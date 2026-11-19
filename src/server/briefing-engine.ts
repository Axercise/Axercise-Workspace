import { createHash } from "node:crypto";
import type { CalendarEvent, Task } from "../lib/types";
import { assignmentPending, focusElapsed, type LearningState } from "../lib/learning";
import type { BriefingData, BriefingPeriod, BriefingRow, BriefingSettings, BriefingSource } from "../lib/briefings";
import type { TaskActivity } from "./task-activity";
export const bangkokDay = (at: number) => new Date(at + 7 * 3600000).toISOString().slice(0, 10);
export const dayStart = (day: string) => Date.parse(`${day}T00:00:00+07:00`);
export const shiftBriefDay = (day: string, days: number) => bangkokDay(dayStart(day) + days * 86400000);
export const atTime = (day: string, time: string) => Date.parse(`${day}T${time}:00+07:00`);
const dueTime = (value: string) => { const at = value ? Date.parse(value.length === 10 ? `${value}T23:59:00+07:00` : value) : NaN; return Number.isFinite(at) ? at : undefined; };
const short = (value: string, length = 500) => value.slice(0, length);
const learningHref = (courseId: string, tab: string, assignment?: string) => `/learning?course=${encodeURIComponent(courseId)}&tab=${["focus", "review", "plans"].includes(tab) ? "study" : tab}${assignment ? `&assignment=${encodeURIComponent(assignment)}` : ""}`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 24);
export function defaultBriefingSettings(now = Date.now()): BriefingSettings { return { enabled: true, morning: true, evening: true, morningTime: "08:00", eveningTime: "21:00", desktop: true, discord: true, activatedAt: now }; }
export type BriefingSlot = { key: string; day: string; period: BriefingPeriod; dueAt: number; expiresAt: number; status: "pending" | "ready" | "expired"; leaseUntil: number; attemptedAt?: number; reportId?: string; error?: string };
export function scheduledBriefingSlots(settings: BriefingSettings, now: number): BriefingSlot[] {
  if (!settings.enabled) return [];
  const result: BriefingSlot[] = [];
  for (const day of [shiftBriefDay(bangkokDay(now), -1), bangkokDay(now)]) for (const period of ["morning", "evening"] as const) {
    if (!settings[period]) continue;
    const dueAt = atTime(day, period === "morning" ? settings.morningTime : settings.eveningTime);
    if (dueAt < settings.activatedAt || dueAt > now || now >= dueAt + 2 * 3600000) continue;
    result.push({ key: hash(`${day}:${period}`), day, period, dueAt, expiresAt: dueAt + 2 * 3600000, status: "pending", leaseUntil: 0 });
  }
  return result.sort((a, b) => b.dueAt - a.dueAt);
}
export function nextBriefingTime(settings: BriefingSettings, period: BriefingPeriod, now: number) { if (!settings.enabled || !settings[period]) return 0; const day = bangkokDay(now), time = period === "morning" ? settings.morningTime : settings.eveningTime, today = atTime(day, time); return today > now ? today : atTime(shiftBriefDay(day, 1), time); }

