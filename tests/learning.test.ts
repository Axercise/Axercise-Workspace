import test, { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axercise-learning-test-"));
process.env.AXERCISE_DATA_DIR = directory;
const store = await import("../src/server/learning-store.ts");
const { atomicJSON, updateConfig, config } = await import("../src/server/store.ts");
const { saveFile, extractFile } = await import("../src/server/learning-files.ts");
const backup = await import("../src/server/learning-backup.ts");
const { gradeSummary, focusElapsed, reviewCard, learningSchemas } = await import("../src/lib/learning.ts");
const { syncLearning } = await import("../src/server/learning-notion.ts");
const { syncAssignmentTask, mergeLinkedTasks, planToAssignments } = await import("../src/server/learning-integrations.ts");
const { saveLinkedEvent } = await import("../src/server/calendar.ts");
const { deleteDocument, documentDeletionDetails, cleanupDeletedDocuments } = await import("../src/server/learning-delete.ts");
const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = originalFetch; atomicJSON(path.join(store.LEARNING, "catalog.json"), store.emptyLearning()); updateConfig(c => { c.notion.token = "TEST_SECRET_NOT_FOR_BACKUP"; c.notion.tasksId = randomUUID(); c.notion.learningId = randomUUID(); }); });
after(() => { globalThis.fetch = originalFetch; const target = path.resolve(directory); assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep)); assert.ok(path.basename(target).startsWith("axercise-learning-test-")); fs.rmSync(target, { recursive: true, force: true }); });
function course() { const term = store.saveLearningRecord("terms", { title: "เทอม 1", year: "2569" }); return store.saveLearningRecord("courses", { title: "วิชาทดสอบภาษาไทย", termId: term.id, code: "TEST101" }); }
async function upload(courseId: string, name: string, text: string, documentId?: string, assignmentId?: string) { const form = new FormData(); form.set("courseId", courseId); form.set("file", new File([text], name)); if (documentId) form.set("documentId", documentId); if (assignmentId) form.set("assignmentId", assignmentId); const doc = await saveFile(form); await extractFile(doc.versions.at(-1)!.id).catch(() => {}); return store.record(store.readLearning(), "documents", doc.id); }

