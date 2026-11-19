import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { atomicJSON, DATA } from "./store";
import { AppError } from "./http";
import { LIBRARY_FILE_LIMIT, LIBRARY_KINDS, libraryHasKind, type LibraryAsset, type LibraryFeed, type LibraryItem } from "../lib/library";
import type { AgentId } from "../lib/types";

const folder = () => path.join(DATA, "library");
const catalog = () => path.join(folder(), "catalog.json");
const uuid = z.uuid();
const assetSchema = z.object({ id: uuid, name: z.string().max(300), size: z.number().int().nonnegative(), mime: z.string(), sha256: z.string(), createdAt: z.string(), owner: z.string(), pendingDelete: z.boolean().optional() });
const itemSchema = z.object({ id: uuid, revision: z.number().int().positive(), title: z.string().min(1).max(300), content: z.string().max(200000), urls: z.array(z.string()), tags: z.array(z.string()), favorite: z.boolean(), fileIds: z.array(uuid), source: z.string(), createdAt: z.string(), updatedAt: z.string(), deletedAt: z.string().optional(), captureKey: uuid.optional(), captureHash: z.string().optional() });
const stateSchema = z.object({ version: z.literal(1), assets: z.array(assetSchema), items: z.array(itemSchema) });
type State = z.infer<typeof stateSchema>;
export function readLibrary(): State {
  if (!fs.existsSync(catalog())) return { version: 1, assets: [], items: [] };
  try { return stateSchema.parse(JSON.parse(fs.readFileSync(catalog(), "utf8"))); }
  catch { throw new AppError("ข้อมูลคลังบันทึกเสียหาย กรุณากู้ catalog.json จากชุดสำรอง", 409); }
}
function change<T>(fn: (state: State) => T) { const state = readLibrary(), result = fn(state); atomicJSON(catalog(), state); return result; }
export function libraryAssetPath(id: string) { uuid.parse(id); return path.join(folder(), "files", `${id}.bin`); }
export function libraryAsset(id: string): LibraryAsset {
  uuid.parse(id); const file = readLibrary().assets.find(a => a.id === id && !a.pendingDelete);
  if (!file) throw new AppError("ไม่พบไฟล์ หรือไฟล์ถูกลบแล้ว", 404);
  const { owner: _owner, pendingDelete: _pending, ...asset } = file; return asset;
}
function view(state: State, item: State["items"][number]): LibraryItem {
  const { captureKey: _key, captureHash: _hash, ...value } = item;
  return { ...value, files: item.fileIds.flatMap(id => { const a = state.assets.find(a => a.id === id && !a.pendingDelete); if (!a) return []; const { owner: _owner, pendingDelete: _pending, ...file } = a; return [file]; }) };
}
export function libraryRead(id: string) { uuid.parse(id); const state = readLibrary(), item = state.items.find(i => i.id === id && !i.deletedAt); if (!item) throw new AppError("ไม่พบรายการบันทึก", 404); return view(state, item); }
const querySchema = z.object({ query: z.string().max(1000).default(""), kind: z.enum(LIBRARY_KINDS).default("all"), tag: z.string().max(100).default(""), favorite: z.boolean().default(false), trash: z.boolean().default(false), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(200).default(80) });
export function libraryList(input: unknown = {}): LibraryFeed {
  cleanupLibraryFiles(); const q = querySchema.parse(input), state = readLibrary(), active = state.items.filter(i => !i.deletedAt).map(i => view(state, i));
  const counts = Object.fromEntries(LIBRARY_KINDS.map(k => [k, active.filter(i => libraryHasKind(i, k)).length])) as LibraryFeed["counts"];
  counts.trash = state.items.filter(i => !!i.deletedAt).length; counts.favorites = active.filter(i => i.favorite).length;
  const words = q.query.normalize("NFKC").toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const items = (q.trash ? state.items.filter(i => !!i.deletedAt).map(i => view(state, i)) : active).filter(i => {
    const haystack = [i.title, i.content, ...i.urls, ...i.tags, ...i.files.map(f => f.name)].join("\n").normalize("NFKC").toLocaleLowerCase();
    return words.every(word => haystack.includes(word)) && libraryHasKind(i, q.kind) && (!q.favorite || i.favorite) && (!q.tag || i.tags.includes(q.tag));
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { items: items.slice(q.offset, q.offset + q.limit), total: items.length, offset: q.offset, limit: q.limit, counts, tags: [...new Set(active.flatMap(i => i.tags))].sort((a, b) => a.localeCompare(b, "th")) };
}
export function cleanLibraryUrl(value: string) {
  let url: URL; try { url = new URL(value.trim()); } catch { throw new AppError("ลิงก์ไม่ถูกต้อง ใช้ URL ที่ขึ้นต้นด้วย https:// หรือ http://"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || value.length > 5000) throw new AppError("รองรับลิงก์ http/https ที่ไม่มีรหัสผ่านฝังอยู่เท่านั้น");
  return url.href;
}
const saveSchema = z.object({ title: z.string().trim().max(300).optional(), content: z.string().max(200000).optional(), urls: z.array(z.string().max(5000)).max(50).optional(), tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(), favorite: z.boolean().optional(), attachmentIds: z.array(uuid).max(20).optional(), captureKey: uuid.optional() }).strict();
export function saveLibrary(input: unknown, id?: string, revision?: number, source = "web") {
  const data = saveSchema.parse(input); if (id) uuid.parse(id);
  return change(state => {
    const existing = id ? state.items.find(i => i.id === id && !i.deletedAt) : undefined;
    if (id && !existing) throw new AppError("ไม่พบรายการบันทึก", 404);
    if (existing && existing.revision !== revision) throw new AppError("รายการนี้มีการแก้ไขแล้ว กรุณาเปิดใหม่ก่อนบันทึก", 409);
    const content = data.content ?? existing?.content ?? "";
    const detected = [...content.matchAll(/https?:\/\/[^\s<>"\u0000-\u001f]+/gi)].map(m => m[0].replace(/[),.;!?\]}]+$/, ""));
    const urls = [...new Set([...(data.urls ?? existing?.urls ?? []), ...detected].filter(Boolean).map(cleanLibraryUrl))];
    if (urls.length > 50) throw new AppError("หนึ่งรายการเก็บลิงก์ได้ไม่เกิน 50 ลิงก์");
    const fileIds = [...new Set(data.attachmentIds ?? existing?.fileIds ?? [])];
    for (const fileId of fileIds) { if (!state.assets.some(a => a.id === fileId && !a.pendingDelete) || !fs.existsSync(libraryAssetPath(fileId))) throw new AppError("ไฟล์แนบหายหรือไม่พร้อมใช้งาน กรุณาแนบใหม่", 404); }
    if (!content.trim() && !urls.length && !fileIds.length) throw new AppError("เพิ่มข้อความ ลิงก์ หรือไฟล์อย่างน้อยหนึ่งอย่าง");
    const title = data.title?.trim() || existing?.title || (fileIds.length ? state.assets.find(a => a.id === fileIds[0])!.name : content.trim().split("\n")[0]?.slice(0, 150) || new URL(urls[0]).hostname);
    const tags = [...new Set(data.tags ?? existing?.tags ?? [])], favorite = data.favorite ?? existing?.favorite ?? false;
    const captureHash = createHash("sha256").update(JSON.stringify({ title, content, urls, tags, favorite, fileIds })).digest("hex");
    if (!id && data.captureKey) { const previous = state.items.find(i => i.captureKey === data.captureKey); if (previous) { if (previous.captureHash !== captureHash || previous.deletedAt) throw new AppError("คำขอบันทึกนี้ถูกใช้แล้ว เปิดรายการเดิมก่อนแก้ไข", 409); return view(state, previous); } }
    const now = new Date().toISOString();
    const item = itemSchema.parse({ ...existing, id: existing?.id || randomUUID(), revision: (existing?.revision || 0) + 1, title, content, urls, tags, favorite, fileIds, source: existing?.source || source, createdAt: existing?.createdAt || now, updatedAt: now, captureKey: existing?.captureKey || data.captureKey, captureHash: existing?.captureHash || captureHash });
    if (existing) state.items[state.items.indexOf(existing)] = item; else state.items.push(item); return view(state, item);
  });
}
export function deleteLibrary(id: string, revision: number, action: "trash" | "restore" | "delete") {
  uuid.parse(id);
  change(state => {
    const item = state.items.find(i => i.id === id); if (!item) throw new AppError("ไม่พบรายการบันทึก", 404);
    if (item.revision !== revision) throw new AppError("รายการนี้เปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนลบ", 409);
    if (action === "delete") {
      if (!item.deletedAt) throw new AppError("ย้ายรายการลงถังขยะก่อนลบถาวร", 409);
      state.items = state.items.filter(i => i.id !== id);
      for (const fileId of item.fileIds) if (!state.items.some(i => i.fileIds.includes(fileId))) { const asset = state.assets.find(a => a.id === fileId); if (asset) asset.pendingDelete = true; }
    } else { item.deletedAt = action === "trash" ? new Date().toISOString() : undefined; item.updatedAt = new Date().toISOString(); item.revision++; }
  });
  const pending = cleanupLibraryFiles(); return { ok: true, pendingFileDeletion: pending };
}
export function cleanupLibraryFiles() {
  const state = readLibrary(); let dirty = false;
  for (const asset of [...state.assets]) {
    const referenced = state.items.some(i => i.fileIds.includes(asset.id));
    if (!referenced && (asset.pendingDelete || Date.parse(asset.createdAt) < Date.now() - 7 * 86400000)) {
      if (!asset.pendingDelete) { asset.pendingDelete = true; dirty = true; }
      try { fs.rmSync(libraryAssetPath(asset.id), { force: true }); state.assets = state.assets.filter(a => a.id !== asset.id); dirty = true; } catch {}
    }
  }
  if (dirty) atomicJSON(catalog(), state); return state.assets.filter(a => a.pendingDelete).length;
}
export function assetMime(bytes: Buffer, name: string): string {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString())) return "image/gif";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (bytes.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  const ext = path.extname(name).toLowerCase();
  return ({ ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4" } as Record<string, string>)[ext] || "application/octet-stream";
}
export function stageLibraryFile(bytes: Buffer, filename: string, owner = "web"): LibraryAsset {
  if (!bytes.length || bytes.length > LIBRARY_FILE_LIMIT) throw new AppError("ไฟล์ต้องมีขนาดมากกว่า 0 และไม่เกิน 50 MB", 413);
  const name = path.basename(filename.replaceAll("\\", "/")).replace(/[\u0000-\u001f]/g, "").slice(0, 300) || "attachment";
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const previous = readLibrary().assets.find(a => !a.pendingDelete && a.sha256 === sha256 && a.name === name && a.owner === owner);
  if (previous && fs.existsSync(libraryAssetPath(previous.id))) { change(state => { if (!state.items.some(i => i.fileIds.includes(previous.id))) state.assets.find(a => a.id === previous.id)!.createdAt = new Date().toISOString(); }); return libraryAsset(previous.id); }
  const file = { id: randomUUID(), name, size: bytes.length, mime: assetMime(bytes, name), sha256, createdAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(libraryAssetPath(file.id)), { recursive: true }); fs.writeFileSync(libraryAssetPath(file.id), bytes, { flag: "wx", mode: 0o600 });
  try { change(state => state.assets.push({ ...file, owner })); return file; } catch (error) { fs.rmSync(libraryAssetPath(file.id), { force: true }); throw error; }
}
export function importAgentLibraryFile(filename: string, agent: AgentId) {
  const home = path.resolve(DATA, "hermes", agent), candidate = path.resolve(filename);
  const roots = ["cache/images", "cache/audio", "cache/documents", "cache/videos", "cache/video", "cache/screenshots", "image_cache", "audio_cache", "document_cache", "video_cache", "browser_screenshots", "attachments", "downloads"];
  const inside = (root: string, file: string) => { const relative = path.relative(root, file); return !!relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative); };
  let resolved: string; try { resolved = fs.realpathSync(candidate); } catch { throw new AppError("ไม่พบไฟล์แนบที่ Hermes ดาวน์โหลดไว้", 404); }
  if (!roots.some(p => { const root = path.join(home, p); return fs.existsSync(root) && inside(fs.realpathSync(root), resolved) && inside(fs.realpathSync(home), fs.realpathSync(root)); })) throw new AppError("เลือกได้เฉพาะไฟล์แนบในโฟลเดอร์ cache/downloads ของ Agent นี้", 403);
  const stat = fs.statSync(resolved); if (!stat.isFile() || !stat.size || stat.size > LIBRARY_FILE_LIMIT) throw new AppError("ไฟล์แนบต้องไม่เกิน 50 MB", 413);
  return stageLibraryFile(fs.readFileSync(resolved), path.basename(resolved), agent);
}
