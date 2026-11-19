import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ROOT, atomicJSON } from "./store";
import { learningPython } from "../../bin/runtime.mjs";
import { AppError } from "./http";
import { changeLearning, readLearning, record, findVersion, fileLocation, ASSETS, TEXTS } from "./learning-store";
import { learningSchemas, type LearningDocument } from "../lib/learning";
const execute = promisify(execFile);
export const FILE_LIMIT = 50 * 1024 * 1024;
export const allowedFiles = new Set(["pdf", "png", "jpg", "jpeg", "webp", "gif", "docx", "pptx", "xlsx", "txt", "md", "csv", "zip", "py", "js", "ts", "cpp", "c", "h", "java", "json", "ipynb"]);
export const mime: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
export type TextPage = { page: number; label: string; text: string };
export type DocumentText = { status: "ready" | "scanned" | "unsupported" | "error"; pages: TextPage[]; error?: string };
export function checkFile(id: string) {
  const { version } = findVersion(id), file = fileLocation(id);
  if (!fs.existsSync(file)) throw new AppError(`ไม่พบไฟล์ ${version.name} กรุณานำกลับจากชุดสำรอง`, 404);
  const bytes = fs.readFileSync(file);
  if (bytes.length !== version.size || createHash("sha256").update(bytes).digest("hex") !== version.sha256) throw new AppError(`ไฟล์ ${version.name} ไม่ตรงกับต้นฉบับที่เก็บไว้ กรุณานำกลับจากชุดสำรอง`, 409);
  return { ok: true };
}
export async function boundedBody(req: Request, limit: number) {
  if (Number(req.headers.get("content-length") || 0) > limit) throw new AppError("ไฟล์ใหญ่เกินขนาดที่รองรับ", 413);
  const reader = req.body?.getReader(); if (!reader) throw new AppError("ไม่พบไฟล์ที่ส่งมา");
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > limit) { await reader.cancel(); throw new AppError("ไฟล์ใหญ่เกินขนาดที่รองรับ", 413); } chunks.push(next.value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
export async function limitedForm(req: Request, limit = FILE_LIMIT + 1024 * 1024) {
  const bytes = await boundedBody(req, limit);
  return new Response(bytes, { headers: { "Content-Type": req.headers.get("content-type") || "" } }).formData();
}
export async function saveFile(form: FormData) {
  const file = form.get("file"); if (!(file instanceof File) || !file.size || file.size > FILE_LIMIT) throw new AppError("เลือกไฟล์ขนาดไม่เกิน 50 MB");
  const name = path.basename(file.name.replaceAll("\\", "/")).replace(/[\u0000-\u001f]/g, "").slice(0, 300), extension = name.split(".").pop()?.toLowerCase() || "";
  if (!allowedFiles.has(extension)) throw new AppError("ชนิดไฟล์นี้ยังไม่รองรับ");
  const courseId = String(form.get("courseId") || ""), documentId = String(form.get("documentId") || ""), assignmentId = String(form.get("assignmentId") || "") || null;
  const state = readLearning(); record(state, "courses", courseId);
  if (documentId) { const d = record(state, "documents", documentId); if (d.courseId !== courseId || d.archived || d.deletedAt) throw new AppError("ไม่สามารถเพิ่มเวอร์ชันให้เอกสารนี้"); }
  if (assignmentId && record(state, "assignments", assignmentId).courseId !== courseId) throw new AppError("การบ้านอยู่คนละวิชา");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (extension === "pdf" && !bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new AppError("เนื้อหาไฟล์ไม่ใช่ PDF ที่อ่านได้");
  const fileId = randomUUID(), checksum = createHash("sha256").update(bytes).digest("hex"), createdAt = new Date().toISOString();
  fs.mkdirSync(ASSETS, { recursive: true }); fs.writeFileSync(fileLocation(fileId), bytes, { flag: "wx", mode: 0o600 });
  try {
    const saved = changeLearning(s => {
      const existing = documentId ? record(s, "documents", documentId) : null;
      const version = { id: fileId, name, extension, size: bytes.length, sha256: checksum, createdAt, note: String(form.get("versionNote") || "").slice(0, 2000), textStatus: "pending" as const, pages: 0, textError: "" };
      const reading = { ...(existing?.reading || {}), ...(existing?.selectedVersionId && !existing.reading[existing.selectedVersionId] ? { [existing.selectedVersionId]: { lastPage: existing.lastPage, bookmarks: existing.bookmarks } } : {}), [fileId]: { lastPage: 1, bookmarks: [] } };
      const item = learningSchemas.documents.parse(existing ? { ...existing, reading, lastPage: 1, bookmarks: [], versions: [...existing.versions, version], selectedVersionId: fileId, updatedAt: createdAt, revision: existing.revision + 1 } : { id: randomUUID(), title: name, createdAt, updatedAt: createdAt, revision: 1, courseId, assignmentId, category: String(form.get("category") || "เอกสารเรียน"), reading, versions: [version], selectedVersionId: fileId });
      if (existing) s.records.documents[s.records.documents.findIndex(d => d.id === item.id)] = item; else s.records.documents.push(item);
      return item;
    });
    void extractFile(fileId).catch(() => {});
    return saved;
  } catch (error) { fs.unlinkSync(fileLocation(fileId)); throw error; }
}
export async function documentCommand(mode: "extract" | "render", id: string, page?: number) {
  const { version } = findVersion(id), python = learningPython;
  if (!fs.existsSync(python)) throw new AppError("ติดตั้งเครื่องมือเอกสารด้วย npm run setup:learning ก่อน", 409);
  try {
    const { stdout } = await execute(python, ["-u", path.join(ROOT, "scripts", "learning-documents.py"), mode, fileLocation(id), version.extension, ...(page ? [String(page)] : [])], { timeout: 90000, maxBuffer: 12 * 1024 * 1024, windowsHide: true, env: { ...process.env, PYTHONUTF8: "1" } });
    return JSON.parse(stdout);
  } catch (error) {
    const out = (error as { stdout?: string }).stdout; if (out) { try { const parsed = JSON.parse(out); throw new AppError(parsed.error || "อ่านเอกสารไม่สำเร็จ", 422); } catch (e) { if (e instanceof AppError) throw e; } }
    throw new AppError("อ่านเอกสารไม่สำเร็จ ตรวจเครื่องมือเอกสารหรือไฟล์แล้วลองอีกครั้ง", 422);
  }
}
let extraction: Promise<unknown> = Promise.resolve();
const pending = new Set<string>();
export function queuePendingExtractions() {
  for (const d of readLearning().records.documents.filter(d => !d.deletedAt)) for (const v of d.versions) if (["pending", "processing"].includes(v.textStatus) && !pending.has(v.id)) void extractFile(v.id).catch(() => {});
}
export function extractFile(id: string) {
  if (pending.has(id)) return extraction;
  findVersion(id); pending.add(id);
  const run = extraction.catch(() => {}).then(async () => {
    const update = (status: "processing" | DocumentText["status"], pages = 0, error = "") => changeLearning(s => {
      const d = s.records.documents.find(d => d.versions.some(v => v.id === id)); if (!d) return;
      const version = d.versions.find(v => v.id === id)!; version.textStatus = status; version.pages = pages; version.textError = error;
      d.updatedAt = new Date().toISOString(); d.revision++;
    });
    update("processing");
    try { const result = await documentCommand("extract", id) as DocumentText; findVersion(id); fs.mkdirSync(TEXTS, { recursive: true }); atomicJSON(fileLocation(id, true), result); update(result.status, result.pages.length); return result; }
    catch (error) { update("error", 0, error instanceof Error ? error.message.slice(0, 500) : "อ่านไฟล์ไม่สำเร็จ"); throw error; }
    finally { pending.delete(id); }
  });
  extraction = run; return run;
}
export function readDocumentText(id: string): DocumentText {
  findVersion(id);
  if (!fs.existsSync(fileLocation(id, true))) return { status: "error", pages: [], error: "ยังไม่ได้อ่านไฟล์ กดประมวลผลเอกสาร" };
  return JSON.parse(fs.readFileSync(fileLocation(id, true), "utf8"));
}
export function sourceSearch(courseId: string, query: string, versionIds: string[] = []) {
  const s = readLearning(); record(s, "courses", courseId);
  const terms = [...new Intl.Segmenter("th", { granularity: "word" }).segment(query.toLowerCase())].filter(t => t.isWordLike && t.segment.length > 1).map(t => t.segment).slice(0, 40);
  const results: { documentId: string; versionId: string; title: string; page: number; label: string; text: string; score: number }[] = [];
  let totalPages = 0;
  for (const d of s.records.documents.filter(d => d.courseId === courseId && !d.archived && !d.deletedAt)) {
    const selected = d.versions.filter(v => versionIds.length ? versionIds.includes(v.id) : v.id === (d.selectedVersionId || d.versions.at(-1)?.id));
    for (const v of selected) {
      const index = readDocumentText(v.id); totalPages += index.pages.length;
      for (const p of index.pages) if (p.text.trim()) {
        const lower = p.text.toLowerCase(), score = terms.reduce((sum, word) => sum + (lower.split(word).length - 1) * 2 + (d.title.toLowerCase().includes(word) ? 3 : 0), 0);
        results.push({ documentId: d.id, versionId: v.id, title: d.title, page: p.page, label: p.label, text: p.text.slice(0, 7000), score });
      }
    }
  }
  results.sort((a, b) => b.score - a.score || a.page - b.page);
  return { totalPages, sources: results.slice(0, 10) };
}
export function referencedVersions(d: LearningDocument) { return d.versions.map(v => ({ id: v.id, sha256: v.sha256 })); }
