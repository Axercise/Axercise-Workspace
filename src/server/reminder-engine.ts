import { createHash } from "node:crypto";
import { assignmentPending, type LearningState } from "../lib/learning";
import type { CalendarEvent, Task } from "../lib/types";
import type { ReminderCandidate, ReminderGroup, ReminderState, Reminder, ScheduledDraft } from "../lib/reminders";

export const MINUTE = 60000;
const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 24);
export function newReminderState(): ReminderState { return { version: 1, settings: { enabled: true, desktop: true, discord: true, sound: true, repeatMinutes: 10 }, reminders: [], deliveries: [], sourceErrors: {}, lastScanAt: 0, native: { available: false, updatedAt: 0 } }; }
export function scheduledTime(value: string, hour = "23:59") { return Date.parse(value.length === 10 ? `${value}T${hour}:00+07:00` : value); }

export function collectReminderCandidates(learning: LearningState, tasks: Task[] | undefined, events: CalendarEvent[] | undefined, now: number, drafts: ScheduledDraft[] = []): ReminderCandidate[] {
  const result: ReminderCandidate[] = [], suppressed = new Set<string>();
  const activeCourses = new Set(learning.records.courses.filter(c => !c.archived && learning.records.terms.some(t => t.id === c.termId && !t.archived)).map(c => c.id));
  const courseName = (id: string) => { const c = learning.records.courses.find(c => c.id === id); return c?.code || c?.title || "การเรียน"; };
  const add = (candidate: ReminderCandidate) => { if (Number.isFinite(candidate.dueAt)) result.push(candidate); };
  for (const a of learning.records.assignments) {
    const aliases = [`assignment:${a.id}`, ...(a.taskId ? [`task:${a.taskId}`] : [])];
    if (!activeCourses.has(a.courseId) || !assignmentPending(a)) { aliases.forEach(k => suppressed.add(k)); continue; }
    if (a.deadline) add({ aliases, groups: ["learning"], title: a.title, detail: `${courseName(a.courseId)} · ${a.purpose === "study" ? "แผนอ่าน" : a.status === "Completed" ? "ทำเสร็จแล้ว · ยังรอส่ง" : "การบ้าน"}`, kind: "assignment", dueAt: scheduledTime(a.deadline), href: `/learning?course=${a.courseId}&assignment=${a.id}`, priority: 20 });
  }
  for (const a of learning.records.assessments) {
    const aliases = [`assessment:${a.id}`, ...(a.calendarId ? [`calendar:${a.calendarId}`] : [])];
    if (a.archived || !activeCourses.has(a.courseId) || a.score !== null) { aliases.forEach(k => suppressed.add(k)); continue; }
    if (a.date) add({ aliases, groups: ["learning"], title: a.title, detail: `${courseName(a.courseId)} · สอบ / ประเมิน${a.location ? ` · ${a.location}` : ""}`, kind: "assessment", dueAt: scheduledTime(a.date, "09:00"), href: `/learning?course=${a.courseId}&tab=grades`, priority: 20 });
  }
  for (const plan of learning.records.plans) for (const block of plan.blocks) {
    const assignment = learning.records.assignments.find(a => a.id === block.assignmentId);
    const aliases = [`block:${block.id}`, ...(block.assignmentId ? [`assignment:${block.assignmentId}`] : []), ...(block.taskId ? [`task:${block.taskId}`] : []), ...(block.calendarId ? [`calendar:${block.calendarId}`] : [])];
    if (plan.archived || !activeCourses.has(plan.courseId) || block.done || (assignment && !assignmentPending(assignment))) { aliases.forEach(k => suppressed.add(k)); continue; }
    add({ aliases, groups: ["learning"], title: block.title, detail: `${courseName(plan.courseId)} · ${plan.title}`, kind: "plan", dueAt: Date.parse(block.start), href: `/learning?course=${plan.courseId}&tab=study&study=plans`, priority: 25 });
  }
  for (const set of learning.records.sets) {
    if (set.archived || !activeCourses.has(set.courseId)) continue;
    const dates = set.cards.filter(c => c.due).map(c => Date.parse(c.due!)).filter(Number.isFinite);
    if (!dates.length) continue;
    add({ aliases: [`review:${set.id}`], groups: ["learning"], title: `ทบทวน ${set.title}`, detail: `${courseName(set.courseId)} · ${set.cards.filter(c => c.due && Date.parse(c.due) <= now).length} ข้อถึงรอบแล้ว`, kind: "review", dueAt: Math.min(...dates), href: `/learning?course=${set.courseId}&tab=study&study=sets`, priority: 20 });
  }
  for (const focus of learning.records.focus) {
    if (focus.archived || focus.endedAt || focus.pausedAt || !activeCourses.has(focus.courseId)) continue;
    add({ aliases: [`focus:${focus.id}`], groups: ["learning"], title: `ครบรอบอ่าน · ${focus.title}`, detail: `${courseName(focus.courseId)} · ถึงเวลาพัก`, kind: "focus", dueAt: Date.parse(focus.startedAt) + focus.pausedMs + focus.duration * 1000, href: `/learning?course=${focus.courseId}&tab=study&study=focus`, priority: 20 });
  }
  for (const task of tasks || []) {
    const aliases = [`task:${task.id}`, ...(task.calendar?.eventId ? [`calendar:${task.calendar.eventId}`] : [])];
    if (task.status === "Done") {
      const submissionPending = learning.records.assignments.some(a => a.taskId === task.id && activeCourses.has(a.courseId) && assignmentPending(a));
      if (!submissionPending) aliases.forEach(k => suppressed.add(k));
      continue;
    }
    if (task.deadline) add({ aliases, groups: ["notion"], title: task.title, detail: "To-do · Notion", kind: "task", dueAt: scheduledTime(task.deadline), href: `/?task=${encodeURIComponent(task.id)}`, priority: 30 });
  }
  for (const event of events || []) {
    if (event.task) {
      // A Calendar projection is the same task, including date-only deadlines at 23:59.
      // A successful Tasks read is authoritative even while an old projection awaits cleanup.
      if (tasks !== undefined || event.task.status === "Done") continue;
      if (event.task.deadline) add({ aliases: [`task:${event.task.id}`, `calendar:${event.id}`], groups: ["calendar"], title: event.title, detail: "To-do · Calendar", kind: "task", dueAt: scheduledTime(event.task.deadline), href: `/?task=${encodeURIComponent(event.task.id)}`, priority: 30 });
      continue;
    }
    const at = scheduledTime(event.start, "09:00"); if (!Number.isFinite(at)) continue;
    const day = event.allDay ? event.start : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(at));
    add({ aliases: [`calendar:${event.id}`], groups: ["calendar"], title: event.title, detail: `Calendar${event.location ? ` · ${event.location}` : ""}`, kind: "calendar", dueAt: at, href: `/?event=${encodeURIComponent(event.id)}&date=${day}`, priority: 40 });
  }
  for (const draft of drafts) {
    const task = tasks?.find(t => t.title === draft.title && scheduledTime(t.deadline) === scheduledTime(draft.deadline));
    add({ aliases: [`draft:${draft.id}`, ...(task ? [`task:${task.id}`] : [])], groups: ["draft"], title: draft.title, detail: "To-do · ฉบับร่างในเครื่อง", kind: "draft", dueAt: scheduledTime(draft.deadline), href: "/?tasks=drafts", priority: 10 });
  }
  const merged: ReminderCandidate[] = [];
  for (const candidate of result.filter(c => !c.aliases.some(a => suppressed.has(a)))) {
    const matches = merged.filter(c => c.aliases.some(a => candidate.aliases.includes(a)));
    const all = [...matches, candidate], primary = all.reduce((a, b) => a.priority >= b.priority ? a : b);
    const combined = { ...primary, aliases: [...new Set(all.flatMap(c => c.aliases))], groups: [...new Set(all.flatMap(c => c.groups))] };
    for (const match of matches) merged.splice(merged.indexOf(match), 1);
    merged.push(combined);
  }
  return merged;
}

