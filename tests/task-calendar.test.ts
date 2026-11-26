import test, { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axercise-task-calendar-test-"));
process.env.AXERCISE_DATA_DIR = directory;
const store = await import("../src/server/store.ts");
const notion = await import("../src/server/notion.ts");
const calendar = await import("../src/server/calendar.ts");
const links = await import("../src/server/task-calendar.ts");
const originalFetch = globalThis.fetch;
const pages = new Map<string, any>(), events = new Map<string, any>();
let created = 0, lostCreate = false, googleDown = false, notionDown = false;
let hold: (() => Promise<void>) | undefined;
const writes: { method: string; key: string }[] = [];
const taskInput = (extra: Record<string, unknown> = {}) => ({ title: "การบ้านทดสอบ", details: "เก็บรายละเอียดเดิม", deadline: "2030-06-15", important: true, urgent: false, status: "Todo", ...extra });
function plain(properties: Record<string, any>) {
  return Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, { ...value, ...(value.title ? { title: value.title.map((r: any) => ({ plain_text: r.text.content })) } : {}), ...(value.rich_text ? { rich_text: value.rich_text.map((r: any) => ({ plain_text: r.text.content })) } : {}) }]));
}
beforeEach(() => {
  pages.clear(); events.clear(); writes.length = 0; created = 0; lostCreate = false; googleDown = false; notionDown = false; hold = undefined;
  store.atomicJSON(path.join(directory, "task-calendar.json"), { version: 1, links: {} });
  store.updateConfig(c => { c.notion.token = "TEST_NOTION"; c.notion.tasksId = "11111111-1111-4111-8111-111111111111"; c.google.refreshToken = "TEST_REFRESH"; c.google.accessToken = "TEST_ACCESS"; c.google.expiresAt = Date.now() + 3600000; c.google.calendarId = "primary"; });
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input)), method = options?.method || "GET", data = options?.body ? JSON.parse(String(options.body)) : undefined;
    if (url.hostname === "api.notion.com") {
      if (notionDown) throw new Error("offline");
      if (url.pathname.includes("data_sources")) return Response.json({ results: [...pages.values()].filter(p => !p.in_trash), has_more: false });
      const id = url.pathname.split("/").at(-1)!;
      if (method === "GET") return Response.json(pages.get(id));
      if (method === "POST") { const page = { id: randomUUID(), parent: { data_source_id: store.config().notion.tasksId }, properties: plain(data.properties), url: "https://notion.so/test" }; pages.set(page.id, page); return Response.json(page); }
      const page = pages.get(id); assert.ok(page); if (data.properties) page.properties = { ...page.properties, ...plain(data.properties) }; if (data.in_trash) page.in_trash = true; return Response.json(page);
    }
    assert.equal(url.hostname, "www.googleapis.com");
    if (googleDown) throw new Error("offline");
    if (hold) await hold();
    const parts = url.pathname.split("/"), eventIndex = parts.indexOf("events"), calendarId = decodeURIComponent(parts[eventIndex - 1]), id = parts[eventIndex + 1];
    const key = `${calendarId}:${id || data?.id}`;
    const event = events.get(key);
    if (method === "GET") return id ? event ? Response.json(event, { status: event.status === "cancelled" ? 410 : 200 }) : Response.json({}, { status: 404 }) : Response.json({ items: [...events.entries()].filter(([k]) => k.startsWith(`${calendarId}:`)).map(([, e]) => e) });
    writes.push({ method, key });
    if (method === "POST") {
      if (event) return Response.json({}, { status: 409 });
      created++; const saved = { ...data, htmlLink: `https://calendar.google.com/test/${data.id}` }; events.set(key, saved);
      if (lostCreate) { lostCreate = false; throw new Error("response lost after insert"); } return Response.json(saved);
    }
    if (method === "PATCH") { assert.ok(event); Object.assign(event, data); return Response.json(event); }
    if (method === "DELETE") { assert.ok(event); event.status = "cancelled"; return new Response(null, { status: 204 }); }
    throw new Error("Unexpected mock request");
  };
});
after(() => { globalThis.fetch = originalFetch; const target = path.resolve(directory); assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep)); assert.ok(path.basename(target).startsWith("axercise-task-calendar-test-")); fs.rmSync(target, { recursive: true, force: true }); });

test("Calendar linking is optional and uses the existing To-do date as one all-day event with exclusive end", async () => {
  const task = await notion.saveTask(taskInput()); assert.equal(created, 0);
  const linked = await notion.saveTask(taskInput({ calendarEnabled: true }), task.id);
  assert.equal(linked.id, task.id); assert.equal(pages.size, 1); assert.equal(linked.calendar?.state, "synced"); assert.equal(created, 1);
  const event = [...events.values()][0]; assert.deepEqual(event.start, { date: "2030-06-15" }); assert.deepEqual(event.end, { date: "2030-06-16" });
  assert.equal(event.extendedProperties.private.axerciseTaskId, task.id);
  assert.equal((await calendar.listEvents("2030-06-15T00:00:00+07:00", "2030-06-16T00:00:00+07:00"))[0].task?.id, task.id);
});

