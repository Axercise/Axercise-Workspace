export const BRIEFING_PERIODS = ["morning", "evening"] as const;
export type BriefingPeriod = typeof BRIEFING_PERIODS[number];
export const briefingLabels = { morning: "สรุปตอนเช้า", evening: "สรุปก่อนนอน" };
export type BriefingSource = { name: "tasks" | "calendar" | "learning"; status: "fresh" | "cached" | "unavailable" | "unconfigured"; at?: number; message?: string };
export type BriefingRow = { key: string; title: string; detail: string; href: string; source: "task" | "calendar" | "learning"; dueAt?: number; endAt?: number; allDay?: boolean; score?: number; reason?: string; observed?: boolean };
export type BriefingData = {
  day: string; targetDay: string; period: BriefingPeriod; generatedAt: number; sources: BriefingSource[];
  agenda: BriefingRow[]; work: BriefingRow[]; priorities: BriefingRow[]; awaitingSubmission: BriefingRow[]; completed: BriefingRow[]; exams: BriefingRow[]; reviews: BriefingRow[];
  counts: { agenda: number; work: number; overdue: number; dueToday: number; completed: number; awaitingSubmission: number; exams: number; reviews: number };
  trackingSince?: number;
};
export type BriefingDelivery = { state: "off" | "pending" | "sent" | "expired"; attemptedAt?: number; leaseUntil?: number; sentAt?: number; error?: string; messageId?: string };
export type BriefingRecord = { id: string; data: BriefingData; origin: "manual" | "schedule" | "agent"; readAt?: number; expiresAt: number; desktop: BriefingDelivery; discord: BriefingDelivery; discordNonce?: string };
export type BriefingSettings = { enabled: boolean; morning: boolean; evening: boolean; morningTime: string; eveningTime: string; desktop: boolean; discord: boolean; activatedAt: number };
export type BriefingSummary = { id: string; day: string; period: BriefingPeriod; generatedAt: number; readAt?: number; partial: boolean; origin: BriefingRecord["origin"]; desktop: BriefingDelivery; discord: BriefingDelivery };
export type BriefingFeed = { settings: BriefingSettings; history: BriefingSummary[]; latest?: BriefingRecord; unread: number; discordConfigured: boolean; generating: boolean; nextMorning: number; nextEvening: number; scheduleErrors: string[] };
export const briefingHref = (id: string) => `/briefing?report=${id}`;
