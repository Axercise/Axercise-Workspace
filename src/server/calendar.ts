import { config, updateConfig } from "./store";
import { AppError } from "./http";
import { eventSchema, idSchema } from "./schemas";
import type { CalendarEvent, Task } from "../lib/types";
let refreshing: Promise<string> | undefined;
async function accessToken(): Promise<string> {
  const g = config().google;
  if (!g.refreshToken) throw new AppError("เชื่อมบัญชี Google Calendar ในหน้าตั้งค่าก่อน", 409);
  if (g.accessToken && g.expiresAt > Date.now() + 60000) return g.accessToken;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ client_id: g.clientId, client_secret: g.clientSecret, refresh_token: g.refreshToken, grant_type: "refresh_token" }), signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new AppError(r.status >= 500 || r.status === 429 ? "Google ยังไม่พร้อมต่ออายุการเชื่อมต่อ กรุณาลองอีกครั้ง" : "กรุณาเชื่อมบัญชี Google ใหม่", r.status >= 500 ? 503 : r.status === 429 ? 429 : 401);
    const token = await r.json();
    updateConfig(v => { v.google.accessToken = token.access_token; v.google.expiresAt = Date.now() + token.expires_in * 1000; }); return token.access_token as string;
  })();
  try { return await refreshing; } finally { refreshing = undefined; }
}
async function google(path: string, init: RequestInit = {}) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, { ...init, headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000), cache: "no-store" });
  if (!r.ok) throw new AppError(r.status === 403 ? "บัญชีนี้ยังไม่มีสิทธิ์เข้าถึง Calendar หรือยังไม่เปิด Calendar API" : "เรียก Google Calendar ไม่สำเร็จ", r.status === 401 ? 401 : 502);
  return r.status === 204 ? {} : r.json();
}
type GoogleEvent = { id: string; summary?: string; description?: string; location?: string; htmlLink?: string; status?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string }; extendedProperties?: { private?: Record<string, string> } };
const canonical = (id: string) => id.replaceAll("-", "").toLowerCase();
const convert = (e: GoogleEvent): CalendarEvent => {
  const meta = e.extendedProperties?.private, task = meta?.axerciseTaskId && meta.axerciseTasksSource === canonical(config().notion.tasksId) && ["Todo", "Doing", "Done"].includes(meta.axerciseTaskStatus) ? { id: meta.axerciseTaskId, status: meta.axerciseTaskStatus as Task["status"], deadline: meta.axerciseTaskDeadline || "" } : undefined;
  return { id: e.id, title: e.summary || "ไม่มีชื่อ", description: e.description || "", location: e.location || "", start: e.start.dateTime || e.start.date || "", end: e.end.dateTime || e.end.date || "", allDay: !!e.start.date, url: e.htmlLink, ...(task ? { task } : {}) };
};
const calendarPath = () => `calendars/${encodeURIComponent(config().google.calendarId || "primary")}/events`;
export async function listEvents(from: string, to: string) {
  if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(to) <= Date.parse(from)) throw new AppError("ช่วงวันที่ไม่ถูกต้อง");
  const params = new URLSearchParams({ timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250" });
  const events: CalendarEvent[] = []; let next: string | undefined;
  do { if (next) params.set("pageToken", next); const r = await google(`${calendarPath()}?${params}`); events.push(...(r.items || []).filter((e: { status: string }) => e.status !== "cancelled").map(convert)); next = r.nextPageToken; } while (next);
  return events;
}
export async function saveEvent(input: unknown, id?: string) {
  const e = eventSchema.parse(input);
  return convert(await google(`${calendarPath()}${id ? `/${encodeURIComponent(idSchema.parse(id))}` : ""}`, { method: id ? "PATCH" : "POST", body: JSON.stringify({ summary: e.title, description: e.description, location: e.location, start: { dateTime: e.start, timeZone: config().timezone }, end: { dateTime: e.end, timeZone: config().timezone } }) }));
}
export async function removeEvent(id: string) { await google(`${calendarPath()}/${encodeURIComponent(idSchema.parse(id))}`, { method: "DELETE" }); return { ok: true }; }
export async function saveLinkedEvent(input: unknown, recordId: string) {
  const e = eventSchema.parse(input), id = `a${recordId.replaceAll("-", "")}`;
  if (!/^a[a-f0-9]{32}$/.test(id)) throw new AppError("รหัสนัดการเรียนไม่ถูกต้อง");
  const headers = { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" };
  const data = { summary: e.title, description: e.description, location: e.location, start: { dateTime: e.start, timeZone: config().timezone }, end: { dateTime: e.end, timeZone: config().timezone }, extendedProperties: { private: { axerciseLearningId: recordId } } };
  const target = `https://www.googleapis.com/calendar/v3/${calendarPath()}`;
  let response = await fetch(target, { method: "POST", headers, body: JSON.stringify({ id, ...data }), signal: AbortSignal.timeout(20000) });
  if (response.status === 409) {
    const existing = await fetch(`${target}/${id}`, { headers, signal: AbortSignal.timeout(20000) });
    if (!existing.ok || (await existing.json()).extendedProperties?.private?.axerciseLearningId !== recordId) throw new AppError("รหัสนัดชนกับรายการอื่นในปฏิทิน", 409);
    response = await fetch(`${target}/${id}`, { method: "PATCH", headers, body: JSON.stringify(data), signal: AbortSignal.timeout(20000) });
  }
  if (!response.ok) throw new AppError("บันทึก Calendar ไม่สำเร็จ ตรวจบัญชีและการเชื่อมต่อ", 502);
  return convert(await response.json());
}
export async function listCalendars() { const r = await google("users/me/calendarList?minAccessRole=writer"); return (r.items || []).map((c: { id: string; summary: string; primary?: boolean }) => ({ id: c.id, title: c.summary, primary: !!c.primary })); }

export async function probeCalendarAccess() {
  const target = `https://www.googleapis.com/calendar/v3/${calendarPath()}?maxResults=1`;
  const request = async () => fetch(target, { headers: { Authorization: `Bearer ${await accessToken()}` }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  let response = await request();
  if (response.status === 401) { updateConfig(c => { c.google.accessToken = ""; c.google.expiresAt = 0; }); response = await request(); }
  if (!response.ok) throw new AppError(response.status === 401 ? "กรุณาเชื่อมบัญชี Google ใหม่" : response.status === 403 || response.status === 404 ? "เข้าถึงปฏิทินที่เลือกไม่ได้ ตรวจสิทธิ์และปฏิทินในตั้งค่า" : "Google Calendar ยังไม่พร้อม กรุณาลองอีกครั้ง", response.status);
}

export class TaskCalendarEventGone extends Error {}
function taskEventPath(calendarId: string, eventId: string) { return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`; }
async function taskEventRequest(url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000), cache: "no-store" });
}
function assertTaskEventOwner(event: GoogleEvent, taskId: string, sourceId: string) {
  const owner = event.extendedProperties?.private;
  if (canonical(owner?.axerciseTaskId || "") !== canonical(taskId) || owner?.axerciseTasksSource !== canonical(sourceId)) throw new AppError("รายการ Calendar นี้ไม่ได้เป็นของ To-do นี้ จึงไม่แก้หรือลบให้", 409);
}
export async function saveTaskCalendarEvent(calendarId: string, eventId: string, task: Task, sourceId: string) {
  if (!task.deadline) throw new AppError("เลือกวันที่ของงานก่อนแสดงใน Calendar");
  const allDay = task.deadline.length === 10;
  const start = allDay ? { date: task.deadline } : { dateTime: task.deadline, timeZone: config().timezone };
  const end = allDay ? { date: new Date(Date.parse(`${task.deadline}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) } : { dateTime: new Date(Date.parse(task.deadline) + 30 * 60000).toISOString(), timeZone: config().timezone };
  const body = { summary: `${task.status === "Done" ? "✓ " : ""}${task.title}`, description: `${task.details.slice(0, 9000)}\n\nTo-do: http://127.0.0.1:3210/?task=${encodeURIComponent(task.id)}${task.url ? `\nNotion: ${task.url}` : ""}`, start, end, transparency: task.status === "Done" ? "transparent" : "opaque", reminders: { useDefault: false }, extendedProperties: { private: { axerciseTaskId: task.id, axerciseTasksSource: canonical(sourceId), axerciseTaskStatus: task.status, axerciseTaskDeadline: task.deadline } } };
  const url = taskEventPath(calendarId, eventId);
  let existing = await taskEventRequest(url);
  if (existing.status === 410) throw new TaskCalendarEventGone();
  if (existing.ok) {
    const event = await existing.json() as GoogleEvent;
    if (event.status === "cancelled") throw new TaskCalendarEventGone();
    assertTaskEventOwner(event, task.id, sourceId);
  } else if (existing.status !== 404) throw new AppError("อ่าน Calendar ไม่สำเร็จ จะลองเชื่อมงานใหม่ให้อัตโนมัติ", 502);
  let saved = existing.ok ? await taskEventRequest(url, { method: "PATCH", body: JSON.stringify(body) }) : await taskEventRequest(url.slice(0, url.lastIndexOf("/")), { method: "POST", body: JSON.stringify({ id: eventId, ...body }) });
  if (saved.status === 409 && !existing.ok) {
    existing = await taskEventRequest(url);
    if (existing.status === 410) throw new TaskCalendarEventGone();
    if (!existing.ok) throw new AppError("ตรวจรายการ Calendar ที่สร้างไว้ไม่สำเร็จ", 502);
    const event = await existing.json() as GoogleEvent;
    if (event.status === "cancelled") throw new TaskCalendarEventGone();
    assertTaskEventOwner(event, task.id, sourceId);
    saved = await taskEventRequest(url, { method: "PATCH", body: JSON.stringify(body) });
  }
  if (saved.status === 410) throw new TaskCalendarEventGone();
  if (!saved.ok) throw new AppError("งานบันทึกแล้ว แต่ยังส่งเข้า Calendar ไม่สำเร็จ ระบบจะลองใหม่", 502);
  return convert(await saved.json());
}
export async function removeTaskCalendarEvent(calendarId: string, eventId: string, taskId: string, sourceId: string) {
  const url = taskEventPath(calendarId, eventId), existing = await taskEventRequest(url);
  if ([404, 410].includes(existing.status)) return;
  if (!existing.ok) throw new AppError("ตรวจรายการ Calendar ก่อนยกเลิกการเชื่อมไม่สำเร็จ", 502);
  const event = await existing.json() as GoogleEvent;
  if (event.status === "cancelled") return;
  assertTaskEventOwner(event, taskId, sourceId);
  const removed = await taskEventRequest(url, { method: "DELETE" });
  if (!removed.ok && ![404, 410].includes(removed.status)) throw new AppError("ยังนำงานออกจาก Calendar ไม่สำเร็จ ระบบจะลองใหม่", 502);
}