test("task edits, timed deadlines, completion and reopening update the same Calendar item", async () => {
  const task = await notion.saveTask(taskInput({ calendarEnabled: true }));
  await notion.saveTask(taskInput({ title: "แก้ชื่องาน", deadline: "2030-06-16T14:30:00+07:00", status: "Done" }), task.id);
  const event = [...events.values()][0]; assert.equal(created, 1); assert.equal(event.summary, "✓ แก้ชื่องาน"); assert.equal(event.start.dateTime, "2030-06-16T14:30:00+07:00");
  assert.equal(Date.parse(event.end.dateTime) - Date.parse(event.start.dateTime), 30 * 60000); assert.equal(event.transparency, "transparent"); assert.equal(event.extendedProperties.private.axerciseTaskStatus, "Done");
  await notion.saveTask(taskInput({ status: "Doing" }), task.id); assert.equal(created, 1); assert.equal(event.summary, "การบ้านทดสอบ"); assert.equal(event.extendedProperties.private.axerciseTaskStatus, "Doing");
});

test("matrix placement preserves newer task details, date, status and the existing Calendar link", async () => {
  const task = await notion.saveTask(taskInput({ calendarEnabled: true }));
  const eventId = task.calendar!.eventId;
  // Simulate changes made in Notion after the board loaded its original card.
  Object.assign(pages.get(task.id).properties, plain({
    Name: { title: [{ text: { content: "ชื่อที่แก้ใน Notion" } }] },
    Details: { rich_text: [{ text: { content: "รายละเอียดใหม่จากอีกช่องทาง" } }] },
    Deadline: { date: { start: "2030-06-18" } },
    Status: { select: { name: "Doing" } },
  }));
  const route = await import("../src/app/api/notion/route");
  const response = await route.PATCH(new Request(`http://localhost/api/notion?kind=tasks&action=matrix&id=${task.id}`, {
    method: "PATCH", headers: { host: "localhost", "x-axercise-client": "workspace" },
    body: JSON.stringify({ important: false, urgent: true }),
  }));
  assert.equal(response.status, 200);
  const moved = await response.json();
  assert.equal(moved.important, false);
  assert.equal(moved.urgent, true);
  assert.equal(moved.title, "ชื่อที่แก้ใน Notion");
  assert.equal(moved.details, "รายละเอียดใหม่จากอีกช่องทาง");
  assert.equal(moved.deadline, "2030-06-18");
  assert.equal(moved.status, "Doing");
  assert.equal(moved.calendar.eventId, eventId);
  assert.equal(created, 1);
  const done = await notion.updateMatrixTask(task.id, { status: "Done" });
  assert.equal(done.important, false);
  assert.equal(done.urgent, true);
  assert.equal(done.calendar?.eventId, eventId);
  assert.equal([...events.values()][0].transparency, "transparent");
});

test("matrix moves reject unavailable, archived or foreign tasks and unrelated update fields", async () => {
  const task = await notion.saveTask(taskInput());
  await assert.rejects(notion.updateMatrixTask(task.id, { important: false, urgent: false, title: "overwrite" }));
  notionDown = true;
  await assert.rejects(notion.updateMatrixTask(task.id, { important: false, urgent: false }));
  notionDown = false;
  assert.equal(pages.get(task.id).properties.Important.checkbox, true);
  pages.get(task.id).in_trash = true;
  await assert.rejects(notion.updateMatrixTask(task.id, { important: false, urgent: false }), { status: 409 });
  pages.get(task.id).in_trash = false;
  pages.get(task.id).parent.data_source_id = "another-source";
  await assert.rejects(notion.updateMatrixTask(task.id, { important: false, urgent: false }), { status: 403 });
});

test("a lost Calendar create response retains the saved task and retries from durable state without duplication", async () => {
  lostCreate = true;
  const task = await notion.saveTask(taskInput({ calendarEnabled: true }));
  assert.equal(task.calendar?.enabled, true); assert.equal(task.calendar?.state, "error"); assert.equal(pages.size, 1); assert.equal(created, 1);
  const disk = JSON.parse(fs.readFileSync(path.join(directory, "task-calendar.json"), "utf8")); for (const link of Object.values(disk.links) as any[]) link.retryAt = 0; store.atomicJSON(path.join(directory, "task-calendar.json"), disk);
  await links.dispatchTaskCalendar();
  assert.equal(links.decorateTaskCalendar(task).calendar?.state, "synced"); assert.equal(created, 1); assert.equal(pages.size, 1);
});

