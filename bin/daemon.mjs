import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createController, CONTROL_HOST, CONTROL_PORT } from "./control.mjs";
import { root, dataDir, agents, ensureConfig, readConfig, writeJSON, findHermes, hermesArgs, provision, agentEnv } from "./runtime.mjs";
import { initializeDesktopNotifications, sendDesktopNotifications, sendDesktopHealthNotifications, sendDesktopBriefings } from "./desktop-notifications.mjs";
ensureConfig();
const children = new Map(); let stopping = false, fingerprint = "", timer, tick;
const retry = new Map();
const intentionalStops = new WeakSet();
const instanceId = randomUUID(), startedAt = new Date().toISOString();
function terminate(proc) { if (!proc || proc.exitCode !== null || !proc.pid) return; if (process.platform === "win32") { try { execFileSync("taskkill.exe", ["/PID", String(proc.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch {} } else proc.kill(); }
const runtimePath = path.join(dataDir, "runtime.json");
function record() { writeJSON(runtimePath, { pid: process.pid, instanceId, startedAt, webPid: children.get("web")?.pid || null, children: [...children.values()].map(p => p.pid).filter(Boolean) }); }
function start(name, command, args, cwd, env) {
  const log = fs.openSync(path.join(dataDir, `${name}.log`), "a");
  const proc = spawn(command, args, { cwd, env, windowsHide: true, stdio: ["ignore", log, log] }); fs.closeSync(log); children.set(name, proc); record();
  proc.on("error", () => { children.delete(name); retry.set(name, Date.now() + 30000); fs.appendFileSync(path.join(dataDir, `${name}.log`), "\nProcess could not start. Check the installed runtime.\n"); });
  proc.on("exit", () => { if (children.get(name) === proc) children.delete(name); if (!intentionalStops.has(proc)) retry.set(name, Date.now() + 30000); if (!stopping) record(); });
  return proc;
}
const controller = createController({ getToken: () => readConfig().serviceToken, getStatus: () => ({ pid: process.pid, instanceId, startedAt, webPid: children.get("web")?.pid || null }), onStop: () => void stop(), onRestartAgent: async agent => {
  const profile = agents.find(item => item.id === agent);
  try { const response = await fetch(`http://127.0.0.1:${profile.port}/health/detailed`, { headers: { Authorization: `Bearer ${readConfig().gatewayKeys[agent]}` }, signal: AbortSignal.timeout(1500) }); if (response.ok) { const data = await response.json(), work = data.readiness?.checks?.background_queues || {}; if (data.gateway_busy || Number(data.active_agents) > 0 || Number(work.active_api_runs) > 0 || Number(work.active_delegations) > 0 || Number(work.process_completions) > 0) return false; } } catch {}
  try { const state = JSON.parse(fs.readFileSync(path.join(dataDir, "hermes", agent, "gateway_state.json"), "utf8")); if (Number(state.active_agents) > 0) { try { process.kill(Number(state.pid), 0); return false; } catch {} } } catch {}
  setTimeout(() => { if (stopping) return; const child = children.get(agent); if (child) { intentionalStops.add(child); children.delete(agent); terminate(child); } retry.delete(agent); record(); reconcile(); }, 50);
  return true;
} });
// Acquire the single-instance listener before starting any agent process.
await new Promise(resolve => { const failed = error => { console.error(`Cannot start the Axercise controller (${error.code || "listen error"}).`); process.exit(1); }; controller.once("error", failed); controller.listen({ host: CONTROL_HOST, port: CONTROL_PORT, exclusive: true }, () => { controller.off("error", failed); controller.on("error", () => void stop()); resolve(); }); });
provision();
function ensureWeb() {
  if (children.has("web") || (retry.get("web") || 0) > Date.now()) return;
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  start("web", process.execPath, [nextBin, fs.existsSync(path.join(root, ".next", "BUILD_ID")) ? "start" : "dev", "--hostname", "127.0.0.1", "--port", "3210"], root, { ...process.env, AXERCISE_ROOT: root, AXERCISE_MANAGED: "1", AXERCISE_INSTANCE_ID: instanceId, AXERCISE_CONTROLLER_PID: String(process.pid), NEXT_TELEMETRY_DISABLED: "1" });
}
function reconcile() {
  if (stopping) return; ensureWeb();
  const c = readConfig(); const next = JSON.stringify([c.defaultProvider, c.defaultModel, c.openrouterKey, c.discord, c.hermesPath, c.approvalMode]);
  if (next !== fingerprint) { provision(); fingerprint = next; for (const [name, proc] of children) if (name !== "web") { terminate(proc); retry.delete(name); } }
  let hermes; try { hermes = findHermes(); } catch { return; }
  for (const agent of agents) {
    const home = path.join(dataDir, "hermes", agent.id);
    const ready = c.defaultProvider === "openrouter" ? !!c.openrouterKey : fs.existsSync(path.join(home, "auth.json"));
    if (ready && !children.has(agent.id) && (retry.get(agent.id) || 0) < Date.now() && !fs.existsSync(path.join(home, "axercise-login.lock"))) start(agent.id, hermes.python, [...hermesArgs, "gateway", "run"], root, agentEnv(agent));
  }
}
reconcile();
timer = setInterval(reconcile, 5000);
let tickBusy = false;
async function reminderTick() {
  if (tickBusy || stopping) return;
  tickBusy = true;
  try {
    await initializeDesktopNotifications();
    const response = await fetch("http://127.0.0.1:3210/api/internal/tick", { method: "POST", headers: { Authorization: `Bearer ${readConfig().serviceToken}` }, signal: AbortSignal.timeout(55000) });
    if (response.ok) { const data = await response.json(); await sendDesktopNotifications(data.desktop || []); await sendDesktopHealthNotifications(data.healthDesktop || []); await sendDesktopBriefings(data.briefingDesktop || []); }
  } catch {} finally { tickBusy = false; }
}
tick = setInterval(() => void reminderTick(), 20000);
setTimeout(() => void reminderTick(), 5000).unref();
async function stop() { if (stopping) return; stopping = true; clearInterval(timer); clearInterval(tick); controller.close(); for (const proc of children.values()) terminate(proc); await new Promise(r => setTimeout(r, 500)); try { fs.unlinkSync(runtimePath); } catch {} process.exit(0); }
process.on("SIGTERM", stop); process.on("SIGINT", stop);
process.on("uncaughtException", () => { void stop(); });
