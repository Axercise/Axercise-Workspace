import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarItemsByDay, calendarPeriod, isCalendarDay, monthCells, moveCalendarPeriod } from "../src/lib/calendar-view";
import type { CalendarEvent, Task } from "../src/lib/types";

test("calendar periods handle leap February, month ends and weeks that cross years", () => {
  assert.equal(isCalendarDay("2025-02-29"), false);
  assert.deepEqual(calendarPeriod("2024-02-29", "month"), { start: "2024-02-01", end: "2024-03-01", days: 29 });
  assert.equal(calendarPeriod("2024-06-01", "year").days, 366);
  assert.deepEqual(monthCells("2026-11-24").slice(0, 8), [null, null, null, null, null, null, "2026-11-01", "2026-11-02"]);
  assert.deepEqual(calendarPeriod("2026-01-01", "week"), { start: "2025-12-29", end: "2026-01-05", days: 7 });
  assert.equal(moveCalendarPeriod("2026-01-31", "month", 1), "2026-02-28");
  assert.equal(moveCalendarPeriod("2024-02-29", "year", 1), "2025-02-28");
});

test("a day shows event overlaps in Bangkok and uses the source task instead of its Calendar copy", () => {
  const event = (id: string, start: string, end: string, allDay = false): CalendarEvent => ({ id, title: id, start, end, allDay, description: "", location: "" });
  const task: Task = { id: "study", title: "Study", details: "", deadline: "2026-12-01T18:00:00Z", status: "Todo", important: true, urgent: false };
  const copy = { ...event("copy", "2026-12-02", "2026-12-03", true), task: { id: task.id, deadline: task.deadline, status: task.status } };
  const byDay = calendarItemsByDay([
    event("conference", "2026-11-30", "2026-12-02", true),
    event("midnight", "2026-12-01T23:30:00+07:00", "2026-12-02T00:00:00+07:00"),
    event("overnight", "2026-12-02T23:30:00+07:00", "2026-12-03T00:30:00+07:00"),
    copy,
  ], [task], "2026-12-01", "2026-12-04");
  const ids = (day: string) => (byDay.get(day) ?? []).map(item => item.kind === "event" ? item.event.id : item.task.id);
  assert.deepEqual(ids("2026-11-30"), []);
  assert.deepEqual(ids("2026-12-01"), ["conference", "midnight"]);
  assert.deepEqual(ids("2026-12-02"), ["study", "overnight"]);
  assert.deepEqual(ids("2026-12-03"), ["overnight"]);
});
