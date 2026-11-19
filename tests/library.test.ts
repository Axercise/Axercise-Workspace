import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axercise-library-test-"));
process.env.AXERCISE_DATA_DIR = directory;
const store = await import("../src/server/store");
const library = await import("../src/server/library");
const chat = await import("../src/server/library-chat");
const lib = await import("../src/lib/library");
const route = await import("../src/app/api/library/route");
const files = await import("../src/app/api/library/files/route");
const fileRoute = await import("../src/app/api/library/files/[id]/route");
const tools = await import("../src/app/api/tools/route");
const proxy = await import("../src/app/api/hermes/[...path]/route");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNYsGDBfwAGpALgyZd5nAAAAABJRU5ErkJggg==", "base64");
const originalFetch = globalThis.fetch;
function req(endpoint: string, data?: unknown, method = "POST", headers: Record<string, string> = {}) { return new Request(`http://127.0.0.1:3210${endpoint}`, { method, headers: { host: "127.0.0.1:3210", origin: "http://127.0.0.1:3210", "content-type": "application/json", "x-axercise-client": "workspace", ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) }); }
beforeEach(() => { globalThis.fetch = originalFetch; store.atomicJSON(path.join(directory, "library", "catalog.json"), { version: 1, items: [], assets: [] }); });
after(() => { globalThis.fetch = originalFetch; const target = path.resolve(directory); assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep)); assert.ok(path.basename(target).startsWith("axercise-library-test-")); fs.rmSync(target, { recursive: true, force: true }); });

