import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { atomicJSON, config, DATA } from "./store";
import { AppError } from "./http";
import { listTasks } from "./notion";
import { listEvents } from "./calendar";
import { emptyLearning, readLearning } from "./learning-store";
import { discordRequest, reminderState } from "./reminders";
import { taskActivity } from "./task-activity";
import { bangkokDay, buildDailyBriefing, dayStart, defaultBriefingSettings, formatBriefingDiscord, nextBriefingTime, scheduledBriefingSlots, type BriefingSlot } from "./briefing-engine";
import { briefingLabels, type BriefingData, type BriefingDelivery, type BriefingFeed, type BriefingPeriod, type BriefingRecord, type BriefingSettings, type BriefingSource } from "../lib/briefings";
import type { CalendarEvent, Task } from "../lib/types";

const file = () => path.join(DATA, "briefings.json");
const idSchema = z.string().regex(/^[a-f0-9]{24}$/);
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const settingsSchema = z.object({ enabled: z.boolean(), morning: z.boolean(), evening: z.boolean(), morningTime: timeSchema, eveningTime: timeSchema, desktop: z.boolean(), discord: z.boolean(), activatedAt: z.number().nonnegative() });
const deliverySchema = z.object({ state: z.enum(["off", "pending", "sent", "expired"]), attemptedAt: z.number().optional(), leaseUntil: z.number().optional(), sentAt: z.number().optional(), error: z.string().optional(), messageId: z.string().optional() });
const rowSchema = z.object({ key: z.string(), title: z.string(), detail: z.string(), href: z.string().startsWith("/"), source: z.enum(["task", "calendar", "learning"]), dueAt: z.number().optional(), endAt: z.number().optional(), allDay: z.boolean().optional(), score: z.number().optional(), reason: z.string().optional(), observed: z.boolean().optional() });
const sourceSchema = z.object({ name: z.enum(["tasks", "calendar", "learning"]), status: z.enum(["fresh", "cached", "unavailable", "unconfigured"]), at: z.number().optional(), message: z.string().optional() });
const dataSchema = z.object({ day: z.iso.date(), targetDay: z.iso.date(), period: z.enum(["morning", "evening"]), generatedAt: z.number(), sources: z.array(sourceSchema), agenda: z.array(rowSchema), work: z.array(rowSchema), priorities: z.array(rowSchema), awaitingSubmission: z.array(rowSchema), completed: z.array(rowSchema), exams: z.array(rowSchema), reviews: z.array(rowSchema), counts: z.object({ agenda: z.number(), work: z.number(), overdue: z.number(), dueToday: z.number(), completed: z.number(), awaitingSubmission: z.number(), exams: z.number(), reviews: z.number() }), trackingSince: z.number().optional() });
const recordSchema = z.object({ id: idSchema, data: dataSchema, origin: z.enum(["manual", "schedule", "agent"]), readAt: z.number().optional(), expiresAt: z.number(), desktop: deliverySchema, discord: deliverySchema, discordNonce: z.string().optional() });
const slotSchema = z.object({ key: idSchema, day: z.iso.date(), period: z.enum(["morning", "evening"]), dueAt: z.number(), expiresAt: z.number(), status: z.enum(["pending", "ready", "expired"]), leaseUntil: z.number(), attemptedAt: z.number().optional(), reportId: idSchema.optional(), error: z.string().optional() });
type Cache<T> = { scope: string; at: number; items: T[]; from?: number; to?: number };
type State = { version: 1; settings: BriefingSettings; reports: BriefingRecord[]; slots: BriefingSlot[]; cache: { tasks?: Cache<Task>; calendar?: Cache<CalendarEvent> } };
const cachedTask = z.object({ id: z.string(), title: z.string(), details: z.string(), deadline: z.string(), important: z.boolean(), urgent: z.boolean(), status: z.enum(["Todo", "Doing", "Done"]) }).passthrough();
const cachedEvent = z.object({ id: z.string(), title: z.string(), description: z.string(), start: z.string(), end: z.string(), location: z.string(), allDay: z.boolean(), task: z.object({ id: z.string() }).passthrough().optional() }).passthrough();
const schema = z.object({ version: z.literal(1), settings: settingsSchema, reports: z.array(recordSchema), slots: z.array(slotSchema), cache: z.object({ tasks: z.object({ scope: z.string(), at: z.number(), items: z.array(cachedTask) }).optional(), calendar: z.object({ scope: z.string(), at: z.number(), items: z.array(cachedEvent), from: z.number(), to: z.number() }).optional() }) });
export function briefingState(now = Date.now()): State {
  if (!fs.existsSync(file())) return { version: 1, settings: defaultBriefingSettings(now), reports: [], slots: [], cache: {} };
  try { return schema.parse(JSON.parse(fs.readFileSync(file(), "utf8"))) as State; }
  catch { throw new AppError("ข้อมูล Daily Briefing เสียหาย กรุณากู้ briefings.json จากชุดสำรอง", 409); }
}
export function changeBriefings<T>(change: (state: State) => T, now = Date.now()): T { const state = briefingState(now), result = change(state); atomicJSON(file(), state); return result; }
function expire(state: State, now: number) {
  for (const report of state.reports) for (const channel of ["desktop", "discord"] as const) if (report[channel].state === "pending" && report.expiresAt <= now) report[channel].state = "expired";
  for (const slot of state.slots) if (slot.status === "pending" && slot.expiresAt <= now) slot.status = "expired";
  state.slots = state.slots.filter(s => s.dueAt > now - 90 * 86400000);
  state.reports = state.reports.filter(r => r.data.generatedAt > now - 60 * 86400000).slice(-180);
}
export function briefingFeed(summaryOnly = false): BriefingFeed {
  const state = briefingState(), now = Date.now(), bot = config().discord.find(b => b.agent === "secretary"), reports = [...state.reports].sort((a, b) => b.data.generatedAt - a.data.generatedAt);
  return { settings: state.settings, history: reports.map(r => ({ id: r.id, day: r.data.day, period: r.data.period, generatedAt: r.data.generatedAt, readAt: r.readAt, partial: r.data.sources.some(s => s.status !== "fresh" || !!s.message), origin: r.origin, desktop: r.desktop, discord: r.discord })), ...(!summaryOnly && reports[0] ? { latest: reports[0] } : {}), unread: reports.filter(r => !r.readAt).length, discordConfigured: !!(bot?.token && bot.channelId && bot.allowedUserId), generating: generating.size > 0, nextMorning: nextBriefingTime(state.settings, "morning", now), nextEvening: nextBriefingTime(state.settings, "evening", now), scheduleErrors: state.slots.filter(s => s.status === "pending" && s.error && s.expiresAt > now).map(s => s.error!).slice(-3) };
}
export function readBriefing(id: string) { idSchema.parse(id); const report = briefingState().reports.find(r => r.id === id); if (!report) throw new AppError("ไม่พบสรุปนี้ หรือเกินช่วงเก็บประวัติแล้ว", 404); return report; }
export function markBriefingRead(id: string) { idSchema.parse(id); changeBriefings(s => { const r = s.reports.find(r => r.id === id); if (!r) throw new AppError("ไม่พบสรุปนี้", 404); r.readAt ||= Date.now(); }); return { ok: true }; }
export function updateBriefingSettings(input: unknown) {
  const patch = settingsSchema.omit({ activatedAt: true }).partial().strict().parse(input), now = Date.now();
  changeBriefings(s => {
    const next = { ...s.settings, ...patch };
    if (next.morning && next.evening && next.morningTime === next.eveningTime) throw new AppError("เลือกรอบเช้ากับรอบก่อนนอนคนละเวลา");
    const scheduleChanged = ["enabled", "morning", "evening", "morningTime", "eveningTime"].some(key => next[key as keyof BriefingSettings] !== s.settings[key as keyof BriefingSettings]);
    if (scheduleChanged) { next.activatedAt = now; for (const slot of s.slots) if (slot.status === "pending") slot.status = "expired"; }
    for (const r of s.reports) for (const ch of ["desktop", "discord"] as const) if (r[ch].state === "pending" && (!next[ch] || (r.origin === "schedule" && scheduleChanged))) r[ch].state = "expired";
    s.settings = next;
  }, now);
  return briefingFeed();
}
function scopeFor(kind: "tasks" | "calendar") { const c = config(); return createHash("sha256").update(JSON.stringify(kind === "tasks" ? [c.notion.tasksId, c.notion.token] : [c.google.clientId, c.google.calendarId, c.google.refreshToken])).digest("hex"); }
type Sources = { tasks: Task[]; events: CalendarEvent[]; learning: ReturnType<typeof readLearning>; activity?: ReturnType<typeof taskActivity>; sources: BriefingSource[] };
let gathering: Promise<Sources> | undefined;
async function collectSources(day: string): Promise<Sources> {
  if (gathering) return gathering;
  gathering = (async () => {
    const c = config(), old = briefingState(), from = dayStart(day) - 86400000, to = dayStart(day) + 9 * 86400000;
    const taskScope = scopeFor("tasks"), calendarScope = scopeFor("calendar");
    const tasksConfigured = !!(c.notion.token && c.notion.tasksId), calendarConfigured = !!c.google.refreshToken;
    const [t, e] = await Promise.allSettled([tasksConfigured ? listTasks() : Promise.resolve([] as Task[]), calendarConfigured ? listEvents(new Date(from).toISOString(), new Date(to).toISOString()) : Promise.resolve([] as CalendarEvent[])]);
    const now = Date.now(), sources: BriefingSource[] = []; let tasks: Task[] = [], events: CalendarEvent[] = [];
    const taskCache = old.cache.tasks?.scope === taskScope ? old.cache.tasks : undefined, calendarCache = old.cache.calendar?.scope === calendarScope && old.cache.calendar.from! <= from + 86400000 && old.cache.calendar.to! >= to - 7 * 86400000 ? old.cache.calendar : undefined;
    if (!tasksConfigured) sources.push({ name: "tasks", status: "unconfigured", message: "ยังไม่ได้เชื่อมฐานข้อมูล To-do" });
    else if (t.status === "fulfilled" && scopeFor("tasks") === taskScope) { tasks = t.value; sources.push({ name: "tasks", status: "fresh", at: now }); changeBriefings(s => { s.cache.tasks = { scope: taskScope, at: now, items: tasks }; }); }
    else if (taskCache && scopeFor("tasks") === taskScope) { tasks = taskCache.items; sources.push({ name: "tasks", status: "cached", at: taskCache.at, message: "อ่าน To-do ไม่สำเร็จ ใช้ข้อมูลล่าสุดที่เคยอ่านได้ สถานะอาจเปลี่ยนไปแล้ว" }); }
    else sources.push({ name: "tasks", status: "unavailable", message: "อ่าน To-do ไม่สำเร็จ สรุปงานอาจไม่ครบ" });
    if (!calendarConfigured) sources.push({ name: "calendar", status: "unconfigured", message: "ยังไม่ได้เชื่อม Google Calendar" });
    else if (e.status === "fulfilled" && scopeFor("calendar") === calendarScope) { events = e.value; sources.push({ name: "calendar", status: "fresh", at: now }); changeBriefings(s => { s.cache.calendar = { scope: calendarScope, at: now, items: events, from, to }; }); }
    else if (calendarCache && scopeFor("calendar") === calendarScope) { events = calendarCache.items; sources.push({ name: "calendar", status: "cached", at: calendarCache.at, message: "อ่าน Calendar ไม่สำเร็จ ใช้ข้อมูลเก่าที่เคยอ่านได้ อาจมีนัดเพิ่มหรือเปลี่ยนเวลา" }); }
    else sources.push({ name: "calendar", status: "unavailable", message: "อ่าน Calendar ไม่สำเร็จ จำนวนที่แสดงไม่ได้แปลว่าวันนี้ไม่มีนัด" });
    let learning = emptyLearning();
    try { learning = readLearning(); sources.push({ name: "learning", status: "fresh", at: now }); } catch { sources.push({ name: "learning", status: "unavailable", message: "อ่านข้อมูลการเรียนบนเครื่องไม่ได้" }); }
    let activity: ReturnType<typeof taskActivity> | undefined;
    try { activity = taskActivity(); } catch { const source = sources.find(s => s.name === "tasks")!; source.message = `${source.message ? source.message + " · " : ""}อ่านประวัติความคืบหน้าไม่ได้`; }
    return { tasks, events, learning, activity, sources };
  })();
  try { return await gathering; } finally { gathering = undefined; }
}
const generating = new Map<string, Promise<BriefingRecord>>();
function createRecord(data: BriefingData, origin: BriefingRecord["origin"], expiresAt: number, settings: BriefingSettings): BriefingRecord {
  return { id: randomBytes(12).toString("hex"), data, origin, expiresAt, desktop: { state: origin === "schedule" && settings.desktop ? "pending" : "off" }, discord: { state: origin === "schedule" && settings.discord ? "pending" : "off" } };
}
export async function generateBriefing(period: BriefingPeriod, origin: "manual" | "agent" = "manual") {
  z.enum(["morning", "evening"]).parse(period);
  const day = bangkokDay(Date.now()), key = `${day}:${period}`; if (generating.has(key)) return generating.get(key)!;
  const promise = (async () => { const sources = await collectSources(day), now = Date.now(), data = buildDailyBriefing({ ...sources, day, period, now }); return changeBriefings(s => { const record = createRecord(data, origin, now + 2 * 3600000, s.settings); s.reports.push(record); expire(s, now); return record; }); })();
  generating.set(key, promise); try { return await promise; } finally { generating.delete(key); }
}
export async function runBriefingTick(now = Date.now()) {
  const claim = changeBriefings(s => {
    expire(s, now);
    for (const slot of scheduledBriefingSlots(s.settings, now)) {
      const index = s.slots.findIndex(old => old.key === slot.key), old = s.slots[index];
      if (!old) s.slots.push(slot);
      else if (old.status === "expired" && !old.reportId && old.dueAt !== slot.dueAt) s.slots[index] = slot;
    }
    const slot = s.slots.filter(x => x.status === "pending" && x.expiresAt > now && x.leaseUntil <= now && (!x.attemptedAt || x.attemptedAt <= now - 60000)).sort((a, b) => b.dueAt - a.dueAt)[0];
    if (!slot || !s.settings.enabled || !s.settings[slot.period]) return;
    slot.leaseUntil = now + 120000; slot.attemptedAt = now; return { ...slot };
  }, now);
  if (claim) {
    try {
      const sources = await collectSources(claim.day), finished = Date.now(), data = buildDailyBriefing({ ...sources, day: claim.day, period: claim.period, now: finished });
      changeBriefings(s => { const slot = s.slots.find(x => x.key === claim.key); if (!slot || slot.status !== "pending" || slot.leaseUntil !== claim.leaseUntil || !s.settings.enabled || !s.settings[claim.period] || claim.expiresAt <= finished) return; const record = createRecord(data, "schedule", claim.expiresAt, s.settings); s.reports.push(record); slot.status = "ready"; slot.reportId = record.id; slot.error = undefined; });
    } catch { changeBriefings(s => { const slot = s.slots.find(x => x.key === claim.key); if (slot?.status === "pending" && slot.leaseUntil === claim.leaseUntil) { slot.leaseUntil = 0; slot.error = "สร้างสรุปอัตโนมัติยังไม่สำเร็จ ระบบจะลองใหม่ในช่วงเวลาของรอบนี้"; } }); }
  }
  await dispatchBriefingDiscord();
}
function ready(state: State, record: BriefingRecord, channel: "desktop" | "discord", now: number) { const d = record[channel]; return state.settings[channel] && (record.origin !== "schedule" || state.settings.enabled) && record.expiresAt > now && d.state === "pending" && (d.leaseUntil || 0) <= now && (!d.attemptedAt || d.attemptedAt <= now - 60000); }
export function leaseBriefingDesktop() {
  return changeBriefings(s => { const now = Date.now(); expire(s, now); return s.reports.filter(r => ready(s, r, "desktop", now)).slice(0, 2).map(r => { r.desktop.attemptedAt = now; r.desktop.leaseUntil = now + 120000; return { id: r.id, title: `Secretary · ${briefingLabels[r.data.period]}`, message: `${r.data.period === "morning" ? "วันนี้" : "พรุ่งนี้"} ${r.data.counts.agenda} นัด/ช่วงอ่าน · ${r.data.counts.work} งานค้าง${r.data.counts.awaitingSubmission ? ` · รอส่ง ${r.data.counts.awaitingSubmission} งาน` : ""}\nเปิดดูสรุปและงานที่ควรทำก่อน`, sound: reminderState().settings.sound }; }); });
}
export function briefingDesktopFeedback(id: string, action: "sent" | "failed") {
  idSchema.parse(id); changeBriefings(s => { const r = s.reports.find(r => r.id === id); if (!r) throw new AppError("ไม่พบสรุปนี้", 404); if (r.desktop.state !== "pending") return; if (action === "sent") r.desktop = { state: "sent", sentAt: Date.now() }; else { r.desktop.leaseUntil = 0; r.desktop.error = "ส่งสรุปไป Windows ไม่สำเร็จ ระบบจะลองใหม่"; } }); return { ok: true };
}
export function queueBriefingDiscord(id: string) {
  idSchema.parse(id); const bot = config().discord.find(b => b.agent === "secretary");
  if (!bot?.token || !bot.channelId || !bot.allowedUserId) throw new AppError("ตั้งค่าห้องแจ้งเตือนของ Secretary ก่อนส่ง Discord", 409);
  changeBriefings(s => { const r = s.reports.find(r => r.id === id); if (!r) throw new AppError("ไม่พบสรุปนี้", 404); if (!s.settings.discord) throw new AppError("เปิดช่องทาง Discord ในการตั้งค่า Daily Briefing ก่อน", 409); if (r.discord.state === "sent" || r.discord.state === "pending") return; if (r.expiresAt <= Date.now()) throw new AppError("สรุปนี้เก่าแล้ว สร้างสรุปใหม่ก่อนส่ง", 409); if (r.origin === "schedule" && !s.settings.enabled) throw new AppError("สร้างสรุปใหม่ด้วยปุ่มสรุปตอนนี้ก่อนส่ง", 409); r.discord = { state: "pending" }; }); return { ok: true };
}
async function findPreviousDiscordMessage(channel: string, report: BriefingRecord) {
  const self = await discordRequest("users/@me"), since = (report.discord.attemptedAt || 0) - 120000; let before = "";
  for (let page = 0; page < 3; page++) {
    const messages = await discordRequest(`channels/${channel}/messages?limit=100${before ? `&before=${before}` : ""}`) as { id: string; timestamp: string; author: { id: string }; content: string }[];
    if (!Array.isArray(messages)) throw new Error("Cannot reconcile delivery");
    const sent = messages.find(m => m.author?.id === self.id && m.content.includes(`/briefing?report=${report.id}`)); if (sent) return sent.id;
    if (messages.length < 100 || Date.parse(messages.at(-1)!.timestamp) <= since) return null;
    before = messages.at(-1)!.id;
  }
  throw new Error("Cannot establish complete delivery history");
}
let dispatching: Promise<void> | undefined;
export async function dispatchBriefingDiscord() {
  if (dispatching) return dispatching;
  dispatching = (async () => {
    const bot = config().discord.find(b => b.agent === "secretary"); if (!bot?.token || !bot.channelId || !bot.allowedUserId) return;
    changeBriefings(s => expire(s, Date.now()));
    const snapshot = briefingState();
    for (const id of snapshot.reports.filter(r => ready(snapshot, r, "discord", Date.now())).slice(0, 2).map(r => r.id)) {
      const claim = changeBriefings(s => { const r = s.reports.find(r => r.id === id); if (!r || !ready(s, r, "discord", Date.now())) return; const previous = { ...r.discord }; r.discordNonce ||= BigInt(`0x${r.id.slice(0, 15)}`).toString(); r.discord.attemptedAt = Date.now(); r.discord.leaseUntil = Date.now() + 120000; return { record: structuredClone(r), previous }; });
      if (!claim) continue;
      try {
        let messageId = claim.previous.attemptedAt ? await findPreviousDiscordMessage(bot.channelId, { ...claim.record, discord: claim.previous }) : null;
        const current = briefingState(), live = current.reports.find(r => r.id === id);
        const currentBot = config().discord.find(b => b.agent === "secretary");
        if (!live || live.discord.state !== "pending" || !current.settings.discord || (live.origin === "schedule" && !current.settings.enabled) || live.expiresAt <= Date.now() || JSON.stringify(currentBot) !== JSON.stringify(bot)) continue;
        if (!messageId) { const user = /^\d{10,25}$/.test(bot.allowedUserId) ? bot.allowedUserId : undefined; const result = await discordRequest(`channels/${bot.channelId}/messages`, { method: "POST", body: JSON.stringify({ content: `${user ? `<@${user}> ` : ""}${formatBriefingDiscord(live.data, id)}`, nonce: live.discordNonce, enforce_nonce: true, allowed_mentions: { parse: [], users: user ? [user] : [] } }) }); messageId = result.id; }
        if (typeof messageId !== "string" || !/^\d{10,25}$/.test(messageId)) throw new Error("Missing Discord receipt");
        changeBriefings(s => { const r = s.reports.find(r => r.id === id); if (r) r.discord = { state: "sent", sentAt: Date.now(), messageId: messageId! }; });
      } catch { changeBriefings(s => { const r = s.reports.find(r => r.id === id); if (r?.discord.state === "pending") { r.discord.leaseUntil = 0; r.discord.error = "ส่งหรือยืนยันการส่ง Discord ยังไม่สำเร็จ ระบบจะตรวจข้อความเดิมก่อนลองใหม่"; } }); }
    }
  })();
  try { await dispatching; } finally { dispatching = undefined; }
}