test("terms and courses persist independently across semesters and archive keeps relationships", () => {
  const c = course(), another = store.saveLearningRecord("terms", { title: "เทอม 2", year: "2570" });
  const repeated = store.saveLearningRecord("courses", { title: c.title, code: c.code, termId: another.id });
  const term = store.record(store.readLearning(), "terms", c.termId);
  store.saveLearningRecord("terms", { ...term, archived: true }, term.id, term.revision);
  const state = store.readLearning(); assert.equal(state.records.courses.length, 2); assert.notEqual(c.id, repeated.id); assert.equal(store.record(state, "courses", c.id).termId, c.termId); assert.equal(store.record(state, "terms", c.termId).archived, true);
});
test("optimistic revision rejects stale edits without losing the accepted record", () => {
  const c = course(); store.saveLearningRecord("courses", { ...c, title: "แก้ครั้งแรก" }, c.id, c.revision);
  assert.throws(() => store.saveLearningRecord("courses", { ...c, title: "ทับข้อมูลเก่า" }, c.id, c.revision));
  assert.equal(store.record(store.readLearning(), "courses", c.id).title, "แก้ครั้งแรก");
});
test("same-name uploads preserve all bytes, and a submitted version stays fixed", async () => {
  const c = course(), a = store.saveLearningRecord("assignments", { courseId: c.id, title: "งาน 1" });
  const first = await upload(c.id, "งาน.txt", "ฉบับแรก", undefined, a.id), firstVersion = first.versions[0];
  const submitted = store.saveLearningRecord("assignments", { ...a, status: "Submitted", submittedVersionId: firstVersion.id }, a.id, a.revision);
  const second = await upload(c.id, "งาน.txt", "ฉบับแก้ไข", first.id, a.id);
  assert.equal(second.versions.length, 2); assert.equal(fs.readFileSync(store.fileLocation(firstVersion.id), "utf8"), "ฉบับแรก");
  assert.equal(store.record(store.readLearning(), "assignments", a.id).submittedVersionId, firstVersion.id); assert.ok(submitted.submittedAt);
  const otherCourse = store.saveLearningRecord("courses", { termId: c.termId, title: "อีกวิชา" });
  const other = store.saveLearningRecord("assignments", { courseId: otherCourse.id, title: "อีกงาน" });
  assert.throws(() => store.saveLearningRecord("assignments", { ...other, submittedVersionId: firstVersion.id }, other.id));
});
test("unknown grades remain pending while an entered zero is a real assessed score", () => {
  const c = course(), groupId = randomUUID(), examGroup = randomUUID();
  const weighted = store.saveLearningRecord("courses", { ...c, weights: [{ id: groupId, name: "การบ้าน", weight: 20 }, { id: examGroup, name: "สอบ", weight: 80 }], target: 80 }, c.id);
  store.saveLearningRecord("assessments", { courseId: c.id, title: "การบ้าน 1", groupId, score: 100, maxScore: 100 });
  store.saveLearningRecord("assessments", { courseId: c.id, title: "การบ้าน 2 รอผล", groupId, score: null, maxScore: 100 });
  let summary = gradeSummary(weighted, store.readLearning().records.assessments);
  assert.equal(summary.earned, 10); assert.equal(summary.assessedWeight, 10); assert.equal(summary.remaining, 90);
  store.saveLearningRecord("assessments", { courseId: c.id, title: "สอบได้ศูนย์", groupId: examGroup, score: 0, maxScore: 100 });
  summary = gradeSummary(weighted, store.readLearning().records.assessments); assert.equal(summary.earned, 10); assert.equal(summary.assessedWeight, 90);
});
test("focus timing recovers pauses from timestamps and only one active session is accepted", () => {
  const c = course(), started = Date.parse("2026-11-17T00:00:00Z"), f = store.saveLearningRecord("focus", { title: "อ่าน", courseId: c.id, startedAt: new Date(started).toISOString(), duration: 1500 });
  assert.equal(focusElapsed(f, started + 60000), 60);
  const paused = store.saveLearningRecord("focus", { ...f, pausedAt: new Date(started + 60000).toISOString() }, f.id);
  assert.equal(focusElapsed(paused, started + 600000), 60);
  assert.throws(() => store.saveLearningRecord("focus", { title: "ซ้อน", courseId: c.id, startedAt: new Date().toISOString() }));
  const resumed = store.saveLearningRecord("focus", { ...paused, pausedAt: null, pausedMs: 120000 }, paused.id);
  assert.equal(focusElapsed(resumed, started + 240000), 120);
});
test("review intervals and written answers survive persistence", () => {
  const c = course(), set = store.saveLearningRecord("sets", { title: "ทบทวน", courseId: c.id, cards: [{ id: randomUUID(), question: "คำถาม", answer: "คำตอบ" }] }), now = Date.now();
  const reviewed = reviewCard(set.cards[0], "again", now, "คำตอบของฉัน"), saved = store.saveLearningRecord("sets", { ...set, cards: [reviewed] }, set.id);
  assert.equal(Date.parse(saved.cards[0].due!) - now, 600000); assert.equal(saved.cards[0].history[0].answer, "คำตอบของฉัน");
  const good = reviewCard(saved.cards[0], "good", now); assert.equal(good.interval, 1); assert.equal(good.reviews, 2);
});
test("ZIP round trip restores files and revision checks prevent overwriting changes made after preview", async () => {
  const c = course(), d = await upload(c.id, "ทบทวน.txt", "ข้อมูลที่ต้องเก็บ");
  const zip = backup.exportLearning(), entries = unzipSync(zip);
  assert.equal(strFromU8(entries["catalog.json"]).includes("TEST_SECRET_NOT_FOR_BACKUP"), false);
  const checked = backup.validateBackup(zip); assert.equal(checked.incoming.records.documents[0].id, d.id);
  atomicJSON(path.join(store.LEARNING, "catalog.json"), store.emptyLearning());
  const preview = backup.previewRestore(zip); backup.applyRestore(preview.stageId, "keep");
  assert.equal(store.readLearning().records.courses[0].title, c.title); assert.equal(fs.readFileSync(store.fileLocation(d.versions[0].id), "utf8"), "ข้อมูลที่ต้องเก็บ");
  const stale = backup.previewRestore(zip); store.saveLearningRecord("courses", { ...c, title: "เปลี่ยนหลังดูตัวอย่าง" }, c.id);
  assert.throws(() => backup.applyRestore(stale.stageId, "backup")); assert.equal(store.record(store.readLearning(), "courses", c.id).title, "เปลี่ยนหลังดูตัวอย่าง");
});
test("backup rejects unsafe paths, missing originals, and modified payloads", async () => {
  assert.throws(() => backup.validateBackup(zipSync({ "../../outside.txt": strToU8("x") })));
  const c = course(), d = await upload(c.id, "a.txt", "ต้นฉบับ"), zip = backup.exportLearning(), files = unzipSync(zip);
  files[`files/${d.versions[0].id}`] = strToU8("เปลี่ยนเนื้อหา"); assert.throws(() => backup.validateBackup(zipSync(files)));
  fs.unlinkSync(store.fileLocation(d.versions[0].id)); assert.throws(() => backup.exportLearning());
});
test("Notion synchronization pushes once, pulls changes, and preserves simultaneous edits as a conflict", async () => {
  const c = course(), remote: { id: string; properties: Record<string, unknown> }[] = []; let creates = 0;
  const plain = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).map(([key, value]) => { const v = value as { rich_text?: { text: { content: string } }[]; title?: { text: { content: string } }[] }; return [key, v.rich_text ? { rich_text: v.rich_text.map(t => ({ plain_text: t.text.content })) } : v.title ? { title: v.title.map(t => ({ plain_text: t.text.content })) } : value]; }));
  globalThis.fetch = async (url, init) => { const endpoint = String(url), data = init?.body ? JSON.parse(String(init.body)) : {}; if (endpoint.includes("/query")) { const rows = data.filter ? remote.filter(p => (p.properties.RecordID as { rich_text: { plain_text: string }[] }).rich_text[0].plain_text === data.filter.rich_text.equals) : remote; return Response.json({ results: rows, has_more: false }); } if (endpoint.endsWith("/pages")) { const page = { id: randomUUID(), properties: plain(data.properties) }; remote.push(page); creates++; return Response.json(page); } const p = remote.find(p => endpoint.endsWith(p.id)); if (p) { p.properties = plain(data.properties); return Response.json(p); } throw new Error("Unexpected mocked Notion endpoint"); };
  await syncLearning(); await syncLearning(); assert.equal(creates, 2);
  const p = remote.find(p => (p.properties.RecordID as { rich_text: { plain_text: string }[] }).rich_text[0].plain_text === c.id)!;
  const remoteData = JSON.parse((p.properties.Data as { rich_text: { plain_text: string }[] }).rich_text.map(t => t.plain_text).join("")); remoteData.title = "แก้จาก Notion"; remoteData.revision++;
  p.properties.Data = { rich_text: [{ plain_text: JSON.stringify(remoteData) }] };
  await syncLearning(); assert.equal(store.record(store.readLearning(), "courses", c.id).title, "แก้จาก Notion");
  store.saveLearningRecord("courses", { title: "แก้ในเครื่อง" }, c.id);
  remoteData.title = "แก้จาก Notion อีกครั้ง"; remoteData.revision++; p.properties.Data = { rich_text: [{ plain_text: JSON.stringify(remoteData) }] };
  await syncLearning(); assert.equal(store.readLearning().sync.items[c.id].conflict, true); assert.equal(store.record(store.readLearning(), "courses", c.id).title, "แก้ในเครื่อง");
});
test("linked tasks recover a lost create response without duplication and pull later edits", async () => {
  const c = course(), a = store.saveLearningRecord("assignments", { courseId: c.id, title: "งานเชื่อม", details: "รายละเอียด" });
  let page: Record<string, unknown> | null = null, creates = 0, loseResponse = true;
  const properties = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).map(([key, value]) => { const v = value as { rich_text?: { text: { content: string } }[]; title?: { text: { content: string } }[] }; return [key, v.rich_text ? { rich_text: v.rich_text.map(t => ({ plain_text: t.text.content })) } : v.title ? { title: v.title.map(t => ({ plain_text: t.text.content })) } : value]; }));
  globalThis.fetch = async (url, init) => { const endpoint = String(url), data = init?.body ? JSON.parse(String(init.body)) : {}; if (endpoint.includes("/query")) return Response.json({ results: page ? [page] : [], has_more: false }); if (endpoint.includes("/data_sources/")) return Response.json({}); if (endpoint.endsWith("/pages")) { page = { id: randomUUID(), properties: properties(data.properties) }; creates++; if (loseResponse) { loseResponse = false; throw new Error("Response lost after create"); } return Response.json(page); } if (page) { page.properties = { ...page.properties as object, ...properties(data.properties) }; return Response.json(page); } throw new Error("Unexpected endpoint"); };
  await assert.rejects(syncAssignmentTask(a.id)); await syncAssignmentTask(a.id); assert.equal(creates, 1);
  const synced = store.record(store.readLearning(), "assignments", a.id); assert.equal(synced.taskSync, "synced");
  mergeLinkedTasks([{ id: synced.taskId!, title: "แก้จาก Tasks", details: synced.details, deadline: "", status: "Done", important: true, urgent: false }]);
  const changed = store.record(store.readLearning(), "assignments", a.id); assert.equal(changed.title, "แก้จาก Tasks"); assert.equal(changed.status, "Completed"); assert.equal(changed.submittedAt, "");
});
test("study plan conversion is idempotent and Google event IDs prevent duplicate insertion", async () => {
  const c = course(), blockId = randomUUID(), plan = store.saveLearningRecord("plans", { title: "อ่านสอบ", courseId: c.id, blocks: [{ id: blockId, title: "บทที่ 1", start: "2027-01-01T09:00:00+07:00", end: "2027-01-01T10:00:00+07:00" }] });
  assert.equal(planToAssignments(plan.id).added, 1); assert.equal(planToAssignments(plan.id).added, 0); assert.equal(store.readLearning().records.assignments.length, 1);
  updateConfig(v => { v.google.refreshToken = "TEST"; v.google.accessToken = "TEST"; v.google.expiresAt = Date.now() + 3600000; });
  let event: Record<string, unknown> | null = null, creates = 0;
  globalThis.fetch = async (_url, init) => { const data = init?.body ? JSON.parse(String(init.body)) : {}; if (init?.method === "POST") { if (event) return Response.json({}, { status: 409 }); event = data; creates++; return Response.json(event); } if (init?.method === "PATCH") { event = { ...event, ...data }; return Response.json(event); } return Response.json(event); };
  const data = { title: "อ่านบท 1", start: "2027-01-01T09:00:00+07:00", end: "2027-01-01T10:00:00+07:00" };
  await saveLinkedEvent(data, blockId); await saveLinkedEvent(data, blockId); assert.equal(creates, 1);
});
test("reading positions belong to each file version and invalid citations cannot enter the catalog", async () => {
  const c = course(), first = await upload(c.id, "บทเรียน.txt", "บทที่หนึ่ง");
  store.saveLearningRecord("documents", { reading: { [first.versions[0].id]: { lastPage: 1, bookmarks: [1] } } }, first.id);
  const next = await upload(c.id, "บทเรียน.txt", "ปรับปรุง", first.id);
  assert.deepEqual(next.reading[first.versions[0].id].bookmarks, [1]);
  assert.equal(next.reading[next.versions[1].id]?.bookmarks.length || 0, 0);
  assert.throws(() => store.saveLearningRecord("documents", { reading: { [randomUUID()]: { lastPage: 1, bookmarks: [] } } }, first.id));
  assert.throws(() => store.saveLearningRecord("sets", { courseId: c.id, title: "แหล่งหาย", sourceVersionIds: [randomUUID()] }));
  const damaged = store.readLearning(); damaged.sync.items[c.id] = { pageId: "bad", baseHash: "" }; assert.throws(() => store.validateLearning(damaged));
});
test("academic reminders retain unsubmitted homework, finish study tasks and deduplicate linked services", async () => {
  const { learningReminders } = await import("../src/server/learning-reminders.ts");
  const { assignmentPending } = await import("../src/lib/learning.ts");
  const c = course(), now = Date.now(), date = new Date(now + 600000).toISOString();
  const homework = store.saveLearningRecord("assignments", { courseId: c.id, title: "เสร็จแต่ยังไม่ส่ง", status: "Completed", deadline: date });
  const study = store.saveLearningRecord("assignments", { courseId: c.id, title: "อ่านเสร็จ", purpose: "study", status: "Completed", deadline: date });
  assert.equal(assignmentPending(homework), true); assert.equal(assignmentPending(study), false);
  store.changeLearning(s => { store.record(s, "assignments", homework.id).taskId = "remote-task"; });
  const exam = store.saveLearningRecord("assessments", { courseId: c.id, title: "สอบ", date });
  store.changeLearning(s => { store.record(s, "assessments", exam.id).calendarId = "remote-event"; });
  const list = learningReminders(store.readLearning(), now, now + 3600000);
  assert.equal(list.length, 2); assert.ok(list.some(r => r.key === `task:remote-task:${Date.parse(date)}` && r.text.includes("อย่าลืมส่ง")));
  assert.ok(list.some(r => r.key === `event:remote-event:${Date.parse(date)}`));
  store.saveLearningRecord("courses", { archived: true }, c.id);
  assert.equal(learningReminders(store.readLearning(), now, now + 3600000).length, 0); void exam;
});
test("study plan revisions retain change history and protect integration links", () => {
  const c = course(), block = { id: randomUUID(), title: "อ่านบท 1", start: "2027-01-01T09:00:00+07:00", end: "2027-01-01T10:00:00+07:00" };
  const plan = store.saveLearningRecord("plans", { title: "แผนสอบ", courseId: c.id, blocks: [block] });
  planToAssignments(plan.id);
  const linked = store.record(store.readLearning(), "plans", plan.id);
  const edited = store.saveLearningRecord("plans", { ...linked, history: [], blocks: [{ ...linked.blocks[0], title: "อ่านบท 1 ฉบับแก้", start: "2027-01-01T08:00:00+07:00", assignmentId: randomUUID() }] }, plan.id, linked.revision);
  assert.equal(edited.blocks[0].assignmentId, linked.blocks[0].assignmentId); assert.equal(edited.history.length, 1); assert.ok(edited.history[0].note.includes("09:00"));
  const again = store.saveLearningRecord("plans", { ...edited, history: [] }, plan.id, edited.revision); assert.equal(again.history.length, 1);
});
test("opening a missing or corrupted original gives a recovery error and retains academic metadata", async () => {
  const { checkFile } = await import("../src/server/learning-files.ts");
  const c = course(), d = await upload(c.id, "ต้นฉบับ.txt", "เนื้อหาที่เก็บไว้"), id = d.versions[0].id;
  assert.equal(checkFile(id).ok, true); const zip = backup.exportLearning(); fs.writeFileSync(store.fileLocation(id), "เสียหาย"); assert.throws(() => checkFile(id), /ชุดสำรอง/);
  const repair = backup.previewRestore(zip); assert.equal(repair.repairs[0].reason, "corrupt"); backup.applyRestore(repair.stageId, "keep"); assert.equal(checkFile(id).ok, true);
  const originals = fs.readdirSync(path.join(store.LEARNING, "recovered-originals")); assert.equal(originals.length, 1); assert.equal(fs.readFileSync(path.join(store.LEARNING, "recovered-originals", originals[0]), "utf8"), "เสียหาย");
  fs.unlinkSync(store.fileLocation(id)); assert.throws(() => checkFile(id), /ชุดสำรอง/); assert.equal(store.record(store.readLearning(), "documents", d.id).versions[0].id, id);
  const missing = backup.previewRestore(zip); assert.equal(missing.repairs[0].reason, "missing"); backup.applyRestore(missing.stageId, "keep"); assert.equal(checkFile(id).ok, true);
});
test("document deletion removes every file version, retains citations and restores only when explicitly chosen", async () => {
  const c = course(), a = store.saveLearningRecord("assignments", { courseId: c.id, title: "ส่งงาน" });
  const first = await upload(c.id, "เอกสาร.txt", "ฉบับแรก", undefined, a.id), doc = await upload(c.id, "เอกสาร.txt", "ฉบับสอง", first.id, a.id);
  const other = await upload(c.id, "อีกไฟล์.txt", "เก็บไฟล์อื่นไว้");
  store.saveLearningRecord("assignments", { submittedVersionId: first.versions[0].id, status: "Submitted" }, a.id);
  const citation = { documentId: doc.id, versionId: doc.versions[0].id, page: 1, title: doc.title, label: "หน้า 1" };
  const note = store.saveLearningRecord("notes", { title: "โน้ต", courseId: c.id, documentId: doc.id, versionId: doc.versions[0].id, sources: [citation], content: "สิ่งที่เรียน [S1]" });
  const set = store.saveLearningRecord("sets", { title: "ทบทวน", courseId: c.id, sources: [citation], sourceVersionIds: [citation.versionId] });
  const zip = backup.exportLearning(), latest = store.record(store.readLearning(), "documents", doc.id), impact = documentDeletionDetails(doc.id);
  assert.equal(impact.notes, 1); assert.equal(impact.sets, 1); assert.equal(impact.submissions.length, 1);
  assert.throws(() => deleteDocument(doc.id, latest.revision - 1)); assert.ok(fs.existsSync(store.fileLocation(doc.versions[0].id)));
  assert.equal(deleteDocument(doc.id, latest.revision).cleanupPending, false);
  for (const v of doc.versions) { assert.equal(fs.existsSync(store.fileLocation(v.id)), false); assert.equal(fs.existsSync(store.fileLocation(v.id, true)), false); assert.throws(() => store.findVersion(v.id)); }
  assert.equal(fs.readFileSync(store.fileLocation(other.versions[0].id), "utf8"), "เก็บไฟล์อื่นไว้");
  assert.equal(store.record(store.readLearning(), "notes", note.id).content, "สิ่งที่เรียน [S1]"); assert.equal(store.record(store.readLearning(), "sets", set.id).sources[0].versionId, citation.versionId);
  assert.throws(() => store.saveLearningRecord("documents", { archived: false, deletedAt: null }, doc.id));
  assert.doesNotThrow(() => backup.validateBackup(backup.exportLearning()));
  const keep = backup.previewRestore(zip); backup.applyRestore(keep.stageId, "keep"); assert.throws(() => store.findVersion(citation.versionId));
  const restore = backup.previewRestore(zip); backup.applyRestore(restore.stageId, "backup"); assert.equal(store.findVersion(citation.versionId).document.deletedAt, null); assert.equal(fs.readFileSync(store.fileLocation(citation.versionId), "utf8"), "ฉบับแรก");
});
test("deleted documents cannot return from stale Notion rows and sync archives their metadata", async () => {
  const c = course(), doc = await upload(c.id, "ลบทดสอบ.txt", "ข้อมูล"), state = store.readLearning();
  const pages = new Map<string, { id: string; properties: Record<string, unknown> }>();
  for (const kind of ["terms", "courses", "documents"] as const) for (const item of state.records[kind]) { const page = { id: randomUUID(), properties: { RecordID: { rich_text: [{ plain_text: item.id }] }, Kind: { select: { name: kind } }, Data: { rich_text: [{ plain_text: JSON.stringify(item) }] } } }; pages.set(item.id, page); store.changeLearning(s => { s.sync.items[item.id] = { pageId: page.id, baseHash: store.hash(item) }; }); }
  const stale = pages.get(doc.id)!; let archived = 0;
  globalThis.fetch = async (url, init) => { const p = String(url), data = init?.body ? JSON.parse(String(init.body)) : {}; if (p.endsWith("/query")) return Response.json({ results: [...pages.values()], has_more: false }); if (p.endsWith(stale.id) && data.in_trash) { pages.delete(doc.id); archived++; return Response.json({ id: stale.id }); } throw Error("Unexpected Notion write"); };
  deleteDocument(doc.id, doc.revision); await syncLearning(); assert.equal(archived, 1); assert.ok(store.record(store.readLearning(), "documents", doc.id).notionDeletedAt); assert.throws(() => store.findVersion(doc.versions[0].id));
  pages.set(doc.id, stale); await syncLearning(); assert.equal(archived, 2); assert.ok(store.record(store.readLearning(), "documents", doc.id).deletedAt); assert.equal(pages.has(doc.id), false);
});
test("locked deleted files remain inaccessible and their removal retries after the lock clears", async () => {
  const c = course(), doc = await upload(c.id, "ไฟล์ล็อก.txt", "ข้อมูล"), target = store.fileLocation(doc.versions[0].id), original = fs.unlinkSync;
  try { fs.unlinkSync = ((file: fs.PathLike) => { if (String(file) === target) throw Object.assign(new Error("locked"), { code: "EBUSY" }); return original(file); }) as typeof fs.unlinkSync;
    assert.equal(deleteDocument(doc.id, doc.revision).cleanupPending, true); assert.ok(fs.existsSync(target)); assert.throws(() => store.findVersion(doc.versions[0].id));
  } finally { fs.unlinkSync = original; }
  cleanupDeletedDocuments(); assert.equal(fs.existsSync(target), false); assert.ok(store.record(store.readLearning(), "documents", doc.id).filesDeletedAt);
});
function mockTaskDatabase() {
  const pages = new Map<string, { id: string; parent: { data_source_id: string }; properties: Record<string, any> }>(); let creates = 0;
  const props = (input: Record<string, any>) => Object.fromEntries(Object.entries(input).map(([key, v]) => [key, v.rich_text ? { rich_text: v.rich_text.map((t: any) => ({ plain_text: t.text.content })) } : v.title ? { title: v.title.map((t: any) => ({ plain_text: t.text.content })) } : v]));
  globalThis.fetch = async (url, init) => { const endpoint = String(url), data = init?.body ? JSON.parse(String(init.body)) : {};
    if (endpoint.endsWith("/query")) { const learningId = data.filter?.rich_text?.equals; return Response.json({ results: [...pages.values()].filter(p => !learningId || p.properties.LearningID.rich_text[0].plain_text === learningId), has_more: false }); }
    if (endpoint.includes("/data_sources/")) return Response.json({});
    if (endpoint.endsWith("/pages")) { const p = { id: randomUUID(), parent: { data_source_id: config().notion.tasksId }, properties: props(data.properties) }; pages.set(p.id, p); creates++; return Response.json(p); }
    const id = endpoint.split("/").at(-1)!, p = pages.get(id); if (!p) throw Error("Unknown task");
    if (init?.method === "PATCH") p.properties = { ...p.properties, ...props(data.properties || {}) }; return Response.json(p);
  };
  return { pages, creates: () => creates };
}
test("homework selects all four Eisenhower quadrants and updates one linked task", async () => {
  const db = mockTaskDatabase(), c = course(), a = store.saveLearningRecord("assignments", { title: "จัดช่องงาน", courseId: c.id });
  for (let i = 0; i < 4; i++) { const result = await syncAssignmentTask(a.id, undefined, i), page = db.pages.get(result.assignment.taskId!)!;
    assert.equal(page.properties.Important.checkbox, i < 2); assert.equal(page.properties.Urgent.checkbox, i === 0 || i === 2);
    assert.equal(result.assignment.taskImportant, i < 2); assert.equal(result.assignment.taskUrgent, i === 0 || i === 2);
  }
  assert.equal(db.creates(), 1);
});
test("editing a linked To-do task updates course priority/status and returns the course link", async () => {
  const { listTasks, saveTask } = await import("../src/server/notion.ts");
  const db = mockTaskDatabase(), c = course(), a = store.saveLearningRecord("assignments", { title: "งานสองทาง", courseId: c.id, deadline: "2026-12-01T09:30:00+07:00" });
  const linked = await syncAssignmentTask(a.id, undefined, 1), task = (await listTasks())[0]; assert.equal(task.learning?.assignmentId, a.id); assert.equal(task.learning?.courseId, c.id);
  const saved = await saveTask({ ...task, important: false, urgent: true, status: "Done" }, linked.assignment.taskId!);
  const changed = store.record(store.readLearning(), "assignments", a.id); assert.equal(changed.taskImportant, false); assert.equal(changed.taskUrgent, true); assert.equal(changed.status, "Completed"); assert.equal(changed.submittedAt, ""); assert.equal(changed.deadline, a.deadline); assert.equal(saved.learning?.statusLabel, "ทำเสร็จ · รอส่ง"); assert.equal(db.creates(), 1);
});
test("existing task fingerprints migrate before a user changes the selected quadrant", async () => {
  const db = mockTaskDatabase(), c = course(), a = store.saveLearningRecord("assignments", { title: "งานเดิม", courseId: c.id }); await syncAssignmentTask(a.id);
  store.changeLearning(s => { const v = store.record(s, "assignments", a.id); v.taskBase = store.hash({ title: v.title, details: v.details, deadline: v.deadline, status: "Todo" }); });
  const result = await syncAssignmentTask(a.id, undefined, 3); assert.equal(result.assignment.taskImportant, false); assert.equal(result.assignment.taskUrgent, false); assert.equal(result.assignment.taskSync, "synced"); assert.equal(db.creates(), 1);
});
test("homework To-do linking is optional and an explicit request persists for retry", () => {
  const c = course(), a = store.saveLearningRecord("assignments", { title: "เก็บวิชาอย่างเดียว", courseId: c.id, taskImportant: false, taskUrgent: true }); assert.equal(a.taskSync, "unlinked");
  const requested = store.saveLearningRecord("assignments", { taskRequested: true }, a.id); assert.equal(requested.taskSync, "pending"); assert.equal(requested.taskImportant, false); assert.equal(requested.taskUrgent, true);
});
test("concurrent quadrant changes wait for the current sync and keep a single task", async () => {
  const db = mockTaskDatabase(), c = course(), a = store.saveLearningRecord("assignments", { title: "เปลี่ยนช่องต่อเนื่อง", courseId: c.id });
  await Promise.all([syncAssignmentTask(a.id, undefined, 1), syncAssignmentTask(a.id, undefined, 2)]);
  const item = store.record(store.readLearning(), "assignments", a.id); assert.equal(item.taskImportant, false); assert.equal(item.taskUrgent, true); assert.equal(db.creates(), 1);
});
