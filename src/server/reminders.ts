import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { atomicJSON, config, DATA } from "./store";
import { listEvents } from "./calendar";
import { listTasks } from "./notion";
import { readLearning } from "./learning-store";
import { actOnReminder, advanceReminders, collectReminderCandidates, newReminderState, reconcileReminders } from "./reminder-engine";
import type { Reminder, ReminderDelivery, ReminderFeed, ReminderGroup, ReminderSettings, ReminderState, ScheduledDraft } from "../lib/reminders";
import { AppError } from "./http";

const file = () => path.join(DATA, "reminders.json");
export function reminderState(): ReminderState {
  if (!fs.existsSync(file())) return newReminderState();
  try { const state = JSON.parse(fs.readFileSync(file(), "utf8")); if (state.version !== 1 || !Array.isArray(state.reminders) || !Array.isArray(state.deliveries)) throw new Error(); return state; }
  catch { throw new AppError("ข้อมูลแจ้งเตือนเสียหาย กรุณากู้ reminders.json จากข้อมูลสำรอง", 409); }
}
export function changeReminders<T>(change: (state: ReminderState) => T): T { const state = reminderState(); const result = change(state); atomicJSON(file(), state); return result; }
export function reminderFeed(): ReminderFeed {
  const state = reminderState(), bot = config().discord.find(d => d.agent === "secretary");
  return { ...state, reminders: state.reminders.filter(r => r.status !== "cancelled").sort((a, b) => a.dueAt - b.dueAt), deliveries: state.deliveries.slice(-300), discordConfigured: !!(bot?.token && bot.channelId) };
}
export function updateReminder(id: string, action: "acknowledge" | "snooze" | "resume", minutes = 10) { const changed = changeReminders(state => actOnReminder(state, id, action, Date.now(), minutes)); if (!changed) throw new AppError("ไม่พบรายการเตือนที่ยังใช้งานอยู่", 404); return { ok: true }; }
export function updateReminderSettings(settings: Partial<ReminderSettings>) { changeReminders(state => { Object.assign(state.settings, settings); }); return reminderFeed(); }
export function syncDraftReminders(clientId: string, drafts: ScheduledDraft[]) { changeReminders(state => { state.draftClients ||= {}; if (drafts.length) state.draftClients[clientId] = { drafts, updatedAt: Date.now() }; else delete state.draftClients[clientId]; state.lastScanAt = 0; }); return { ok: true }; }
export function addTestReminder() {
  const now = Date.now(), id = randomUUID().replaceAll("-", "").slice(0, 24);
  changeReminders(state => { state.reminders.push({ id, aliases: [`test:${id}`], groups: ["test"], kind: "test", title: "ทดสอบแจ้งเตือน Axercise", detail: "ลองกดรับทราบ หรือเลื่อนเตือน 10 นาที", dueAt: now, href: "/?reminders=open", priority: 100, status: "pending", snoozedUntil: 0, createdAt: now, updatedAt: now, expiresAt: now + 60 * 60000 }); advanceReminders(state, now); });
  return { id };
}
export function notificationText(record: Reminder, now = Date.now()) {
  const delta = record.dueAt - now, when = new Date(record.dueAt).toLocaleString("th-TH", { timeZone: config().timezone, dateStyle: "medium", timeStyle: "short" });
  const timing = record.kind === "test" ? "การทดสอบ" : delta > 60000 ? `อีก ${Math.ceil(delta / 60000)} นาที` : delta < -60000 ? `เลยเวลา ${Math.floor(-delta / 60000)} นาที` : "ถึงเวลาแล้ว";
  return `${timing} · ${when}\n${record.detail}`;
}