export function buildDailyBriefing(input: { tasks: Task[]; events: CalendarEvent[]; learning: LearningState; activity?: TaskActivity; sources: BriefingSource[]; day: string; period: BriefingPeriod; now: number }): BriefingData {
  const { tasks, events, learning, activity, day, period, now } = input;
  const targetDay = period === "morning" ? day : shiftBriefDay(day, 1), start = dayStart(targetDay), end = start + 86400000, progressStart = dayStart(day), progressEnd = progressStart + 86400000, reference = now;
  const activeCourses = new Set(learning.records.courses.filter(c => !c.archived && learning.records.terms.some(t => t.id === c.termId && !t.archived)).map(c => c.id));
  const courseTitle = (id: string) => { const c = learning.records.courses.find(c => c.id === id); return c?.code || c?.title || "การเรียน"; };
  const allTaskLinks = new Set(learning.records.assignments.flatMap(a => a.taskId ? [a.taskId] : []));
  const taskMap = new Map(tasks.map(t => [t.id, t])), work: BriefingRow[] = [], submission: BriefingRow[] = [], completed: BriefingRow[] = [], exams: BriefingRow[] = [], reviews: BriefingRow[] = [], agenda: BriefingRow[] = [];
  const rank = (row: BriefingRow, important: boolean, urgent: boolean, sending = false, doing = false) => {
    const overdue = row.dueAt !== undefined && row.dueAt < reference, soon = row.dueAt !== undefined && row.dueAt < end;
    row.score = (important ? 100 : 0) + (urgent ? 60 : 0) + (overdue ? 160 : soon ? 80 : 0) + (sending ? 40 : 0) + (doing ? 10 : 0);
    row.reason = [overdue ? "เลยกำหนดแล้ว" : soon ? row.dueAt !== undefined && bangkokDay(row.dueAt) === day ? "ถึงกำหนดวันนี้" : "ถึงกำหนดพรุ่งนี้" : "", sending ? "ทำเสร็จแล้ว รอส่ง" : "", important ? "สำคัญ" : "", urgent ? "เร่งด่วน" : "", !row.dueAt ? "ยังไม่กำหนดวัน" : ""].filter(Boolean).join(" · ") || "พิจารณาตามเวลาที่มี";
    work.push(row); if (sending) submission.push(row);
  };
  for (const a of learning.records.assignments) {
    if (!activeCourses.has(a.courseId) || a.archived) continue;
    const linked = a.taskId ? taskMap.get(a.taskId) : undefined;
    const deadline = linked && a.taskSync !== "conflict" ? linked.deadline : a.deadline;
    if (assignmentPending(a)) rank({ key: `assignment:${a.id}`, title: short(a.title, 300), detail: `${courseTitle(a.courseId)} · ${a.purpose === "study" ? "แผนอ่าน" : a.status === "Completed" ? "การบ้านทำเสร็จ · ยังไม่ส่ง" : "การบ้าน"}${a.taskSync === "conflict" ? " · ข้อมูลต่างจาก To-do ตรวจต้นทางก่อน" : ""}`, href: learningHref(a.courseId, "assignments", a.id), source: "learning", dueAt: dueTime(deadline) }, linked?.important ?? a.taskImportant, linked?.urgent ?? a.taskUrgent, a.purpose !== "study" && a.status === "Completed", a.status === "Doing");
    const latest = a.history.filter(h => Date.parse(h.at) >= progressStart && Date.parse(h.at) < progressEnd && ["Completed", "Submitted", "Graded"].includes(h.status)).sort((a, b) => b.at.localeCompare(a.at))[0];
    if (latest && ["Completed", "Submitted", "Graded"].includes(a.status)) completed.push({ key: `assignment:${a.id}`, title: short(a.title, 300), detail: `${courseTitle(a.courseId)} · ${a.status === "Completed" ? a.purpose === "study" ? "บันทึกว่าอ่านเสร็จ" : "ทำเสร็จแล้ว · ยังรอส่ง" : a.status === "Submitted" ? "ส่งการบ้านแล้ว" : "บันทึกผลประเมินแล้ว"}`, href: learningHref(a.courseId, "assignments", a.id), source: "learning", dueAt: Date.parse(latest.at) });
  }
  for (const task of tasks) {
    if (allTaskLinks.has(task.id) || task.status === "Done") continue;
    rank({ key: `task:${task.id}`, title: short(task.title, 300), detail: task.status === "Doing" ? "To-do · กำลังทำ" : "To-do", href: `/?task=${encodeURIComponent(task.id)}`, source: "task", dueAt: dueTime(task.deadline) }, task.important, task.urgent, false, task.status === "Doing");
  }
  if (activity) {
    const latest = new Map<string, TaskActivity["events"][number]>();
    for (const event of activity.events) if (!latest.has(event.taskId) || latest.get(event.taskId)!.at <= event.at) latest.set(event.taskId, event);
    for (const event of latest.values()) if (!allTaskLinks.has(event.taskId) && event.kind === "completed" && event.at >= progressStart && event.at < progressEnd && taskMap.get(event.taskId)?.status === "Done") completed.push({ key: `task:${event.taskId}`, title: short(event.title, 300), detail: event.observed ? "ตรวจพบสถานะ Done วันนี้ · ไม่ทราบเวลาที่ทำเสร็จจริง" : "บันทึกว่า To-do เสร็จแล้ว", href: `/?task=${encodeURIComponent(event.taskId)}`, source: "task", dueAt: event.at, observed: event.observed });
  }
  for (const focus of learning.records.focus) if (!focus.archived && activeCourses.has(focus.courseId) && focus.endedAt && Date.parse(focus.endedAt) >= progressStart && Date.parse(focus.endedAt) < progressEnd) completed.push({ key: `focus:${focus.id}`, title: short(focus.title, 300), detail: `${courseTitle(focus.courseId)} · อ่าน ${Math.floor(focusElapsed(focus, Date.parse(focus.endedAt)) / 60)} นาที`, href: learningHref(focus.courseId, "focus"), source: "learning", dueAt: Date.parse(focus.endedAt) });
  for (const set of learning.records.sets) if (!set.archived && activeCourses.has(set.courseId)) {
    const due = set.cards.filter(c => c.due && Date.parse(c.due) < end).length;
    if (due) reviews.push({ key: `review:${set.id}`, title: short(set.title, 300), detail: `${courseTitle(set.courseId)} · ${due} ข้อถึงรอบทบทวน`, href: learningHref(set.courseId, "review"), source: "learning" });
    const answered = set.cards.filter(c => c.history.some(h => Date.parse(h.at) >= progressStart && Date.parse(h.at) < progressEnd)).length;
    if (answered) completed.push({ key: `review:${set.id}`, title: short(set.title, 300), detail: `${courseTitle(set.courseId)} · ทบทวน ${answered} ข้อ`, href: learningHref(set.courseId, "review"), source: "learning" });
  }
  const calendarLinks = new Map<string, { row: BriefingRow; done: boolean }>();
  const localAgenda: { row: BriefingRow; calendarId?: string; done: boolean }[] = [];
  for (const a of learning.records.assessments) if (!a.archived && activeCourses.has(a.courseId) && a.date) {
    const remote = a.calendarId ? events.find(e => e.id === a.calendarId) : undefined;
    const dueAt = remote ? remote.allDay ? dayStart(remote.start) : Date.parse(remote.start) : a.date.length === 10 ? atTime(a.date, "09:00") : Date.parse(a.date);
    const row: BriefingRow = { key: `assessment:${a.id}`, title: short(remote?.title || a.title, 300), detail: short(`${courseTitle(a.courseId)} · การสอบ/ประเมิน${remote?.location || a.location ? ` · ${remote?.location || a.location}` : ""}${a.scope ? ` · ${a.scope}` : ""}`), href: learningHref(a.courseId, "overview"), source: "learning", dueAt, endAt: remote ? remote.allDay ? dayStart(remote.end) : Date.parse(remote.end) : a.end ? Date.parse(a.end) : dueAt + 3600000, allDay: remote?.allDay ?? a.date.length === 10 };
    if (dueAt >= start && dueAt < start + 7 * 86400000) exams.push(row);
    localAgenda.push({ row, calendarId: a.calendarId || undefined, done: false });
  }
  const planTaskLinks = new Set<string>();
  for (const plan of learning.records.plans) if (!plan.archived && activeCourses.has(plan.courseId)) for (const block of plan.blocks) {
    if (block.taskId) planTaskLinks.add(block.taskId);
    const assignment = block.assignmentId ? learning.records.assignments.find(a => a.id === block.assignmentId) : undefined;
    const representedAsWork = work.some(row => row.key === `task:${block.taskId}` || row.key === `assignment:${block.assignmentId}`);
    const done = block.done || !!(assignment && !assignmentPending(assignment)) || representedAsWork;
    localAgenda.push({ row: { key: `plan:${block.id}`, title: short(block.title, 300), detail: `${courseTitle(plan.courseId)} · แผนอ่าน`, href: learningHref(plan.courseId, "plans"), source: "learning", dueAt: Date.parse(block.start), endAt: Date.parse(block.end) }, calendarId: block.calendarId || undefined, done });
  }
  for (const entry of localAgenda) if (entry.calendarId) calendarLinks.set(entry.calendarId, entry);
  const seenEvents = new Set<string>();
  const addAgenda = (row: BriefingRow) => { if (row.dueAt !== undefined && row.dueAt < end && (row.endAt ?? row.dueAt + 1) > start) agenda.push(row); };
  for (const event of events) {
    if (seenEvents.has(event.id)) continue; seenEvents.add(event.id);
    if (event.task?.status === "Done") continue;
    if (event.task && (taskMap.has(event.task.id) || allTaskLinks.has(event.task.id) || planTaskLinks.has(event.task.id))) continue;
    const linked = calendarLinks.get(event.id); if (linked?.done) continue;
    const dueAt = event.allDay ? dayStart(event.start) : Date.parse(event.start), endAt = event.allDay ? dayStart(event.end) : Date.parse(event.end);
    addAgenda({ ...(linked?.row || { key: `event:${event.id}`, title: "", detail: "", href: `/?date=${targetDay}&event=${encodeURIComponent(event.id)}`, source: "calendar" as const }), title: short(event.title, 300), detail: linked?.row.detail || short(`${event.task ? "To-do จาก Calendar" : "Google Calendar"}${event.location ? ` · ${event.location}` : ""}`), dueAt, endAt, allDay: event.allDay });
  }
  for (const entry of localAgenda) if (!entry.done && (!entry.calendarId || !seenEvents.has(entry.calendarId))) addAgenda(entry.row);
  work.sort((a, b) => (b.score || 0) - (a.score || 0) || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.title.localeCompare(b.title, "th"));
  agenda.sort((a, b) => Number(!!b.allDay) - Number(!!a.allDay) || (a.dueAt || 0) - (b.dueAt || 0));
  completed.sort((a, b) => (b.dueAt || 0) - (a.dueAt || 0)); exams.sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));
  const sortedSubmission = work.filter(r => submission.some(s => s.key === r.key));
  return { day, targetDay, period, generatedAt: now, sources: input.sources, agenda: agenda.slice(0, 100), work: work.slice(0, 100), priorities: work.slice(0, 3), awaitingSubmission: sortedSubmission.slice(0, 100), completed: completed.slice(0, 100), exams: exams.slice(0, 100), reviews: reviews.slice(0, 100), counts: { agenda: agenda.length, work: work.length, overdue: work.filter(r => r.dueAt !== undefined && r.dueAt < reference).length, dueToday: work.filter(r => r.dueAt !== undefined && r.dueAt >= start && r.dueAt < end).length, awaitingSubmission: sortedSubmission.length, completed: completed.length, exams: exams.length, reviews: reviews.length }, trackingSince: activity?.startedAt };
}

