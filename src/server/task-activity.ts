import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { atomicJSON, config, DATA } from "./store";
import { AppError } from "./http";
import type { Task } from "../lib/types";
const file = () => path.join(DATA, "task-activity.json");
const eventSchema = z.object({ id: z.string(), taskId: z.string(), title: z.string(), at: z.number(), kind: z.enum(["completed", "reopened"]), observed: z.boolean() });
const schema = z.object({ version: z.literal(1), scope: z.string(), startedAt: z.number(), tasks: z.record(z.string(), z.object({ status: z.enum(["Todo", "Doing", "Done"]), seenAt: z.number() })), events: z.array(eventSchema) });
export type TaskActivity = z.infer<typeof schema>;
const scope = () => createHash("sha256").update(JSON.stringify([config().notion.tasksId, config().notion.token])).digest("hex");
export function taskActivity(now = Date.now()): TaskActivity {
  if (!fs.existsSync(file())) return { version: 1, scope: scope(), startedAt: now, tasks: {}, events: [] };
  try { const state = schema.parse(JSON.parse(fs.readFileSync(file(), "utf8"))); return state.scope === scope() ? state : { version: 1, scope: scope(), startedAt: now, tasks: {}, events: [] }; }
  catch { throw new AppError("อ่านประวัติความคืบหน้า To-do ไม่สำเร็จ ข้อมูลสรุปความคืบหน้าอาจไม่ครบ", 409); }
}
export function observeTaskActivity(tasks: Task[], mutation = false, now = Date.now()) {
  const state = taskActivity(now);
  for (const task of tasks) {
    if (!task.id || typeof task.title !== "string" || !["Todo", "Doing", "Done"].includes(task.status)) continue;
    const previous = state.tasks[task.id];
    if (task.status === "Done" && ((previous && previous.status !== "Done") || (!previous && mutation))) state.events.push({ id: randomUUID(), taskId: task.id, title: task.title.slice(0, 300), at: now, kind: "completed", observed: !mutation });
    if (previous?.status === "Done" && task.status !== "Done") state.events.push({ id: randomUUID(), taskId: task.id, title: task.title.slice(0, 300), at: now, kind: "reopened", observed: !mutation });
    state.tasks[task.id] = { status: task.status, seenAt: now };
  }
  state.events = state.events.filter(e => e.at > now - 90 * 86400000).slice(-5000);
  state.tasks = Object.fromEntries(Object.entries(state.tasks).filter(([, value]) => value.seenAt > now - 90 * 86400000));
  atomicJSON(file(), state);
}
// Optional reporting must never turn a successfully saved Notion task into a failed request.
export function safelyObserveTaskActivity(tasks: Task[], mutation = false) { try { observeTaskActivity(tasks, mutation); } catch {} }
