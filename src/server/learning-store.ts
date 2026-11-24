import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { DATA, atomicJSON } from "./store";
import { AppError } from "./http";
import { kinds, learningSchemas, type LearningState, type LearningKind, type LearningRecords, type LearningRecord } from "../lib/learning";

export const LEARNING = path.join(DATA, "learning");
export const ASSETS = path.join(LEARNING, "files");
export const TEXTS = path.join(LEARNING, "text");
const statePath = path.join(LEARNING, "catalog.json");
export const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
export function emptyLearning(): LearningState {
  return { version: 1, revision: 0, updatedAt: new Date().toISOString(), sync: { lastAt: null, items: {}, error: "" }, records: { terms: [], courses: [], documents: [], assignments: [], assessments: [], notes: [], sets: [], focus: [], plans: [] } };
}
export function readLearning(): LearningState {
  if (!fs.existsSync(statePath)) return emptyLearning();
  try { return validateLearning(JSON.parse(fs.readFileSync(statePath, "utf8"))); }
  catch { throw new AppError("อ่านแคตตาล็อกการเรียนไม่สำเร็จ กรุณาเก็บไฟล์เดิมไว้และตรวจชุดสำรอง", 500); }
}
export function validateLearning(raw: unknown): LearningState {
  const s = raw as LearningState;
  if (!s || s.version !== 1 || !Number.isInteger(s.revision) || s.revision < 0 || !s.records || !s.sync?.items) throw new Error("Invalid learning catalog");
  z.iso.datetime().parse(s.updatedAt);
  s.sync = z.object({ lastAt: z.iso.datetime().nullable(), error: z.string().max(10000), items: z.record(z.uuid(), z.object({ pageId: z.uuid(), baseHash: z.string().max(100), conflict: z.boolean().optional(), error: z.string().max(2000).optional() })) }).parse(s.sync);
  const seen = new Set<string>();
  for (const k of kinds) {
    if (!Array.isArray(s.records[k]) || s.records[k].length > 20000) throw new Error("Invalid record collection");
    s.records[k] = s.records[k].map(r => { const item = learningSchemas[k].parse(r); if (seen.has(item.id)) throw new Error("Duplicate record ID"); seen.add(item.id); return item; }) as never;
  }
  const versions = new Set<string>();
  for (const d of s.records.documents) for (const v of d.versions) { if (versions.has(v.id)) throw new Error("Duplicate file version ID"); versions.add(v.id); }
  for (const k of kinds) for (const item of s.records[k]) validateReferences(s, k, item);
  return s;
}
export function changeLearning<T>(fn: (state: LearningState) => T): T {
  // All mutations are synchronous while holding this function: async remote work
  // commits against a freshly read state, never a captured catalog snapshot.
  const state = readLearning(), result = fn(state);
  state.revision++; state.updatedAt = new Date().toISOString();
  validateLearning(state); atomicJSON(statePath, state);
  return result;
}
export function record<K extends LearningKind>(state: LearningState, kind: K, id: string): LearningRecords[K] {
  const item = state.records[kind].find(r => r.id === id); if (!item) throw new AppError("ไม่พบรายการการเรียน", 404); return item;
}
export function validateReferences(state: LearningState, kind: LearningKind, item: LearningRecord) {
  if (kind === "terms") { const t = item as LearningRecords["terms"]; if (t.start && t.end && Date.parse(t.end) < Date.parse(t.start)) throw new AppError("วันสิ้นสุดเทอมต้องไม่ก่อนวันเปิดเทอม"); }
  if (kind === "courses") record(state, "terms", (item as LearningRecords["courses"]).termId);
  if (kind === "courses") { const c = item as LearningRecords["courses"]; if (new Set(c.weights.map(w => w.id)).size !== c.weights.length) throw new AppError("รหัสกลุ่มน้ำหนักคะแนนซ้ำ"); }
  if ("courseId" in item) record(state, "courses", item.courseId);
  if ("assignmentId" in item && item.assignmentId) {
    const a = record(state, "assignments", item.assignmentId);
    if (!("courseId" in item) || a.courseId !== item.courseId) throw new AppError("รายการและการบ้านต้องอยู่ในวิชาเดียวกัน");
  }
  if (kind === "assignments") {
    const a = item as LearningRecords["assignments"];
    if (a.submittedVersionId && !state.records.documents.some(d => d.assignmentId === a.id && d.courseId === a.courseId && d.versions.some(v => v.id === a.submittedVersionId))) throw new AppError("ฉบับที่ส่งต้องเป็นไฟล์ของการบ้านนี้");
  }
  if (kind === "documents") {
    const d = item as LearningRecords["documents"];
    if (d.selectedVersionId && !d.versions.some(v => v.id === d.selectedVersionId)) throw new AppError("ไม่พบเวอร์ชันไฟล์ที่เลือก");
    for (const id of Object.keys(d.reading)) if (!d.versions.some(v => v.id === id)) throw new AppError("จุดที่อ่านต้องผูกกับเวอร์ชันของเอกสารนี้");
  }
  if (kind === "assessments") {
    const a = item as LearningRecords["assessments"];
    if (a.groupId && !record(state, "courses", a.courseId).weights.some(w => w.id === a.groupId)) throw new AppError("ไม่พบกลุ่มน้ำหนักคะแนนในวิชานี้");
  }
  if (kind === "focus" && !(item as LearningRecords["focus"]).endedAt && state.records.focus.some(f => f.id !== item.id && !f.endedAt && !f.archived) && !item.archived) throw new AppError("มีรอบอ่านหนังสือที่ยังไม่จบอยู่แล้ว", 409);
  if (kind === "focus") { const f = item as LearningRecords["focus"]; if ((f.endedAt && Date.parse(f.endedAt) < Date.parse(f.startedAt)) || (f.pausedAt && Date.parse(f.pausedAt) < Date.parse(f.startedAt))) throw new AppError("เวลารอบอ่านไม่ถูกต้อง"); }
  if (kind === "notes" || kind === "sets") {
    const withSources = item as LearningRecords["notes"] | LearningRecords["sets"];
    for (const source of withSources.sources) { const d = record(state, "documents", source.documentId); if (d.courseId !== withSources.courseId || !d.versions.some(v => v.id === source.versionId)) throw new AppError("แหล่งอ้างอิงต้องอยู่ในรายวิชาและเวอร์ชันที่ระบุ"); }
    if (kind === "notes") { const n = item as LearningRecords["notes"]; if (n.documentId) { const d = record(state, "documents", n.documentId); if (d.courseId !== n.courseId || (n.versionId && !d.versions.some(v => v.id === n.versionId))) throw new AppError("โน้ตอ้างอิงเอกสารคนละวิชา/เวอร์ชัน"); } }
    if (kind === "sets") for (const id of (item as LearningRecords["sets"]).sourceVersionIds) if (!state.records.documents.some(d => d.courseId === withSources.courseId && d.versions.some(v => v.id === id))) throw new AppError("ชุดทบทวนอ้างอิงไฟล์คนละวิชาหรือไม่พบเวอร์ชัน");
  }
  if (kind === "plans") { const p = item as LearningRecords["plans"]; if (p.assessmentId && record(state, "assessments", p.assessmentId).courseId !== p.courseId) throw new AppError("แผนอ่านอ้างอิงการสอบคนละวิชา"); for (const b of p.blocks) if (b.assignmentId && record(state, "assignments", b.assignmentId).courseId !== p.courseId) throw new AppError("งานอ่านอยู่คนละวิชา"); }
}
export function saveLearningRecord<K extends LearningKind>(kind: K, input: unknown, id?: string, expectedRevision?: number): LearningRecords[K] {
  return changeLearning(state => {
    const previous = id ? record(state, kind, id) : null;
    if (previous && expectedRevision !== undefined && previous.revision !== expectedRevision) throw new AppError("รายการนี้เปลี่ยนไปแล้ว โหลดข้อมูลล่าสุดก่อนบันทึกอีกครั้ง", 409);
    const data = input as Record<string, unknown>;
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new AppError("ข้อมูลไม่ถูกต้อง");
    if (kind === "documents" && !previous && !data.url) throw new AppError("เพิ่มเอกสารใหม่ด้วยการอัปโหลดไฟล์ หรือเพิ่มลิงก์ที่ต้องการเก็บ");
    const item = learningSchemas[kind].parse({ ...previous, ...data, id: previous?.id || randomUUID(), createdAt: previous?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), revision: (previous?.revision || 0) + 1 });
    if (previous && "courseId" in previous && "courseId" in item && previous.courseId !== item.courseId) throw new AppError("เปลี่ยนรายวิชาของรายการเดิมไม่ได้");
    if (kind === "documents" && previous) {
      const before = previous as LearningRecords["documents"], doc = item as LearningRecords["documents"];
      if (before.deletedAt) throw new AppError("เอกสารถูกลบแล้ว", 404);
      if (before.url && !doc.url) throw new AppError("รายการลิงก์ต้องมี URL หากไม่ต้องการเก็บแล้วให้ลบรายการนี้");
      doc.versions = before.versions; doc.deletedAt = before.deletedAt; doc.filesDeletedAt = before.filesDeletedAt; doc.notionDeletedAt = before.notionDeletedAt;
    }
    if (kind === "documents" && !previous) {
      const doc = item as LearningRecords["documents"];
      doc.deletedAt = null; doc.filesDeletedAt = null; doc.notionDeletedAt = null;
    }
    if (kind === "assessments") (item as LearningRecords["assessments"]).calendarId = (previous as LearningRecords["assessments"] | null)?.calendarId || null;
    if (kind === "plans") {
      const p = item as LearningRecords["plans"], before = previous as LearningRecords["plans"] | null;
      p.history = before?.history || [];
      p.blocks = p.blocks.map(b => { const old = before?.blocks.find(x => x.id === b.id); return { ...b, assignmentId: old?.assignmentId || null, taskId: old?.taskId || null, calendarId: old?.calendarId || null }; });
      if (before) {
        const changes = p.blocks.flatMap(b => { const old = before.blocks.find(x => x.id === b.id); return !old ? [`เพิ่ม ${b.title}`] : b.title !== old.title || b.start !== old.start || b.end !== old.end || b.done !== old.done ? [`${b.title}: ${old.start} → ${b.start}${b.done !== old.done ? b.done ? " · อ่านเสร็จ" : " · เปิดอ่านต่อ" : ""}`] : []; });
        for (const b of before.blocks) if (!p.blocks.some(x => x.id === b.id)) changes.push(`นำ ${b.title} ออกจากแผน`);
        if (p.title !== before.title || p.content !== before.content) changes.unshift("แก้ชื่อหรือรายละเอียดแผน");
        if (changes.length) p.history = [...p.history, { at: item.updatedAt, revision: item.revision, note: changes.join("; ").slice(0, 2000) }].slice(-20);
      }
    }
    if (kind === "assignments") {
      const a = item as LearningRecords["assignments"], before = previous as LearningRecords["assignments"] | null;
      a.taskId = before?.taskId || null; a.taskBase = before?.taskBase || ""; a.taskRequested = !!a.taskId || !!before?.taskRequested || a.taskRequested; a.taskSync = a.taskId || a.taskRequested ? "pending" : "unlinked";
      if (before && a.taskBase) { const original = { title: before.title, details: before.details, deadline: before.deadline, status: before.status === "Todo" ? "Todo" : before.status === "Doing" ? "Doing" : "Done" }; if (a.taskBase === hash(original)) a.taskBase = hash({ ...original, important: before.taskImportant, urgent: before.taskUrgent }); }
      a.history = before?.history || [];
      if (!before || before.status !== a.status) a.history = [...a.history, { at: item.updatedAt, status: a.status, note: "เปลี่ยนสถานะ" }];
      if ((a.status === "Submitted" || a.status === "Graded") && !a.submittedAt) a.submittedAt = item.updatedAt;
    }
    const array = state.records[kind] as LearningRecord[], index = array.findIndex(r => r.id === item.id);
    if (index < 0) array.push(item); else array[index] = item;
    validateReferences(state, kind, item);
    return item as LearningRecords[K];
  });
}
export function fileLocation(id: string, text = false) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new AppError("รหัสไฟล์ไม่ถูกต้อง");
  return path.join(text ? TEXTS : ASSETS, text ? `${id}.json` : id);
}
export function findVersion(id: string) {
  const state = readLearning();
  for (const document of state.records.documents.filter(d => !d.deletedAt)) { const version = document.versions.find(v => v.id === id); if (version) return { state, document, version }; }
  throw new AppError("ไม่พบไฟล์", 404);
}
