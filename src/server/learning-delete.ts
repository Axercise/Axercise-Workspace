import fs from "node:fs";
import path from "node:path";
import { AppError } from "./http";
import { changeLearning, fileLocation, LEARNING, readLearning, record } from "./learning-store";

export function documentDeletionDetails(id: string) {
  const s = readLearning(), d = record(s, "documents", id), versions = new Set(d.versions.map(v => v.id));
  if (d.deletedAt) throw new AppError("เอกสารถูกลบแล้ว", 404);
  return { id: d.id, title: d.title, revision: d.revision, versions: d.versions.length, ...(d.url ? { url: d.url } : {}),
    notes: s.records.notes.filter(n => n.documentId === id || n.sources.some(source => source.documentId === id)).length,
    sets: s.records.sets.filter(set => set.sourceVersionIds.some(v => versions.has(v)) || set.sources.some(source => source.documentId === id)).length,
    submissions: s.records.assignments.filter(a => a.submittedVersionId && versions.has(a.submittedVersionId)).map(a => a.title) };
}

export function cleanupDeletedDocuments() {
  const done: string[] = [];
  for (const d of readLearning().records.documents.filter(d => d.deletedAt && !d.filesDeletedAt)) {
    let failed = false;
    for (const v of d.versions) {
      const originals = path.join(LEARNING, "recovered-originals");
      const files = [fileLocation(v.id), fileLocation(v.id, true)];
      try { if (fs.existsSync(originals)) for (const name of fs.readdirSync(originals)) if (new RegExp(`^${v.id}\\.[a-f0-9-]{36}$`).test(name)) files.push(path.join(originals, name)); } catch { failed = true; }
      for (const file of files) { try { fs.unlinkSync(file); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") failed = true; } }
    }
    if (!failed) done.push(d.id);
  }
  if (done.length) changeLearning(s => { for (const id of done) { const d = record(s, "documents", id); if (d.deletedAt) d.filesDeletedAt = new Date().toISOString(); } });
}

export function deleteDocument(id: string, revision: number) {
  const before = record(readLearning(), "documents", id);
  if (!before.deletedAt) changeLearning(s => {
    const d = record(s, "documents", id);
    if (d.revision !== revision) throw new AppError("เอกสารนี้เปลี่ยนไปแล้ว ตรวจรายละเอียดล่าสุดก่อนลบ", 409);
    const now = new Date().toISOString(); d.deletedAt = now; d.archived = true; d.updatedAt = now; d.revision++;
    // Retain only catalog metadata for existing citations and deletion sync.
    delete s.sync.items[id];
  });
  cleanupDeletedDocuments();
  const pending = !record(readLearning(), "documents", id).filesDeletedAt;
  return { ok: true, cleanupPending: pending, message: before.url ? "ลบลิงก์จากรายวิชาแล้ว" : pending ? "ลบเอกสารแล้ว ไฟล์บางส่วนยังถูกใช้งาน ระบบจะลองลบอีกครั้ง" : "ลบเอกสารและไฟล์ทุกเวอร์ชันแล้ว" };
}
