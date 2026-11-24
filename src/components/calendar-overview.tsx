"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ListTodo, Plus, RotateCw } from "lucide-react";
import { api } from "@/lib/client";
import { calendarItemsByDay, calendarPeriod, monthCells, moveCalendarPeriod, shiftDate, type CalendarItem, type CalendarView } from "@/lib/calendar-view";
import { todayBangkok } from "@/lib/utils";
import type { CalendarEvent, Task } from "@/lib/types";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import "./calendar-overview.css";

const views = { month: "เดือน", week: "สัปดาห์", year: "ปี" } as const;
const weekdays = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];
const compactWeekdays = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const fullDay = new Intl.DateTimeFormat("th-TH", { dateStyle: "full", timeZone: "UTC" });
const shortDay = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" });
const monthName = new Intl.DateTimeFormat("th-TH", { month: "long", timeZone: "UTC" });
const yearLabel = new Intl.DateTimeFormat("th-TH", { year: "numeric", timeZone: "UTC" });
const time = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
const utc = (day: string) => new Date(`${day}T00:00:00Z`);
const itemKey = (item: CalendarItem) => item.kind === "task" ? `task:${item.task.id}` : `event:${item.event.id}`;
const title = (item: CalendarItem) => item.kind === "task" ? item.task.title : item.event.title;
const isTask = (item: CalendarItem) => item.kind === "task" || !!item.event.task;
const statuses = { Todo: "ยังไม่เริ่ม", Doing: "กำลังทำ", Done: "เสร็จแล้ว" };
const statusOf = (item: CalendarItem) => item.kind === "task" ? item.task.status : item.event.task?.status;