const discordText = (value: string, max = 160) => value.replace(/[@`*_~|<>\[\]\\]/g, "").replace(/[\r\n]+/g, " ").slice(0, max);
export function formatBriefingDiscord(data: BriefingData, id: string) {
  const date = new Date(dayStart(data.day)).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
  const clock = (row: BriefingRow) => row.allDay ? "ทั้งวัน" : row.dueAt === undefined ? "" : new Date(row.dueAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
  const lines = [`**${data.period === "morning" ? "☀️ สรุปตอนเช้า" : "🌙 สรุปก่อนนอน"} · ${date}**`];
  if (data.sources.some(s => s.status !== "fresh" || s.message)) lines.push("⚠️ ข้อมูลบางส่วนเป็นข้อมูลเก่าหรือโหลดไม่ได้ เปิดรายงานเพื่อดูขอบเขตข้อมูล");
  lines.push(data.period === "morning" ? `วันนี้มี ${data.counts.agenda} นัด/ช่วงอ่าน · ${data.counts.work} งานค้าง` : `ความคืบหน้าที่บันทึกวันนี้ ${data.counts.completed} รายการ · พรุ่งนี้ ${data.counts.agenda} นัด/ช่วงอ่าน`);
  if (data.counts.awaitingSubmission) lines.push(`📤 ทำเสร็จแต่ยังรอส่ง ${data.counts.awaitingSubmission} งาน`);
  if (data.counts.overdue) lines.push(`⏳ เลยกำหนด ${data.counts.overdue} งาน ตามข้อมูลที่อ่านได้`);
  if (data.priorities.length) { lines.push(`\n**${data.period === "morning" ? "เริ่มจาก 3 เรื่องนี้" : "สิ่งที่ควรเตรียมสำหรับพรุ่งนี้"}**`); for (const [i, row] of data.priorities.entries()) lines.push(`${i + 1}. ${discordText(row.title, 115)} — ${discordText(row.reason || row.detail, 100)}`); }
  if (data.agenda.length) { lines.push(`\n**${data.period === "morning" ? "ตารางวันนี้" : "ตารางพรุ่งนี้"}**`); for (const row of data.agenda.slice(0, 4)) lines.push(`• ${clock(row)} ${discordText(row.title, 100)}`); }
  if (data.exams.length) lines.push(`\n📚 สอบ/ประเมินใน 7 วัน: ${discordText(data.exams[0].title, 100)}`);
  if (data.counts.reviews) lines.push(`🧠 มี ${data.counts.reviews} ชุดที่ถึงรอบทบทวน`);
  const link = `\n\nดูรายงานและเปิดงานต้นทางบนคอม:\nhttp://127.0.0.1:3210/briefing?report=${id}`;
  return lines.join("\n").slice(0, 1850 - link.length) + link;
}