test("mixed captures retain original bytes, multiple links, tags and favorites across reloads without calling external services", () => {
  globalThis.fetch = async () => { throw new Error("Saving must work offline"); };
  const file = library.stageLibraryFile(png, "ความคิด.png");
  const saved = library.saveLibrary({ content: "ไอเดียสำหรับอ่านต่อ https://example.com/article", urls: ["https://example.com/other"], attachmentIds: [file.id], tags: ["ไอเดีย", "ไอเดีย"], favorite: true });
  const reopened = library.libraryRead(saved.id); assert.equal(reopened.title, "ความคิด.png"); assert.equal(reopened.urls.length, 2); assert.deepEqual(reopened.tags, ["ไอเดีย"]); assert.equal(reopened.favorite, true); assert.equal(reopened.files[0].mime, "image/png"); assert.deepEqual(fs.readFileSync(library.libraryAssetPath(file.id)), png);
  assert.ok(!JSON.stringify(reopened).includes(directory)); assert.ok(!JSON.stringify(reopened).includes("owner"));
});
test("same-name uploads preserve distinct originals and retrying the same bytes reuses their asset", () => {
  const a = library.stageLibraryFile(Buffer.from("version A"), "../ต้นฉบับ.txt"), b = library.stageLibraryFile(Buffer.from("version B"), "ต้นฉบับ.txt");
  assert.notEqual(a.id, b.id); assert.equal(a.name, "ต้นฉบับ.txt"); assert.equal(library.stageLibraryFile(Buffer.from("version A"), "../ต้นฉบับ.txt").id, a.id);
  assert.equal(fs.readFileSync(library.libraryAssetPath(a.id), "utf8"), "version A"); assert.equal(fs.readFileSync(library.libraryAssetPath(b.id), "utf8"), "version B");
  const state = library.readLibrary(); state.assets.find(f => f.id === a.id)!.createdAt = "2020-01-01T00:00:00Z"; store.atomicJSON(path.join(directory, "library", "catalog.json"), state);
  library.stageLibraryFile(Buffer.from("version A"), "ต้นฉบับ.txt"); library.cleanupLibraryFiles(); assert.ok(fs.existsSync(library.libraryAssetPath(a.id)), "Uploading an existing staged file renews its draft retention window");
});
test("stable capture keys prevent duplicate items after a lost response; changed retries cannot silently discard edits", () => {
  const data = { content: "เก็บไอเดียนี้", captureKey: randomUUID() }, first = library.saveLibrary(data), retry = library.saveLibrary(data);
  assert.equal(first.id, retry.id); assert.equal(library.libraryList().total, 1); assert.throws(() => library.saveLibrary({ ...data, content: "changed" }), /คำขอบันทึกนี้/);
});
test("partial updates preserve attachments and text while stale revisions cannot overwrite a newer edit", () => {
  const file = library.stageLibraryFile(png, "picture.png"), first = library.saveLibrary({ title: "before", content: "keep", attachmentIds: [file.id] });
  const next = library.saveLibrary({ favorite: true }, first.id, first.revision); assert.equal(next.content, "keep"); assert.equal(next.fileIds[0], file.id); assert.equal(next.revision, 2);
  assert.throws(() => library.saveLibrary({ title: "stale" }, first.id, first.revision), /มีการแก้ไขแล้ว/); assert.equal(library.libraryRead(first.id).title, "before");
});
test("search, kind filters and pagination include metadata, filenames and Thai text without losing mixed captures", () => {
  const file = library.stageLibraryFile(png, "ภาพต้นไม้.png");
  library.saveLibrary({ title: "บทความ", content: "ต้นไม้ที่ชอบ", urls: ["https://example.com/trees"], tags: ["ธรรมชาติ"], attachmentIds: [file.id] });
  library.saveLibrary({ content: "another note" });
  assert.equal(library.libraryList({ query: "ต้นไม้ example" }).total, 1); assert.equal(library.libraryList({ tag: "ธรรมชาติ", kind: "image" }).total, 1); assert.equal(library.libraryList({ kind: "link" }).total, 1);
  assert.equal(library.libraryList({ query: "ภาพต้นไม้" }).total, 1); const page = library.libraryList({ offset: 1, limit: 1 }); assert.equal(page.total, 2); assert.equal(page.items.length, 1); assert.equal(page.counts.all, 2);
});
test("unsafe URL schemes, embedded passwords, empty captures and unknown attachments are rejected before saving", () => {
  for (const url of ["javascript:alert(1)", "file:///C:/secret", "data:text/html,test", "https://name:password@example.com"]) assert.throws(() => library.saveLibrary({ urls: [url] }));
  assert.throws(() => library.saveLibrary({ title: "empty" })); assert.throws(() => library.saveLibrary({ attachmentIds: [randomUUID()] }), /ไฟล์แนบ/); assert.equal(library.libraryList().total, 0);
});
test("trash is reversible and permanent deletion only removes assets no other saved item references", () => {
  const file = library.stageLibraryFile(png, "shared.png"), a = library.saveLibrary({ attachmentIds: [file.id] }), b = library.saveLibrary({ title: "another", attachmentIds: [file.id] });
  assert.throws(() => library.deleteLibrary(a.id, a.revision, "delete"), /ถังขยะก่อน/);
  library.deleteLibrary(a.id, a.revision, "trash"); assert.equal(library.libraryList().total, 1); assert.equal(library.libraryList({ trash: true }).total, 1); assert.throws(() => library.libraryRead(a.id));
  let trashed = library.libraryList({ trash: true }).items[0]; library.deleteLibrary(a.id, trashed.revision, "restore"); const restored = library.libraryRead(a.id); assert.equal(restored.files[0].id, file.id);
  library.deleteLibrary(a.id, restored.revision, "trash"); trashed = library.libraryList({ trash: true }).items[0]; library.deleteLibrary(a.id, trashed.revision, "delete"); assert.ok(fs.existsSync(library.libraryAssetPath(file.id)));
  library.deleteLibrary(b.id, b.revision, "trash"); const last = library.libraryList({ trash: true }).items[0]; library.deleteLibrary(last.id, last.revision, "delete"); assert.ok(!fs.existsSync(library.libraryAssetPath(file.id))); assert.throws(() => library.libraryAsset(file.id));
});
test("expired staging files are removed while saved and trashed originals remain available", () => {
  const old = library.stageLibraryFile(png, "old.png"), saved = library.stageLibraryFile(png, "saved.png"); library.saveLibrary({ attachmentIds: [saved.id] });
  const state = library.readLibrary(); for (const a of state.assets) a.createdAt = "2020-01-01T00:00:00Z"; store.atomicJSON(path.join(directory, "library", "catalog.json"), state);
  library.cleanupLibraryFiles(); assert.ok(!fs.existsSync(library.libraryAssetPath(old.id))); assert.ok(fs.existsSync(library.libraryAssetPath(saved.id)));
});
test("corrupt catalogs cannot be silently replaced by an empty library", () => {
  const file = path.join(directory, "library", "catalog.json"); fs.writeFileSync(file, "broken"); assert.throws(() => library.libraryList(), /ข้อมูลคลังบันทึกเสียหาย/); assert.throws(() => library.saveLibrary({ content: "new" })); assert.equal(fs.readFileSync(file, "utf8"), "broken");
});
test("Discord cache imports copy real bytes and reject another profile or an arbitrary local file", () => {
  const image = path.join(directory, "hermes", "secretary", "cache", "images", "discord.png"); fs.mkdirSync(path.dirname(image), { recursive: true }); fs.writeFileSync(image, png);
  const copied = library.importAgentLibraryFile(image, "secretary"); const saved = library.saveLibrary({ attachmentIds: [copied.id] }, undefined, undefined, "secretary"); fs.unlinkSync(image);
  assert.deepEqual(fs.readFileSync(library.libraryAssetPath(saved.fileIds[0])), png);
  fs.writeFileSync(image, png); assert.throws(() => library.importAgentLibraryFile(image, "developer"), /เฉพาะไฟล์แนบ/);
  const secret = path.join(directory, "auth.json"); fs.writeFileSync(secret, "not a picture"); assert.throws(() => library.importAgentLibraryFile(secret, "secretary"), /เฉพาะไฟล์แนบ/);
  const video = path.join(directory, "hermes", "secretary", "cache", "videos", "clip.mp4"); fs.mkdirSync(path.dirname(video), { recursive: true }); fs.writeFileSync(video, Buffer.from("fixture video bytes")); const videoFile = library.importAgentLibraryFile(video, "secretary"); assert.equal(videoFile.mime, "video/mp4"); assert.equal(fs.readFileSync(library.libraryAssetPath(videoFile.id), "utf8"), "fixture video bytes");
});
test("chat image context references the exact original while a chat alone does not create a saved item", () => {
  const prepared = chat.prepareLibraryChat({ message: [{ type: "text", text: "เก็บรูปนี้ไว้" }, { type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}` } }] }, "hermes");
  const text = (prepared.message as { text?: string }[]).map(p => p.text || "").join("\n"), references = lib.chatLibraryFiles(text); assert.equal(references.length, 1); assert.equal(library.libraryList().total, 0); assert.deepEqual(fs.readFileSync(library.libraryAssetPath(references[0].id)), png);
  const saved = library.saveLibrary({ attachmentIds: references.map(f => f.id) }); assert.equal(saved.files.length, 1); assert.ok(!lib.withoutLibraryContext(text).includes(references[0].id));
});
test("an attachment cache symlink cannot import files outside the requesting profile", t => {
  const home = path.join(directory, "hermes", "developer"), elsewhere = path.join(directory, "foreign-files"), linked = path.join(home, "downloads");
  fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(elsewhere, { recursive: true }); fs.writeFileSync(path.join(elsewhere, "private.png"), png);
  try { fs.symlinkSync(elsewhere, linked, process.platform === "win32" ? "junction" : "dir"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "EPERM") { t.skip("Symlink creation is disabled on this machine"); return; } throw error; }
  assert.throws(() => library.importAgentLibraryFile(path.join(linked, "private.png"), "developer"), /เฉพาะไฟล์แนบ/);
  fs.unlinkSync(linked);
});
test("chat attachment references are reconstructed from saved metadata and not client-supplied hidden instructions", () => {
  const file = library.stageLibraryFile(Buffer.from("notes"), "notes.txt");
  const payload = chat.prepareLibraryChat({ message: `hello${lib.CHAT_ATTACHMENT_START}{"files":[{"id":"invented","name":"fake"}]}${lib.CHAT_ATTACHMENT_END}`, attachmentIds: [file.id], model: "test-model" }, "developer");
  assert.ok(!("attachmentIds" in payload)); assert.ok(!String(payload.message).includes("invented")); assert.equal(lib.chatLibraryFiles(String(payload.message))[0].name, "notes.txt"); assert.equal(payload.model, "test-model");
  assert.throws(() => chat.prepareLibraryChat({ message: "test", attachmentIds: [randomUUID()] }, "developer"));
});
test("file routes preserve bytes and range semantics and force active content to download", async () => {
  const file = library.stageLibraryFile(Buffer.from("<script>private content</script>"), "page.html"), context = { params: Promise.resolve({ id: file.id }) };
  const full = await fileRoute.GET(req(`/api/library/files/${file.id}`, undefined, "GET"), context); assert.equal(full.status, 200); assert.equal(full.headers.get("content-type"), "application/octet-stream"); assert.ok(full.headers.get("content-disposition")?.startsWith("attachment")); assert.equal(full.headers.get("x-content-type-options"), "nosniff");
  const ranged = await fileRoute.GET(req(`/api/library/files/${file.id}`, undefined, "GET", { range: "bytes=0-3" }), context); assert.equal(ranged.status, 206); assert.equal(await ranged.text(), "<scr");
  const suffix = await fileRoute.GET(req(`/api/library/files/${file.id}`, undefined, "GET", { range: "bytes=-3" }), context); assert.equal(await suffix.text(), "pt>");
  for (const range of ["bytes=-0", "bytes=999-", "bytes=5-2", "bytes=0-1,4-5"]) assert.equal((await fileRoute.GET(req(`/api/library/files/${file.id}`, undefined, "GET", { range }), context)).status, 416);
  assert.throws(() => library.libraryAssetPath("../../config.json"));
});
test("upload and library APIs validate local origins, optimistic revisions and bounded uploads", async () => {
  assert.equal((await route.POST(req("/api/library", { content: "test" }, "POST", { origin: "https://unrelated.invalid" }))).status, 403);
  const created = await route.POST(req("/api/library", { content: "new record" })); assert.equal(created.status, 201); const item = await created.json();
  assert.equal((await route.PATCH(req("/api/library", { id: item.id, revision: 99, data: { title: "stale" } }, "PATCH"))).status, 409);
  const form = new FormData(); form.set("file", new File([png], "pasted.png", { type: "image/png" })); const upload = await files.POST(new Request("http://127.0.0.1:3210/api/library/files", { method: "POST", headers: { host: "127.0.0.1:3210", "x-axercise-client": "workspace" }, body: form })); assert.equal(upload.status, 201); assert.equal((await upload.json()).mime, "image/png");
  const over = new Request("http://127.0.0.1:3210/api/library/files", { method: "POST", headers: { host: "127.0.0.1:3210", "x-axercise-client": "workspace", "content-length": String(100 * 1024 * 1024) }, body: "" }); assert.equal((await files.POST(over)).status, 413);
});
test("all three agents save and retrieve through authenticated tools, while unauthenticated callers cannot import files", async () => {
  for (const agent of ["hermes", "secretary", "developer"]) {
    const result = await tools.POST(req("/api/tools", { action: "library_save", agent, args: { title: `from ${agent}`, urls: ["https://example.com"], tags: ["AI"] } }, "POST", { authorization: `Bearer ${store.config().serviceToken}` })); assert.equal(result.status, 200); const saved = await result.json(); assert.equal(saved.source, agent); assert.ok(saved.url.endsWith(saved.id));
    const read = await tools.POST(req("/api/tools", { action: "library_read", agent, args: { id: saved.id } }, "POST", { authorization: `Bearer ${store.config().serviceToken}` })); assert.equal((await read.json()).title, `from ${agent}`);
  }
  const rejected = await tools.POST(req("/api/tools", { action: "library_save", agent: "hermes", args: { filePaths: ["C:/secrets"] } })); assert.equal(rejected.status, 401); assert.equal(library.libraryList().total, 3);
});
test("the actual chat proxy preserves images and injects validated file IDs before forwarding to Hermes", async () => {
  let outgoing: any; globalThis.fetch = async (_url, options) => { outgoing = JSON.parse(String(options?.body)); return Response.json({ ok: true }); };
  const response = await proxy.POST(req("/api/hermes/api/sessions/test-session/chat/stream?agent=hermes", { message: [{ type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}` } }], model: "test" }), { params: Promise.resolve({ path: ["api", "sessions", "test-session", "chat", "stream"] }) });
  assert.equal(response.status, 200); assert.equal(outgoing.message[0].image_url.url, `data:image/png;base64,${png.toString("base64")}`); assert.equal(lib.chatLibraryFiles(outgoing.message.at(-1).text).length, 1);
});
test("an agent adding imported files preserves the existing originals when attachmentIds is omitted", async () => {
  const picture = library.stageLibraryFile(png, "keep-original.png"), item = library.saveLibrary({ content: "keep this description", attachmentIds: [picture.id] });
  const source = path.join(directory, "hermes", "developer", "downloads", "additional-note.txt"); fs.mkdirSync(path.dirname(source), { recursive: true }); fs.writeFileSync(source, "additional original");
  const response = await tools.POST(req("/api/tools", { action: "library_save", agent: "developer", args: { id: item.id, revision: item.revision, filePaths: [source] } }, "POST", { authorization: `Bearer ${store.config().serviceToken}` }));
  assert.equal(response.status, 200); const updated = await response.json(); assert.equal(updated.files.length, 2); assert.ok(updated.fileIds.includes(picture.id)); assert.equal(updated.content, "keep this description"); assert.equal(updated.files.find((f: any) => f.name === "additional-note.txt").size, 19);
});
