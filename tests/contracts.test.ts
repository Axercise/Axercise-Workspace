import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
process.env.AXERCISE_DATA_DIR = path.join(process.cwd(), ".axercise", "contract-tests");
const { taskSchema, eventSchema } = await import("../src/server/schemas.ts");
const { localRequest, AppError, body } = await import("../src/server/http.ts");
const { config, publicSettings, updateConfig } = await import("../src/server/store.ts");
const { saveTask } = await import("../src/server/notion.ts");
const { consumeSSE } = await import("../src/lib/client.ts");
const { readDrafts, writeDrafts } = await import("../src/lib/drafts.ts");
const { normalizeModels } = await import("../src/lib/models.ts");
test("local API rejects cross-origin writes and DNS rebinding hosts", () => {
  for (const [host, origin, marker] of [["evil.example", "http://evil.example", "workspace"], ["127.0.0.1:3210", "https://evil.example", "workspace"], ["127.0.0.1:3210", "http://127.0.0.1:3210", ""]]) {
    assert.throws(() => localRequest(new Request("http://127.0.0.1:3210/api/settings", { method: "PATCH", headers: { host, origin, "x-axercise-client": marker } })), (e: unknown) => e instanceof AppError && e.status === 403);
  }
  assert.doesNotThrow(() => localRequest(new Request("http://127.0.0.1:3210/api/settings", { method: "PATCH", headers: { host: "127.0.0.1:3210", origin: "http://127.0.0.1:3210", "x-axercise-client": "workspace" } })));
});
test("internal tools require the service key even for loopback callers", () => {
  const req = (token: string) => new Request("http://127.0.0.1:3210/api/tools", { method: "POST", headers: { host: "127.0.0.1:3210", authorization: `Bearer ${token}` } });
  assert.throws(() => localRequest(req("a".repeat(64)), true));
  assert.throws(() => localRequest(req("ก".repeat(64)), true));
  assert.doesNotThrow(() => localRequest(req(config().serviceToken), true));
});
test("public settings cannot expose provider, bot, service, or Google secrets", () => {
  updateConfig(c => { c.openrouterKey = "private-provider-secret"; c.notion.token = "private-notion-secret"; c.google.refreshToken = "private-google-secret"; c.discord[0].token = "private-discord-secret"; });
  const json = JSON.stringify(publicSettings());
  for (const value of ["private-provider-secret", "private-notion-secret", "private-google-secret", "private-discord-secret", config().serviceToken, ...Object.values(config().gatewayKeys)]) assert.equal(json.includes(value), false);
  assert.equal(publicSettings().openrouterConfigured, true);
});
test("task and calendar contracts reject invalid deadlines and reversed event times", () => {
  assert.equal(taskSchema.safeParse({ title: "ทบทวนบทเรียน", deadline: "2026-11-18", important: true, urgent: false }).success, true);
  assert.equal(taskSchema.safeParse({ title: " ", deadline: "tomorrow" }).success, false);
  assert.equal(eventSchema.safeParse({ title: "เรียน", start: "2026-11-18T10:00:00+07:00", end: "2026-11-18T09:00:00+07:00" }).success, false);
});
test("Notion writes cannot edit pages outside the new Tasks database", async () => {
  updateConfig(c => { c.notion.tasksId = "11111111-1111-1111-1111-111111111111"; });
  const original = globalThis.fetch; let writes = 0;
  globalThis.fetch = async (_url, init) => { if (init?.method === "PATCH") writes++; return Response.json({ id: "page", parent: { data_source_id: "22222222-2222-2222-2222-222222222222" } }); };
  try { await assert.rejects(saveTask({ title: "task" }, "page"), (e: unknown) => e instanceof AppError && e.status === 403); assert.equal(writes, 0); } finally { globalThis.fetch = original; }
});
test("Notion create stores long content in valid rich-text chunks and correct data source", async () => {
  const original = globalThis.fetch; let payload: Record<string, any> = {};
  globalThis.fetch = async (_url, init) => { payload = JSON.parse(String(init?.body)); return Response.json({ id: "task-1", properties: { Name: { title: [{ plain_text: "task" }] }, Details: { rich_text: [{ plain_text: "x".repeat(4500) }] } }, url: "https://notion.so/task-1" }); };
  try { const t = await saveTask({ title: "task", details: "x".repeat(4500) }); assert.equal(payload.parent.data_source_id, config().notion.tasksId); assert.equal(payload.properties.Details.rich_text.length, 3); assert.equal(payload.properties.Details.rich_text.every((r: any) => r.text.content.length <= 2000), true); assert.equal(t.details.length, 4500); } finally { globalThis.fetch = original; }
});
test("MCP coordinator can delegate while specialist tool lists remain isolated", () => {
  for (const role of ["hermes", "secretary", "developer"]) {
    const input = [JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }), JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })].join("\n") + "\n";
    const r = spawnSync(process.execPath, ["scripts/workspace-mcp.mjs"], { input, encoding: "utf8", env: { ...process.env, AXERCISE_AGENT: role, AXERCISE_SERVICE_TOKEN: "DO_NOT_OUTPUT_THIS" }, windowsHide: true });
    assert.equal(r.status, 0); assert.equal(r.stdout.includes("DO_NOT_OUTPUT_THIS"), false);
    const responses = r.stdout.trim().split("\n").map(s => JSON.parse(s)); const tools = responses.find(r => r.id === 2).result.tools;
    assert.equal(tools.some((t: any) => t.name === "agent_delegate"), role === "hermes"); assert.equal(tools.some((t: any) => t.name === "calendar_create"), true);
  }
});
test("streaming handles UTF-8 and CRLF boundaries split across network chunks", async () => {
  const bytes = new TextEncoder().encode('event: assistant.delta\r\ndata: {"delta":"สวัสดี"}\r\n\r\nevent: run.completed\r\ndata: {"completed":true}\r\n\r\n');
  let cursor = 0; const stream = new ReadableStream({ pull(controller) { if (cursor >= bytes.length) { controller.close(); return; } controller.enqueue(bytes.slice(cursor, ++cursor)); } });
  const events: [string, unknown][] = []; await consumeSSE(new Response(stream), (name, value) => events.push([name, value]));
  assert.deepEqual(events, [["assistant.delta", { delta: "สวัสดี" }], ["run.completed", { completed: true }]]);
});
test("offline drafts survive reloading and corrupt storage does not crash the workspace", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const drafts = [{ id: "draft-1", kind: "note" as const, title: "ความคิด", content: "เก็บไว้ก่อนมีอินเทอร์เน็ต", savedAt: "2026-11-16T10:00:00Z" }];
  writeDrafts(storage, drafts); assert.deepEqual(readDrafts({ ...storage }), drafts);
  assert.deepEqual(readDrafts({ getItem: () => "corrupt", setItem: () => {} }), []);
  assert.deepEqual(readDrafts({ getItem: () => '[null,{"kind":"note"}]', setItem: () => {} }), []);
  assert.throws(() => writeDrafts({ getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } }, drafts));
  assert.deepEqual(readDrafts(storage), drafts);
});
test("model picker reads Hermes string model lists with provider identity intact", () => {
  const options = normalizeModels({ provider: "openrouter", model: "vendor/current", providers: [{ slug: "openrouter", models: ["vendor/free:free", "vendor/free:free"], capabilities: { "vendor/free:free": { vision: true } } }, { slug: "openai-codex", models: ["account-model"] }] });
  assert.deepEqual(options, [{ id: "vendor/free:free", provider: "openrouter", label: "vendor/free:free", vision: true }, { id: "account-model", provider: "openai-codex", label: "account-model", vision: undefined }]);
});
test.after(() => { const target = path.resolve(process.env.AXERCISE_DATA_DIR!); assert.equal(target.startsWith(path.resolve(process.cwd(), ".axercise") + path.sep), true); fs.rmSync(target, { recursive: true, force: true }); });
