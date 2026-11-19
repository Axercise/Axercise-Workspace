export type AgentId = "hermes" | "secretary" | "developer";
export type Agent = { id: AgentId; name: string; role: string; description: string; port: number };
export const AGENTS: Agent[] = [
  { id: "hermes", name: "Hermes", role: "ผู้ช่วยหลัก", description: "คิด วางแผน และประสานงานกับผู้ช่วยของคุณ", port: 18642 },
  { id: "secretary", name: "Secretary", role: "เลขาส่วนตัว", description: "จัดตาราง งาน และไอเดียให้เป็นระเบียบ", port: 18643 },
  { id: "developer", name: "Developer", role: "ผู้ช่วยเขียนโค้ด", description: "พัฒนา ตรวจสอบ และแก้ไขโปรเจกต์บนเครื่อง", port: 18644 },
];
export type Task = { id: string; title: string; details: string; deadline: string; important: boolean; urgent: boolean; status: "Todo" | "Doing" | "Done"; calendar?: import("./task-calendar").TaskCalendarInfo; learning?: { assignmentId: string; courseId: string; courseTitle: string; courseCode: string; statusLabel: string }; url?: string };
export type Note = { id: string; title: string; content: string; tags: string[]; createdAt: string; url?: string };
export type CalendarEvent = { id: string; title: string; description: string; start: string; end: string; allDay: boolean; location: string; url?: string; task?: import("./task-calendar").CalendarTaskOrigin };
export type Session = { id: string; title?: string; source?: string; message_count?: number; last_active?: string | number; started_at?: string | number };
export type Message = { id?: string; role: string; content: string | Array<Record<string, unknown>>; tool_name?: string };
export type ConnectionState = { configured: boolean; ready?: boolean; message?: string };
export type PublicSettings = {
  timezone: string; defaultProvider: string; defaultModel: string; openrouterConfigured: boolean;
  notion: { configured: boolean; parentPageId: string; tasksReady: boolean; notesReady: boolean };
  google: { configured: boolean; connected: boolean; clientId: string; calendarId: string };
  discord: { agent: AgentId; tokenConfigured: boolean; allowedUserId: string; channelId: string; reminderMinutes: number }[];
};
export type ModelOption = { id: string; provider: string; label: string; vision?: boolean };
export type Draft = { id: string; kind: "task" | "note"; title: string; content: string; savedAt: string; deadline?: string; important?: boolean; urgent?: boolean; calendarEnabled?: boolean };