test("unlink removes only the Calendar copy, relink creates a fresh ID and task archive cleans up its projection", async () => {
  const task = await notion.saveTask(taskInput({ calendarEnabled: true })); const first = task.calendar!.eventId;
  await notion.saveTask(taskInput({ calendarEnabled: false }), task.id);
  assert.equal(pages.get(task.id).in_trash, undefined); assert.equal([...events.values()][0].status, "cancelled");
  const relinked = await notion.saveTask(taskInput({ calendarEnabled: true }), task.id); assert.notEqual(relinked.calendar?.eventId, first); assert.equal(created, 2);
  await notion.archiveNotion("task", task.id); assert.equal(pages.get(task.id).in_trash, true); assert.ok([...events.values()].every(event => event.status === "cancelled"));
});

test("external Notion edits synchronize, a successful deletion removes the projection, a read failure preserves it", async () => {
  const task = await notion.saveTask(taskInput({ calendarEnabled: true }));
  pages.get(task.id).properties.Name = { title: [{ plain_text: "แก้จาก Notion" }] }; await notion.listTasks(); await links.dispatchTaskCalendar(); assert.equal([...events.values()][0].summary, "แก้จาก Notion");
  notionDown = true; await assert.rejects(notion.listTasks()); assert.equal(links.decorateTaskCalendar(task).calendar?.enabled, true);
  notionDown = false; pages.get(task.id).in_trash = true; await notion.listTasks(); await links.dispatchTaskCalendar(); assert.equal([...events.values()][0].status, "cancelled");
});

test("removing the source date pauses the link and restoring a date resumes without resurrecting a deleted Google ID", async () => {
  const task = await notion.saveTask(taskInput({ calendarEnabled: true }));
  pages.get(task.id).properties.Deadline = { date: null }; await notion.listTasks(); await links.dispatchTaskCalendar();
  assert.equal(links.decorateTaskCalendar(task).calendar?.state, "paused"); assert.equal([...events.values()][0].status, "cancelled");
  pages.get(task.id).properties.Deadline = { date: { start: "2030-06-20" } }; await notion.listTasks(); await links.dispatchTaskCalendar(); assert.equal(created, 2); assert.equal(links.decorateTaskCalendar(task).calendar?.state, "synced");
});

test("ownership prevents modifying or deleting an unrelated event", async () => {
  const task = await notion.saveTask(taskInput({ calendarEnabled: true }));
  const event = [...events.values()][0]; event.extendedProperties.private.axerciseTaskId = randomUUID(); const before = writes.length;
  const saved = await notion.saveTask(taskInput({ calendarEnabled: false }), task.id);
  assert.equal(saved.calendar?.state, "error"); assert.equal(writes.length, before); assert.equal(event.status, undefined);
});

test("links retain their original Calendar target until explicitly unlinked and linked again", async () => {
  const task = await notion.saveTask(taskInput({ calendarEnabled: true })); store.updateConfig(c => { c.google.calendarId = "another@example.test"; });
  await notion.saveTask(taskInput({ title: "ยังอยู่ปฏิทินเดิม" }), task.id); assert.ok(writes.at(-1)!.key.startsWith("primary:"));
  await notion.saveTask(taskInput({ calendarEnabled: false }), task.id); assert.ok(writes.at(-1)!.key.startsWith("primary:"));
  await notion.saveTask(taskInput({ calendarEnabled: true }), task.id); assert.ok(writes.at(-1)!.key.startsWith("another@example.test:"));
});

test("concurrent edits while Calendar is waiting settle on the latest task without an extra event", async () => {
  const task = await notion.saveTask(taskInput({ calendarEnabled: true }));
  let release!: () => void, reached!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), waiting = new Promise<void>(resolve => { reached = resolve; });
  hold = async () => { reached(); await gate; };
  links.observeTaskCalendar({ ...task, title: "เวอร์ชันสอง" }); const syncing = links.syncTaskCalendar(task.id); await waiting;
  links.observeTaskCalendar({ ...task, title: "เวอร์ชันล่าสุด" }); hold = undefined; release(); await syncing;
  assert.equal([...events.values()][0].summary, "เวอร์ชันล่าสุด"); assert.equal(created, 1); assert.equal(links.decorateTaskCalendar(task).calendar?.state, "synced");
});

test("a missing date is rejected before writing a task when Calendar linking is requested", async () => {
  await assert.rejects(notion.saveTask(taskInput({ deadline: "", calendarEnabled: true }))); assert.equal(pages.size, 0); assert.equal(created, 0);
});
