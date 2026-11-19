import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { AppError } from "./http";
import { atomicJSON } from "./store";
import { kinds, type LearningState, type LearningRecord } from "../lib/learning";
import { LEARNING, readLearning, validateLearning, changeLearning, fileLocation, ASSETS, TEXTS, hash } from "./learning-store";

export const BACKUP_LIMIT = 256 * 1024 * 1024;
type Manifest = { format: "axercise-learning"; version: 1; createdAt: string; files: { name: string; size: number; sha256: string }[] };
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function selectedState(courseId?: string) {
  const state = structuredClone(readLearning());
  if (courseId) {
    const course = state.records.courses.find(c => c.id === courseId); if (!course) throw new AppError("ไม่พบวิชาที่จะสำรอง", 404);
    state.records.terms = state.records.terms.filter(t => t.id === course.termId);
    state.records.courses = [course];
    for (const kind of kinds.filter(k => k !== "terms" && k !== "courses")) state.records[kind] = (state.records[kind] as LearningRecord[]).filter(r => "courseId" in r && r.courseId === courseId) as never;
    const ids = new Set(kinds.flatMap(k => state.records[k].map(r => r.id)));
    state.sync.items = Object.fromEntries(Object.entries(state.sync.items).filter(([id]) => ids.has(id)));
  }
  return state;
}
export function exportLearning(courseId?: string) {
  const state = selectedState(courseId), files: Record<string, Uint8Array> = { "catalog.json": strToU8(JSON.stringify(state)) };
  let bytes = files["catalog.json"].byteLength;
  for (const d of state.records.documents.filter(d => !d.deletedAt)) for (const v of d.versions) {
    const filename = fileLocation(v.id); if (!fs.existsSync(filename)) throw new AppError(`สำรองไม่ได้: ไม่พบไฟล์ ${v.name}`, 409);
    const data = fs.readFileSync(filename); if (data.length !== v.size || hashFile(data) !== v.sha256) throw new AppError(`สำรองไม่ได้: ไฟล์ ${v.name} ไม่ตรงกับข้อมูลที่บันทึก`, 409);
    files[`files/${v.id}`] = data; bytes += data.length;
    if (fs.existsSync(fileLocation(v.id, true))) { const text = fs.readFileSync(fileLocation(v.id, true)); files[`text/${v.id}.json`] = text; bytes += text.length; }
    if (bytes > BACKUP_LIMIT) throw new AppError("ชุดสำรองใหญ่เกิน 256 MB กรุณาสำรองแยกรายวิชา", 413);
  }
  const manifest: Manifest = { format: "axercise-learning", version: 1, createdAt: new Date().toISOString(), files: Object.entries(files).map(([name, data]) => ({ name, size: data.length, sha256: sha(data) })) };
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  return zipSync(files, { level: 1 });
}
const hashFile = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
export function validateBackup(bytes: Uint8Array) {
  if (bytes.length > BACKUP_LIMIT) throw new AppError("ZIP ใหญ่เกิน 256 MB", 413);
  let size = 0, count = 0;
  const files = unzipSync(bytes, { filter: item => {
    count++; size += item.originalSize;
    if (count > 5000 || size > BACKUP_LIMIT || item.originalSize > 50 * 1024 * 1024) throw new AppError("ZIP มีข้อมูลเกินขนาดที่รองรับ", 413);
    if (!/^(?:catalog\.json|manifest\.json|files\/[a-f0-9-]{36}|text\/[a-f0-9-]{36}\.json)$/.test(item.name)) throw new AppError("พบเส้นทางที่ไม่ใช่ข้อมูลการเรียนใน ZIP");
    return true;
  } });
  if (!files["manifest.json"] || !files["catalog.json"] || files["catalog.json"].length > 10 * 1024 * 1024) throw new AppError("ZIP นี้ไม่มีแคตตาล็อกและ manifest การเรียนที่รองรับ");
  const manifest = JSON.parse(strFromU8(files["manifest.json"])) as Manifest;
  if (manifest.format !== "axercise-learning" || manifest.version !== 1 || !Array.isArray(manifest.files)) throw new AppError("ไม่รองรับรูปแบบชุดสำรองนี้");
  const listed = new Set<string>();
  for (const entry of manifest.files) {
    const data = files[entry.name];
    if (listed.has(entry.name) || !data || data.length !== entry.size || sha(data) !== entry.sha256) throw new AppError("ไฟล์ในชุดสำรองไม่ครบหรือ checksum ไม่ตรง");
    listed.add(entry.name);
  }
  if (Object.keys(files).some(name => name !== "manifest.json" && !listed.has(name))) throw new AppError("พบไฟล์ที่ไม่ได้ระบุใน manifest");
  const incoming = validateLearning(JSON.parse(strFromU8(files["catalog.json"])));
  const versions = new Set<string>();
  for (const d of incoming.records.documents.filter(d => !d.deletedAt)) for (const v of d.versions) {
    if (versions.has(v.id)) throw new AppError("พบ ID ไฟล์ซ้ำในชุดสำรอง"); versions.add(v.id);
    const data = files[`files/${v.id}`]; if (!data || data.length !== v.size || hashFile(data) !== v.sha256) throw new AppError("ไฟล์ต้นฉบับในชุดสำรองไม่ตรงกับแคตตาล็อก");
    const text = files[`text/${v.id}.json`];
    if (text) {
      if (text.length > 10 * 1024 * 1024) throw new AppError("ดัชนีเอกสารใหญ่เกินขนาด");
      const index = JSON.parse(strFromU8(text));
      if (!Array.isArray(index.pages) || index.pages.length > 500 || index.pages.some((p: { page: number; label: string; text: string }) => !Number.isInteger(p.page) || p.page < 1 || typeof p.label !== "string" || typeof p.text !== "string") || index.pages.reduce((n: number, p: { text: string }) => n + p.text.length, 0) > 2_000_000) throw new AppError("ดัชนีเอกสารในชุดสำรองไม่ถูกต้อง");
    }
  }
  for (const name of Object.keys(files)) if ((name.startsWith("files/") || name.startsWith("text/")) && !versions.has(name.split("/")[1].replace(/\.json$/, ""))) throw new AppError("พบไฟล์ที่ไม่ได้ผูกกับเอกสารในแคตตาล็อก");
  return { incoming, files, manifest };
}
function conflicts(incoming: LearningState, local: LearningState) {
  return kinds.flatMap(kind => incoming.records[kind].flatMap(item => { const current = (local.records[kind] as LearningRecord[]).find(r => r.id === item.id); return current && hash(current) !== hash(item) ? [{ id: item.id, kind, title: item.title }] : []; }));
}
function repairList(incoming: LearningState) {
  const result: { id: string; name: string; reason: "missing" | "corrupt" }[] = [];
  for (const d of incoming.records.documents.filter(d => !d.deletedAt)) for (const v of d.versions) { const file = fileLocation(v.id); if (!fs.existsSync(file)) result.push({ id: v.id, name: v.name, reason: "missing" }); else if (hashFile(fs.readFileSync(file)) !== v.sha256) result.push({ id: v.id, name: v.name, reason: "corrupt" }); }
  return result;
}
export function previewRestore(bytes: Uint8Array) {
  const { incoming, manifest } = validateBackup(bytes), local = readLearning(), stageId = randomUUID();
  const staging = path.join(LEARNING, "restore"); fs.mkdirSync(staging, { recursive: true });
  fs.writeFileSync(path.join(staging, `${stageId}.zip`), bytes, { flag: "wx", mode: 0o600 });
  atomicJSON(path.join(staging, `${stageId}.json`), { revision: local.revision, at: Date.now() });
  return { stageId, createdAt: manifest.createdAt, files: incoming.records.documents.filter(d => !d.deletedAt).reduce((n, d) => n + d.versions.length, 0), counts: Object.fromEntries(kinds.map(k => [k, incoming.records[k].length])), conflicts: conflicts(incoming, local), repairs: repairList(incoming) };
}
export function applyRestore(stageId: string, strategy: "keep" | "backup") {
  if (!/^[a-f0-9-]{36}$/.test(stageId)) throw new AppError("รหัสชุดนำเข้าไม่ถูกต้อง");
  const prefix = path.join(LEARNING, "restore", stageId), meta = JSON.parse(fs.readFileSync(`${prefix}.json`, "utf8"));
  if (Date.now() - meta.at > 3600000) throw new AppError("ตัวอย่างนำเข้าหมดอายุ กรุณาเลือก ZIP ใหม่", 409);
  const { incoming, files } = validateBackup(fs.readFileSync(`${prefix}.zip`)), local = readLearning();
  if (local.revision !== meta.revision) throw new AppError("ข้อมูลบนเครื่องเปลี่ยนหลังดูตัวอย่าง กรุณาเลือก ZIP เพื่อตรวจใหม่", 409);
  const merged = structuredClone(local);
  for (const kind of kinds) for (const item of incoming.records[kind]) {
    const list = merged.records[kind] as LearningRecord[], i = list.findIndex(r => r.id === item.id);
    if (i < 0) list.push(item); else if (strategy === "backup") list[i] = item;
    if (!merged.sync.items[item.id] && incoming.sync.items[item.id]) merged.sync.items[item.id] = incoming.sync.items[item.id];
  }
  for (const d of merged.records.documents) if (!d.deletedAt && local.records.documents.some(old => old.id === d.id && old.deletedAt)) { delete merged.sync.items[d.id]; d.notionDeletedAt = null; d.filesDeletedAt = null; }
  validateLearning(merged);
  const written: string[] = [], recovered: { file: string; original: string }[] = [];
  function install(file: string, data: Uint8Array) { const temp = `${file}.${randomUUID()}.restore`; try { fs.writeFileSync(temp, data, { flag: "wx", mode: 0o600 }); fs.renameSync(temp, file); written.push(file); } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); } }
  try {
    fs.mkdirSync(ASSETS, { recursive: true }); fs.mkdirSync(TEXTS, { recursive: true });
    for (const d of merged.records.documents.filter(d => !d.deletedAt)) for (const v of d.versions) {
      const file = fileLocation(v.id), data = files[`files/${v.id}`];
      if (!data) continue; // A per-course import does not modify unrelated assets.
      if (hashFile(data) !== v.sha256) throw new AppError("ชุดสำรองมี ID เวอร์ชันตรงกันแต่เนื้อหาคนละฉบับ หยุดนำเข้าเพื่อรักษาข้อมูล", 409);
      const previous = local.records.documents.flatMap(d => d.versions).find(f => f.id === v.id);
      if (previous && previous.sha256 !== v.sha256) throw new AppError("เวอร์ชันไฟล์ในชุดสำรองใช้ ID เดิมกับต้นฉบับคนละเนื้อหา หยุดนำเข้าเพื่อรักษาข้อมูล", 409);
      if (fs.existsSync(file)) {
        if (hashFile(fs.readFileSync(file)) !== v.sha256) {
          const directory = path.join(LEARNING, "recovered-originals"); fs.mkdirSync(directory, { recursive: true });
          const original = path.join(directory, `${v.id}.${randomUUID()}`); fs.renameSync(file, original); recovered.push({ file, original });
          install(file, data);
        }
      }
      else if (data) install(file, data);
      else throw new AppError("ไม่พบไฟล์สำหรับรายการที่จะนำกลับ", 409);
      const textFile = fileLocation(v.id, true), text = files[`text/${v.id}.json`];
      if (text && !fs.existsSync(textFile)) install(textFile, text);
    }
    changeLearning(s => { if (s.revision !== local.revision) throw new AppError("ข้อมูลเปลี่ยนระหว่างนำเข้า กรุณาลองใหม่", 409); s.records = merged.records; s.sync = merged.sync; });
  } catch (error) { for (const file of written) fs.unlinkSync(file); for (const entry of recovered) fs.renameSync(entry.original, entry.file); throw error; }
  fs.unlinkSync(`${prefix}.zip`); fs.unlinkSync(`${prefix}.json`);
  return { ok: true, records: kinds.reduce((n, k) => n + incoming.records[k].length, 0), repaired: recovered.length };
}
