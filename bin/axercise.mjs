#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { parse } from "yaml";
import { requestControl, matchingInstance } from "./control.mjs";
import { root, dataDir, agents, ensureConfig, writeJSON, readConfig, findHermes, hermesArgs, provision, agentEnv } from "./runtime.mjs";
import { getStartupStatus, setStartupEnabled } from "./startup.mjs";
const command = process.argv[2] || "start", url = "http://127.0.0.1:3210";
ensureConfig();
async function control(action) { return requestControl(action, readConfig().serviceToken); }
async function running() { return control("status"); }
async function webStatus() { try { const response = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(3000) }); return response.ok ? await response.json() : null; } catch { return null; } }
async function stop() {
  const state = await running();
  if (!state) { if ((await webStatus())?.name === "axercise") throw new Error("The Axercise web server is responding, but its background controller is unavailable. The workspace has not been stopped."); console.log("Axercise is already stopped."); return; }
  await control("stop");
  for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 250)); const current = await running(), web = await webStatus(); if (!current && web?.name !== "axercise") { console.log("Axercise and its background services have stopped."); return; } }
  throw new Error("Axercise received the stop request, but some services are still responding. Check .axercise/daemon.log.");
}
async function openBrowser() { if (process.platform === "win32") spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], { detached: true, stdio: "ignore", windowsHide: true }).unref(); }
try {
if (command === "stop") { await stop(); }
else if (command === "startup") {
  const action = process.argv[3] || "status";
  if (!["on", "off", "status"].includes(action)) throw new Error("Use axercise startup [on | off | status]");
  const status = action === "status" ? getStartupStatus() : setStartupEnabled(action === "on");
  console.log(status.enabled ? "Windows startup is enabled. Axercise will start in the background after you sign in." : "Windows startup is disabled. You can still start Axercise with the axercise command.");
  if (status.message) console.log(status.message);
}
else if (command === "status") { const state = await running(), web = await webStatus(); if (matchingInstance(state, web)) console.log(`Axercise is running: ${url}\nThe workspace and background controller are connected.`); else if (state) { console.log("The Axercise controller is running, but the web server is not ready."); process.exitCode = 1; } else if (web?.name === "axercise") throw new Error("The Axercise web server is responding, but its background controller is unavailable."); else console.log("Axercise is stopped."); }
else if (command === "login") {
  const { python, install } = findHermes(), name = process.argv[3]; const targets = name ? agents.filter(a => a.id === name) : agents;
  if (!targets.length) throw new Error("เลือก hermes, secretary หรือ developer");
  if (await running()) await stop();
  provision();
  for (const a of targets) {
    console.log(`\nเชื่อมบัญชี ChatGPT สำหรับ ${a.name}`); const lock = path.join(dataDir, "hermes", a.id, "axercise-login.lock"); fs.writeFileSync(lock, "login");
    try { const result = spawnSync(python, [...hermesArgs, "model"], { cwd: root, env: agentEnv(a), stdio: "inherit", windowsHide: false }); if (result.status !== 0) process.exitCode = 1; } finally { fs.unlinkSync(lock); }
  }
  if (!process.exitCode) { const c = readConfig(), chosen = parse(fs.readFileSync(path.join(dataDir, "hermes", targets[0].id, "config.yaml"), "utf8")); c.defaultProvider = chosen.model?.provider || "openai-codex"; c.defaultModel = chosen.model?.default || chosen.model?.model || c.defaultModel; writeJSON(path.join(dataDir, "config.json"), c); console.log("เชื่อมบัญชีแล้ว เปิด axercise แล้วเลือกโมเดลที่บัญชีรองรับในหน้าแชท"); }
} else if (command === "start" || command === "restart") {
  if (command === "restart") await stop();
  if (!await running()) {
    const existing = await webStatus();
    if (existing?.name === "axercise") throw new Error(existing.managed ? "An older Axercise web server is running without a reachable controller. Stop that instance before starting a new one." : "A development server is using port 3210. Stop npm run dev before opening axercise.");
    if (!fs.existsSync(path.join(root, "node_modules", "next"))) throw new Error("กรุณารัน npm install ในโฟลเดอร์ Axercise ก่อน");
    const log = fs.openSync(path.join(dataDir, "daemon.log"), "a");
    const proc = spawn(process.execPath, [path.join(root, "bin", "daemon.mjs")], { cwd: root, env: { ...process.env, AXERCISE_ROOT: root }, detached: true, windowsHide: true, stdio: ["ignore", log, log] }); fs.closeSync(log); proc.unref();
  }
  let ready = false;
  for (let i = 0; i < 60; i++) { if (matchingInstance(await running(), await webStatus())) { ready = true; break; } await new Promise(r => setTimeout(r, 1000)); }
  if (ready) {
    console.log(`
  AXERCISE WORKSPACE
  Your personal space for focused work.

  Your workspace is ready: ${url}

  Open the link above to access your AI assistants, calendar,
  tasks, Brain Dump, and Learning. Open Learning to organize
  your courses, study files, assignments, grades, and revision.
  On your first visit, connect local Hermes, an AI account, and Notion.
  Setup instructions: http://127.0.0.1:3210/docs
  You can add Google Calendar and Discord later in Settings.

  Axercise runs locally on your computer. You can close the
  browser tab or this terminal without stopping the workspace.
  Configured bots and reminders continue in the background
  while your computer is awake and connected to the internet.

  Useful commands:
    axercise          Open your workspace again
    axercise status   Check whether Axercise is running
    axercise restart  Restart the workspace and background services
    axercise stop     Stop the workspace and its background services

  Ready when you are. Make room for what matters.
`);
    if (!process.argv.includes("--no-open")) await openBrowser();
  }
  else { console.error("เปิดเว็บไม่สำเร็จ ตรวจ .axercise/web.log และ .axercise/daemon.log"); process.exitCode = 1; }
} else { console.log("axercise [start | stop | restart | status | startup [on|off|status] | login [hermes|secretary|developer]]"); }
} catch (error) { console.error(error.message || "Axercise could not complete the command."); process.exitCode = 1; }