function eventTime(event: CalendarEvent, day: string) {
  if (event.allDay) return "ทั้งวัน";
  const start = Date.parse(event.start), end = Date.parse(event.end);
  const midnight = Date.parse(`${day}T00:00:00+07:00`);
  const tomorrow = midnight + 86_400_000;
  if (start < midnight && end >= tomorrow) return "ต่อเนื่องทั้งวัน";
  const startLabel = start < midnight ? "ต่อจากวันก่อน" : time.format(start);
  const endLabel = end > tomorrow ? "ต่อถึงวันถัดไป" : end === tomorrow ? "24:00" : time.format(end);
  return `${startLabel} – ${endLabel}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  day: string;
  onDay: (day: string) => void;
  calendarId?: string;
  tasks: Task[];
  tasksError: string;
  revision: number;
  onEvent: (event?: CalendarEvent) => void;
  onTask: (task?: Task) => void;
};

export function CalendarOverview({ open, onClose, day, onDay, calendarId, tasks, tasksError, revision, onEvent, onTask }: Props) {
  const [view, setView] = useState<CalendarView>("month");
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{ key: string; events: CalendarEvent[]; error?: string }>();
  const details = useRef<HTMLElement>(null);
  const selectedCell = useRef<HTMLButtonElement>(null);
  const { start, end, days } = calendarPeriod(day, view);
  const key = JSON.stringify([calendarId, start, days, revision, attempt]);
  const current = response?.key === key ? response : undefined;
  const loading = !!calendarId && !current;
  const today = todayBangkok();

  useEffect(() => {
    if (!open || !calendarId) return;
    const request = new AbortController();
    api<CalendarEvent[]>(`/api/calendar?date=${start}&days=${days}`, { signal: request.signal })
      .then(events => { if (!request.signal.aborted) setResponse({ key, events }); })
      .catch(error => { if (!request.signal.aborted) setResponse({ key, events: [], error: (error as Error).message }); });
    return () => request.abort();
  }, [open, calendarId, start, days, key]);

  const byDay = useMemo(() => calendarItemsByDay(current?.events ?? [], tasks, start, end), [current, tasks, start, end]);
  const agenda = byDay.get(day) ?? [];
  const periodLabel = view === "year" ? yearLabel.format(utc(day))
    : view === "month" ? monthYear.format(utc(day))
    : shortDay.formatRange(utc(start), utc(shiftDate(end, -1)));

  function select(date: string) {
    onDay(date);
    if (window.matchMedia("(max-width: 900px)").matches) {
      requestAnimationFrame(() => details.current?.focus());
    }
  }

  function dayCell(date: string, mini = false, weekday?: string) {
    const entries = byDay.get(date) ?? [];
    const limit = view === "week" ? 5 : 2;
    return <button key={date} type="button" ref={date === day ? selectedCell : undefined}
      className={mini ? "cal-mini-day" : "cal-day"}
      aria-label={`${fullDay.format(utc(date))} · ${entries.length} รายการ`}
      aria-pressed={date === day} aria-current={date === today ? "date" : undefined} onClick={() => select(date)}>
      <span className="cal-day-number">{weekday && <span className="cal-mobile-weekday">{weekday} </span>}{Number(date.slice(-2))}</span>
      {entries.length > 0 && <span className="cal-day-count" aria-hidden="true">{mini ? "•" : entries.length}</span>}
      {!mini && <span className="cal-previews" aria-hidden="true">
        {entries.slice(0, limit).map(item => <span key={itemKey(item)} className={`cal-chip${isTask(item) ? " cal-chip-task" : ""}`}>
          {isTask(item) ? <ListTodo size={12} /> : <CalendarDays size={12} />}<span>{title(item)}</span>
        </span>)}
        {entries.length > limit && <span className="cal-more">อีก {entries.length - limit} รายการ</span>}
      </span>}
    </button>;
  }

  return <Modal open={open} onOpenChange={value => { if (!value) onClose(); }} title="ปฏิทินของฉัน" className="calendar-overview">
    <div className="cal-toolbar">
      <div className="cal-navigation">
        <button className="icon-button" aria-label={`${views[view]}ก่อน`} onClick={() => onDay(moveCalendarPeriod(day, view, -1))}><ChevronLeft size={18} /></button>
        <button className="icon-button" aria-label={`${views[view]}ถัดไป`} onClick={() => onDay(moveCalendarPeriod(day, view, 1))}><ChevronRight size={18} /></button>
        <Button variant="secondary" size="sm" onClick={() => onDay(today)}>วันนี้</Button>
        <h3 aria-live="polite">{periodLabel}</h3>
      </div>
      <div className="cal-views" role="group" aria-label="มุมมองปฏิทินขนาดใหญ่">
        {(Object.keys(views) as CalendarView[]).map(mode => <button key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}>{views[mode]}</button>)}
      </div>
    </div>
    <div className="cal-layout">
      <div className="cal-schedule">
        <div className="cal-sources">
          <span><CalendarDays size={14} />นัดหมาย</span><span><ListTodo size={14} />งาน</span>
          {loading && <span role="status">กำลังโหลดนัดหมาย…</span>}
          {calendarId && <button className="icon-button cal-reload" aria-label="โหลดนัดหมายใหม่" title="โหลดนัดหมายใหม่" disabled={loading} onClick={() => setAttempt(value => value + 1)}><RotateCw size={14} /></button>}
        </div>
        {(!calendarId || current?.error || tasksError) && <div className="cal-source-notice" role="status">
          {!calendarId && <p>เชื่อม Google Calendar ในตั้งค่าเพื่อแสดงนัดหมาย</p>}
          {current?.error && <p>โหลดนัดหมายไม่สำเร็จ · {current.error}</p>}
          {tasksError && <p>โหลด To-do ไม่สำเร็จ · {tasksError}</p>}
        </div>}
        {view === "year" ? <div className="cal-year">
          {Array.from({ length: 12 }, (_, index) => {
            const month = moveCalendarPeriod(start, "month", index);
            return <section className="cal-mini" key={month}>
              <button className="cal-month-title" onClick={() => { onDay(day.slice(0, 7) === month.slice(0, 7) ? day : month); setView("month"); }}>{monthName.format(utc(month))}</button>
              <div className="cal-grid">
                {compactWeekdays.map(name => <span className="cal-weekday" key={name}>{name}</span>)}
                {monthCells(month).map((date, i) => date ? dayCell(date, true) : <span key={i} aria-hidden="true" />)}
              </div>
            </section>;
          })}
        </div> : <div className={`cal-grid cal-large-grid cal-${view}`}>
          {weekdays.map((name, index) => <span className="cal-weekday" key={name}><span>{name}</span><abbr title={name}>{compactWeekdays[index]}</abbr></span>)}
          {(view === "month" ? monthCells(day) : Array.from({ length: 7 }, (_, i) => shiftDate(start, i)))
            .map((date, index) => date ? dayCell(date, false, view === "week" ? weekdays[index] : undefined) : <span className="cal-blank" key={index} aria-hidden="true" />)}
        </div>}
      </div>
      <section className="cal-details" ref={details} tabIndex={-1} aria-label={fullDay.format(utc(day))}>
        <div className="cal-details-heading">
          <h3>{fullDay.format(utc(day))}</h3>
          <p>{agenda.length} รายการ{day === today ? " · วันนี้" : ""}</p>
          <button className="cal-back text-link" onClick={() => { selectedCell.current?.focus(); }}>กลับไปตาราง</button>
        </div>
        <div className="cal-add">
          <Button variant="secondary" size="sm" disabled={!calendarId} onClick={() => onEvent()}><Plus size={14} />เพิ่มนัดหมาย</Button>
          <Button variant="secondary" size="sm" onClick={() => onTask()}><Plus size={14} />เพิ่มงาน</Button>
        </div>
        {agenda.length > 0 ? <ul className="cal-agenda">
          {agenda.map(item => {
            const task = item.kind === "task" ? item.task : undefined;
            const event = item.kind === "event" ? item.event : undefined;
            const status = statusOf(item);
            const sourceMissing = !!event?.task;
            return <li key={itemKey(item)}>
              <details className="cal-agenda-card">
                <summary>
                  <span className="cal-entry-type">{isTask(item) ? <ListTodo size={14} /> : <CalendarDays size={14} />}{isTask(item) ? "งาน" : "นัดหมาย"}{status && ` · ${statuses[status]}`}</span>
                  <strong>{title(item)}</strong>
                  {event && <span>{eventTime(event, day)}</span>}
                  {task && task.deadline.length > 10 && <span>กำหนดส่ง {time.format(new Date(task.deadline))}</span>}
                </summary>
                {event?.location && <p>{event.location}</p>}
                {(event?.description || task?.details) && <p>{event?.description || task?.details}</p>}
                {sourceMissing
                  ? <p>ยังเปิดงานต้นทางไม่ได้จาก To-do</p>
                  : <Button variant="secondary" size="sm" onClick={() => task ? onTask(task) : onEvent(event)}>{task ? "เปิดงาน" : "เปิดนัดหมาย"}</Button>}
              </details>
            </li>;
          })}
        </ul> : <p className="cal-empty">{loading ? "กำลังโหลดรายการของวันนี้…" : current?.error || tasksError ? "บางแหล่งข้อมูลยังโหลดไม่สำเร็จ" : "ยังไม่มีรายการในวันนี้"}</p>}
      </section>
    </div>
  </Modal>;
}
