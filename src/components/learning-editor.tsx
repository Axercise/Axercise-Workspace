"use client";
import { useEffect, useState } from "react";
import { Plus, X, Loader2, Save } from "lucide-react";
import { Modal } from "./ui/dialog";
import { Button } from "./ui/button";
import { HomeworkQuadrant } from "./homework-quadrant";
import { api } from "@/lib/client";
import { assignmentLabels, assignmentStatuses, categories, type LearningKind, type LearningRecord, type LearningState, type Course, type Assignment, type StudySet, type LearningRecords } from "@/lib/learning";

export type EditorSelection = { kind: LearningKind; data: Record<string, unknown>; fresh?: boolean };
export function localDateTime(value: string) { return value ? new Date(Date.parse(value.length === 10 ? `${value}T23:59:00+07:00` : value) + 7 * 3600000).toISOString().slice(0, 16) : ""; }
export function isoDateTime(value: string) { return value ? `${value}:00+07:00` : ""; }
const kindNames: Record<LearningKind, string> = { terms: "เทอม", courses: "รายวิชา", documents: "รายละเอียดเอกสาร", assignments: "การบ้าน", assessments: "คะแนน / การสอบ", notes: "โน้ต", sets: "ชุดทบทวน", plans: "แผนอ่านสอบ", focus: "รอบอ่านหนังสือ" };
export function LearningEditor({ selection, state, onClose, onSaved }: { selection: EditorSelection | null; state: LearningState; onClose: () => void; onSaved: (record: LearningRecord) => void }) {
  const [draft, setDraft] = useState<Record<string, unknown>>({}), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    if (!selection) return;
    setDraft({ title: "", year: String(new Date().getFullYear() + 543), credits: 3, maxScore: 100, itemWeight: 1, kind: "homework", purpose: "homework", taskRequested: false, taskImportant: true, taskUrgent: false, status: "Todo", mode: "cards", ...structuredClone(selection.data) }); setError("");
  }, [selection]);
  if (!selection) return null;
  const kind = selection.kind, str = (key: string) => String(draft[key] ?? ""), set = (key: string, value: unknown) => setDraft(d => ({ ...d, [key]: value }));
  function field(key: string, label: string, type = "text", placeholder = "", required = false) {
    const datetime = type === "datetime-local";
    return <label className="field" key={key}><span>{label}</span><input type={type} required={required} placeholder={placeholder} maxLength={type === "url" ? 4000 : type === "text" ? 2000 : undefined} value={datetime ? localDateTime(str(key)) : type === "number" && draft[key] === null ? "" : str(key)} onChange={e => set(key, datetime ? isoDateTime(e.target.value) : type === "number" ? e.target.value === "" ? null : Number(e.target.value) : e.target.value)} step={type === "number" ? "any" : undefined} /></label>;
  }
  const area = (key: string, label: string, placeholder = "", rows = 4) => <label className="field" key={key}><span>{label}</span><textarea rows={rows} maxLength={60000} value={str(key)} placeholder={placeholder} onChange={e => set(key, e.target.value)} /></label>;
  const choose = (key: string, label: string, options: { id: string; title: string }[], empty?: string) => <label className="field"><span>{label}</span><select value={str(key)} onChange={e => set(key, e.target.value || null)}>{empty && <option value="">{empty}</option>}{options.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}</select></label>;
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const { id, revision, createdAt, updatedAt, ...data } = draft; void createdAt; void updatedAt;
      const result = await api<LearningRecord>("/api/learning", { method: "POST", body: JSON.stringify({ kind, ...(!selection!.fresh && id ? { id, revision } : {}), data }) });
      onSaved(result); onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const weights = (draft.weights || []) as Course["weights"], checklist = (draft.checklist || []) as Assignment["checklist"], cards = (draft.cards || []) as StudySet["cards"], blocks = (draft.blocks || []) as LearningRecords["plans"]["blocks"];
  const editWeight = (index: number, key: string, value: unknown) => set("weights", weights.map((v, i) => i === index ? { ...v, [key]: value } : v));
  const assignmentFiles = state.records.documents.filter(d => d.assignmentId === draft.id).flatMap(d => d.versions.map((v, i) => ({ id: v.id, title: `${d.title} · v${i + 1} · ${v.name}` })));
  const course = state.records.courses.find(c => c.id === draft.courseId);
  return <Modal open={!!selection} onOpenChange={open => !open && !busy && onClose()} title={`${selection.fresh ? "เพิ่ม" : "แก้ไข"}${kind === "documents" && (selection.fresh || selection.data.url) ? "ลิงก์เรียน" : kindNames[kind]}`} description="เก็บรายละเอียดไว้ แล้วกลับมาต่อจากจุดเดิม" className="learning-editor">
    <form className="editor-body learning-form" onSubmit={save}>
      {field("title", kind === "courses" ? "ชื่อรายวิชา" : "ชื่อ", "text", "", true)}
      {kind === "terms" && <>{field("year", "ปีการศึกษา", "text", "2569", true)}<div className="form-grid">{field("start", "วันเปิดเทอม", "date")}{field("end", "วันสิ้นสุดเทอม", "date")}</div></>}
      {kind === "courses" && <>
        {choose("termId", "เทอม", state.records.terms.map(t => ({ id: t.id, title: `${t.year} · ${t.title}${t.archived ? " · เก็บย้อนหลัง" : ""}` })))}
        <div className="form-grid">{field("code", "รหัสวิชา", "text", "เช่น CS101")}{field("credits", "หน่วยกิต", "number")}</div>
        {area("description", "รายละเอียดวิชา", "เรียนเกี่ยวกับอะไร สิ่งที่อยากเข้าใจ หรือเป้าหมายของวิชานี้", 3)}
        <div className="form-grid">{field("teacher", "ชื่ออาจารย์")}{field("email", "อีเมลติดต่อ", "email")}</div>
        {field("contact", "ช่องทางติดต่ออื่น / ลิงก์ชั้นเรียน")}{field("officeHours", "ช่วงเวลาที่ติดต่ออาจารย์ได้")}
        {area("schedule", "ตารางเรียน", "เช่น จันทร์ 09:00–12:00 และพุธ 13:00–15:00", 2)}{field("room", "ห้องเรียน / อาคาร / ลิงก์เรียน")}
        <div className="learning-section-heading"><h3>เกณฑ์น้ำหนักคะแนน</h3><Button type="button" size="sm" variant="secondary" onClick={() => set("weights", [...weights, { id: crypto.randomUUID(), name: "", weight: 0 }])}><Plus size={14} />เพิ่มกลุ่ม</Button></div>
        <p className="muted small">กำหนดตามเกณฑ์ของวิชา เช่น การบ้าน 20% กลางภาค 30% ปลายภาค 50%</p>
        {weights.map((w, i) => <div className="learning-weight-row" key={w.id}><input required aria-label={`กลุ่มคะแนน ${i + 1}`} value={w.name} placeholder="ชื่อกลุ่มคะแนน" onChange={e => editWeight(i, "name", e.target.value)} /><input aria-label={`น้ำหนักกลุ่ม ${i + 1}`} type="number" min={0} max={100} step="any" value={w.weight} onChange={e => editWeight(i, "weight", Number(e.target.value))} /><span>%</span><button className="icon-button" type="button" aria-label="นำกลุ่มคะแนนออก" onClick={() => set("weights", weights.filter((_, n) => n !== i))}><X size={16} /></button></div>)}
        <p className="small muted">น้ำหนักรวม {weights.reduce((n, w) => n + w.weight, 0)}%</p>
        {field("target", "เป้าหมายคะแนนรวม (%) · เว้นว่างหากยังไม่กำหนด", "number")}{area("gradeRules", "เกณฑ์เกรดของวิชา", "เช่น A ตั้งแต่ 80 คะแนน หรือตามประกาศอาจารย์", 2)}
      </>}
      {kind === "documents" && <>
        {(selection.fresh || selection.data.url) && <>{field("url", "ลิงก์ / URL", "url", "https://…", true)}<p className="learning-upload-hint">เก็บลิงก์ต้นทางไว้เปิดภายหลัง ไม่ดาวน์โหลดเนื้อหาเว็บอัตโนมัติ</p></>}
        {choose("category", "ประเภทเอกสาร", categories.map(title => ({ id: title, title })))}{field("chapter", "บท / สัปดาห์")}
        <label className="field"><span>แท็ก · คั่นด้วยเครื่องหมายจุลภาค</span><input value={((draft.tags || []) as string[]).join(", ")} onChange={e => set("tags", e.target.value.split(",").map(t => t.trim()).filter(Boolean))} /></label>
        {area("note", "บันทึกประกอบ")}
        <label className="learning-check"><input type="checkbox" checked={!!draft.pinned} onChange={e => set("pinned", e.target.checked)} />ปักหมุดเป็นเอกสารสำคัญ</label>
      </>}
      {kind === "assignments" && <>
        <section className="learning-homework-todo"><label className="learning-check"><input type="checkbox" checked={!!draft.taskRequested || !!draft.taskId} disabled={!!draft.taskId || !!selection.data.taskRequested} onChange={e => set("taskRequested", e.target.checked)} />แสดงการบ้านนี้ใน To-do List</label><HomeworkQuadrant important={draft.taskImportant !== false} urgent={!!draft.taskUrgent} onChange={(important, urgent) => setDraft(d => ({ ...d, taskImportant: important, taskUrgent: urgent }))} /><p className="small muted">เลือกช่องที่เหมาะกับงานนี้ งานที่เชื่อมแล้วจะปรับรายการเดิมเมื่อแก้ไข และเก็บรอส่งได้หากยังเชื่อม Notion ไม่สำเร็จ</p></section>
        {choose("purpose", "ประเภทงาน", [{ id: "homework", title: "การบ้าน / งานส่ง" }, { id: "study", title: "งานอ่านและทบทวน" }])}
        {area("details", "โจทย์และรายละเอียด", "สิ่งที่ต้องทำ เงื่อนไข และรายละเอียดการส่ง", 5)}{area("rubric", "เกณฑ์ตรวจงาน / Rubric", "เกณฑ์ที่อาจารย์ใช้ให้คะแนน", 4)}
        <div className="form-grid">{field("deadline", draft.purpose === "study" ? "กำหนดอ่าน" : "กำหนดส่ง", "datetime-local")}{choose("status", "สถานะ", assignmentStatuses.map(id => ({ id, title: draft.purpose === "study" && id === "Completed" ? "อ่านเสร็จแล้ว" : assignmentLabels[id] })))}</div>
        {draft.purpose !== "study" && <>{field("submissionUrl", "ลิงก์ส่งงาน")}
        {choose("submittedVersionId", "ฉบับที่ส่งจริง", assignmentFiles, "ยังไม่ระบุไฟล์ที่ส่ง")}{field("submittedAt", "เวลาที่ส่งงาน", "datetime-local")}</>}
        <div className="learning-section-heading"><h3>Checklist ก่อนส่ง</h3><Button type="button" variant="secondary" size="sm" onClick={() => set("checklist", [...checklist, { id: crypto.randomUUID(), text: "", done: false }])}><Plus size={14} />เพิ่มข้อ</Button></div>
        {checklist.map((c, i) => <div className="learning-check-row" key={c.id}><input type="checkbox" aria-label={`ข้อ ${i + 1} เสร็จแล้ว`} checked={c.done} onChange={e => set("checklist", checklist.map(v => v.id === c.id ? { ...v, done: e.target.checked } : v))} /><input required aria-label={`รายการตรวจข้อ ${i + 1}`} value={c.text} onChange={e => set("checklist", checklist.map(v => v.id === c.id ? { ...v, text: e.target.value } : v))} /><button type="button" className="icon-button" aria-label="นำรายการตรวจออก" onClick={() => set("checklist", checklist.filter(v => v.id !== c.id))}><X size={15} /></button></div>)}
        {area("feedback", "ข้อเสนอแนะ / ข้อผิดพลาดที่อยากกลับมาทบทวน")}
      </>}
      {kind === "assessments" && <>
        {choose("kind", "ประเภท", [{ id: "homework", title: "การบ้าน" }, { id: "quiz", title: "แบบทดสอบ" }, { id: "attendance", title: "เข้าเรียน" }, { id: "midterm", title: "สอบกลางภาค" }, { id: "final", title: "สอบปลายภาค" }, { id: "other", title: "อื่น ๆ" }])}
        {choose("assignmentId", "เชื่อมกับการบ้าน", state.records.assignments.filter(a => a.courseId === draft.courseId).map(a => ({ id: a.id, title: a.title })), "รายการประเมินแยก / การสอบ")}
        <div className="form-grid">{field("date", "วันและเวลาเริ่ม", "datetime-local")}{field("end", "เวลาสิ้นสุด", "datetime-local")}</div>
        {field("location", "สถานที่ / ลิงก์สอบ")}{area("scope", "ขอบเขตเนื้อหา / บทที่ออกสอบ")}
        {choose("groupId", "กลุ่มน้ำหนักคะแนน", (course?.weights || []).map(w => ({ id: w.id, title: `${w.name} · ${w.weight}%` })), "ยังไม่จัดกลุ่ม")}
        <div className="form-grid">{field("maxScore", "คะแนนเต็ม", "number")}{field("score", "คะแนนที่ได้ · เว้นว่างเมื่อรอผล", "number")}</div>
        {field("itemWeight", "น้ำหนักภายในกลุ่ม · ใส่ 1 เท่ากันทุกรายการเพื่อเฉลี่ย", "number")}{area("feedback", "ข้อเสนอแนะจากอาจารย์")}
      </>}
      {kind === "notes" && area("content", "เนื้อหาโน้ต / สรุป", "", 12)}
      {kind === "sets" && <>
        {field("chapter", "บท / หัวข้อ")}<label className="field"><span>แท็กชุดทบทวน · คั่นด้วยจุลภาค</span><input value={((draft.tags || []) as string[]).join(", ")} onChange={e => set("tags", e.target.value.split(",").map(t => t.trim()).filter(Boolean))} /></label>
        {choose("mode", "วิธีทบทวน", [{ id: "cards", title: "Flashcards" }, { id: "quiz", title: "แบบทดสอบทีละข้อ" }])}
        {cards.map((card, i) => <section className="learning-card-editor" key={card.id}><div className="learning-section-heading"><strong>ข้อ {i + 1}</strong><button className="icon-button" type="button" aria-label="นำคำถามออก" onClick={() => set("cards", cards.filter(c => c.id !== card.id))}><X size={16} /></button></div><label className="field"><span>คำถาม</span><textarea rows={2} required value={card.question} onChange={e => set("cards", cards.map(c => c.id === card.id ? { ...c, question: e.target.value } : c))} /></label><label className="field"><span>คำตอบ / คำอธิบาย</span><textarea rows={3} required value={card.answer} onChange={e => set("cards", cards.map(c => c.id === card.id ? { ...c, answer: e.target.value } : c))} /></label><label className="field"><span>แหล่งอ้างอิง</span><input value={card.source} onChange={e => set("cards", cards.map(c => c.id === card.id ? { ...c, source: e.target.value } : c))} /></label></section>)}
        <Button type="button" variant="secondary" onClick={() => set("cards", [...cards, { id: crypto.randomUUID(), question: "", answer: "", source: "", reviews: 0, interval: 0, due: null, lastResult: null, history: [] }])}><Plus size={15} />เพิ่มคำถาม</Button>
      </>}
      {kind === "plans" && <>
        {area("content", "แนวทางและสมมติฐานของแผน", "", 5)}
        {blocks.map((b, i) => <section className="learning-card-editor" key={b.id}><div className="learning-section-heading"><strong>ช่วงอ่าน {i + 1}</strong><button className="icon-button" type="button" aria-label="นำช่วงอ่านออก" onClick={() => set("blocks", blocks.filter(x => x.id !== b.id))}><X size={16} /></button></div><label className="field"><span>หัวข้อ</span><input required value={b.title} onChange={e => set("blocks", blocks.map(x => x.id === b.id ? { ...x, title: e.target.value } : x))} /></label><div className="form-grid">{["start", "end"].map(key => <label className="field" key={key}><span>{key === "start" ? "เริ่ม" : "สิ้นสุด"}</span><input required type="datetime-local" value={localDateTime(b[key as "start" | "end"])} onChange={e => set("blocks", blocks.map(x => x.id === b.id ? { ...x, [key]: isoDateTime(e.target.value) } : x))} /></label>)}</div></section>)}
        <Button type="button" variant="secondary" onClick={() => set("blocks", [...blocks, { id: crypto.randomUUID(), title: "", start: new Date(Date.now() + 86400000).toISOString(), end: new Date(Date.now() + 86400000 + 3600000).toISOString(), assignmentId: null, taskId: null, calendarId: null, done: false }])}><Plus size={15} />เพิ่มช่วงอ่าน</Button>
      </>}
      {error && <div className="form-alert error" role="alert">{error}</div>}
      <div className="editor-actions">{!selection.fresh && !!draft.id && <Button type="button" variant="ghost" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { const item = await api<LearningRecord>("/api/learning", { method: "POST", body: JSON.stringify({ kind, id: draft.id, revision: draft.revision, data: { ...draft, archived: !draft.archived } }) }); onSaved(item); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>{draft.archived ? "คืนรายการ" : "เก็บย้อนหลัง"}</Button>}<Button type="button" variant="ghost" disabled={busy} onClick={onClose}>ยกเลิก</Button><Button type="submit" disabled={busy || !str("title").trim()}>{busy ? <Loader2 size={15} className="spin" /> : <Save size={15} />}บันทึก</Button></div>
    </form>
  </Modal>;
}
