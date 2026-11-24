import { z } from "zod";

const id = z.uuid();
const text = (max = 10000) => z.string().max(max);
export const learningLinkSchema = z.string().trim().min(1, "ใส่ลิงก์ที่ต้องการเก็บ").max(4000).refine(value => {
  if (!/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f\\]/.test(value)) return false;
  try { const url = new URL(value); return !!url.hostname && !url.username && !url.password; } catch { return false; }
}, "ใช้ลิงก์ http:// หรือ https:// ที่ไม่มีชื่อผู้ใช้หรือรหัสผ่านฝังอยู่");
const date = z.union([z.literal(""), z.iso.date(), z.iso.datetime({ offset: true })]);
const base = { id, title: text(300).trim().min(1), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), revision: z.number().int().positive(), archived: z.boolean().default(false) };
export const assignmentStatuses = ["Todo", "Doing", "Completed", "Submitted", "Graded"] as const;
export const assignmentLabels = { Todo: "ยังไม่เริ่ม", Doing: "กำลังทำ", Completed: "ทำเสร็จ · รอส่ง", Submitted: "ส่งแล้ว", Graded: "ได้คะแนน" };
export const categories = ["เอกสารเรียน", "Syllabus", "สไลด์", "เอกสารอ่าน", "โจทย์", "ไฟล์งาน", "เฉลย", "ข้อเสนอแนะ"];
const weight = z.object({ id, name: text(100).trim().min(1), weight: z.number().min(0).max(100) });
const citation = z.object({ documentId: id, versionId: id, page: z.number().int().positive(), title: text(300), label: text(100) });
const version = z.object({ id, name: text(300), extension: text(20), size: z.number().int().nonnegative().max(50 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.iso.datetime(), note: text(2000).default(""), textStatus: z.enum(["pending", "processing", "ready", "scanned", "unsupported", "error"]).default("pending"), pages: z.number().int().nonnegative().default(0), textError: text(500).default("") });
export const learningSchemas = {
  terms: z.object({ ...base, year: text(30).min(1), start: date.default(""), end: date.default("") }),
  courses: z.object({ ...base, termId: id, code: text(100).default(""), credits: z.number().min(0).max(50).default(3), description: text().default(""), teacher: text(300).default(""), email: z.union([z.literal(""), z.email()]).default(""), contact: text(2000).default(""), officeHours: text(2000).default(""), schedule: text(4000).default(""), room: text(1000).default(""), weights: z.array(weight).max(30).default([]), target: z.number().min(0).max(100).nullable().default(null), gradeRules: text(4000).default("") }),
  documents: z.object({ ...base, deletedAt: z.iso.datetime().nullable().default(null), filesDeletedAt: z.iso.datetime().nullable().default(null), notionDeletedAt: z.iso.datetime().nullable().default(null), courseId: id, assignmentId: id.nullable().default(null), category: text(100).default("เอกสารเรียน"), chapter: text(300).default(""), tags: z.array(text(80)).max(30).default([]), note: text().default(""), pinned: z.boolean().default(false), lastPage: z.number().int().min(1).max(10000).default(1), bookmarks: z.array(z.number().int().min(1).max(10000)).max(1000).default([]), reading: z.record(id, z.object({ lastPage: z.number().int().min(1).max(10000), bookmarks: z.array(z.number().int().min(1).max(10000)).max(1000) })).default({}), versions: z.array(version).max(200).default([]), selectedVersionId: id.nullable().default(null), url: learningLinkSchema.optional() }).refine(d => !d.url || d.versions.length === 0, "ลิงก์และไฟล์ต้นฉบับต้องเก็บเป็นคนละรายการ"),
  assignments: z.object({ ...base, courseId: id, purpose: z.enum(["homework", "study"]).default("homework"), taskRequested: z.boolean().default(false), taskImportant: z.boolean().default(true), taskUrgent: z.boolean().default(false), details: text(20000).default(""), rubric: text(20000).default(""), deadline: date.default(""), status: z.enum(assignmentStatuses).default("Todo"), submissionUrl: text(1000).default(""), submittedAt: date.default(""), submittedVersionId: id.nullable().default(null), checklist: z.array(z.object({ id, text: text(1000).min(1), done: z.boolean() })).max(100).default([]), feedback: text().default(""), history: z.array(z.object({ at: z.iso.datetime(), status: z.enum(assignmentStatuses), note: text(1000) })).max(1000).default([]), taskId: z.string().max(200).nullable().default(null), taskBase: z.string().max(100).default(""), taskSync: z.enum(["unlinked", "pending", "synced", "conflict", "missing"]).default("unlinked") }),
  assessments: z.object({ ...base, courseId: id, assignmentId: id.nullable().default(null), kind: z.enum(["homework", "quiz", "attendance", "midterm", "final", "other"]).default("homework"), date: date.default(""), end: date.default(""), location: text(2000).default(""), scope: text().default(""), groupId: id.nullable().default(null), itemWeight: z.number().min(.0001).max(10000).default(1), maxScore: z.number().positive().max(100000).default(100), score: z.number().min(0).max(100000).nullable().default(null), feedback: text().default(""), calendarId: z.string().max(200).nullable().default(null) }).refine(a => a.score === null || a.score <= a.maxScore, "คะแนนที่ได้ต้องไม่เกินคะแนนเต็ม").refine(a => !a.end || (!!a.date && Date.parse(a.end) > Date.parse(a.date)), "เวลาสิ้นสุดต้องหลังเวลาเริ่ม"),
  notes: z.object({ ...base, courseId: id, content: text(60000).default(""), documentId: id.nullable().default(null), versionId: id.nullable().default(null), page: z.number().int().positive().nullable().default(null), sources: z.array(citation).max(30).default([]) }),
  sets: z.object({ ...base, courseId: id, chapter: text(300).default(""), tags: z.array(text(80)).max(30).default([]), mode: z.enum(["quiz", "cards"]).default("cards"), sourceVersionIds: z.array(id).max(30).default([]), sources: z.array(citation).max(30).default([]), cards: z.array(z.object({ id, question: text(3000).min(1), answer: text(6000).min(1), source: text(1000).default(""), reviews: z.number().int().nonnegative().default(0), interval: z.number().min(0).max(3650).default(0), due: z.iso.datetime().nullable().default(null), lastResult: z.enum(["again", "hard", "good", "easy"]).nullable().default(null), history: z.array(z.object({ at: z.iso.datetime(), result: z.enum(["again", "hard", "good", "easy"]), answer: text(6000) })).max(200).default([]) })).max(200).default([]) }),
  focus: z.object({ ...base, courseId: id, assignmentId: id.nullable().default(null), duration: z.number().int().min(60).max(14400).default(1500), breakMinutes: z.number().int().min(0).max(120).default(5), startedAt: z.iso.datetime(), pausedAt: z.iso.datetime().nullable().default(null), pausedMs: z.number().nonnegative().default(0), endedAt: z.iso.datetime().nullable().default(null), note: text(4000).default("") }),
  plans: z.object({ ...base, history: z.array(z.object({ at: z.iso.datetime(), revision: z.number().int().positive(), note: text(2000) })).max(20).default([]), courseId: id, assessmentId: id.nullable().default(null), content: text(60000).default(""), blocks: z.array(z.object({ id, title: text(300).min(1), start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }), assignmentId: id.nullable().default(null), taskId: z.string().max(200).nullable().default(null), calendarId: z.string().max(200).nullable().default(null), done: z.boolean().default(false) }).refine(b => Date.parse(b.end) > Date.parse(b.start), "เวลาอ่านสิ้นสุดต้องหลังเวลาเริ่ม")).max(200).default([]) }),
};
export const kinds = Object.keys(learningSchemas) as LearningKind[];
export type LearningKind = keyof typeof learningSchemas;
export type LearningRecords = { [K in LearningKind]: z.infer<(typeof learningSchemas)[K]> };
export type LearningRecord = LearningRecords[LearningKind];
export type Course = LearningRecords["courses"];
export type Assignment = LearningRecords["assignments"];
export type LearningDocument = LearningRecords["documents"];
export type FileVersion = z.infer<typeof version>;
export type Assessment = LearningRecords["assessments"];
export type StudySet = LearningRecords["sets"];
export type FocusSession = LearningRecords["focus"];
export function assignmentPending(a: Assignment) { return !a.archived && !(a.purpose === "study" ? ["Completed", "Submitted", "Graded"] : ["Submitted", "Graded"]).includes(a.status); }
export function assignmentStatusLabel(a: Assignment) { return a.purpose === "study" && a.status === "Completed" ? "อ่านเสร็จแล้ว" : assignmentLabels[a.status]; }
export type SyncInfo = { pageId: string; baseHash: string; conflict?: boolean; error?: string };
export type LearningState = { version: 1; revision: number; updatedAt: string; sync: { lastAt: string | null; items: Record<string, SyncInfo>; error: string }; records: { [K in LearningKind]: LearningRecords[K][] } };

