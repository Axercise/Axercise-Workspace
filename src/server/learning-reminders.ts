import { assignmentPending, type LearningState } from "../lib/learning";

export const deadlineTime = (date: string) => Date.parse(date.length === 10 ? `${date}T23:59:00+07:00` : date);
export function learningReminders(state: LearningState, now: number, horizon: number, timezone = "Asia/Bangkok") {
  const active = new Set(state.records.courses.filter(c => !c.archived && state.records.terms.some(t => t.id === c.termId && !t.archived)).map(c => c.id));
  const pending: { key: string; text: string }[] = [];
  for (const a of state.records.assignments) {
    const at = deadlineTime(a.deadline);
    if (!active.has(a.courseId) || !assignmentPending(a) || !(at > now && at <= horizon)) continue;
    pending.push({ key: `task:${a.taskId || a.id}:${at}`, text: `${a.purpose === "study" ? "📖 ถึงเวลาอ่าน" : a.status === "Completed" ? "📤 ทำเสร็จแล้ว อย่าลืมส่ง" : "✅ งานใกล้ถึงกำหนด"}: ${a.title}\n${new Date(at).toLocaleString("th-TH", { timeZone: timezone })}` });
  }
  for (const a of state.records.assessments) {
    const at = deadlineTime(a.date);
    if (a.archived || !active.has(a.courseId) || !(at > now && at <= horizon)) continue;
    pending.push({ key: `event:${a.calendarId || a.id}:${at}`, text: `📅 ใกล้ถึงการสอบ / การประเมิน: ${a.title}\n${new Date(at).toLocaleString("th-TH", { timeZone: timezone })}${a.location ? `\n${a.location}` : ""}` });
  }
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(now));
  for (const s of state.records.sets) {
    if (s.archived || !active.has(s.courseId)) continue;
    const due = s.cards.filter(c => c.due && Date.parse(c.due) <= now).length;
    if (due) pending.push({ key: `review:${s.id}:${day}`, text: `🧠 ถึงรอบทบทวน ${s.title}: ${due} ข้อ\nเปิดเมนูการเรียน → ทบทวน` });
  }
  return pending;
}
