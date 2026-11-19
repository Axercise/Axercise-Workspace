import { randomUUID } from "node:crypto";
import { AppError } from "./http";
import { config } from "./store";
import { changeLearning, hash, readLearning, record, saveLearningRecord } from "./learning-store";
import { listTasks } from "./notion";
import { notionCall, notionText, plainProperty } from "./learning-notion";
import { saveLinkedEvent } from "./calendar";
import type { Assignment } from "../lib/learning";
import type { LearningKind, LearningRecord } from "../lib/learning";
import type { Task } from "../lib/types";

export const assignmentTask = (a: Assignment) => ({ title: a.title, details: a.details, deadline: a.deadline, important: a.taskImportant, urgent: a.taskUrgent, status: a.status === "Todo" ? "Todo" : a.status === "Doing" ? "Doing" : "Done" });
const taskFields = (t: Task) => ({ title: t.title, details: t.details, deadline: t.deadline, status: t.status, taskImportant: t.important, taskUrgent: t.urgent });
type TaskValues = Pick<Task, "title" | "details" | "deadline" | "status" | "important" | "urgent">;
const legacyFingerprint = (t: TaskValues) => hash({ title: t.title, details: t.details, deadline: t.deadline, status: t.status });
export const taskFingerprint = (t: TaskValues) => hash({ title: t.title, details: t.details, deadline: t.deadline, status: t.status, important: t.important, urgent: t.urgent });
const atBase = (t: TaskValues, base: string) => !!base && (taskFingerprint(t) === base || legacyFingerprint(t) === base);
export function mergeLinkedTasks(tasks: Task[]) {
  const before = readLearning(); if (!before.records.assignments.some(a => a.taskId && tasks.some(t => t.id === a.taskId))) return;
  changeLearning(s => {
    for (const a of s.records.assignments) {
      const t = tasks.find(t => t.id === a.taskId); if (!t) continue;
      const remoteHash = taskFingerprint(t), localHash = taskFingerprint(assignmentTask(a) as Task);
      if (remoteHash === localHash) { a.taskBase = remoteHash; a.taskSync = "synced"; continue; }
      if (atBase(assignmentTask(a) as Task, a.taskBase)) {
        a.title = t.title; a.details = t.details; a.deadline = t.deadline; a.taskImportant = t.important; a.taskUrgent = t.urgent; a.taskRequested = true;
        const status = t.status === "Todo" ? "Todo" : t.status === "Doing" ? "Doing" : ["Submitted", "Graded"].includes(a.status) ? a.status : "Completed";
        if (a.status !== status) a.history.push({ at: new Date().toISOString(), status, note: "อัปเดตจาก Tasks" });
        a.status = status as Assignment["status"]; a.taskBase = remoteHash; a.taskSync = "synced"; a.revision++; a.updatedAt = new Date().toISOString();
      } else if (!atBase(t, a.taskBase)) a.taskSync = "conflict";
    }
  });
}
let taskSchemaReady = false;
let syncing: Promise<{ ok: boolean; assignment: Assignment }> | null = null;
let activeTaskId: string | null = null;
const queued = new Set<string>(), nextAttempt = new Map<string, number>();
let draining = false;
export function queueTaskSync(id: string) {
  if (activeTaskId === id || (nextAttempt.get(id) || 0) > Date.now() || !config().notion.tasksId) return;
  queued.add(id);
  if (draining) return;
  draining = true;
  void (async () => {
    try {
      while (queued.size) {
        const current = queued.values().next().value!; queued.delete(current);
        if (syncing) await syncing.catch(() => {});
        try { await syncAssignmentTask(current); nextAttempt.delete(current); }
        catch { nextAttempt.set(current, Date.now() + 60000); }
        await new Promise(r => setTimeout(r, 350));
      }
    } finally { draining = false; }
  })();
}
export function queuePendingAssignmentTasks() { for (const a of readLearning().records.assignments) if (a.taskSync === "pending" && !a.archived) queueTaskSync(a.id); }
export function saveAndScheduleLearning(kind: LearningKind, data: unknown, id?: string, revision?: number): LearningRecord {
  const item = saveLearningRecord(kind, data, id, revision);
  if (kind === "assignments" && ((item as Assignment).taskId || (item as Assignment).taskRequested) && (item as Assignment).taskSync === "pending") queueTaskSync(item.id);
  return item;
}
export async function syncAssignmentTask(id: string, use?: "local" | "remote", placement?: number) {
  while (syncing) await syncing.catch(() => {});
  changeLearning(s => { const a = record(s, "assignments", id); if (a.taskBase === legacyFingerprint(assignmentTask(a) as Task)) a.taskBase = taskFingerprint(assignmentTask(a) as Task); a.taskRequested = true; if (placement !== undefined) { if (!Number.isInteger(placement) || placement < 0 || placement > 3) throw new AppError("เลือกช่อง Eisenhower ที่ถูกต้อง"); a.taskImportant = placement < 2; a.taskUrgent = placement === 0 || placement === 2; a.revision++; a.updatedAt = new Date().toISOString(); } });
  activeTaskId = id;
  syncing = performTaskSync(id, use).catch(error => {
    changeLearning(s => { const a = record(s, "assignments", id); if (a.taskSync === "unlinked") a.taskSync = "pending"; });
    nextAttempt.set(id, Date.now() + 60000); throw error;
  }).finally(() => { syncing = null; activeTaskId = null; const a = readLearning().records.assignments.find(a => a.id === id); if (a?.taskSync === "pending") queueTaskSync(id); }); return syncing;
}
async function performTaskSync(id: string, use?: "local" | "remote") {
  const source = config().notion.tasksId; if (!source) throw new AppError("เชื่อม Tasks ใน Notion ก่อน", 409);
  const a = record(readLearning(), "assignments", id);
  if (a.archived) throw new AppError("คืนการบ้านจาก Archive ก่อนซิงก์");
  if (!taskSchemaReady) { await notionCall(`data_sources/${source}`, "PATCH", { properties: { LearningID: { rich_text: {} } } }); taskSchemaReady = true; }
  const found = await notionCall<{ results: { id: string; properties: Record<string, { title?: { plain_text: string }[]; rich_text?: { plain_text: string }[]; select?: { name: string } | null; date?: { start: string } | null; checkbox?: boolean }> }[] }>(`data_sources/${source}/query`, "POST", { filter: { property: "LearningID", rich_text: { equals: id } }, page_size: 2 });
  if (found.results.length > 1) throw new AppError("พบ Tasks ที่ผูกการบ้านนี้มากกว่าหนึ่งรายการ กรุณาตรวจ Notion", 409);
  const page = found.results[0];
  if (a.taskId && !page) { changeLearning(s => { record(s, "assignments", id).taskSync = "missing"; }); throw new AppError("ไม่พบ Tasks เดิม อาจถูกย้ายไปถังขยะ ตรวจ Notion ก่อนเชื่อมอีกครั้ง", 409); }
  let remote: Task | null = null;
  if (page) remote = { id: page.id, title: plainProperty(page, "Name"), details: plainProperty(page, "Details"), deadline: page.properties.Deadline?.date?.start || "", status: (page.properties.Status?.select?.name || "Todo") as Task["status"], important: !!page.properties.Important?.checkbox, urgent: !!page.properties.Urgent?.checkbox };
  const current = record(readLearning(), "assignments", id), desired = assignmentTask(current), currentHash = taskFingerprint(desired as Task);
  if (remote && taskFingerprint(remote) !== currentHash && !atBase(remote, current.taskBase) && !atBase(desired as Task, current.taskBase) && !use) {
    changeLearning(s => { record(s, "assignments", id).taskSync = "conflict"; });
    throw new AppError("Tasks และการบ้านมีการแก้ไขทั้งสองฝั่ง เลือกว่าจะใช้ข้อมูลจากฝั่งไหน", 409);
  }
  if (remote && (use === "remote" || (!use && atBase(desired as Task, current.taskBase)))) {
    changeLearning(s => { const v = record(s, "assignments", id); Object.assign(v, taskFields(remote!)); v.status = remote!.status === "Todo" ? "Todo" : remote!.status === "Doing" ? "Doing" : ["Submitted", "Graded"].includes(current.status) ? current.status : "Completed"; v.taskId = remote!.id; v.taskBase = taskFingerprint(remote!); v.taskSync = "synced"; v.updatedAt = new Date().toISOString(); v.revision++; });
  } else {
    const properties = { Name: { title: notionText(desired.title) }, Details: { rich_text: notionText(desired.details) }, Deadline: { date: desired.deadline ? { start: desired.deadline } : null }, Status: { select: { name: desired.status } }, LearningID: { rich_text: notionText(id) }, Important: { checkbox: desired.important }, Urgent: { checkbox: desired.urgent } };
    const written = await notionCall<{ id: string }>(page ? `pages/${page.id}` : "pages", page ? "PATCH" : "POST", { ...(page ? {} : { parent: { type: "data_source_id", data_source_id: source } }), properties });
    changeLearning(s => { const v = record(s, "assignments", id); v.taskId = written.id; v.taskBase = currentHash; v.taskSync = taskFingerprint(assignmentTask(v) as Task) === currentHash ? "synced" : "pending"; for (const plan of s.records.plans) { let changed = false; for (const b of plan.blocks) if (b.assignmentId === id && b.taskId !== written.id) { b.taskId = written.id; changed = true; } if (changed) { plan.revision++; plan.updatedAt = new Date().toISOString(); } } });
  }
  return { ok: true, assignment: record(readLearning(), "assignments", id) };
}
export async function refreshAssignmentTasks() {
  const tasks = await listTasks();
  mergeLinkedTasks(tasks);
  changeLearning(s => { for (const a of s.records.assignments) if (a.taskId && !tasks.some(t => t.id === a.taskId)) a.taskSync = "missing"; });
  return { ok: true };
}
export async function syncLearningCalendar(kind: "assessments" | "plans", id: string) {
  const s = readLearning(), item = record(s, kind, id), course = record(s, "courses", item.courseId);
  if (kind === "assessments") {
    const exam = record(s, "assessments", id);
    if (!exam.date.includes("T") || !exam.end.includes("T")) throw new AppError("ใส่วันและเวลาเริ่ม–สิ้นสุดการสอบก่อนส่ง Calendar");
    const saved = await saveLinkedEvent({ title: `${course.code ? course.code + " · " : ""}${exam.title}`, description: exam.scope, start: exam.date, end: exam.end, location: exam.location }, id);
    changeLearning(v => { record(v, "assessments", id).calendarId = saved.id; });
  } else {
    const plan = record(s, "plans", id);
    for (const block of plan.blocks) {
      const saved = await saveLinkedEvent({ title: `${course.code || course.title} · ${block.title}`, description: plan.title, start: block.start, end: block.end, location: "" }, block.id);
      changeLearning(v => { const current = record(v, "plans", id).blocks.find(b => b.id === block.id); if (current) current.calendarId = saved.id; });
    }
  }
  return { ok: true };
}
export function planToAssignments(id: string) {
  return changeLearning(s => {
    const plan = record(s, "plans", id), now = new Date().toISOString(); let added = 0;
    for (const block of plan.blocks) {
      if (block.assignmentId && s.records.assignments.some(a => a.id === block.assignmentId)) continue;
      const assignmentId = randomUUID();
      s.records.assignments.push({ id: assignmentId, courseId: plan.courseId, purpose: "study", taskRequested: false, taskImportant: true, taskUrgent: false, title: block.title, details: plan.title, rubric: "", deadline: block.start, status: block.done ? "Completed" : "Todo", submissionUrl: "", submittedAt: "", submittedVersionId: null, checklist: [], feedback: "", history: [{ at: now, status: "Todo", note: "สร้างจากแผนอ่านสอบ" }], taskId: null, taskBase: "", taskSync: "unlinked", createdAt: now, updatedAt: now, revision: 1, archived: false });
      block.assignmentId = assignmentId; added++;
    }
    plan.updatedAt = now; plan.revision++; return { added };
  });
}
export async function syncPlanTasks(id: string) {
  const result = planToAssignments(id), plan = record(readLearning(), "plans", id); let linked = 0, pending = 0;
  for (const block of plan.blocks) if (block.assignmentId) { try { await syncAssignmentTask(block.assignmentId); linked++; } catch { pending++; } }
  return { ...result, linked, pending, message: pending ? `เก็บงานอ่านแล้ว มี ${pending} รายการรอเชื่อม Tasks` : `เก็บงานอ่านและเชื่อม Tasks แล้ว ${linked} รายการ` };
}
