"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, Check, Clock3, ExternalLink, Loader2, RefreshCw, Volume2, X } from "lucide-react";
import { Modal } from "./ui/dialog";
import { Button } from "./ui/button";
import { api } from "@/lib/client";
import type { Reminder, ReminderDelivery, ReminderFeed, ReminderSettings } from "@/lib/reminders";
import { readDrafts } from "@/lib/drafts";
import "./notification-center.css";

const labels: Record<string, string> = { calendar: "Calendar", task: "To-do", draft: "To-do · ฉบับร่าง", assignment: "การบ้าน / งานอ่าน", assessment: "สอบ / ประเมิน", plan: "แผนอ่าน", review: "ทบทวน", focus: "รอบอ่าน", test: "ทดสอบ" };
function dueLabel(reminder: Reminder) {
  if (reminder.status === "acknowledged") return "รับทราบแล้ว · หยุดเตือน";
  if (reminder.snoozedUntil > Date.now()) return `เลื่อนถึง ${new Date(reminder.snoozedUntil).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
  const minutes = Math.ceil((reminder.dueAt - Date.now()) / 60000);
  return minutes > 0 ? `อีก ${minutes} นาที` : minutes < -1 ? `เลยเวลา ${Math.abs(minutes)} นาที` : "ถึงเวลาแล้ว";
}
function isDue(record: Reminder) { return record.status === "pending" && record.dueAt - Date.now() <= (record.kind === "focus" ? 0 : 30 * 60000) && record.snoozedUntil <= Date.now() && (!record.expiresAt || record.expiresAt > Date.now()); }

export function NotificationCenter() {
  const [feed, setFeed] = useState<ReminderFeed>(), [open, setOpen] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState("");
  const [tab, setTab] = useState<"active" | "all" | "acknowledged">("active"), [popup, setPopup] = useState<{ record: Reminder; delivery: ReminderDelivery }>();
  const [browserPermission, setBrowserPermission] = useState("default");
  const seen = useRef(new Set<string>()), popupTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const draftHash = useRef("");
  const load = useCallback(async () => {
    try {
      try {
        const drafts = readDrafts(localStorage).filter(d => d.kind === "task" && typeof d.deadline === "string" && Number.isFinite(Date.parse(d.deadline)) && d.title.trim()).map(d => ({ id: d.id.slice(0, 100), title: d.title.slice(0, 300), deadline: d.deadline! }));
        const hash = JSON.stringify(drafts);
        if (draftHash.current !== hash) {
          let clientId = localStorage.getItem("axercise-reminder-client");
          if (!clientId) { clientId = crypto.randomUUID(); localStorage.setItem("axercise-reminder-client", clientId); }
          await api("/api/reminders", { method: "POST", body: JSON.stringify({ action: "drafts", clientId, drafts }) }); draftHash.current = hash;
        }
      } catch { /* Draft storage is optional; Calendar and academic alerts still load. */ }
      setFeed(await api<ReminderFeed>("/api/reminders")); setError("");
    }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    if (query.has("reminder") || query.has("reminders")) setOpen(true);
    if (query.has("reminder")) setTab("all");
    if ("Notification" in window) setBrowserPermission(Notification.permission);
    void load(); const timer = setInterval(load, 15000); window.addEventListener("focus", load);
    return () => { clearInterval(timer); window.removeEventListener("focus", load); if (popupTimer.current) clearTimeout(popupTimer.current); };
  }, [load]);
  useEffect(() => {
    if (!feed) return;
    const fresh = feed.deliveries.filter(d => !d.superseded && d.createdAt > Date.now() - 3 * 60000 && !seen.current.has(d.id));
    for (const delivery of fresh) {
      seen.current.add(delivery.id);
      const record = feed.reminders.find(r => r.id === delivery.reminderId);
      if (!record || !isDue(record) || !feed.settings.enabled) continue;
      setPopup({ record, delivery });
      if (popupTimer.current) clearTimeout(popupTimer.current);
      popupTimer.current = setTimeout(() => setPopup(undefined), 14000);
      if (feed.settings.desktop && !feed.native.available && browserPermission === "granted" && "Notification" in window) {
        // The native daemon is the primary sender. Browser banners are a fallback.
        try {
          const key = `axercise-browser-notice:${delivery.id}`;
          if (!localStorage.getItem(key)) {
            localStorage.setItem(key, "shown");
            const notice = new Notification(record.title, { body: `${dueLabel(record)}\n${record.detail}`, tag: delivery.id, requireInteraction: true });
            notice.onclick = () => { window.focus(); setOpen(true); notice.close(); };
          }
        } catch { /* The notification center remains available if OS permission changes. */ }
      }
    }
  }, [feed, browserPermission]);
  async function action(id: string, kind: "acknowledge" | "snooze" | "resume") {
    setBusy(id);
    try { setFeed(await api<ReminderFeed>("/api/reminders", { method: "PATCH", body: JSON.stringify({ id, action: kind, minutes: 10 }) })); if (popup?.record.id === id) setPopup(undefined); }
    catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }
  async function configure(settings: Partial<ReminderSettings>) {
    setBusy("settings");
    try { setFeed(await api<ReminderFeed>("/api/reminders", { method: "POST", body: JSON.stringify({ action: "settings", settings }) })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }
  async function refresh(test = false) {
    setBusy("refresh");
    try { setFeed(await api<ReminderFeed>("/api/reminders", { method: "POST", body: JSON.stringify({ action: test ? "test" : "refresh" }) })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }
  const count = feed?.reminders.filter(isDue).length || 0;
  const list = feed?.reminders.filter(r => tab === "acknowledged" ? r.status === "acknowledged" : r.status === "pending" && (tab === "all" || isDue(r))) || [];
  return <>
    <button className={`notification-launcher ${count ? "has-reminders" : ""}`} aria-label={`ศูนย์แจ้งเตือน${count ? ` · ${count} รายการถึงเวลา` : ""}`} title="ศูนย์แจ้งเตือน" onClick={() => setOpen(true)}><Bell size={21} />{count > 0 && <span>{count > 99 ? "99+" : count}</span>}</button>
    {popup && !open && <aside className="reminder-popup" role="status"><BellRing size={21} /><div><strong>{popup.record.title}</strong><p>{dueLabel(popup.record)} · {popup.record.detail}</p><div><button disabled={!!busy} onClick={() => action(popup.record.id, "acknowledge")}>รับทราบ</button><button disabled={!!busy} onClick={() => action(popup.record.id, "snooze")}>เลื่อน 10 นาที</button><button onClick={() => { setOpen(true); setPopup(undefined); }}>ดูทั้งหมด</button></div></div><button className="icon-button" aria-label="ปิดการเตือนนี้ชั่วคราว" onClick={() => setPopup(undefined)}><X size={15} /></button></aside>}
    <Modal open={open} onOpenChange={setOpen} title="ศูนย์แจ้งเตือน" description="กำหนดการทั้งหมดของคุณ · รับทราบหรือเลื่อนเวลาได้จากทุกช่องทาง" className="notification-center-modal">
      <div className="notification-center-body">
        {error && <div className="form-alert error" role="alert">{error}</div>}
        <section className="reminder-preferences" aria-label="ตั้งค่าการแจ้งเตือน">
          <label><input type="checkbox" checked={feed?.settings.enabled ?? true} disabled={!feed || !!busy} onChange={e => configure({ enabled: e.target.checked })} />เปิดการแจ้งเตือน</label>
          <label><input type="checkbox" checked={feed?.settings.desktop ?? true} disabled={!feed || !!busy} onChange={e => configure({ desktop: e.target.checked })} />เด้งบน Windows</label>
          <label><input type="checkbox" checked={feed?.settings.discord ?? true} disabled={!feed || !!busy} onChange={e => configure({ discord: e.target.checked })} />ส่งเข้า Discord</label>
          <label><input type="checkbox" checked={feed?.settings.sound ?? true} disabled={!feed || !!busy} onChange={e => configure({ sound: e.target.checked })} /><Volume2 size={14} />เสียงเตือน</label>
          <label>เตือนซ้ำทุก <select aria-label="ความถี่เตือนซ้ำ" value={feed?.settings.repeatMinutes || 10} disabled={!feed || !!busy} onChange={e => configure({ repeatMinutes: Number(e.target.value) })}>{[1, 5, 10, 15, 30, 60].map(n => <option key={n} value={n}>{n} นาที</option>)}</select></label>
        </section>
        <div className="reminder-transport-status"><span>{feed?.native.available ? "Windows พร้อมส่ง · ปิดแท็บเว็บได้เมื่อ Axercise ยังทำงาน" : "Windows: กำลังรอบริการเบื้องหลัง"}</span><span>{feed?.discordConfigured ? "Secretary เชื่อมห้องแจ้งเตือนแล้ว" : "Discord: เลือก Channel ID ของ Secretary ในตั้งค่า"}</span></div>
        {feed?.native.error && <p className="reminder-warning">{feed.native.error}</p>}
        {!feed?.native.available && browserPermission !== "granted" && <Button variant="secondary" size="sm" onClick={async () => { if ("Notification" in window) setBrowserPermission(await Notification.requestPermission()); }}>อนุญาตแจ้งเตือนจากเบราว์เซอร์สำรอง</Button>}
        <p className="reminder-explanation">เตือนก่อน 30 / 15 / 5 นาที และเมื่อถึงเวลา จากนั้นเตือนซ้ำจนกดรับทราบ · เลื่อนเตือนใช้เวลาร่วมกันบน Windows และ Discord · Windows อาจเก็บไว้ในศูนย์แจ้งเตือนเมื่อเปิดห้ามรบกวน</p>
        <div className="reminder-tools"><nav aria-label="กรองรายการเตือน">{([["active", "ถึงเวลา"], ["all", "กำหนดการทั้งหมด"], ["acknowledged", "รับทราบแล้ว"]] as const).map(([id, label]) => <button key={id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}>{label}</button>)}</nav><Button variant="ghost" size="sm" disabled={!!busy} onClick={() => refresh()}>{busy === "refresh" ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}โหลดใหม่</Button></div>
        {feed && Object.values(feed.sourceErrors).map(message => <div className="reminder-warning" key={message}>{message}</div>)}
        <div className="reminder-list">{!feed ? <div className="empty-state"><Loader2 className="spin" />กำลังโหลดกำหนดการ</div> : !list.length ? <div className="empty-state"><Check size={25} /><p>{tab === "active" ? "ยังไม่มีรายการถึงเวลา" : "ยังไม่มีรายการในหมวดนี้"}</p></div> : list.map(record => <article className={`reminder-card ${isDue(record) ? "is-due" : ""}`} key={record.id}><div className="reminder-card-heading"><span>{labels[record.kind] || "กำหนดการ"}</span><small>{dueLabel(record)}</small></div><h3>{record.title}</h3><p>{record.detail}</p><time>{new Date(record.dueAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" })}</time><div className="reminder-card-actions">{record.status === "acknowledged" ? <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => action(record.id, "resume")}><Bell size={14} />เปิดเตือนอีกครั้ง</Button> : <><Button size="sm" disabled={!!busy} onClick={() => action(record.id, "acknowledge")}><Check size={14} />รับทราบ · หยุดเตือน</Button><Button size="sm" variant="secondary" disabled={!!busy} onClick={() => action(record.id, "snooze")}><Clock3 size={14} />เลื่อน 10 นาที</Button></>}<a href={record.href} onClick={() => setOpen(false)}>เปิดรายการ<ExternalLink size={13} /></a></div></article>)}</div>
        <div className="reminder-center-footer"><p>รายการที่ไม่มีวันที่จะไม่สร้างการเตือน · To-do ที่เสร็จแล้ว การบ้านที่ส่งแล้ว และรายการเก็บย้อนหลังจะหยุดเตือน</p><Button variant="secondary" size="sm" disabled={!feed?.settings.enabled || !!busy} onClick={() => refresh(true)}>ทดสอบแจ้งเตือน</Button></div>
      </div>
    </Modal>
  </>;
}