export function reconcileReminders(state: ReminderState, candidates: ReminderCandidate[], successful: Set<ReminderGroup>, now: number) {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const unavailablePrimary = state.reminders.find(r => r.status !== "cancelled" && r.priority > candidate.priority && r.groups.some(g => !successful.has(g)) && r.aliases.some(a => candidate.aliases.includes(a)));
    if (unavailablePrimary) { seen.add(unavailablePrimary.id); continue; }
    const matching = state.reminders.filter(r => r.dueAt === candidate.dueAt && r.aliases.some(a => candidate.aliases.includes(a)));
    let record = matching.find(r => r.status === "acknowledged") || matching.find(r => r.status !== "cancelled") || matching[0];
    if (!record) { record = { ...candidate, id: hash(`${candidate.aliases[0]}:${candidate.dueAt}`), status: "pending", snoozedUntil: 0, createdAt: now, updatedAt: now }; state.reminders.push(record); }
    else { const wasCancelled = record.status === "cancelled"; Object.assign(record, candidate, { updatedAt: now }); if (wasCancelled) record.status = "pending"; }
    seen.add(record.id);
    for (const duplicate of matching) if (duplicate !== record) duplicate.status = "cancelled";
  }
  for (const record of state.reminders) {
    if (record.expiresAt && record.expiresAt <= now) record.status = "cancelled";
    else if (!seen.has(record.id) && record.groups.some(g => successful.has(g))) record.status = "cancelled";
  }
  state.lastScanAt = now;
}

