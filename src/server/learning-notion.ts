import { config, updateConfig } from "./store";
import { AppError } from "./http";
import { changeLearning, hash, readLearning, validateLearning } from "./learning-store";
import { kinds, learningSchemas, type LearningKind, type LearningRecord } from "../lib/learning";

export async function notionCall<T = Record<string, unknown>>(endpoint: string, method = "GET", data?: unknown): Promise<T> {
  const token = config().notion.token;
  if (!token) throw new AppError("เชื่อม Notion ในการตั้งค่าก่อน", 409);
  const response = await fetch(`https://api.notion.com/v1/${endpoint}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Notion-Version": "2025-09-03" }, ...(data ? { body: JSON.stringify(data) } : {}), cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new AppError(response.status === 401 ? "Notion Token ใช้ไม่ได้" : response.status === 404 ? "Notion เข้าถึงรายการไม่ได้ ตรวจ Connection ของหน้า Axercise" : response.status === 429 ? "Notion รับคำขอมากเกินไป ลองซิงก์อีกครั้งภายหลัง" : "ซิงก์ Notion ไม่สำเร็จ ข้อมูลบนเครื่องยังอยู่", response.status === 429 ? 429 : 502);
  return response.json();
}
export function notionText(value: string) {
  const chars = Array.from(value), result = [];
  for (let i = 0; i < chars.length; i += 1800) result.push({ type: "text", text: { content: chars.slice(i, i + 1800).join("") } });
  if (result.length > 100) throw new AppError("ข้อมูลรายการนี้ยาวเกินกว่าจะซิงก์ Notion ได้ กรุณาแบ่งโน้ตเป็นหลายรายการ");
  return result;
}
type Page = { id: string; properties: Record<string, { title?: { plain_text: string }[]; rich_text?: { plain_text: string }[]; select?: { name: string } | null }> };
export const plainProperty = (p: Page, key: string) => (p.properties[key]?.rich_text || p.properties[key]?.title || []).map(t => t.plain_text).join("");
async function source() {
  const c = config(); if (c.notion.learningId) return c.notion.learningId;
  const parent = c.notion.parentPageId.match(/[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/i)?.[0];
  if (!parent) throw new AppError("กำหนดหน้า Notion ใน Settings ก่อน", 409);
  // Recover a successful creation whose response/config write was interrupted.
  let cursor: string | undefined;
  const matches: string[] = [];
  do {
    const query = new URLSearchParams({ page_size: "100", ...(cursor ? { start_cursor: cursor } : {}) });
    const found = await notionCall<{ results: { id: string; type: string; child_database?: { title: string } }[]; has_more: boolean; next_cursor?: string }>(`blocks/${parent}/children?${query}`);
    for (const d of found.results) if (d.type === "child_database" && d.child_database?.title === "Axercise · Learning") matches.push(d.id);
    cursor = found.has_more ? found.next_cursor : undefined;
  } while (cursor);
  if (matches.length > 1) throw new AppError("พบฐานข้อมูล Axercise · Learning หลายชุด กรุณาตรวจหน้า Notion ก่อนเชื่อม", 409);
  if (matches[0]) { const db = await notionCall<{ data_sources: { id: string }[] }>(`databases/${matches[0]}`); if (!db.data_sources?.[0]) throw new AppError("อ่าน data source ของ Learning ไม่สำเร็จ", 502); updateConfig(v => { v.notion.learningId = db.data_sources[0].id; }); return db.data_sources[0].id; }
  const db = await notionCall<{ data_sources: { id: string }[] }>("databases", "POST", { parent: { type: "page_id", page_id: parent }, title: notionText("Axercise · Learning"), initial_data_source: { properties: { Name: { title: {} }, RecordID: { rich_text: {} }, Kind: { select: { options: kinds.map(name => ({ name })) } }, Data: { rich_text: {} } } } });
  if (!db.data_sources?.[0]) throw new AppError("สร้างฐานข้อมูลแล้ว แต่ยังอ่าน data source ไม่สำเร็จ กรุณาลองซิงก์ใหม่", 502);
  updateConfig(v => { v.notion.learningId = db.data_sources[0].id; }); return db.data_sources[0].id;
}
let running: Promise<unknown> | null = null;
export function syncLearning(resolve?: { id: string; use: "local" | "remote" }) {
  if (running) return running;
  running = performSync(resolve).catch(error => { changeLearning(s => { s.sync.error = error instanceof Error ? error.message : "ซิงก์ไม่สำเร็จ"; }); throw error; }).finally(() => { running = null; });
  return running;
}
async function performSync(resolve?: { id: string; use: "local" | "remote" }) {
  const sourceId = await source(), remote = new Map<string, { page: Page; kind: LearningKind; item: LearningRecord }>();
  const remotePages = new Map<string, Page[]>();
  let cursor: string | undefined;
  do {
    const r = await notionCall<{ results: Page[]; has_more: boolean; next_cursor?: string }>(`data_sources/${sourceId}/query`, "POST", { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    for (const page of r.results) {
      const recordId = plainProperty(page, "RecordID"); remotePages.set(recordId, [...(remotePages.get(recordId) || []), page]);
      if (readLearning().records.documents.some(d => d.id === recordId && d.deletedAt)) continue;
      const kind = page.properties.Kind?.select?.name as LearningKind;
      if (!kinds.includes(kind)) throw new AppError("พบชนิดข้อมูลที่ไม่รองรับในฐานข้อมูลการเรียน กรุณาตรวจ Notion", 409);
      let item: LearningRecord;
      try { item = learningSchemas[kind].parse(JSON.parse(plainProperty(page, "Data"))); }
      catch { throw new AppError("พบข้อมูลการเรียนใน Notion ที่รูปแบบไม่ถูกต้อง กรุณาตรวจแถวก่อนซิงก์", 409); }
      if (item.id !== plainProperty(page, "RecordID") || remote.has(item.id)) throw new AppError("RecordID ใน Notion ซ้ำหรือไม่ตรงกับข้อมูล กรุณาตรวจฐานข้อมูล", 409);
      remote.set(item.id, { page, kind, item });
    }
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  changeLearning(state => {
    for (const { page, kind, item } of remote.values()) {
      const list = state.records[kind] as LearningRecord[], index = list.findIndex(r => r.id === item.id), local = list[index], info = state.sync.items[item.id];
      if (local && "deletedAt" in local && local.deletedAt) continue;
      const remoteHash = hash(item), localHash = local ? hash(local) : "";
      if (!local || localHash === remoteHash || localHash === info?.baseHash || (resolve?.id === item.id && resolve.use === "remote")) {
        if (!local) list.push(item); else list[index] = item;
        state.sync.items[item.id] = { pageId: page.id, baseHash: remoteHash };
      } else if (remoteHash !== info?.baseHash && !(resolve?.id === item.id && resolve.use === "local")) {
        state.sync.items[item.id] = { pageId: page.id, baseHash: info?.baseHash || "", conflict: true };
      } else state.sync.items[item.id] = { pageId: page.id, baseHash: info?.baseHash || remoteHash };
    }
    // A previously synchronized row that disappears remotely needs a decision.
    for (const kind of kinds) for (const item of state.records[kind]) {
      if ("deletedAt" in item && item.deletedAt) continue;
      const info = state.sync.items[item.id];
      if (info?.pageId && !remote.has(item.id)) {
        if (resolve?.id === item.id && resolve.use === "local") delete state.sync.items[item.id];
        else state.sync.items[item.id] = { ...info, conflict: true, error: "ไม่พบแถวเดิมใน Notion ตรวจว่าถูกย้ายไปถังขยะหรือถูกถอนสิทธิ์" };
      }
    }
    validateLearning(state);
  });
  let pushed = 0;
  for (const kind of kinds) for (const captured of readLearning().records[kind]) {
    const current = readLearning(), item = (current.records[kind] as LearningRecord[]).find(r => r.id === captured.id);
    if (!item) continue;
    if ("deletedAt" in item && item.deletedAt) {
      for (const page of remotePages.get(item.id) || []) await notionCall(`pages/${page.id}`, "PATCH", { in_trash: true });
      changeLearning(s => { const doc = s.records.documents.find(d => d.id === item.id); if (doc?.deletedAt === item.deletedAt) { doc.notionDeletedAt = new Date().toISOString(); delete s.sync.items[item.id]; } });
      continue;
    }
    const info = current.sync.items[item.id], itemHash = hash(item);
    if (info?.conflict || info?.baseHash === itemHash) continue;
    const properties = { Name: { title: notionText(item.title) }, RecordID: { rich_text: notionText(item.id) }, Kind: { select: { name: kind } }, Data: { rich_text: notionText(JSON.stringify(item)) } };
    let pageId = info?.pageId;
    if (!pageId) {
      const found = await notionCall<{ results: Page[] }>(`data_sources/${sourceId}/query`, "POST", { filter: { property: "RecordID", rich_text: { equals: item.id } }, page_size: 2 });
      if (found.results.length > 1) throw new AppError("RecordID ใน Notion ซ้ำ กรุณาตรวจฐานข้อมูล", 409);
      if (found.results[0]) {
        const recovered = found.results[0];
        if (plainProperty(recovered, "Data") !== JSON.stringify(item)) {
          changeLearning(s => { s.sync.items[item.id] = { pageId: recovered.id, baseHash: "", conflict: true }; });
          continue;
        }
        pageId = recovered.id;
      } else pageId = (await notionCall<Page>("pages", "POST", { parent: { type: "data_source_id", data_source_id: sourceId }, properties })).id;
    } else await notionCall(`pages/${pageId}`, "PATCH", { properties });
    changeLearning(s => { const latest = (s.records[kind] as LearningRecord[]).find(r => r.id === item.id); if (latest && !("deletedAt" in latest && latest.deletedAt)) s.sync.items[item.id] = { pageId: pageId!, baseHash: itemHash }; });
    pushed++;
    await new Promise(r => setTimeout(r, 350));
  }
  changeLearning(s => { s.sync.lastAt = new Date().toISOString(); s.sync.error = ""; });
  return { pushed, conflicts: Object.values(readLearning().sync.items).filter(i => i.conflict).length };
}
