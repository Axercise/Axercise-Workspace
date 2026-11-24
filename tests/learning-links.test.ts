import test, { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { unzipSync } from "fflate";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axercise-learning-links-test-"));
process.env.AXERCISE_DATA_DIR = directory;
const store = await import("../src/server/store");
const learning = await import("../src/server/learning-store");
const { learningSchemas } = await import("../src/lib/learning");
const files = await import("../src/server/learning-files");
const deletion = await import("../src/server/learning-delete");
const backup = await import("../src/server/learning-backup");
const notion = await import("../src/server/learning-notion");
const route = await import("../src/app/api/learning/route");
const tools = await import("../src/app/api/tools/route");
const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = async () => { throw new Error("Saving references must not fetch a website"); };
  store.atomicJSON(path.join(learning.LEARNING, "catalog.json"), learning.emptyLearning());
  store.updateConfig(c => { c.notion.token = "learning-links-test-secret"; c.notion.learningId = randomUUID(); c.notion.tasksId = randomUUID(); });
});
after(() => { globalThis.fetch = originalFetch; const target = path.resolve(directory); assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith("axercise-learning-links-test-")); fs.rmSync(target, { recursive: true, force: true }); });
function course() { const term = learning.saveLearningRecord("terms", { title: "เทอม 1", year: "2569" }); return learning.saveLearningRecord("courses", { title: "CS101", termId: term.id }); }
function link(courseId: string, patch: Record<string, unknown> = {}) { return learning.saveLearningRecord("documents", { courseId, title: "สไลด์บทที่ 1", url: "https://example.com/lecture?chapter=1#slides", ...patch }); }
function originalFile(courseId: string) {
  const bytes = Buffer.from("Original lecture notes"), versionId = randomUUID(), now = new Date().toISOString();
  fs.mkdirSync(learning.ASSETS, { recursive: true }); fs.writeFileSync(learning.fileLocation(versionId), bytes);
  const doc = learningSchemas.documents.parse({ id: randomUUID(), title: "old-notes.txt", courseId, createdAt: now, updatedAt: now, revision: 1, versions: [{ id: versionId, name: "old-notes.txt", extension: "txt", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), createdAt: now, textStatus: "ready" }], selectedVersionId: versionId });
  learning.changeLearning(s => { s.records.documents.push(doc); }); return doc;
}
function request(data?: unknown, method = "POST", headers: Record<string, string> = {}) { return new Request("http://127.0.0.1:3210/api/learning", { method, headers: { host: "127.0.0.1:3210", origin: "http://127.0.0.1:3210", "content-type": "application/json", "x-axercise-client": "workspace", ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) }); }

