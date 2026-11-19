import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { atomicJSON, config, DATA } from "./store";
import { AppError } from "./http";
import { removeTaskCalendarEvent, saveTaskCalendarEvent, TaskCalendarEventGone } from "./calendar";
import type { Task } from "../lib/types";
import type { TaskCalendarInfo } from "../lib/task-calendar";

type RetiredEvent = { calendarId: string; eventId: string };
type Link = { taskId: string; sourceId: string; calendarId: string; generation: number; eventId?: string; enabled: boolean; task: Task; applied: string; state: TaskCalendarInfo["state"]; error?: string; url?: string; retryAt: number; retired: RetiredEvent[] };
type State = { version: 1; links: Record<string, Link> };
const canonical = (id: string) => id.replaceAll("-", "").toLowerCase();
const keyFor = (id: string, source = config().notion.tasksId) => `${canonical(source)}:${canonical(id)}`;
const file = () => path.join(DATA, "task-calendar.json");
export function taskCalendarState(): State {
  if (!fs.existsSync(file())) return { version: 1, links: {} };
  try { const state = JSON.parse(fs.readFileSync(file(), "utf8")); if (state.version !== 1 || !state.links || typeof state.links !== "object" || Array.isArray(state.links)) throw new Error(); return state; }
  catch { throw new AppError("ข้อมูลเชื่อม To-do กับ Calendar เสียหาย กรุณากู้ task-calendar.json จากชุดสำรอง", 409); }
}
function change<T>(fn: (state: State) => T): T { const state = taskCalendarState(), result = fn(state); atomicJSON(file(), state); return result; }
function snapshot(task: Task): Task { return { id: task.id, title: task.title, details: task.details, deadline: task.deadline, status: task.status, important: task.important, urgent: task.urgent, ...(task.url ? { url: task.url } : {}) }; }
const signature = (task: Task) => JSON.stringify(snapshot(task));
const eventId = (link: Link) => `t${createHash("sha256").update(`${keyFor(link.taskId, link.sourceId)}:${link.calendarId}:${link.generation}`).digest("hex").slice(0, 40)}`;
function retire(link: Link) { if (link.eventId) link.retired.push({ calendarId: link.calendarId, eventId: link.eventId }); link.eventId = undefined; link.applied = ""; link.url = undefined; }
function observe(state: State, task: Task, enabled?: boolean) {
  const key = keyFor(task.id); let link = state.links[key];
  if (!link && !enabled) return;
  if (!link) link = state.links[key] = { taskId: task.id, sourceId: config().notion.tasksId, calendarId: config().google.calendarId || "primary", generation: 0, enabled: false, task: snapshot(task), applied: "", state: "pending", retryAt: 0, retired: [] };
  const changed = signature(link.task) !== signature(task);
  if (enabled === false || (link.enabled && !task.deadline)) retire(link);
  if (enabled === true && !link.enabled) { link.calendarId = config().google.calendarId || "primary"; link.applied = ""; }
  if (enabled !== undefined) link.enabled = enabled;
  if (link.enabled && task.deadline && !link.eventId) { link.generation++; link.eventId = eventId(link); }
  link.task = snapshot(task);
  if (changed || enabled !== undefined) { link.retryAt = 0; link.error = undefined; }
  if (link.retired.length || (link.enabled && link.task.deadline && link.applied !== signature(link.task))) link.state = "pending";
  else if (!link.enabled) link.state = "unlinked";
  else if (!link.task.deadline) link.state = "paused";
}
export function observeTaskCalendar(task: Task, enabled?: boolean) { if (enabled === undefined && !taskCalendarState().links[keyFor(task.id)]) return; change(state => observe(state, task, enabled)); }
export function observeTaskCalendarList(tasks: Task[]) {
  const state = taskCalendarState(), source = canonical(config().notion.tasksId);
  if (!Object.values(state.links).some(link => canonical(link.sourceId) === source)) return;
  change(current => {
    for (const task of tasks) observe(current, task);
    for (const link of Object.values(current.links)) if (canonical(link.sourceId) === source && link.enabled && !tasks.some(task => canonical(task.id) === canonical(link.taskId))) { retire(link); link.enabled = false; link.state = link.retired.length ? "pending" : "unlinked"; link.retryAt = 0; }
  });
}
export function decorateTaskCalendar(task: Task, state = taskCalendarState()): Task {
  const link = state.links[keyFor(task.id)];
  return link ? { ...task, calendar: { enabled: link.enabled, state: link.state, eventId: link.eventId, url: link.url, error: link.error } } : task;
}
export function unlinkTaskCalendar(id: string) {
  if (!taskCalendarState().links[keyFor(id)]) return;
  change(state => { const link = state.links[keyFor(id)]; retire(link); link.enabled = false; link.retryAt = 0; link.state = link.retired.length ? "pending" : "unlinked"; });
}
const running = new Map<string, Promise<void>>();
export async function syncTaskCalendar(id: string) {
  const key = keyFor(id);
  while (running.has(key)) await running.get(key);
  const work = (async () => {
    for (let pass = 0; pass < 3; pass++) {
      const link = taskCalendarState().links[key]; if (!link) return;
      try {
        for (const retired of link.retired) {
          await removeTaskCalendarEvent(retired.calendarId, retired.eventId, link.taskId, link.sourceId);
          change(state => { state.links[key].retired = state.links[key].retired.filter(event => event.eventId !== retired.eventId || event.calendarId !== retired.calendarId); });
        }
        const latest = taskCalendarState().links[key];
        if (!latest.enabled || !latest.task.deadline) { change(state => { const current = state.links[key]; current.state = current.enabled ? "paused" : "unlinked"; current.error = undefined; current.retryAt = 0; }); return; }
        if (latest.applied === signature(latest.task)) return;
        const saved = await saveTaskCalendarEvent(latest.calendarId, latest.eventId!, latest.task, latest.sourceId);
        change(state => { const current = state.links[key]; if (current.eventId === latest.eventId) { current.applied = signature(latest.task); current.url = saved.url; current.error = undefined; current.retryAt = 0; current.state = current.applied === signature(current.task) ? "synced" : "pending"; } });
        if (taskCalendarState().links[key].state === "synced") return;
      } catch (error) {
        if (error instanceof TaskCalendarEventGone) { change(state => { const current = state.links[key]; if (current.enabled) { current.generation++; current.eventId = eventId(current); current.applied = ""; current.state = "pending"; } }); continue; }
        change(state => { const current = state.links[key]; current.state = "error"; current.error = error instanceof AppError ? error.message : "งานบันทึกแล้ว แต่เชื่อม Calendar ยังไม่สำเร็จ ระบบจะลองใหม่"; current.retryAt = Date.now() + 60000; }); return;
      }
    }
  })();
  running.set(key, work);
  try { await work; } finally { if (running.get(key) === work) running.delete(key); }
}
let dispatching: Promise<void> | undefined;
export async function dispatchTaskCalendar() {
  if (dispatching) return dispatching;
  dispatching = (async () => {
    const source = canonical(config().notion.tasksId);
    for (const link of Object.values(taskCalendarState().links).filter(link => canonical(link.sourceId) === source && link.retryAt <= Date.now() && (link.retired.length || (link.enabled && link.task.deadline && link.applied !== signature(link.task)))).slice(0, 4)) await syncTaskCalendar(link.taskId);
  })();
  try { await dispatching; } finally { dispatching = undefined; }
}
