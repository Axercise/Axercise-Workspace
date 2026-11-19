import { config, updateConfig } from "./store";
import { AppError } from "./http";
import { taskSchema, noteSchema, idSchema } from "./schemas";
import type { Task, Note } from "../lib/types";
import { mergeLinkedTasks } from "./learning-integrations";
import { readLearning } from "./learning-store";
import { assignmentStatusLabel } from "../lib/learning";
import { taskCalendarState, decorateTaskCalendar, observeTaskCalendar, observeTaskCalendarList, syncTaskCalendar, unlinkTaskCalendar } from "./task-calendar";
import { safelyObserveTaskActivity } from "./task-activity";

type NotionPage = Record<string, unknown> & { parent: { data_source_id?: string } };
type NotionDatabase = { data_sources: { id: string }[] };
function client() {
  const key = config().notion.token; if (!key) throw new AppError("เชื่อมต่อ Notion ในการตั้งค่าก่อน", 409);
  async function request<T>(endpoint: string, method: string, data?: unknown): Promise<T> {
    const r = await fetch(`https://api.notion.com/v1/${endpoint}`, { method, headers: { Authorization: `Bearer ${key}`, "Notion-Version": "2025-09-03", "Content-Type": "application/json" }, body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(20000), cache: "no-store" });
    if (!r.ok) throw new AppError(r.status === 401 ? "Notion token ไม่ถูกต้อง" : r.status === 404 || r.status === 403 ? "Notion เข้าถึงหน้านี้ไม่ได้ กรุณาเพิ่ม Connection ให้หน้าที่เก็บฐานข้อมูล" : r.status === 429 ? "Notion รับคำขอมากเกินไป กรุณารอสักครู่" : "Notion บันทึกหรืออ่านข้อมูลไม่สำเร็จ", r.status === 429 ? 429 : 502);
    return r.json() as Promise<T>;
  }
  return {
    dataSources: { query: ({ data_source_id, ...data }: { data_source_id: string; start_cursor?: string; page_size: number; sorts: unknown[] }) => request<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(`data_sources/${data_source_id}/query`, "POST", data) },
    pages: {
      retrieve: ({ page_id }: { page_id: string }) => request<NotionPage>(`pages/${page_id}`, "GET"),
      create: (data: unknown) => request<NotionPage>("pages", "POST", data),
      update: ({ page_id, ...data }: { page_id: string; properties?: unknown; in_trash?: boolean }) => request<NotionPage>(`pages/${page_id}`, "PATCH", data),
    },
    databases: { create: (data: unknown) => request<NotionDatabase>("databases", "POST", data) },
  };
}
const rich = (text: string) => (text.match(/[\s\S]{1,1900}/g) || []).map(content => ({ type: "text" as const, text: { content } }));
type Props = Record<string, { title?: { plain_text: string }[]; rich_text?: { plain_text: string }[]; date?: { start: string } | null; checkbox?: boolean; select?: { name: string } | null; multi_select?: { name: string }[] }>;
const plain = (p: Props, key: string) => (p[key]?.title || p[key]?.rich_text || []).map(t => t.plain_text).join("");
function toTask(page: Record<string, unknown>): Task { const p = page.properties as Props; return { id: page.id as string, title: plain(p, "Name"), details: plain(p, "Details"), deadline: p.Deadline?.date?.start || "", important: !!p.Important?.checkbox, urgent: !!p.Urgent?.checkbox, status: (p.Status?.select?.name || "Todo") as Task["status"], url: page.url as string }; }
function toNote(page: Record<string, unknown>): Note { const p = page.properties as Props; return { id: page.id as string, title: plain(p, "Name"), content: plain(p, "Content"), tags: p.Tags?.multi_select?.map(t => t.name) || [], createdAt: page.created_time as string, url: page.url as string }; }
async function query(kind: "tasksId" | "notesId") {
  const notion = client(), id = config().notion[kind];
  if (!id) throw new AppError("สร้างฐานข้อมูล Axercise ในหน้าตั้งค่า Notion ก่อน", 409);
  let cursor: string | undefined; const rows: Record<string, unknown>[] = [];
  do { const r = await notion.dataSources.query({ data_source_id: id, start_cursor: cursor, page_size: 100, sorts: [{ timestamp: "created_time", direction: "descending" }] }); rows.push(...r.results as unknown as Record<string, unknown>[]); cursor = r.has_more ? r.next_cursor || undefined : undefined; } while (cursor);
  return rows;
}
export function linkTaskCourses(tasks: Task[]): Task[] { const state = readLearning(); return tasks.map(t => { const a = state.records.assignments.find(a => a.taskId === t.id && !a.archived), c = a && state.records.courses.find(c => c.id === a.courseId); return a && c ? { ...t, learning: { assignmentId: a.id, courseId: c.id, courseTitle: c.title, courseCode: c.code, statusLabel: assignmentStatusLabel(a) } } : t; }); }
export async function listTasks() { const tasks = (await query("tasksId")).map(toTask); safelyObserveTaskActivity(tasks); mergeLinkedTasks(tasks); observeTaskCalendarList(tasks); const calendar = taskCalendarState(); return linkTaskCourses(tasks).map(task => decorateTaskCalendar(task, calendar)); }
function savedTask(page: Record<string, unknown>) { const t = toTask(page); safelyObserveTaskActivity([t], true); mergeLinkedTasks([t]); return linkTaskCourses([t])[0]; }
export async function listNotes() { return (await query("notesId")).map(toNote); }
export async function saveTask(input: unknown, id?: string) {
  const t = taskSchema.parse(input), notion = client(), source = config().notion.tasksId;
  taskCalendarState(); // Validate durable link state before writing the task remotely.
  if (!source) throw new AppError("ยังไม่ได้สร้างฐานข้อมูล Tasks", 409);
  const properties = { Name: { title: rich(t.title) }, Details: { rich_text: rich(t.details) }, Deadline: { date: t.deadline ? { start: t.deadline } : null }, Important: { checkbox: t.important }, Urgent: { checkbox: t.urgent }, Status: { select: { name: t.status } } };
  if (id) { const before = await assertParent(id, source); if (before.properties) safelyObserveTaskActivity([toTask(before as unknown as Record<string, unknown>)]); }
  const task = savedTask((id ? await notion.pages.update({ page_id: idSchema.parse(id), properties }) : await notion.pages.create({ parent: { type: "data_source_id", data_source_id: source }, properties })) as unknown as Record<string, unknown>);
  observeTaskCalendar(task, t.calendarEnabled);
  await syncTaskCalendar(task.id);
  return decorateTaskCalendar(task);
}
export async function saveNote(input: unknown, id?: string) {
  const n = noteSchema.parse(input), notion = client(), source = config().notion.notesId;
  if (!source) throw new AppError("ยังไม่ได้สร้างฐานข้อมูล Brain Dump", 409);
  const properties = { Name: { title: rich(n.title || n.content.slice(0, 80)) }, Content: { rich_text: rich(n.content) }, Tags: { multi_select: n.tags.map(name => ({ name })) } };
  if (id) { await assertParent(id, source); return toNote(await notion.pages.update({ page_id: idSchema.parse(id), properties }) as unknown as Record<string, unknown>); }
  return toNote(await notion.pages.create({ parent: { type: "data_source_id", data_source_id: source }, properties }) as unknown as Record<string, unknown>);
}
async function assertParent(id: string, expected: string) {
  const page = await client().pages.retrieve({ page_id: idSchema.parse(id) });
  if (!page.parent?.data_source_id || page.parent.data_source_id.replaceAll("-", "") !== expected.replaceAll("-", "")) throw new AppError("รายการนี้ไม่ได้อยู่ในฐานข้อมูล Axercise", 403);
  return page;
}
export async function archiveNotion(kind: "task" | "note", id: string) { if (kind === "task") taskCalendarState(); await assertParent(id, config().notion[kind === "task" ? "tasksId" : "notesId"]); await client().pages.update({ page_id: idSchema.parse(id), in_trash: true }); if (kind === "task") { unlinkTaskCalendar(id); await syncTaskCalendar(id); } return { ok: true }; }
let setup: Promise<unknown> | undefined;
export async function setupNotion() {
  if (setup) return setup;
  setup = (async () => {
    const notion = client(), c = config();
    const match = c.notion.parentPageId.match(/[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i);
    if (!match) throw new AppError("ใส่ลิงก์หรือ ID ของหน้า Notion ที่ต้องการเก็บฐานข้อมูล");
    const parent = { type: "page_id" as const, page_id: match[0] };
    if (!c.notion.tasksId) {
      const db = await notion.databases.create({ parent, title: rich("Axercise · Tasks"), initial_data_source: { properties: { Name: { title: {} }, Details: { rich_text: {} }, Deadline: { date: {} }, Important: { checkbox: {} }, Urgent: { checkbox: {} }, Status: { select: { options: [{ name: "Todo", color: "default" }, { name: "Doing", color: "blue" }, { name: "Done", color: "green" }] } } } } });
      if (!("data_sources" in db) || !db.data_sources[0]) throw new AppError("สร้าง Tasks แล้ว แต่ยังอ่าน ID ไม่ได้ กรุณาตรวจหน้า Notion", 502);
      updateConfig(v => { v.notion.tasksId = db.data_sources[0].id; });
    }
    if (!config().notion.notesId) {
      const db = await notion.databases.create({ parent, title: rich("Axercise · Brain Dump"), initial_data_source: { properties: { Name: { title: {} }, Content: { rich_text: {} }, Tags: { multi_select: { options: [] } } } } });
      if (!("data_sources" in db) || !db.data_sources[0]) throw new AppError("สร้าง Brain Dump แล้ว แต่ยังอ่าน ID ไม่ได้ กรุณาตรวจหน้า Notion", 502);
      updateConfig(v => { v.notion.notesId = db.data_sources[0].id; });
    }
    return { ok: true };
  })();
  try { return await setup; } finally { setup = undefined; }
}
