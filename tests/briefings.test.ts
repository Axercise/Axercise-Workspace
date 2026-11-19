import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Task, CalendarEvent } from "../src/lib/types";
import type { BriefingSource } from "../src/lib/briefings";
import { learningSchemas, type LearningState } from "../src/lib/learning";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axercise-briefing-test-"));
process.env.AXERCISE_DATA_DIR = directory;
const store = await import("../src/server/store");
const learningStore = await import("../src/server/learning-store");
const engine = await import("../src/server/briefing-engine");
const manager = await import("../src/server/briefings");
const activity = await import("../src/server/task-activity");
const route = await import("../src/app/api/briefings/route");
const feedback = await import("../src/app/api/internal/briefings/route");
const tools = await import("../src/app/api/tools/route");
const originalFetch = globalThis.fetch, originalNow = Date.now;
const day = "2026-11-19", id = () => randomUUID();
let now = engine.atTime(day, "08:05");
const at = (time: string, date = day) => engine.atTime(date, time);
const iso = (time: string) => new Date(at(time)).toISOString();
const task = (patch: Partial<Task> = {}): Task => ({ id: id(), title: "อ่านบทเรียน", details: "", deadline: day, important: true, urgent: false, status: "Todo", ...patch });
const event = (patch: Partial<CalendarEvent> = {}): CalendarEvent => ({ id: id(), title: "นัดอาจารย์", description: "", location: "", start: iso("10:00"), end: iso("11:00"), allDay: false, ...patch });
const sources: BriefingSource[] = [{ name: "tasks", status: "fresh" }, { name: "calendar", status: "fresh" }, { name: "learning", status: "fresh" }];
function fixture() {
  const state = learningStore.emptyLearning(), base = { id: id(), title: "เทอม 1", createdAt: iso("07:00"), updatedAt: iso("07:00"), revision: 1 };
  const term = learningSchemas.terms.parse({ ...base, year: "2026" }), course = learningSchemas.courses.parse({ ...base, id: id(), title: "Algorithms", code: "CS101", termId: term.id });
  state.records.terms.push(term); state.records.courses.push(course);
  const assignment = (patch: Record<string, unknown> = {}) => { const a = learningSchemas.assignments.parse({ ...base, id: id(), title: "การบ้าน 1", courseId: course.id, ...patch }); state.records.assignments.push(a); return a; };
  const assessment = (patch: Record<string, unknown> = {}) => { const a = learningSchemas.assessments.parse({ ...base, id: id(), title: "สอบ", courseId: course.id, date: day, ...patch }); state.records.assessments.push(a); return a; };
  return { state, course, term, base, assignment, assessment };
}
function build(patch: Partial<Parameters<typeof engine.buildDailyBriefing>[0]> = {}) { return engine.buildDailyBriefing({ tasks: [], events: [], learning: learningStore.emptyLearning(), day, period: "morning", sources, now, ...patch }); }
function request(data?: unknown, method = "POST", headers: Record<string, string> = {}) { return new Request("http://127.0.0.1:3210/api/briefings", { method, headers: { host: "127.0.0.1:3210", origin: "http://127.0.0.1:3210", "content-type": "application/json", "x-axercise-client": "workspace", ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) }); }
function enableBot() { store.updateConfig(c => { c.discord.find(b => b.agent === "secretary")!.token = "briefing-test-bot"; c.discord.find(b => b.agent === "secretary")!.channelId = "123456789012345678"; c.discord.find(b => b.agent === "secretary")!.allowedUserId = "234567890123456789"; }); }
function enableSources() { store.updateConfig(c => { c.notion.token = "briefing-test-notion"; c.notion.tasksId = id(); c.google.refreshToken = "briefing-test-refresh"; c.google.accessToken = "briefing-test-access"; c.google.expiresAt = now + 86400000; }); }
function notionTask(t: Task) { return { id: t.id, properties: { Name: { title: [{ plain_text: t.title }] }, Details: { rich_text: [] }, Deadline: { date: t.deadline ? { start: t.deadline } : null }, Important: { checkbox: t.important }, Urgent: { checkbox: t.urgent }, Status: { select: { name: t.status } } } }; }
beforeEach(() => {
  Date.now = () => now; now = at("08:05"); globalThis.fetch = async () => { throw new Error("Unexpected external request"); };
  for (const f of ["briefings.json", "task-activity.json", "config.json", "task-calendar.json"]) fs.rmSync(path.join(directory, f), { force: true });
  store.config();
});
after(() => { Date.now = originalNow; globalThis.fetch = originalFetch; const target = path.resolve(directory); assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith("axercise-briefing-test-")); fs.rmSync(target, { recursive: true, force: true }); });

