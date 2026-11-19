import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { HEALTH_IDS, type HealthAlert, type HealthFeed, type HealthId, type HealthState } from "../lib/health";
import { config, DATA, atomicJSON } from "./store";
import { AppError } from "./http";
import { emptyHealth, applyHealthResults, refreshHealthAlerts } from "./health-engine";
import { probeConnections, readGateway } from "./health-probes";
import { discordRequest, reminderState } from "./reminders";
import { requestControl } from "../../bin/control.mjs";
import type { AgentId } from "../lib/types";
const file = () => path.join(DATA, "health.json");
export function healthState(): HealthState {
  if (!fs.existsSync(file())) return emptyHealth();
  try { const state = JSON.parse(fs.readFileSync(file(), "utf8")); if (state.version !== 1 || !state.settings || !state.services || !Array.isArray(state.events) || !Array.isArray(state.alerts)) throw new Error(); return state; }
  catch { throw new AppError("ข้อมูลสถานะระบบเสียหาย กรุณากู้ health.json จากชุดสำรอง", 409); }
}
export function changeHealth<T>(fn: (state: HealthState) => T): T { const state = healthState(), result = fn(state); atomicJSON(file(), state); return result; }
let checking: Promise<void> | undefined;
export function healthFeed(): HealthFeed {
  const state = healthState(), bot = config().discord.find(item => item.agent === "secretary");
  return { settings: state.settings, services: HEALTH_IDS.flatMap(id => state.services[id] ? [state.services[id]!] : []), events: state.events.slice(-60).reverse(), checkedAt: state.lastFullCheckAt, stale: !state.lastFullCheckAt || state.lastFullCheckAt < Date.now() - 5 * 60000, checking: !!checking, discordConfigured: !!(bot?.token && bot.channelId), failedDeliveries: state.alerts.filter(alert => !alert.superseded && (alert.desktop.error || alert.discord.error)).length, repairing: Object.entries(state.repairGrace || {}).filter(([, until]) => until! > Date.now()).map(([agent]) => agent) };
}
function fingerprint() { const c = config(); return createHash("sha256").update(JSON.stringify([c.defaultProvider, c.defaultModel, c.gatewayKeys, c.openrouterKey, c.notion, c.google.clientId, c.google.clientSecret, c.google.refreshToken, c.google.calendarId, c.discord])).digest("hex"); }
export async function runHealthCheck(force = false, id?: HealthId, freshAfterRepair = false) {
  while (checking) { await checking; if (!freshAfterRepair) return; }
  const state = healthState();
  if (!freshAfterRepair && !force && state.lastFullCheckAt > Date.now() - 120000) return;
  if (!freshAfterRepair && force && !id && state.lastFullCheckAt > Date.now() - 10000) return;
  if (!freshAfterRepair && force && id && (state.services[id]?.checkedAt || 0) > Date.now() - 10000) return;
  checking = (async () => {
    const before = fingerprint();
    const results = await probeConnections(id);
    if (before !== fingerprint()) { changeHealth(current => { current.lastFullCheckAt = 0; }); return; }
    changeHealth(current => applyHealthResults(current, results, Date.now(), !id));
  })();
  try { await checking; } finally { checking = undefined; }
}
export function updateHealthSettings(input: Partial<HealthState["settings"]>) {
  changeHealth(state => { Object.assign(state.settings, input); if (input.alertsEnabled === false) for (const alert of state.alerts) alert.superseded = true; });
  return healthFeed();
}
export async function repairHealthGateway(id: HealthId) {
  if (!/^(ai|discord):(hermes|secretary|developer)$/.test(id)) throw new AppError("เลือกรายการ Agent ที่จะเชื่อมใหม่", 400);
  const agent = id.split(":")[1] as AgentId, gateway = await readGateway(agent);
  if (gateway.active > 0) throw new AppError("Agent กำลังทำงานอยู่ รอให้ตอบเสร็จก่อนเริ่มการเชื่อมต่อใหม่", 409);
  try { await requestControl("restart_agent", config().serviceToken, { agent }); }
  catch { throw new AppError("เริ่ม Agent ใหม่ไม่ได้ ตรวจ axercise status หรือใช้ axercise restart หลังงานปัจจุบันเสร็จ", 409); }
  changeHealth(state => { state.lastFullCheckAt = 0; state.repairGrace ||= {}; state.repairGrace[agent] = Date.now() + 90000; });
  return { ok: true, message: "ส่งคำขอเริ่มการเชื่อมต่อใหม่แล้ว ระบบจะตรวจสถานะให้อีกครั้ง" };
}
function readyAlert(state: HealthState, alert: HealthAlert, channel: "desktop" | "discord", now: number) {
  return state.settings.alertsEnabled && state.settings[channel] && !alert.superseded && alert.expiresAt > now && alert[channel].state === "pending" && (alert[channel].leaseUntil || 0) <= now && (alert[channel].attemptedAt || 0) < now - 60000;
}
export function leaseHealthDesktop() {
  return changeHealth(state => {
    const now = Date.now(); refreshHealthAlerts(state, now);
    return state.alerts.filter(alert => readyAlert(state, alert, "desktop", now)).slice(0, 2).map(alert => { alert.desktop.attemptedAt = now; alert.desktop.leaseUntil = now + 90000; return { id: alert.id, title: alert.title, message: alert.message, sound: reminderState().settings.sound }; });
  });
}
export function healthDesktopFeedback(id: string, action: "sent" | "failed") {
  changeHealth(state => { const alert = state.alerts.find(item => item.id === id); if (!alert) throw new AppError("ไม่พบการแจ้งสถานะ", 404); if (action === "sent") alert.desktop = { state: "sent", sentAt: Date.now() }; else { alert.desktop.state = "pending"; alert.desktop.leaseUntil = 0; alert.desktop.error = "ส่งแจ้งสถานะไป Windows ไม่สำเร็จ"; } }); return { ok: true };
}
let dispatching: Promise<void> | undefined;
export async function dispatchHealthDiscord() {
  if (dispatching) return dispatching;
  dispatching = (async () => {
    const bot = config().discord.find(item => item.agent === "secretary");
    if (!bot?.token || !bot.channelId) return;
    changeHealth(state => refreshHealthAlerts(state, Date.now()));
    for (const original of healthState().alerts.filter(alert => readyAlert(healthState(), alert, "discord", Date.now())).slice(0, 2)) {
      const alert = healthState().alerts.find(item => item.id === original.id);
      if (!alert || !readyAlert(healthState(), alert, "discord", Date.now())) continue;
      changeHealth(state => { const current = state.alerts.find(item => item.id === alert.id)!; current.discord.attemptedAt = Date.now(); current.discord.leaseUntil = Date.now() + 90000; });
      try {
        const user = /^\d{10,25}$/.test(bot.allowedUserId) ? bot.allowedUserId : undefined;
        await discordRequest(`channels/${bot.channelId}/messages`, { method: "POST", body: JSON.stringify({ content: `${user ? `<@${user}> ` : ""}**${alert.title}**\n${alert.message}\n\nดูศูนย์สถานะบนคอม: http://127.0.0.1:3210/?health=open`, allowed_mentions: { parse: [], users: user ? [user] : [] } }) });
        changeHealth(state => { const current = state.alerts.find(item => item.id === alert.id); if (current) current.discord = { state: "sent", sentAt: Date.now() }; });
      } catch { changeHealth(state => { const current = state.alerts.find(item => item.id === alert.id); if (current) { current.discord.leaseUntil = 0; current.discord.error = "ส่งแจ้งสถานะเข้า Discord ยังไม่สำเร็จ ระบบจะลองใหม่"; } }); }
    }
  })();
  try { await dispatching; } finally { dispatching = undefined; }
}