async function scanSources() {
  const now = Date.now(), c = config(), old = reminderState();
  const pendingCalendar = old.reminders.filter(r => r.status === "pending" && r.groups.includes("calendar")).map(r => r.dueAt);
  const from = Math.min(now - 86400000, ...pendingCalendar);
  const results = await Promise.allSettled([
    c.google.refreshToken ? listEvents(new Date(from).toISOString(), new Date(now + 7 * 86400000).toISOString()) : Promise.resolve([]),
    c.notion.tasksId ? listTasks() : Promise.resolve([]),
  ]);
  const successful = new Set<ReminderGroup>(["learning", "draft"]), errors: Record<string, string> = {};
  if (results[0].status === "fulfilled") successful.add("calendar"); else errors.calendar = "โหลด Google Calendar ไม่สำเร็จ จะลองใหม่และเก็บรายการเดิมไว้";
  if (results[1].status === "fulfilled") successful.add("notion"); else errors.notion = "โหลด To-do ไม่สำเร็จ จะลองใหม่และเก็บรายการเดิมไว้";
  // listTasks merges the current Notion task status into linked academic records.
  const drafts = Object.values(reminderState().draftClients || {}).flatMap(client => client.drafts);
  const candidates = collectReminderCandidates(readLearning(), results[1].status === "fulfilled" ? results[1].value : undefined, results[0].status === "fulfilled" ? results[0].value : undefined, now, drafts);
  changeReminders(state => { reconcileReminders(state, candidates, successful, Date.now()); state.sourceErrors = errors; });
}

function activeDelivery(state: ReminderState, delivery: ReminderDelivery, channel: "desktop" | "discord", now: number) {
  const record = state.reminders.find(r => r.id === delivery.reminderId);
  return !!(state.settings.enabled && state.settings[channel] && !delivery.superseded && delivery[channel].state !== "sent" && (delivery[channel].leaseUntil || 0) <= now && (delivery[channel].attemptedAt || 0) < now - 30000 && record?.status === "pending" && (!record.snoozedUntil || record.snoozedUntil <= now) && (!record.expiresAt || record.expiresAt > now));
}
export function leaseDesktopReminders() {
  return changeReminders(state => {
    const now = Date.now();
    return state.deliveries.filter(d => activeDelivery(state, d, "desktop", now)).slice(0, 4).map(delivery => {
      delivery.desktop.attemptedAt = now; delivery.desktop.leaseUntil = now + 120000;
      const record = state.reminders.find(r => r.id === delivery.reminderId)!;
      return { deliveryId: delivery.id, reminderId: record.id, title: record.title, message: notificationText(record, now), sound: state.settings.sound, url: `http://127.0.0.1:3210/?reminder=${record.id}` };
    });
  });
}
export function desktopFeedback(input: { deliveryId?: string; action: "sent" | "failed" | "acknowledge" | "snooze" | "health"; error?: string; available?: boolean; reminderId?: string }) {
  changeReminders(state => {
    const now = Date.now();
    if (input.action === "health") { state.native = { available: !!input.available, error: input.error || (input.available ? state.native.error : undefined), updatedAt: now }; return; }
    const delivery = state.deliveries.find(d => d.id === input.deliveryId);
    if (!delivery) throw new AppError("ไม่พบการแจ้งเตือน", 404);
    if (input.action === "acknowledge" || input.action === "snooze") { actOnReminder(state, delivery.reminderId, input.action, now, 10); return; }
    if (input.action === "failed") { delivery.desktop.state = "pending"; delivery.desktop.leaseUntil = 0; delivery.desktop.error = "Windows ส่งแจ้งเตือนไม่สำเร็จ ตรวจการอนุญาตแจ้งเตือนของ Axercise"; state.native.error = delivery.desktop.error; }
    else { delivery.desktop.state = "sent"; delivery.desktop.sentAt = now; delivery.desktop.error = undefined; state.native = { available: true, updatedAt: now }; }
  });
  return { ok: true };
}