test("course links persist with notes, categories, tags and pin state while working offline", () => {
  const c = course(), d = link(c.id, { url: "  https://example.com/วิชา?q=บทที่1#page  ", category: "Syllabus", chapter: "บทที่ 1", tags: ["อ่านสอบ"], note: "อ่านก่อนเรียน", pinned: true });
  const saved = learning.record(learning.readLearning(), "documents", d.id);
  assert.equal(saved.url, "https://example.com/วิชา?q=บทที่1#page"); assert.equal(saved.note, "อ่านก่อนเรียน"); assert.equal(saved.pinned, true); assert.deepEqual(saved.tags, ["อ่านสอบ"]); assert.equal(saved.courseId, c.id); assert.deepEqual(saved.versions, []); assert.equal(saved.selectedVersionId, null); assert.equal(files.sourceSearch(c.id, "วิชา").sources.length, 0);
});
test("unsafe protocols, credentials, malformed URLs and blank references cannot create records", () => {
  const c = course();
  for (const url of ["javascript:alert(1)", "data:text/html,test", "file:///C:/private", "ftp://example.com/notes", "https://user:password@example.com/", "https://user@example.com/", "https:\\example.com", "https://example.com/a b", "https://example.com/\npath", "https://", "", "   "]) assert.throws(() => link(c.id, { url }), `Must reject ${JSON.stringify(url)}`);
  assert.equal(learning.readLearning().records.documents.length, 0); assert.throws(() => learning.saveLearningRecord("documents", { courseId: c.id, title: "fake upload" }), /อัปโหลด/);
});
test("legacy file records retain their exact shape and sync fingerprint without a URL migration", () => {
  const c = course(), d = originalFile(c.id), pageId = randomUUID(), hash = learning.hash(d); learning.changeLearning(s => { s.sync.items[d.id] = { pageId, baseHash: hash }; });
  const reopened = learning.record(learning.readLearning(), "documents", d.id);
  assert.equal(Object.hasOwn(reopened, "url"), false); assert.equal(learning.hash(reopened), hash); assert.equal(learning.readLearning().sync.items[d.id].baseHash, hash); assert.equal(files.checkFile(d.versions[0].id).ok, true);
});
test("partial edits preserve metadata while stale revisions, course moves and removal of a link URL are rejected", () => {
  const c = course(), d = link(c.id, { tags: ["keep"], note: "keep note" }); const edited = learning.saveLearningRecord("documents", { url: "https://example.com/new", pinned: true }, d.id, d.revision);
  assert.equal(edited.title, d.title); assert.deepEqual(edited.tags, ["keep"]); assert.equal(edited.note, "keep note"); assert.throws(() => learning.saveLearningRecord("documents", { note: "stale" }, d.id, d.revision), /เปลี่ยนไปแล้ว/);
  assert.throws(() => learning.saveLearningRecord("documents", { url: undefined }, d.id, edited.revision), /ต้องมี URL/); const other = course(); assert.throws(() => learning.saveLearningRecord("documents", { courseId: other.id }, d.id, edited.revision), /เปลี่ยนรายวิชา/);
});
test("links cannot fabricate local file versions or replace an uploaded original", async () => {
  const c = course(), f = originalFile(c.id), d = link(c.id);
  assert.throws(() => link(c.id, { versions: f.versions }), /คนละรายการ/); assert.throws(() => learning.saveLearningRecord("documents", { url: "https://example.com" }, f.id, f.revision), /คนละรายการ/);
  const form = new FormData(); form.set("courseId", c.id); form.set("documentId", d.id); form.set("file", new File(["new bytes"], "new.txt")); await assert.rejects(() => files.saveFile(form), /รายการนี้เป็นลิงก์/);
  assert.equal(learning.record(learning.readLearning(), "documents", d.id).versions.length, 0); assert.equal(files.checkFile(f.versions[0].id).ok, true);
});
test("assignment references stay in their course and a saved link is distinct from an uploaded submission", () => {
  const c = course(), a = learning.saveLearningRecord("assignments", { title: "งาน 1", courseId: c.id }), d = link(c.id, { assignmentId: a.id }); assert.equal(d.assignmentId, a.id);
  assert.throws(() => learning.saveLearningRecord("assignments", { submittedVersionId: d.id }, a.id), /ต้องเป็นไฟล์/); const other = course(); assert.throws(() => link(other.id, { assignmentId: a.id }), /วิชาเดียวกัน/);
});
test("deleting a link removes only its saved reference and cannot silently resurrect deleted metadata", async () => {
  const c = course(), f = originalFile(c.id), d = link(c.id); const details = deletion.documentDeletionDetails(d.id); assert.equal(details.versions, 0); assert.equal(details.url, d.url);
  assert.throws(() => deletion.deleteDocument(d.id, d.revision + 1), /เปลี่ยนไปแล้ว/); const result = deletion.deleteDocument(d.id, d.revision); assert.equal(result.cleanupPending, false); assert.match(result.message, /ลบลิงก์/);
  assert.ok(learning.record(learning.readLearning(), "documents", d.id).deletedAt); assert.throws(() => learning.saveLearningRecord("documents", { deletedAt: null, archived: false }, d.id)); assert.equal(files.checkFile(f.versions[0].id).ok, true);
  const feed = await (await route.GET(request(undefined, "GET"))).json(); assert.ok(feed.records.documents.every((item: { id: string }) => item.id !== d.id));
});
test("mixed links and uploaded files round-trip through ZIP without downloading website content", () => {
  const c = course(), f = originalFile(c.id), d = link(c.id, { note: "link backup" }), bytes = backup.exportLearning(c.id), entries = unzipSync(bytes);
  assert.deepEqual(Object.keys(entries).sort(), ["catalog.json", `files/${f.versions[0].id}`, "manifest.json"].sort()); const checked = backup.validateBackup(bytes); assert.equal(checked.incoming.records.documents.find(item => item.id === d.id)!.url, d.url);
  deletion.deleteDocument(d.id, d.revision); const preview = backup.previewRestore(bytes); backup.applyRestore(preview.stageId, "backup"); assert.equal(learning.record(learning.readLearning(), "documents", d.id).url, d.url); assert.equal(learning.record(learning.readLearning(), "documents", d.id).deletedAt, null); assert.equal(files.checkFile(f.versions[0].id).ok, true);
});
test("Notion sync preserves links, pulls URL edits, rejects unsafe remote URLs and archives deleted references", async () => {
  const c = course(), d = link(c.id), pages = new Map<string, any>(); let patches = 0, archives = 0;
  const plain = (p: any) => Object.fromEntries(Object.entries(p).map(([key, value]: [string, any]) => [key, { ...value, ...(value.title ? { title: value.title.map((r: any) => ({ plain_text: r.text.content })) } : {}), ...(value.rich_text ? { rich_text: value.rich_text.map((r: any) => ({ plain_text: r.text.content })) } : {}) }]));
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).startsWith("https://api.notion.com/"), "No fetch of saved link destinations"); const body = JSON.parse(String(init?.body || "{}")), endpoint = new URL(String(url)).pathname;
    if (endpoint.endsWith("/query")) { const found = [...pages.values()].filter(p => !body.filter || p.properties.RecordID.rich_text[0].plain_text === body.filter.rich_text.equals); return Response.json({ results: found, has_more: false }); }
    if (endpoint.endsWith("/pages")) { const p = { id: randomUUID(), properties: plain(body.properties) }; pages.set(p.id, p); return Response.json(p); }
    const page = pages.get(endpoint.split("/").at(-1)!); assert.ok(page);
    if (body.in_trash) { pages.delete(page.id); archives++; } else if (body.properties) { page.properties = plain(body.properties); patches++; } return Response.json(page);
  };
  await notion.syncLearning(); assert.equal(pages.size, 3); await notion.syncLearning(); assert.equal(patches, 0);
  const p = [...pages.values()].find(p => p.properties.RecordID.rich_text[0].plain_text === d.id), data = JSON.parse(p.properties.Data.rich_text.map((t: any) => t.plain_text).join("")); data.url = "https://example.com/remote-edit"; data.revision++; p.properties.Data.rich_text = [{ plain_text: JSON.stringify(data) }];
  await notion.syncLearning(); assert.equal(learning.record(learning.readLearning(), "documents", d.id).url, data.url);
  p.properties.Data.rich_text = [{ plain_text: JSON.stringify({ ...data, url: "javascript:alert(1)" }) }]; await assert.rejects(() => notion.syncLearning(), /รูปแบบไม่ถูกต้อง/); assert.equal(learning.record(learning.readLearning(), "documents", d.id).url, data.url);
  p.properties.Data.rich_text = [{ plain_text: JSON.stringify(data) }]; const latest = learning.record(learning.readLearning(), "documents", d.id); deletion.deleteDocument(d.id, latest.revision); await notion.syncLearning(); assert.equal(archives, 1); assert.ok(learning.record(learning.readLearning(), "documents", d.id).notionDeletedAt);
});
test("local endpoints and all three authenticated agents save learning links through the same validated path", async () => {
  const c = course(), data = { courseId: c.id, title: "lecture", url: "https://example.com/lecture" };
  assert.equal((await route.POST(request({ kind: "documents", data }, "POST", { origin: "https://other.example" }))).status, 403); assert.equal((await route.POST(request({ kind: "documents", data: { ...data, url: "javascript:x" } }))).status, 400);
  const response = await route.POST(request({ kind: "documents", data })); assert.equal(response.status, 200); assert.equal((await response.json()).url, data.url);
  for (const agent of ["hermes", "secretary", "developer"]) { const result = await tools.POST(request({ action: "learning_save", agent, args: { kind: "documents", data } }, "POST", { authorization: `Bearer ${store.config().serviceToken}` })); assert.equal(result.status, 200); assert.equal((await result.json()).url, data.url); }
  const denied = await tools.POST(request({ action: "learning_save", agent: "hermes", args: { kind: "documents", data } })); assert.equal(denied.status, 401);
});