export function reminderSlot(reminder: Reminder, now: number, repeatMinutes: number): string | null {
  if (reminder.status !== "pending" || (reminder.expiresAt && reminder.expiresAt <= now)) return null;
  if (reminder.kind === "focus" && now < reminder.dueAt) return null;
  if (reminder.snoozedUntil) {
    if (now < reminder.snoozedUntil) return null;
    return `snooze:${reminder.snoozedUntil}:${Math.floor((now - reminder.snoozedUntil) / (repeatMinutes * MINUTE))}`;
  }
  if (now < reminder.dueAt - 30 * MINUTE) return null;
  if (now >= reminder.dueAt) return `due:${Math.floor((now - reminder.dueAt) / (repeatMinutes * MINUTE))}`;
  return now >= reminder.dueAt - 5 * MINUTE ? "before:5" : now >= reminder.dueAt - 15 * MINUTE ? "before:15" : "before:30";
}

export function advanceReminders(state: ReminderState, now: number) {
  if (!state.settings.enabled) return;
  for (const record of state.reminders) {
    const slot = reminderSlot(record, now, state.settings.repeatMinutes);
    if (!slot) continue;
    const id = hash(`${record.id}:${slot}`);
    if (state.deliveries.some(d => d.id === id)) continue;
    for (const delivery of state.deliveries) if (delivery.reminderId === record.id) delivery.superseded = true;
    state.deliveries.push({ id, reminderId: record.id, slot, createdAt: now, desktop: { state: "pending" }, discord: { state: "pending" } });
  }
  state.deliveries = state.deliveries.filter(d => d.createdAt > now - 7 * 86400000);
  state.reminders = state.reminders.filter(r => r.status === "pending" || r.updatedAt > now - 30 * 86400000);
}

export function actOnReminder(state: ReminderState, id: string, action: "acknowledge" | "snooze" | "resume", now: number, minutes = 10) {
  const record = state.reminders.find(r => r.id === id);
  if (!record || record.status === "cancelled") return false;
  record.updatedAt = now;
  if (action === "acknowledge") { record.status = "acknowledged"; record.acknowledgedAt = now; }
  else if (action === "snooze") { record.status = "pending"; record.snoozedUntil = now + minutes * MINUTE; }
  else { record.status = "pending"; record.snoozedUntil = now; }
  for (const d of state.deliveries) if (d.reminderId === id) d.superseded = true;
  return true;
}
