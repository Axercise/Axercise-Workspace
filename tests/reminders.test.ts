import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { learningSchemas, type LearningState } from "../src/lib/learning";
import { actOnReminder, advanceReminders, collectReminderCandidates, MINUTE, newReminderState, reconcileReminders, reminderSlot, scheduledTime } from "../src/server/reminder-engine";
import type { ReminderCandidate, ReminderGroup } from "../src/lib/reminders";
import type { Task, CalendarEvent } from "../src/lib/types";

const NOW = Date.parse("2030-06-01T10:00:00+07:00"), iso = (n: number) => new Date(n).toISOString();
const candidate = (at = NOW): ReminderCandidate => ({ aliases: ["task:example"], groups: ["notion"], title: "งานทดสอบ", detail: "To-do", kind: "task", dueAt: at, href: "/", priority: 30 });
const successful = () => new Set<ReminderGroup>(["calendar", "notion", "learning", "draft"]);
function fixture() {
  const state: LearningState = { version: 1, revision: 1, updatedAt: iso(NOW), sync: { lastAt: null, items: {}, error: "" }, records: { terms: [], courses: [], documents: [], assignments: [], assessments: [], notes: [], sets: [], focus: [], plans: [] } };
  const base = () => ({ id: randomUUID(), title: "ทดสอบ", createdAt: iso(NOW), updatedAt: iso(NOW), revision: 1 });
  const term = learningSchemas.terms.parse({ ...base(), year: "2030" }); state.records.terms.push(term);
  const course = learningSchemas.courses.parse({ ...base(), termId: term.id }); state.records.courses.push(course);
  return { state, base, course };
}
test("notifications select only the latest elapsed stage and repeat once per interval", () => {
  const state = newReminderState(); reconcileReminders(state, [candidate()], successful(), NOW - 31 * MINUTE);
  for (const minutes of [-31, -30, -16, -15, -6, -5, -1, 0, 9, 10]) advanceReminders(state, NOW + minutes * MINUTE);
  assert.deepEqual(state.deliveries.map(d => d.slot), ["before:30", "before:15", "before:5", "due:0", "due:1"]);
  advanceReminders(state, NOW + 600 * MINUTE);
  assert.equal(state.deliveries.at(-1)?.slot, "due:60");
  assert.equal(state.deliveries.length, 6, "waking from sleep must not emit 59 catch-up alerts");
  assert.equal(state.deliveries.filter(d => !d.superseded).length, 1);
});
test("acknowledgement survives restart and source refresh; a changed deadline rearms", () => {
  let state = newReminderState(); reconcileReminders(state, [candidate()], successful(), NOW); advanceReminders(state, NOW);
  const id = state.reminders[0].id; assert.ok(actOnReminder(state, id, "acknowledge", NOW));
  state = JSON.parse(JSON.stringify(state)); reconcileReminders(state, [candidate()], successful(), NOW + MINUTE); advanceReminders(state, NOW + 20 * MINUTE);
  assert.equal(state.deliveries.length, 1); assert.equal(state.reminders[0].status, "acknowledged");
  reconcileReminders(state, [candidate(NOW + 60 * MINUTE)], successful(), NOW + 30 * MINUTE); advanceReminders(state, NOW + 30 * MINUTE);
  assert.equal(state.reminders.find(r => r.id === id)?.status, "cancelled");
  assert.equal(state.deliveries.length, 2);
});
test("snooze silences both channels and repeats from the new time", () => {
  let state = newReminderState(); reconcileReminders(state, [candidate()], successful(), NOW); advanceReminders(state, NOW);
  const id = state.reminders[0].id; actOnReminder(state, id, "snooze", NOW, 10); state = JSON.parse(JSON.stringify(state));
  advanceReminders(state, NOW + 9 * MINUTE); assert.equal(state.deliveries.length, 1); assert.equal(state.deliveries[0].superseded, true);
  advanceReminders(state, NOW + 10 * MINUTE); advanceReminders(state, NOW + 19 * MINUTE); assert.equal(state.deliveries.length, 2);
  advanceReminders(state, NOW + 20 * MINUTE); assert.equal(state.deliveries.length, 3);
});
test("transient source failure preserves reminders, deletion after a successful scan cancels", () => {
  const state = newReminderState(); reconcileReminders(state, [{ ...candidate(), groups: ["calendar"] }], successful(), NOW);
  reconcileReminders(state, [], new Set(["learning"]), NOW + MINUTE); assert.equal(state.reminders[0].status, "pending");
  reconcileReminders(state, [], successful(), NOW + 2 * MINUTE); assert.equal(state.reminders[0].status, "cancelled");
});
test("linked study plan, homework, Notion task and Calendar event produce one alert", () => {
  const f = fixture(), taskId = randomUUID(), calendarId = "calendar-example";
  const assignment = learningSchemas.assignments.parse({ ...f.base(), courseId: f.course.id, deadline: iso(NOW), taskId }); f.state.records.assignments.push(assignment);
  f.state.records.plans.push(learningSchemas.plans.parse({ ...f.base(), courseId: f.course.id, blocks: [{ id: randomUUID(), title: "อ่านสอบ", start: iso(NOW), end: iso(NOW + 60 * MINUTE), assignmentId: assignment.id, taskId, calendarId }] }));
  const task: Task = { id: taskId, title: "งาน", details: "", deadline: iso(NOW), important: true, urgent: true, status: "Todo" };
  const event: CalendarEvent = { id: calendarId, title: "อ่านสอบ", start: iso(NOW), end: iso(NOW + 60 * MINUTE), description: "", location: "", allDay: false };
  const candidates = collectReminderCandidates(f.state, [task], [event], NOW); assert.equal(candidates.length, 1);
  const state = newReminderState(); reconcileReminders(state, candidates, successful(), NOW); advanceReminders(state, NOW); assert.equal(state.deliveries.length, 1);
});
test("completed homework still reminds about submission, submitted homework stops", () => {
  const f = fixture(), taskId = randomUUID();
  const assignment = learningSchemas.assignments.parse({ ...f.base(), courseId: f.course.id, deadline: iso(NOW), taskId, status: "Completed" }); f.state.records.assignments.push(assignment);
  const task: Task = { id: taskId, title: "งาน", details: "", deadline: iso(NOW), important: true, urgent: true, status: "Done" };
  assert.equal(collectReminderCandidates(f.state, [task], [], NOW).length, 1);
  assignment.status = "Submitted"; assert.equal(collectReminderCandidates(f.state, [{ ...task, status: "Todo" }], [], NOW).length, 0);
});
test("all academic schedules are included; paused/ended focus and archived courses stop", () => {
  const f = fixture();
  f.state.records.assessments.push(learningSchemas.assessments.parse({ ...f.base(), courseId: f.course.id, date: iso(NOW), kind: "final" }));
  f.state.records.sets.push(learningSchemas.sets.parse({ ...f.base(), courseId: f.course.id, cards: [{ id: randomUUID(), question: "Q", answer: "A", due: iso(NOW) }] }));
  const focus = learningSchemas.focus.parse({ ...f.base(), courseId: f.course.id, startedAt: iso(NOW - 1500 * 1000) }); f.state.records.focus.push(focus);
  assert.deepEqual(collectReminderCandidates(f.state, [], [], NOW).map(c => c.kind).sort(), ["assessment", "focus", "review"]);
  focus.pausedAt = iso(NOW); assert.equal(collectReminderCandidates(f.state, [], [], NOW).some(c => c.kind === "focus"), false);
  f.course.archived = true; assert.equal(collectReminderCandidates(f.state, [], [], NOW).length, 0);
});
test("scheduled local drafts notify offline and deduplicate after a task is saved", () => {
  const f = fixture(), draft = { id: randomUUID(), title: "งานจากฉบับร่าง", deadline: iso(NOW) };
  assert.equal(collectReminderCandidates(f.state, undefined, undefined, NOW, [draft]).length, 1);
  const task: Task = { id: randomUUID(), title: draft.title, details: "", deadline: draft.deadline, important: true, urgent: true, status: "Todo" };
  assert.equal(collectReminderCandidates(f.state, [task], [], NOW, [draft]).length, 1);
  task.status = "Done"; assert.equal(collectReminderCandidates(f.state, [task], [], NOW, [draft]).length, 0);
});
test("date-only deadlines use Bangkok end-of-day, all-day events use 09:00", () => {
  assert.equal(scheduledTime("2030-06-01"), Date.parse("2030-06-01T23:59:00+07:00"));
  assert.equal(scheduledTime("2030-06-01", "09:00"), Date.parse("2030-06-01T09:00:00+07:00"));
  const f = fixture(); assert.equal(collectReminderCandidates(f.state, [{ id: "empty", title: "ไม่มีวัน", details: "", deadline: "", important: true, urgent: true, status: "Todo" }], [], NOW).length, 0);
});
test("a To-do Calendar projection shares its deadline and never creates an extra all-day or completed-task reminder", () => {
  const f = fixture(), id = randomUUID(), eventId = "t01234";
  const task: Task = { id, title: "งานที่เชื่อม Calendar", details: "", deadline: "2030-06-01", important: true, urgent: false, status: "Todo", calendar: { enabled: true, state: "synced", eventId } };
  const event: CalendarEvent = { id: eventId, title: task.title, description: "", location: "", start: task.deadline, end: "2030-06-02", allDay: true, task: { id, deadline: task.deadline, status: "Todo" } };
  const candidates = collectReminderCandidates(f.state, [task], [event], NOW);
  assert.equal(candidates.length, 1); assert.equal(candidates[0].dueAt, Date.parse("2030-06-01T23:59:00+07:00")); assert.ok(candidates[0].aliases.includes(`calendar:${eventId}`));
  const fallback = collectReminderCandidates(f.state, undefined, [event], NOW); assert.equal(fallback.length, 1); assert.equal(fallback[0].dueAt, candidates[0].dueAt);
  task.status = "Done"; event.task!.status = "Done"; assert.equal(collectReminderCandidates(f.state, [task], [event], NOW).length, 0);
  assert.equal(collectReminderCandidates(f.state, [], [event], NOW).length, 0);
});
test("global pause produces no deliveries and expired test alerts do not repeat", () => {
  const state = newReminderState(); reconcileReminders(state, [{ ...candidate(), expiresAt: NOW + MINUTE }], successful(), NOW);
  state.settings.enabled = false; advanceReminders(state, NOW); assert.equal(state.deliveries.length, 0);
  state.settings.enabled = true; assert.equal(reminderSlot(state.reminders[0], NOW + MINUTE, 10), null);
});
test("focus timers alert at the end of the round without advance warnings", () => {
  const state = newReminderState(); reconcileReminders(state, [{ ...candidate(), kind: "focus" }], successful(), NOW);
  const reminder = state.reminders[0];
  assert.equal(reminderSlot(reminder, NOW - MINUTE, 10), null);
  assert.equal(reminderSlot(reminder, NOW, 10), "due:0");
});
test("a failed external source does not roll a linked event back to an older local date", () => {
  const state = newReminderState();
  const external: ReminderCandidate = { ...candidate(NOW + 60 * MINUTE), aliases: ["calendar:x", "assessment:y"], groups: ["calendar", "learning"], priority: 40 };
  reconcileReminders(state, [external], successful(), NOW);
  reconcileReminders(state, [{ ...external, dueAt: NOW, groups: ["learning"], priority: 20 }], new Set(["learning"]), NOW + MINUTE);
  assert.equal(state.reminders.length, 1); assert.equal(state.reminders[0].dueAt, NOW + 60 * MINUTE);
  assert.equal(state.reminders[0].status, "pending");
});
