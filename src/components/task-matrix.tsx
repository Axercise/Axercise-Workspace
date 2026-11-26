"use client";

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { CalendarDays, Check, GripVertical, ListTodo, Loader2, Plus, RotateCw, Search } from "lucide-react";
import { api } from "@/lib/client";
import { QUADRANTS, quadrant, todayBangkok } from "@/lib/utils";
import { taskCalendarDay } from "@/lib/task-calendar";
import type { Task } from "@/lib/types";
import { Modal } from "./ui/dialog";
import { Button } from "./ui/button";
import "./task-matrix.css";

const dragType = "application/x-axercise-task";
type Update = { important: boolean; urgent: boolean } | { status: Task["status"] };
const statusLabel = { Todo: "ยังไม่เริ่ม", Doing: "กำลังทำ", Done: "เสร็จแล้ว" };

function dueDate(task: Task) {
  if (!task.deadline) return null;
  const date = taskCalendarDay(task.deadline);
  return <time dateTime={task.deadline} className={task.status !== "Done" && date < todayBangkok() ? "matrix-overdue" : ""}>
    <CalendarDays size={12} />{new Date(date + "T12:00:00+07:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" })}
  </time>;
}

export function TaskMatrix({ open, onOpenChange, tasks, error, onEdit, onRefresh, onUpdated, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: Task[];
  error: string;
  onEdit: (task?: Task) => void;
  onRefresh: () => void;
  onUpdated: (task: Task) => void;
  children?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [dragging, setDragging] = useState<string>();
  const [target, setTarget] = useState<number>();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const pending = useRef(new Set<string>());
  const controls = useRef(new Map<string, HTMLSelectElement>());
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const query = search.trim().toLocaleLowerCase();
  const matches = (task: Task) => !query || [task.title, task.details, task.learning?.courseTitle, task.learning?.courseCode].some(value => value?.toLocaleLowerCase().includes(query));
  const active = tasks.filter(task => task.status !== "Done");
  const completed = tasks.filter(task => task.status === "Done");

  useEffect(() => {
    if (!open) { setDragging(undefined); setTarget(undefined); }
  }, [open]);

  async function updateTask(task: Task, update: Update, announcement: string, restoreFocus = false) {
    if (pending.current.has(task.id)) return;
    pending.current.add(task.id);
    setBusy(new Set(pending.current));
    setSaveError("");
    setMessage("กำลังบันทึก…");
    try {
      const saved = await api<Task>(`/api/notion?kind=tasks&action=matrix&id=${encodeURIComponent(task.id)}`, {
        method: "PATCH", body: JSON.stringify(update),
      });
      onUpdated(saved);
      setMessage(announcement);
    } catch (cause) {
      setMessage("");
      setSaveError((cause as Error).message);
      onRefresh();
    } finally {
      pending.current.delete(task.id);
      setBusy(new Set(pending.current));
      if (restoreFocus) requestAnimationFrame(() => controls.current.get(task.id)?.focus());
    }
  }
  function move(task: Task, index: number, restoreFocus = false) {
    if (index === quadrant(task) || index < 0 || index > 3) return;
    void updateTask(task, { important: index < 2, urgent: index === 0 || index === 2 }, `ย้าย “${task.title}” ไป${QUADRANTS[index].name}แล้ว`, restoreFocus);
  }
  function dragStart(event: DragEvent<HTMLElement>, task: Task) {
    const interactive = (event.target as HTMLElement).closest("button, select, input, a");
    if (busy.has(task.id) || (interactive && !interactive.hasAttribute("data-drag-handle"))) { event.preventDefault(); return; }
    event.dataTransfer.setData(dragType, task.id);
    event.dataTransfer.effectAllowed = "move";
    setDragging(task.id);
    setSaveError("");
  }
  function dragEnd() { setDragging(undefined); setTarget(undefined); }
  function drop(event: DragEvent<HTMLElement>, index: number) {
    if (!dragging) return;
    event.preventDefault();
    const task = tasks.find(item => item.id === dragging && item.status !== "Done");
    dragEnd();
    if (task && event.dataTransfer.getData(dragType) === task.id) move(task, index);
  }
  function taskCard(task: Task, draggable = true) {
    const pendingSave = busy.has(task.id);
    return <article className={`matrix-task${dragging === task.id ? " dragging" : ""}${task.status === "Done" ? " done" : ""}`}
      key={task.id} draggable={draggable && !pendingSave} aria-busy={pendingSave}
      onDragStart={event => dragStart(event, task)} onDragEnd={dragEnd}>
      <div className="matrix-task-top">
        {draggable && <button className="matrix-grip" data-drag-handle draggable={!pendingSave} disabled={pendingSave}
          aria-label={`ลากงาน ${task.title}`} title="ลากไปวางในช่องที่ต้องการ">
          <GripVertical size={17} />
        </button>}
        <button className={`task-check${task.status === "Done" ? " checked" : ""}`} role="checkbox" aria-checked={task.status === "Done"}
          aria-label={`ทำเครื่องหมาย ${task.title} ${task.status === "Done" ? "ยังไม่เสร็จ" : "เสร็จแล้ว"}`}
          disabled={pendingSave} onClick={() => void updateTask(task, { status: task.status === "Done" ? "Todo" : "Done" }, task.status === "Done" ? "นำงานกลับมาทำแล้ว" : "บันทึกว่างานเสร็จแล้ว")}>
          {pendingSave ? <Loader2 size={12} className="spin" /> : task.status === "Done" ? <Check size={12} /> : null}
        </button>
        <button className="matrix-task-title" disabled={pendingSave} onClick={() => onEdit(task)}>{task.title}</button>
      </div>
      {task.details && <p className="matrix-task-description">{task.details}</p>}
      {task.learning && <span className="matrix-course">การบ้าน · {task.learning.courseCode || task.learning.courseTitle}</span>}
      <div className="matrix-task-meta">{dueDate(task)}<span>{statusLabel[task.status]}</span>
        {task.calendar?.enabled && <span><CalendarDays size={12} />Calendar{task.calendar.error ? " · รอลองใหม่" : ""}</span>}
      </div>
      {draggable && <label className="matrix-move"><span>ย้ายไป</span><select
        ref={node => { if (node) controls.current.set(task.id, node); else controls.current.delete(task.id); }}
        aria-label={`ย้าย ${task.title} ไปช่อง`} disabled={pendingSave} value={quadrant(task)}
        onChange={event => move(task, Number(event.target.value), true)}>
        {QUADRANTS.map((entry, index) => <option value={index} key={entry.name}>{entry.name}</option>)}
      </select></label>}
    </article>;
  }

  return <Modal open={open} onOpenChange={onOpenChange} title="Eisenhower Matrix" description="ลากงานข้ามช่องเพื่อเปลี่ยนความสำคัญและความเร่งด่วน" className="task-matrix-modal">
    <div className="matrix-board-toolbar">
      <label className="matrix-search"><Search size={16} /><input aria-label="ค้นหางานใน Matrix" placeholder="ค้นหางานหรือรายวิชา" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <span>{active.length} งานที่ยังไม่เสร็จ · {completed.length} งานเสร็จแล้ว</span>
      <button className="icon-button" title="โหลดงานใหม่" aria-label="โหลดงานใหม่" onClick={onRefresh}><RotateCw size={16} /></button>
      <Button size="sm" onClick={() => onEdit()}><Plus size={15} />เพิ่มงาน</Button>
    </div>
    <div className="matrix-board-feedback">
      {(error || saveError) && <p className="form-alert error" role="alert">{saveError || error}</p>}
      <p role="status" aria-live="polite">{message}</p>
    </div>
    <div className="matrix-board-grid">
      {QUADRANTS.map((entry, index) => {
        const group = active.filter(task => quadrant(task) === index);
        const shown = group.filter(matches);
        return <section className={`matrix-board-quadrant matrix-tone-${index}${target === index ? " drop-target" : ""}`}
          key={entry.name} aria-label={entry.name}
          onDragOver={event => {
            if (!dragging) return;
            event.preventDefault(); event.dataTransfer.dropEffect = "move"; setTarget(index);
          }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTarget(value => value === index ? undefined : value); }}
          onDrop={event => drop(event, index)}>
          <header><h3><span className="priority-dot" />{entry.name}</h3><span className="matrix-count">{query ? `${shown.length}/` : ""}{group.length}</span><p>{entry.subtitle}</p></header>
          <div className="matrix-board-list">
            {shown.map(task => taskCard(task))}
            {!shown.length && <div className="matrix-board-empty"><ListTodo size={22} /><span>{query ? "ไม่พบงานที่ค้นหาในช่องนี้" : "ลากงานมาวางที่นี่"}</span></div>}
          </div>
        </section>;
      })}
    </div>
    {(completed.length > 0 || children) && <div className="matrix-board-footer">
      {completed.length > 0 && <details className="matrix-completed"><summary>งานที่เสร็จแล้ว ({completed.length})</summary><div>{completed.filter(matches).map(task => taskCard(task, false))}</div></details>}
      {children}
    </div>}
  </Modal>;
}
