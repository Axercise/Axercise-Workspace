export type TaskCalendarInfo = {
  enabled: boolean; state: "synced" | "pending" | "error" | "paused" | "unlinked";
  eventId?: string; url?: string; error?: string;
};
export type CalendarTaskOrigin = { id: string; status: "Todo" | "Doing" | "Done"; deadline: string };
export function taskCalendarDay(deadline: string) {
  if (deadline.length === 10) return deadline;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(deadline));
}
