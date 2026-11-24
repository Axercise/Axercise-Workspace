import { taskCalendarDay } from "./task-calendar";
import type { CalendarEvent, Task } from "./types";

export type CalendarView = "week" | "month" | "year";
export type CalendarItem = { kind: "event"; event: CalendarEvent } | { kind: "task"; task: Task };

const dayMs = 86_400_000;
const instant = (day: string) => Date.parse(`${day}T00:00:00Z`);
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export function isCalendarDay(day: string) {
  const timestamp = instant(day);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(timestamp) && isoDay(new Date(timestamp)) === day;
}

export function shiftDate(day: string, by: number) {
  return isoDay(new Date(instant(day) + by * dayMs));
}

export function startOfWeek(day: string) {
  const weekday = new Date(instant(day)).getUTCDay();
  return shiftDate(day, -((weekday + 6) % 7));
}

function moveMonth(day: string, by: number) {
  const date = new Date(instant(day));
  const number = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + by + 1, 0);
  date.setUTCDate(Math.min(number, date.getUTCDate()));
  return isoDay(date);
}

export function moveCalendarPeriod(day: string, view: CalendarView, by: number) {
  return view === "week" ? shiftDate(day, by * 7) : moveMonth(day, by * (view === "year" ? 12 : 1));
}

export function calendarPeriod(day: string, view: CalendarView) {
  const start = view === "week" ? startOfWeek(day) : view === "month" ? `${day.slice(0, 7)}-01` : `${day.slice(0, 4)}-01-01`;
  const end = moveCalendarPeriod(start, view, 1);
  return { start, end, days: (instant(end) - instant(start)) / dayMs };
}

export function monthCells(day: string) {
  const { start, days } = calendarPeriod(day, "month");
  const leading = (instant(start) - instant(startOfWeek(start))) / dayMs;
  return Array.from({ length: Math.ceil((leading + days) / 7) * 7 }, (_, i) =>
    i < leading || i >= leading + days ? null : shiftDate(start, i - leading));
}

export function calendarItemsByDay(events: CalendarEvent[], tasks: Task[], from: string, to: string) {
  const items = new Map<string, CalendarItem[]>();
  function add(day: string, item: CalendarItem) {
    if (day < from || day >= to) return;
    const list = items.get(day);
    if (list) list.push(item);
    else items.set(day, [item]);
  }

  const taskIds = new Set<string>(), projectedEvents = new Set<string>();
  for (const task of tasks) {
    if (!task.deadline || !Number.isFinite(Date.parse(task.deadline))) continue;
    const day = taskCalendarDay(task.deadline);
    if (!isCalendarDay(day)) continue;
    taskIds.add(task.id);
    if (task.calendar?.eventId) projectedEvents.add(task.calendar.eventId);
    add(day, { kind: "task", task });
  }

  for (const event of events) {
    if (taskIds.has(event.task?.id || "") || projectedEvents.has(event.id)) continue;
    if (event.allDay && (!isCalendarDay(event.start) || !isCalendarDay(event.end))) continue;
    const startTime = Date.parse(event.start), endTime = Date.parse(event.end);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) continue;
    const start = event.allDay ? event.start : taskCalendarDay(event.start);
    // Google Calendar's end is exclusive, including events ending at midnight.
    const last = event.allDay ? shiftDate(event.end, -1) : taskCalendarDay(new Date(Math.max(startTime, endTime - 1)).toISOString());
    for (let day = start < from ? from : start; day <= last && day < to; day = shiftDate(day, 1)) {
      add(day, { kind: "event", event });
    }
  }
  return items;
}