export function gradeSummary(course: Course, assessments: Assessment[]) {
  const rows = assessments.filter(a => a.courseId === course.id && !a.archived);
  let earned = 0, assessedWeight = 0;
  const groups = course.weights.map(group => {
    const items = rows.filter(a => a.groupId === group.id), total = items.reduce((n, a) => n + a.itemWeight, 0);
    let points = 0, known = 0;
    for (const a of items) if (a.score !== null && total) { const w = group.weight * a.itemWeight / total; known += w; points += a.score / a.maxScore * w; }
    earned += points; assessedWeight += known;
    return { ...group, count: items.length, earned: points, assessedWeight: known };
  });
  const totalWeight = course.weights.reduce((n, g) => n + g.weight, 0), remaining = Math.max(0, totalWeight - assessedWeight);
  return { earned, assessedWeight, totalWeight, remaining, groups, ungrouped: rows.filter(a => !a.groupId || !course.weights.some(g => g.id === a.groupId)).length, requiredAverage: course.target !== null && remaining > 0 ? Math.max(0, (course.target - earned) / remaining * 100) : null };
}

export function focusElapsed(session: FocusSession, now = Date.now()) {
  return Math.max(0, Math.floor(((session.endedAt ? Date.parse(session.endedAt) : session.pausedAt ? Date.parse(session.pausedAt) : now) - Date.parse(session.startedAt) - session.pausedMs) / 1000));
}
export function reviewCard(card: StudySet["cards"][number], result: "again" | "hard" | "good" | "easy", now = Date.now(), answer = "") {
  const interval = result === "again" ? 0 : result === "hard" ? Math.max(1, card.interval * 1.2) : result === "good" ? (card.interval ? card.interval * 2.5 : 1) : (card.interval ? card.interval * 3.5 : 4);
  return { ...card, reviews: card.reviews + 1, lastResult: result, interval: Math.min(3650, interval), due: new Date(now + (result === "again" ? 10 * 60000 : Math.min(3650, interval) * 86400000)).toISOString(), history: [...card.history, { at: new Date(now).toISOString(), result, answer: answer.slice(0, 6000) }].slice(-200) };
}
