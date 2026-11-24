import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("first-run setup waits for the gateway, provider and both Notion databases", { skip: process.platform !== "win32" }, async t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "axercise-setup-test-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  process.env.AXERCISE_DATA_DIR = path.join(fixture, "private");
  const { POST } = await import("../src/app/api/setup/route");
  const { updateConfig, config } = await import("../src/server/store");
  const submit = (payload: object) => POST(new Request("http://localhost/api/setup", {
    method: "POST", headers: { host: "localhost", "x-axercise-client": "workspace" }, body: JSON.stringify(payload),
  }));
  assert.equal((await submit({ action: "finish" })).status, 400);
  assert.equal((await submit({ action: "runtime", directory: fixture, approvalMode: "manual" })).status, 400);
  for (const file of ["hermes_cli/main.py", ".venv/Scripts/python.exe"]) {
    const full = path.join(fixture, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, "");
  }
  assert.equal((await submit({ action: "runtime", directory: fixture, approvalMode: "manual" })).status, 200);
  updateConfig(c => {
    c.openrouterKey = "fixture";
    Object.assign(c.notion, { token: "fixture", tasksId: "tasks", notesId: "notes" });
  });
  let missing = "gateway";
  t.mock.method(globalThis, "fetch", async (input: string) => {
    const url = new URL(input);
    if (url.hostname === "127.0.0.1") return Response.json({ platform: "hermes-agent", gateway_state: missing === "gateway" ? "starting" : "running" });
    if (url.hostname === "openrouter.ai") return Response.json({}, { status: missing === "ai" ? 401 : 200 });
    assert.equal(url.hostname, "api.notion.com");
    const properties = Object.fromEntries(["Name", "Details", "Deadline", "Important", "Urgent", "Status", "Content", "Tags"].map(key => [key, {}]));
    return Response.json({ properties }, { status: missing === "notes" && url.pathname.endsWith("/notes") ? 403 : 200 });
  });
  for (missing of ["gateway", "ai", "notes"]) {
    assert.equal((await submit({ action: "finish" })).status, 400);
    assert.equal(config().setupComplete, false);
  }
  missing = "";
  assert.equal((await submit({ action: "finish" })).status, 200);
  assert.equal(config().setupComplete, true);
  assert.equal(config().google.refreshToken, "");
  assert.ok(config().discord.every(bot => !bot.token));
});
