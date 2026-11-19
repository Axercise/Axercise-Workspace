import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyHealthResults, emptyHealth, refreshHealthAlerts } from "../src/server/health-engine";
import type { HealthResult, HealthState } from "../src/lib/health";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axercise-health-test-"));
process.env.AXERCISE_DATA_DIR = directory;
const store = await import("../src/server/store.ts");
const health = await import("../src/server/health.ts");
const probes = await import("../src/server/health-probes.ts");
const api = await import("../src/app/api/health/route.ts");
const feedback = await import("../src/app/api/internal/health/route.ts");
const originalFetch = globalThis.fetch;
const NOW = Date.parse("2030-01-01T09:00:00+07:00");
const result = (id: HealthResult["id"] = "calendar", status: HealthResult["status"] = "healthy", problem: HealthResult["problem"] = "none"): HealthResult => ({ id, name: id, group: "calendar", status, problem, message: status === "healthy" ? "พร้อม" : "เชื่อมต่อไม่ได้", details: [], checkedAt: NOW, latencyMs: 10 });
beforeEach(() => {
  globalThis.fetch = originalFetch;
  store.atomicJSON(path.join(directory, "health.json"), emptyHealth());
  store.updateConfig(c => { c.notion.token = "TEST_NOTION_SECRET"; c.notion.tasksId = "tasks"; c.notion.notesId = "notes"; c.notion.learningId = ""; c.google.refreshToken = "TEST_REFRESH_SECRET"; c.google.accessToken = "TEST_ACCESS_SECRET"; c.google.expiresAt = Date.now() + 3600000; const bot = c.discord.find(item => item.agent === "secretary")!; bot.token = "TEST_BOT_SECRET"; bot.allowedUserId = "123456789012345678"; bot.channelId = "234567890123456789"; });
});
after(() => { globalThis.fetch = originalFetch; const target = path.resolve(directory); assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep)); assert.ok(path.basename(target).startsWith("axercise-health-test-")); fs.rmSync(target, { recursive: true, force: true }); });