export async function discordRequest(endpoint: string, init: RequestInit = {}) {
  const bot = config().discord.find(d => d.agent === "secretary");
  if (!bot?.token) throw new Error("Discord is not configured");
  const response = await fetch(`https://discord.com/api/v10/${endpoint}`, { ...init, headers: { Authorization: `Bot ${bot.token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Discord ${response.status}`);
  return response.status === 204 ? null : response.json();
}
async function checkDiscordReactions() {
  const bot = config().discord.find(d => d.agent === "secretary"), state = reminderState();
  if (!state.settings.enabled || !bot?.token || !bot.allowedUserId) return;
  // Rotate through recent messages so controls on an earlier repeat still work.
  const messages = state.deliveries.filter(d => d.discordMessageId && d.discordChannelId && state.reminders.some(r => r.id === d.reminderId && r.status === "pending")).sort((a, b) => (a.reactionsCheckedAt || 0) - (b.reactionsCheckedAt || 0)).slice(0, 6);
  for (const message of messages) {
    if ((message.reactionsCheckedAt || 0) > Date.now() - 30000) continue;
    changeReminders(s => { const d = s.deliveries.find(d => d.id === message.id); if (d) d.reactionsCheckedAt = Date.now(); });
    try {
      for (const [emoji, action] of [["✅", "acknowledge"], ["💤", "snooze"]] as const) {
        if (message.consumedReactions?.includes(emoji)) continue;
        const endpoint = `channels/${message.discordChannelId}/messages/${message.discordMessageId}/reactions/${encodeURIComponent(emoji)}`;
        const users = await discordRequest(`${endpoint}?limit=100`) as { id: string }[];
        if (!users.some(user => user.id === bot.allowedUserId)) continue;
        updateReminder(message.reminderId, action);
        // Consume a snooze reaction once; otherwise the next poll would extend it forever.
        try { await discordRequest(`${endpoint}/${bot.allowedUserId}`, { method: "DELETE" }); } catch {}
        changeReminders(s => { const d = s.deliveries.find(d => d.id === message.id); if (d) { d.consumedReactions ||= []; d.consumedReactions.push(emoji); } });
        const record = reminderState().reminders.find(r => r.id === message.reminderId);
        if (record) {
          const status = action === "acknowledge" ? "✅ รับทราบแล้ว · หยุดเตือนรายการนี้" : `💤 เลื่อนเตือนถึง ${new Date(record.snoozedUntil).toLocaleString("th-TH", { timeZone: config().timezone })}`;
          try { await discordRequest(`channels/${message.discordChannelId}/messages/${message.discordMessageId}`, { method: "PATCH", body: JSON.stringify({ content: `🔔 **${record.title}**\n${notificationText(record)}\n\n${status}`, allowed_mentions: { parse: [] } }) }); } catch {}
        }
        break;
      }
    } catch { /* Retry controls on the next tick without changing the reminder. */ }
  }
}
async function sendDiscordReminders() {
  const bot = config().discord.find(d => d.agent === "secretary");
  if (!bot?.token || !bot.channelId) return;
  const initial = reminderState();
  for (const original of initial.deliveries.filter(d => activeDelivery(initial, d, "discord", Date.now())).slice(0, 4)) {
    const state = reminderState(), record = state.reminders.find(r => r.id === original.reminderId);
    if (!record || !activeDelivery(state, original, "discord", Date.now())) continue;
    changeReminders(s => { const d = s.deliveries.find(d => d.id === original.id)!; d.discord.attemptedAt = Date.now(); d.discord.leaseUntil = Date.now() + 120000; });
    try {
      const content = `<@${bot.allowedUserId}> 🔔 **${record.title}**\n${notificationText(record)}\n\nกด Reaction ✅ รับทราบ (หยุดเตือน) · 💤 เลื่อน 10 นาที\nรหัสเตือน: \`${record.id}\``;
      const sent = await discordRequest(`channels/${bot.channelId}/messages`, { method: "POST", body: JSON.stringify({ content: content.slice(0, 1950), allowed_mentions: { parse: [], users: [bot.allowedUserId] } }) });
      changeReminders(s => { const d = s.deliveries.find(d => d.id === original.id)!; d.discord = { state: "sent", sentAt: Date.now() }; d.discordMessageId = sent.id; d.discordChannelId = bot.channelId; });
      for (const emoji of ["✅", "💤"]) { try { await discordRequest(`channels/${bot.channelId}/messages/${sent.id}/reactions/${encodeURIComponent(emoji)}/@me`, { method: "PUT" }); } catch {} }
    } catch {
      changeReminders(s => { const d = s.deliveries.find(d => d.id === original.id); if (d) { d.discord.leaseUntil = 0; d.discord.error = "ส่ง Discord ไม่สำเร็จ ตรวจห้องและสิทธิ์ของ Secretary"; } });
    }
  }
}

let ticking: Promise<void> | undefined;
export async function runReminderTick(force = false) {
  if (ticking) return ticking;
  ticking = (async () => {
    if (force || reminderState().lastScanAt < Date.now() - 60000) await scanSources();
    changeReminders(state => advanceReminders(state, Date.now()));
  })();
  try { await ticking; } finally { ticking = undefined; }
}

let dispatching: Promise<void> | undefined;
export async function dispatchDiscordReminders() {
  if (dispatching) return dispatching;
  dispatching = (async () => { await checkDiscordReactions(); await sendDiscordReminders(); })();
  try { await dispatching; } finally { dispatching = undefined; }
}