test("Bangkok dates, defaults and future rounds use Thai time across UTC midnight", () => {
  assert.equal(engine.bangkokDay(Date.parse("2026-11-18T17:30:00Z")), day);
  const settings = engine.defaultBriefingSettings(at("07:00")); assert.equal(settings.morningTime, "08:00"); assert.equal(settings.eveningTime, "21:00");
  assert.equal(engine.nextBriefingTime(settings, "morning", now), at("08:00", "2026-11-20"));
  settings.enabled = false; assert.equal(engine.nextBriefingTime(settings, "evening", now), 0);
});
test("schedules catch up within two hours and never retroactively activate old rounds", () => {
  const settings = engine.defaultBriefingSettings(at("07:00"));
  assert.equal(engine.scheduledBriefingSlots(settings, at("07:59")).length, 0);
  assert.equal(engine.scheduledBriefingSlots(settings, at("09:59")).length, 1);
  assert.equal(engine.scheduledBriefingSlots(settings, at("10:00")).length, 0);
  settings.activatedAt = at("08:01"); assert.equal(engine.scheduledBriefingSlots(settings, now).length, 0);
  settings.activatedAt = at("07:00"); settings.eveningTime = "23:30";
  const midnight = engine.scheduledBriefingSlots(settings, at("00:15", "2026-11-20")); assert.equal(midnight.length, 1); assert.equal(midnight[0].day, day);
});
test("a daily round keeps its dedup key even if its configured time changes", () => {
  const settings = engine.defaultBriefingSettings(at("07:00")), first = engine.scheduledBriefingSlots(settings, now)[0];
  settings.morningTime = "08:03"; assert.equal(engine.scheduledBriefingSlots(settings, now)[0].key, first.key);
});
test("linked homework, To-do and Calendar appear once; Completed still awaits submission", () => {
  const f = fixture(), t = task({ status: "Done" }); const a = f.assignment({ taskId: t.id, status: "Completed", deadline: day });
  const data = build({ learning: f.state, tasks: [t], events: [event({ task: { id: t.id, status: "Done", deadline: day } })] });
  assert.equal(data.work.length, 1); assert.equal(data.awaitingSubmission.length, 1); assert.equal(data.agenda.length, 0); assert.ok(data.work[0].href.includes(`assignment=${a.id}`));
  a.status = "Submitted"; assert.equal(build({ learning: f.state, tasks: [t] }).work.length, 0);
});
test("archived courses/terms and finished study blocks do not return as generic linked tasks", () => {
  const f = fixture(), t = task(); f.assignment({ taskId: t.id }); f.term.archived = true;
  assert.equal(build({ learning: f.state, tasks: [t] }).work.length, 0);
  f.term.archived = false; f.state.records.assignments[0].purpose = "study"; f.state.records.assignments[0].status = "Completed";
  assert.equal(build({ learning: f.state, tasks: [t] }).work.length, 0);
});
test("priorities explain urgency and evening does not label tonight's date-only deadline overdue", () => {
  now = at("21:00"); const data = build({ now, period: "evening", tasks: [task({ title: "คืนนี้", deadline: day }), task({ title: "เมื่อวาน", deadline: "2026-11-18" }), task({ title: "ไม่มีวัน", deadline: "", important: false })] });
  assert.equal(data.targetDay, "2026-11-20"); assert.equal(data.counts.overdue, 1); assert.equal(data.priorities[0].title, "เมื่อวาน"); assert.match(data.work.find(r => r.title === "คืนนี้")!.reason!, /วันนี้/); assert.match(data.work.find(r => r.title === "ไม่มีวัน")!.reason!, /ยังไม่กำหนดวัน/);
});
test("Calendar all-day end is exclusive and overnight appointments overlap the selected day", () => {
  const data = build({ events: [event({ id: "yesterday", start: "2026-11-18", end: day, allDay: true }), event({ id: "today", start: day, end: "2026-11-20", allDay: true }), event({ id: "overnight", start: "2026-11-18T23:30:00+07:00", end: `${day}T00:30:00+07:00` })] });
  assert.equal(data.agenda.length, 2); assert.ok(data.agenda.every(r => !r.key.includes("yesterday")));
  const projection = build({ events: [event({ task: { id: "not-loaded", status: "Done", deadline: day } })], sources: [{ name: "tasks", status: "unavailable" }] }); assert.equal(projection.agenda.length, 0, "Completed To-do projections stay completed even when Notion cannot load");
});
test("linked exams use actual Google time once and upcoming exams are bounded to seven days", () => {
  const f = fixture(); f.assessment({ calendarId: "exam", date: "2026-11-20" }); f.assessment({ date: "2026-12-01" });
  const data = build({ learning: f.state, events: [event({ id: "exam", title: "เวลาใหม่", start: iso("13:00"), end: iso("14:00") })] });
  assert.equal(data.exams.length, 1); assert.equal(data.exams[0].title, "เวลาใหม่"); assert.equal(data.exams[0].dueAt, at("13:00")); assert.equal(data.agenda.length, 1);
});
test("initial old Done tasks are baseline only; explicit completion, reopening and observed changes differ", () => {
  const old = task({ status: "Done" }), current = task(); activity.observeTaskActivity([old, current], false, at("07:00")); assert.equal(activity.taskActivity().events.length, 0);
  current.status = "Done"; activity.observeTaskActivity([current], true, at("08:00")); let data = build({ tasks: [old, current], activity: activity.taskActivity() }); assert.equal(data.completed.length, 1); assert.equal(data.completed[0].observed, false);
  current.status = "Todo"; activity.observeTaskActivity([current], true, at("08:01")); assert.equal(build({ tasks: [old, current], activity: activity.taskActivity() }).completed.length, 0);
  current.status = "Done"; activity.observeTaskActivity([current], false, at("08:02")); data = build({ tasks: [old, current], activity: activity.taskActivity() }); assert.equal(data.completed[0].observed, true); assert.match(data.completed[0].detail, /ไม่ทราบเวลา/);
});
test("learning progress requires today's recorded history and preserves submission wording", () => {
  const f = fixture(); f.assignment({ status: "Completed", history: [{ at: iso("08:00"), status: "Completed", note: "done" }] }); f.assignment({ status: "Submitted", history: [{ at: "2026-11-18T02:00:00Z", status: "Submitted", note: "old" }] });
  const data = build({ learning: f.state }); assert.equal(data.completed.length, 1); assert.match(data.completed[0].detail, /ยังรอส่ง/); assert.equal(data.awaitingSubmission.length, 1);
});
test("reports include ended focus minutes and review activity without inventing completed tasks", () => {
  const f = fixture(); f.state.records.focus.push(learningSchemas.focus.parse({ ...f.base, id: id(), courseId: f.course.id, title: "อ่านจริง", startedAt: iso("07:00"), endedAt: iso("07:25") }));
  f.state.records.sets.push(learningSchemas.sets.parse({ ...f.base, id: id(), courseId: f.course.id, title: "คำถาม", cards: [{ id: id(), question: "Q", answer: "A", due: iso("08:00"), history: [{ at: iso("07:30"), result: "good", answer: "A" }] }] }));
  const data = build({ learning: f.state }); assert.equal(data.completed.length, 2); assert.match(data.completed.find(r => r.key.startsWith("focus:"))!.detail, /25 นาที/); assert.equal(data.reviews.length, 1); assert.match(data.reviews[0].href, /tab=study/);
});
test("Discord output is bounded, strips injected mentions and visibly qualifies unavailable sources", () => {
  const data = build({ tasks: Array.from({ length: 8 }, () => task({ title: "@everyone **x** <@12345> ".repeat(40) })), sources: [{ name: "calendar", status: "unavailable" }] });
  const text = engine.formatBriefingDiscord(data, "a".repeat(24)); assert.ok(text.length < 1900); assert.ok(!text.includes("@everyone") && !text.includes("<@12345>")); assert.match(text, /ข้อมูลบางส่วน/); assert.ok(text.endsWith("a".repeat(24)));
});
test("manual reports remain immutable and do not enqueue either delivery channel", async () => {
  const report = await manager.generateBriefing("morning"); assert.equal(report.origin, "manual"); assert.equal(report.desktop.state, "off"); assert.equal(report.discord.state, "off"); assert.equal(manager.leaseBriefingDesktop().length, 0);
  assert.equal(manager.briefingFeed().unread, 1); manager.markBriefingRead(report.id); assert.equal(manager.briefingFeed().unread, 0); now += 60000; await manager.generateBriefing("evening"); assert.deepEqual(manager.readBriefing(report.id).data, report.data);
  const feed = JSON.stringify(manager.briefingFeed()); assert.ok(!feed.includes("cache") || feed.includes("cached")); assert.ok(!feed.includes(store.config().serviceToken));
});
test("concurrent scheduler ticks claim one report and desktop delivery is leased then acknowledged", async () => {
  manager.changeBriefings(s => { s.settings.activatedAt = at("07:00"); s.settings.discord = false; });
  await Promise.all([manager.runBriefingTick(), manager.runBriefingTick()]); assert.equal(manager.briefingState().reports.length, 1);
  const delivery = manager.leaseBriefingDesktop(); assert.equal(delivery.length, 1); assert.equal(manager.leaseBriefingDesktop().length, 0); manager.briefingDesktopFeedback(delivery[0].id, "sent");
  await manager.runBriefingTick(); assert.equal(manager.briefingState().reports.length, 1); assert.equal(manager.readBriefing(delivery[0].id).desktop.state, "sent");
  manager.updateBriefingSettings({ morningTime: "08:10" }); now = at("08:11"); await manager.runBriefingTick(); assert.equal(manager.briefingState().reports.length, 1, "Changing a round's time after delivery must not resend the same daily round");
});
test("disabling schedules while sources are in flight prevents publishing a scheduled report", async () => {
  enableSources(); manager.changeBriefings(s => { s.settings.activatedAt = at("07:00"); }); let release!: () => void; const wait = new Promise<void>(r => { release = r; });
  globalThis.fetch = async url => { await wait; return String(url).includes("notion") ? Response.json({ results: [], has_more: false }) : Response.json({ items: [] }); };
  const pending = manager.runBriefingTick(); manager.updateBriefingSettings({ enabled: false }); release(); await pending; assert.equal(manager.briefingState().reports.length, 0);
});
test("scheduler settings reject invalid/unknown fields and old queued sends expire when disabled", async () => {
  assert.throws(() => manager.updateBriefingSettings({ morningTime: "25:00" })); assert.throws(() => manager.updateBriefingSettings({ morningTime: "21:00" })); assert.throws(() => manager.updateBriefingSettings({ activatedAt: 0 }));
  manager.changeBriefings(s => { s.settings.activatedAt = at("07:00"); s.settings.discord = false; }); await manager.runBriefingTick(); manager.updateBriefingSettings({ enabled: false });
  assert.equal(manager.leaseBriefingDesktop().length, 0); manager.updateBriefingSettings({ enabled: true }); await manager.runBriefingTick(); assert.equal(manager.briefingState().reports.length, 1);
});
test("an unpublished cancelled round can move to a later time without reviving stale slots", async () => {
  enableSources(); manager.changeBriefings(s => { s.settings.activatedAt = at("07:00"); }); let release!: () => void; const wait = new Promise<void>(r => { release = r; });
  globalThis.fetch = async url => { await wait; return String(url).includes("notion") ? Response.json({ results: [], has_more: false }) : Response.json({ items: [] }); };
  const pending = manager.runBriefingTick(); manager.updateBriefingSettings({ enabled: false }); release(); await pending; assert.equal(manager.briefingState().reports.length, 0);
  manager.updateBriefingSettings({ enabled: true, morningTime: "09:00", discord: false }); now = at("09:00"); await manager.runBriefingTick(); assert.equal(manager.briefingState().reports.length, 1); assert.equal(manager.briefingState().slots.length, 1); assert.equal(manager.briefingState().slots[0].dueAt, at("09:00"));
});
test("expired summaries do not flood Windows/Discord after a restart outside catch-up", async () => {
  manager.changeBriefings(s => { s.settings.activatedAt = at("07:00"); s.settings.discord = false; }); await manager.runBriefingTick(); now = at("13:00"); await manager.runBriefingTick(); assert.equal(manager.leaseBriefingDesktop().length, 0); assert.equal(manager.briefingState().reports[0].desktop.state, "expired");
});
test("fresh source reads are cached with scope; outages stay visible and changed accounts cannot reuse old data", async () => {
  enableSources(); const t = task(); globalThis.fetch = async url => String(url).includes("notion") ? Response.json({ results: [notionTask(t)], has_more: false }) : Response.json({ items: [{ id: "appointment", summary: "ประชุม", start: { dateTime: iso("10:00") }, end: { dateTime: iso("11:00") } }] });
  const fresh = await manager.generateBriefing("morning"); assert.ok(fresh.data.sources.every(s => s.status === "fresh")); assert.equal(fresh.data.work.length, 1);
  globalThis.fetch = async () => { throw new Error("offline"); }; const cached = await manager.generateBriefing("morning"); assert.equal(cached.data.work.length, 1); assert.equal(cached.data.sources.find(s => s.name === "calendar")!.status, "cached");
  store.updateConfig(c => { c.notion.tasksId = id(); c.google.refreshToken = "changed-test-refresh"; }); const changed = await manager.generateBriefing("morning"); assert.equal(changed.data.work.length, 0); assert.equal(changed.data.agenda.length, 0); assert.equal(changed.data.sources.find(s => s.name === "calendar")!.status, "unavailable");
});
test("Discord sends an owner-only mention once with a stable nonce and a valid receipt", async () => {
  enableBot(); const report = await manager.generateBriefing("morning"); manager.queueBriefingDiscord(report.id); let count = 0;
  globalThis.fetch = async (_url, init) => { count++; const payload = JSON.parse(String(init?.body)); assert.equal(payload.enforce_nonce, true); assert.match(payload.nonce, /^\d{1,25}$/); assert.deepEqual(payload.allowed_mentions, { parse: [], users: ["234567890123456789"] }); return Response.json({ id: "345678901234567890" }); };
  await manager.dispatchBriefingDiscord(); manager.queueBriefingDiscord(report.id); await manager.dispatchBriefingDiscord(); assert.equal(count, 1); assert.equal(manager.readBriefing(report.id).discord.state, "sent");
});
test("lost Discord responses reconcile existing bot messages before retrying without duplicate posts", async () => {
  enableBot(); const report = await manager.generateBriefing("morning"); manager.queueBriefingDiscord(report.id); let posts = 0;
  globalThis.fetch = async (_url, init) => { if (init?.method === "POST") posts++; throw new Error("lost response"); }; await manager.dispatchBriefingDiscord(); assert.equal(manager.readBriefing(report.id).discord.state, "pending");
  now += 65000; globalThis.fetch = async (url, init) => { assert.notEqual(init?.method, "POST"); return String(url).includes("users/@me") ? Response.json({ id: "456789012345678901" }) : Response.json([{ id: "345678901234567890", timestamp: new Date(now).toISOString(), author: { id: "456789012345678901" }, content: `/briefing?report=${report.id}` }]); };
  await manager.dispatchBriefingDiscord(); assert.equal(posts, 1); assert.equal(manager.readBriefing(report.id).discord.state, "sent");
});
test("incomplete Discord history and invalid receipts retain retry state rather than claiming success", async () => {
  enableBot(); const report = await manager.generateBriefing("morning"); manager.queueBriefingDiscord(report.id); globalThis.fetch = async () => Response.json({}); await manager.dispatchBriefingDiscord(); assert.equal(manager.readBriefing(report.id).discord.state, "pending");
  now += 65000; let posts = 0; globalThis.fetch = async (url, init) => { if (init?.method === "POST") posts++; return String(url).includes("users/@me") ? Response.json({ id: "456789012345678901" }) : Response.json(Array.from({ length: 100 }, () => ({ id: "345678901234567890", timestamp: new Date(now).toISOString(), author: { id: "456789012345678901" }, content: "other" }))); };
  await manager.dispatchBriefingDiscord(); assert.equal(posts, 0); assert.equal(manager.readBriefing(report.id).discord.state, "pending");
});
test("turning off a delivery channel cancels retries independently of other reminders", async () => {
  enableBot(); const report = await manager.generateBriefing("morning"); manager.queueBriefingDiscord(report.id); manager.updateBriefingSettings({ discord: false }); await manager.dispatchBriefingDiscord(); assert.equal(manager.readBriefing(report.id).discord.state, "expired"); assert.throws(() => manager.queueBriefingDiscord(report.id));
});
test("corrupt state or corrupt cached rows are preserved and cannot silently erase report history", () => {
  const file = path.join(directory, "briefings.json"); fs.writeFileSync(file, "broken"); assert.throws(() => manager.briefingState(), /เสียหาย/); assert.throws(() => manager.updateBriefingSettings({ enabled: false })); assert.equal(fs.readFileSync(file, "utf8"), "broken");
  fs.rmSync(file); manager.changeBriefings(() => {}); const value = JSON.parse(fs.readFileSync(file, "utf8")); value.cache.tasks = { scope: "x", at: now, items: [{}] }; fs.writeFileSync(file, JSON.stringify(value)); assert.throws(() => manager.briefingState(), /เสียหาย/);
});
test("public and internal endpoints enforce host, origin, client header, IDs and service authentication", async () => {
  assert.equal((await route.GET(request(undefined, "GET", { host: "evil.example" }))).status, 403);
  assert.equal((await route.POST(request({ action: "generate", period: "morning" }, "POST", { origin: "https://evil.example" }))).status, 403);
  assert.equal((await route.POST(request({ action: "generate", period: "morning" }, "POST", { "x-axercise-client": "" }))).status, 403);
  assert.equal((await route.POST(request({ action: "read", id: "../secret" }))).status, 400);
  assert.equal((await feedback.POST(request({ id: "a".repeat(24), action: "sent" }))).status, 401);
  const generated = await route.POST(request({ action: "generate", period: "morning" })); assert.equal(generated.status, 200); const saved = await generated.json(); assert.match(saved.id, /^[a-f0-9]{24}$/);
});
test("all agents can generate/read real reports through authenticated MCP routing without sending", async () => {
  const call = (action: string, args: object = {}) => tools.POST(request({ action, agent: "secretary", args }, "POST", { authorization: `Bearer ${store.config().serviceToken}` }));
  const response = await call("briefings_generate", { period: "evening" }); assert.equal(response.status, 200); const r = await response.json(); assert.ok(r.url.endsWith(r.id)); assert.equal(r.discord.state, "off");
  assert.equal((await call("briefings_read", { id: r.id })).status, 200); const list = await (await call("briefings_list")).json(); assert.equal(list.history.length, 1); assert.equal(list.latest, undefined);
});