test("initial healthy/unconfigured services and a transient failure never create a recovery notification", () => {
  const state = emptyHealth();
  applyHealthResults(state, [result(), result("openrouter", "unconfigured", "setup")], NOW, true);
  applyHealthResults(state, [result("calendar", "offline", "network")], NOW + 1000);
  applyHealthResults(state, [result()], NOW + 20000);
  assert.equal(state.events.length, 0); assert.equal(state.alerts.length, 0); assert.equal(state.services.calendar?.lastSuccessAt, NOW + 20000);
});
test("sustained outages batch into one alert and do not duplicate after persistence and rechecks", () => {
  let state = emptyHealth();
  const down = [result("calendar", "offline", "network"), result("notion", "offline", "network")];
  applyHealthResults(state, down, NOW); applyHealthResults(state, down, NOW + 5000); assert.equal(state.alerts.length, 0);
  applyHealthResults(state, down, NOW + 60000); assert.equal(state.events.length, 2); assert.equal(state.alerts.length, 1);
  state = JSON.parse(JSON.stringify(state)); applyHealthResults(state, down, NOW + 120000); assert.equal(state.alerts.length, 1); assert.equal(state.events.length, 2);
});
test("recovery supersedes an undelivered outage and is announced once", () => {
  const state = emptyHealth(), down = result("calendar", "offline", "network");
  applyHealthResults(state, [down], NOW); applyHealthResults(state, [down], NOW + 60000);
  applyHealthResults(state, [result()], NOW + 120000);
  assert.equal(state.alerts[0].superseded, true); assert.equal(state.events.at(-1)?.kind, "recovered"); assert.equal(state.alerts.length, 2);
  applyHealthResults(state, [result()], NOW + 180000); assert.equal(state.alerts.length, 2);
});
test("partial recovery removes only resolved services from a pending outage batch", () => {
  const state = emptyHealth(), down = [result("calendar", "offline", "network"), result("notion", "offline", "network")];
  applyHealthResults(state, down, NOW); applyHealthResults(state, down, NOW + 60000);
  applyHealthResults(state, [result()], NOW + 120000);
  assert.equal(state.alerts[0].superseded, undefined); assert.ok(state.alerts[0].message.includes("notion")); assert.ok(!state.alerts[0].message.includes("calendar"));
});
test("confirmed authentication loss after a good check alerts immediately; disabled alerts still retain history", () => {
  const state = emptyHealth(); applyHealthResults(state, [result()], NOW);
  applyHealthResults(state, [result("calendar", "auth_required", "auth")], NOW + 1000); assert.equal(state.alerts.length, 1);
  state.settings.alertsEnabled = false; applyHealthResults(state, [result()], NOW + 2000); assert.equal(state.events.at(-1)?.kind, "recovered"); assert.equal(state.alerts.length, 1);
  refreshHealthAlerts(state, NOW + 5 * 3600000); assert.equal(state.alerts[0].superseded, true);
});
function incident(): HealthState { const state = emptyHealth(), now = Date.now(); applyHealthResults(state, [result("calendar", "offline", "network")], now - 60000); applyHealthResults(state, [result("calendar", "offline", "network")], now); return state; }
test("native health delivery leases prevent duplicate dispatch and feedback persists", () => {
  store.atomicJSON(path.join(directory, "health.json"), incident());
  const pending = health.leaseHealthDesktop(); assert.equal(pending.length, 1); assert.equal(health.leaseHealthDesktop().length, 0);
  health.healthDesktopFeedback(pending[0].id, "failed"); health.changeHealth(state => { state.alerts[0].desktop.attemptedAt = 0; });
  assert.equal(health.leaseHealthDesktop()[0].id, pending[0].id); health.healthDesktopFeedback(pending[0].id, "sent"); assert.equal(health.leaseHealthDesktop().length, 0);
  assert.equal(health.healthState().alerts[0].desktop.state, "sent");
});
test("Discord retries failures, only pings the configured owner, and sends a recovery instead of a stale outage", async () => {
  store.atomicJSON(path.join(directory, "health.json"), incident()); let fail = true; const sent: any[] = [];
  globalThis.fetch = async (_url, options) => { if (fail) throw new Error("offline"); sent.push(JSON.parse(String(options?.body))); return Response.json({ id: "test-message" }); };
  await health.dispatchHealthDiscord(); assert.equal(health.healthState().alerts[0].discord.state, "pending");
  health.changeHealth(state => applyHealthResults(state, [result()], Date.now() + 1000)); fail = false;
  await health.dispatchHealthDiscord(); await health.dispatchHealthDiscord();
  assert.equal(sent.length, 1); assert.ok(sent[0].content.includes("กลับมาพร้อม")); assert.deepEqual(sent[0].allowed_mentions, { parse: [], users: ["123456789012345678"] });
});
test("disabling status alerts stops queued messages without removing the incident history", () => {
  store.atomicJSON(path.join(directory, "health.json"), incident()); health.updateHealthSettings({ alertsEnabled: false });
  assert.equal(health.leaseHealthDesktop().length, 0); assert.equal(health.healthFeed().events.length, 1); assert.equal(health.healthState().alerts[0].superseded, true);
});
test("Discord channel overwrites honor roles, member denials and administrator permissions", () => {
  const guild = "guild", bot = "bot", send = 1n << 11n, view = 1n << 10n;
  const roles = [{ id: guild, permissions: String(view) }, { id: "sender", permissions: String(send) }];
  const overwrites = [{ id: guild, type: 0, deny: String(send), allow: "0" }, { id: "sender", type: 0, deny: "0", allow: String(send) }, { id: bot, type: 1, deny: String(send), allow: "0" }];
  assert.equal(probes.channelPermissions(guild, bot, roles, ["sender"], overwrites) & send, 0n);
  assert.equal(probes.channelPermissions(guild, bot, [...roles, { id: "admin", permissions: "8" }], ["admin"], overwrites) & send, send);
});
test("Notion probes require actual database access and never expose error bodies or credentials", async () => {
  globalThis.fetch = async input => String(input).endsWith("users/me") ? Response.json({ id: "owner" }) : Response.json({ error: "TEST_NOTION_SECRET" }, { status: 403 });
  const [connection] = await probes.probeConnections("notion"); assert.equal(connection.status, "degraded"); assert.equal(connection.problem, "permission"); assert.ok(!JSON.stringify(connection).includes("TEST_NOTION_SECRET"));
});
test("Calendar health renews a rejected cached access token and validates access before reporting ready", async () => {
  let reads = 0, refreshes = 0;
  globalThis.fetch = async input => { if (String(input).includes("oauth2.googleapis.com")) { refreshes++; return Response.json({ access_token: "RENEWED_ACCESS_SECRET", expires_in: 3600 }); } reads++; return reads === 1 ? Response.json({}, { status: 401 }) : Response.json({ items: [] }); };
  const [connection] = await probes.probeConnections("calendar"); assert.equal(connection.status, "healthy"); assert.equal(refreshes, 1); assert.equal(reads, 2); assert.ok(!JSON.stringify(connection).includes("ACCESS_SECRET"));
});
test("a valid Discord token with a disconnected local gateway is not reported ready", async () => {
  store.updateConfig(c => { const bot = c.discord.find(item => item.agent === "hermes")!; bot.token = "TEST_HERMES_SECRET"; bot.allowedUserId = "123456789012345678"; });
  globalThis.fetch = async input => { const url = String(input); if (url.includes("127.0.0.1")) return Response.json({ platform: "hermes-agent", gateway_state: "running", active_agents: 0, platforms: { discord: { state: "disconnected" } } }); if (url.endsWith("oauth2/applications/@me")) return Response.json({ id: "bot", flags: 1 << 19 }); if (url.endsWith("users/@me/guilds")) return Response.json([{ id: "guild" }]); return Response.json({}, { status: 404 }); };
  const [connection] = await probes.probeConnections("discord:hermes"); assert.equal(connection.status, "degraded"); assert.equal(connection.problem, "gateway");
});
test("repair refuses an active API chat even when Discord has no active agents", async () => {
  globalThis.fetch = async () => Response.json({ platform: "hermes-agent", gateway_state: "running", active_agents: 0, gateway_busy: false, readiness: { checks: { background_queues: { active_api_runs: 1 } } } });
  await assert.rejects(health.repairHealthGateway("ai:hermes"), /กำลังทำงาน/);
});
test("health endpoints validate origins, authentication and repair targets before doing work", async () => {
  const request = (data: unknown, headers: Record<string, string> = {}) => new Request("http://127.0.0.1:3210/api/health", { method: "POST", headers: { host: "127.0.0.1:3210", "x-axercise-client": "workspace", "content-type": "application/json", ...headers }, body: JSON.stringify(data) });
  assert.equal((await api.POST(request({ action: "check" }, { origin: "https://unrelated.invalid" }))).status, 403);
  assert.equal((await api.POST(request({ action: "repair", id: "../../arbitrary-command" }))).status, 400);
  assert.equal((await api.POST(request({ action: "repair", id: "calendar" }))).status, 400);
  assert.equal((await api.POST(request({ action: "settings", settings: { alertsEnabled: "true" } }))).status, 400);
  assert.equal((await api.POST(request({ action: "check", command: "arbitrary" }))).status, 400);
  assert.equal((await feedback.POST(request({ id: "a".repeat(24), action: "sent" }))).status, 401);
  assert.ok(!JSON.stringify(health.healthFeed()).includes(store.config().serviceToken));
});
test("the post-repair check waits for an older check and then takes a fresh sample", async () => {
  let release!: () => void, reached!: () => void, reads = 0;
  const waiting = new Promise<void>(resolve => { reached = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  globalThis.fetch = async () => { reads++; if (reads === 1) { reached(); await gate; } return Response.json({ items: [] }); };
  const old = health.runHealthCheck(true, "calendar", true); await waiting;
  const fresh = health.runHealthCheck(true, "calendar", true); release(); await Promise.all([old, fresh]);
  assert.equal(reads, 2); assert.equal(health.healthFeed().services.find(item => item.id === "calendar")?.status, "healthy");
});
test("a requested restart has a grace period and is cleared once both AI and Discord return", () => {
  const state = emptyHealth(); state.repairGrace = { developer: NOW + 90000 };
  state.services["ai:developer"] = { ...result("ai:developer"), checkedAt: NOW - 1000, failures: 0 };
  state.services["discord:developer"] = { ...result("discord:developer"), checkedAt: NOW - 1000, failures: 0 };
  applyHealthResults(state, [result("notion")], NOW); assert.equal(state.repairGrace.developer, NOW + 90000);
  const down = [result("ai:developer", "degraded", "gateway"), result("discord:developer", "degraded", "gateway")];
  applyHealthResults(state, down, NOW); applyHealthResults(state, down, NOW + 60000); assert.equal(state.alerts.length, 0);
  applyHealthResults(state, [result("ai:developer"), result("discord:developer")], NOW + 70000); assert.equal(state.repairGrace.developer, undefined); assert.equal(state.events.length, 0);
});
