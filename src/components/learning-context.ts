import type { Course, LearningKind, LearningRecord, LearningState } from "@/lib/learning";
export type UploadSelection = { courseId: string; documentId?: string; assignmentId?: string; category?: string; versionNote?: string };
export type LearningActions = {
  state: LearningState; course: Course;
  edit: (kind: LearningKind, data: Record<string, unknown>, fresh?: boolean) => void;
  save: (kind: LearningKind, data: Record<string, unknown>, previous?: LearningRecord) => Promise<LearningRecord>;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  integrate: (input: Record<string, unknown>) => Promise<void>;
  openAssignment: (id: string) => void;
  openDocument: (id: string, versionId?: string, page?: number) => void;
  upload: (selection: UploadSelection) => void;
};
export function dateLabel(value: string, time = true) { if (!value) return "ยังไม่กำหนด"; return new Date(value.length === 10 ? `${value}T12:00:00+07:00` : value).toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", ...(time && value.includes("T") ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "Asia/Bangkok" }); }
export function fileSize(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`; }
export const textStatus: Record<string, string> = { pending: "รออ่านเอกสาร", processing: "กำลังอ่านเอกสาร", ready: "ค้นหาเนื้อหาได้", scanned: "มีหน้าสแกน · ใช้ AI อ่านภาพได้", unsupported: "เก็บไฟล์แล้ว · เปิดด้วยโปรแกรมภายนอก", error: "อ่านเนื้อหาไม่สำเร็จ" };
