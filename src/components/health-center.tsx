"use client";
import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Copy, ExternalLink, History, Loader2, MinusCircle, RefreshCw, Settings2 } from "lucide-react";
import { api } from "@/lib/client";
import { healthProblem, type HealthConnection, type HealthFeed, type HealthId } from "@/lib/health";
import { Modal } from "./ui/dialog";
import { Button } from "./ui/button";
import { Settings } from "./settings";
import "./health-center.css";
const statusLabels = { healthy: "พร้อม", degraded: "ต้องดูแล", offline: "ติดต่อไม่ได้", auth_required: "เชื่อมบัญชีใหม่", unconfigured: "ยังไม่ตั้งค่า" };
function time(value?: number) { return value ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "ยังไม่มีผลตรวจ"; }
function StatusIcon({ connection }: { connection: HealthConnection }) { return connection.status === "healthy" ? <CheckCircle2 size={19} /> : connection.status === "unconfigured" ? <MinusCircle size={19} /> : <AlertTriangle size={19} />; }

export function HealthCenter() {
  const [feed, setFeed] = useState<HealthFeed>(), [open, setOpen] = useState(false), [busy, setBusy] = useState(""), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"all" | "issues">("all"), [settingsOpen, setSettingsOpen] = useState(false), [settingsTab, setSettingsTab] = useState<"AI" | "Notion" | "Calendar" | "Discord" | "Workspace">("Workspace"), [loginAgent, setLoginAgent] = useState("");
  const load = useCallback(async () => { try { const next = await api<HealthFeed>("/api/health"); setFeed(next); setError(""); return next; } catch (cause) { const text = (cause as Error).message; setError(cause instanceof TypeError || cause instanceof SyntaxError ? "ติดต่อศูนย์สถานะไม่ได้ ระบบอาจกำลังเริ่มใหม่ กำลังรอลองเชื่อมอีกครั้ง" : text); } }, []);
  useEffect(() => { if (new URLSearchParams(location.search).has("health")) setOpen(true); void load(); const timer = setInterval(load, 20000); window.addEventListener("focus", load); return () => { clearInterval(timer); window.removeEventListener("focus", load); }; }, [load]);
  const check = useCallback(async (id?: HealthId) => {
    setBusy(id || "all"); setError(""); setMessage("");
    try { setFeed(await api<HealthFeed>("/api/health", { method: "POST", body: JSON.stringify({ action: "check", ...(id ? { id } : {}) }) })); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(""); }
  }, []);
  useEffect(() => { if (open) void load().then(next => { if (next?.stale && !next.checking) void check(); }); }, [open, load, check]);
  async function preferences(settings: Partial<HealthFeed["settings"]>) {
    setBusy("settings"); setError("");
    try { setFeed(await api<HealthFeed>("/api/health", { method: "POST", body: JSON.stringify({ action: "settings", settings }) })); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(""); }
  }
  function showSettings(tab: typeof settingsTab) { setSettingsTab(tab); setOpen(false); setSettingsOpen(true); }
  async function repair(connection: HealthConnection) {
    if (connection.problem === "gateway" && /^(ai|discord):/.test(connection.id)) {
      setBusy(connection.id); setError(""); setMessage("");
      try { const result = await api<{ message: string }>("/api/health", { method: "POST", body: JSON.stringify({ action: "repair", id: connection.id }) }); setMessage(result.message); }
      catch (cause) { setError((cause as Error).message); } finally { setBusy(""); }
      return;
    }
    if (connection.provider !== "openrouter" && connection.id.startsWith("ai:") && ["auth", "setup"].includes(connection.problem)) { setOpen(false); setLoginAgent(connection.id.split(":")[1]); return; }
    if (connection.id === "calendar" && connection.status === "auth_required") {
      setBusy("calendar"); setError("");
      try { const result = await api<{ url: string }>("/api/calendar/auth", { method: "POST", body: "{}" }); window.location.assign(result.url); }
      catch (cause) { setError((cause as Error).message); setBusy(""); }
      return;
    }
    showSettings(connection.group === "ai" ? "AI" : connection.group === "notion" ? "Notion" : connection.group === "calendar" ? "Calendar" : connection.group === "discord" ? "Discord" : "Workspace");
  }
  function repairLabel(connection: HealthConnection) {
    if (connection.problem === "gateway" && /^(ai|discord):/.test(connection.id)) return "เริ่มการเชื่อมต่อใหม่";
    if (connection.provider !== "openrouter" && connection.id.startsWith("ai:") && ["auth", "setup"].includes(connection.problem)) return "เชื่อมบัญชีใหม่";
    if (connection.id === "calendar" && connection.status === "auth_required") return "เชื่อม Google ใหม่";
    return "เปิดการตั้งค่า";
  }
  const issues = feed?.services.filter(item => healthProblem(item.status)) || [], configured = feed?.services.filter(item => item.status !== "unconfigured") || [], healthy = configured.filter(item => item.status === "healthy" && !feed?.repairing?.includes(item.id.split(":")[1] || "")).length;
  const services = feed?.services.filter(item => filter === "all" || healthProblem(item.status)) || [];
  const working = !!busy || !!feed?.checking;
  const restarting = (connection: HealthConnection) => /^(ai|discord):/.test(connection.id) && !!feed?.repairing?.includes(connection.id.split(":")[1]);
  return <>
    <button className={`health-launcher ${issues.length ? "needs-attention" : ""}`} aria-label={`ศูนย์สถานะระบบ${issues.length ? ` · ต้องดูแล ${issues.length} รายการ` : ""}`} title="ศูนย์สถานะระบบ" onClick={() => setOpen(true)}><Activity size={21} />{issues.length > 0 && <span>{issues.length}</span>}</button>
    <Modal open={open} onOpenChange={setOpen} title="ศูนย์สถานะระบบ" description="ตรวจการเชื่อมต่อจริง และจัดการส่วนที่ต้องดูแลได้จากที่เดียว" className="health-center-modal">
      <div className="health-center-body">
        <section className="health-summary"><div><span className="health-eyebrow">WORKSPACE CONNECTIONS</span><h3>{!feed ? "กำลังโหลดสถานะ" : feed.repairing?.length ? "กำลังเชื่อม Agent ใหม่" : issues.length ? `มี ${issues.length} รายการที่ต้องดูแล` : "บริการที่เชื่อมไว้พร้อมใช้งาน"}</h3><p>{healthy}/{configured.length} บริการที่ตั้งค่าไว้พร้อม · ตรวจครบชุดล่าสุด {time(feed?.checkedAt)}</p></div><Button variant="secondary" disabled={working} onClick={() => check()}>{working ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}{working ? "กำลังตรวจ" : "ตรวจทั้งหมดอีกครั้ง"}</Button></section>
        {error && <div className="form-alert error" role="alert">{error}</div>}{message && <div className="form-alert success" role="status">{message}</div>}
        {feed?.stale && <p className="health-notice">ผลตรวจอาจยังไม่เป็นปัจจุบัน กดตรวจอีกครั้งเพื่อดูสถานะล่าสุด</p>}
        <section className="health-preferences" aria-label="การแจ้งสถานะการเชื่อมต่อ"><label><input type="checkbox" checked={feed?.settings.alertsEnabled ?? true} disabled={!feed || !!busy} onChange={event => preferences({ alertsEnabled: event.target.checked })} />แจ้งเมื่อมีปัญหาและกลับมาพร้อม</label><label><input type="checkbox" checked={feed?.settings.desktop ?? true} disabled={!feed || !!busy} onChange={event => preferences({ desktop: event.target.checked })} />Windows</label><label><input type="checkbox" checked={feed?.settings.discord ?? true} disabled={!feed || !!busy} onChange={event => preferences({ discord: event.target.checked })} />Discord</label><p>ตรวจอัตโนมัติประมาณทุก 2 นาทีขณะ Axercise ทำงาน · รวมปัญหาที่พบพร้อมกันเป็นข้อความเดียว{feed && !feed.discordConfigured ? " · เลือกห้องแจ้งเตือนของ Secretary ในตั้งค่าเพื่อรับผ่าน Discord" : ""}</p></section>
        {!!feed?.failedDeliveries && <p className="health-notice">มีการแจ้งสถานะที่ยังส่งไม่สำเร็จ ระบบกำลังรอลองใหม่</p>}
        <nav className="health-filters" aria-label="กรองสถานะ"><button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>ทั้งหมด</button><button className={filter === "issues" ? "selected" : ""} onClick={() => setFilter("issues")}>ต้องดูแล ({issues.length})</button></nav>
        <div className="health-grid">{!feed || !feed.services.length ? <div className="empty-state"><Loader2 className="spin" /><p>กำลังรอผลตรวจการเชื่อมต่อ</p></div> : !services.length ? <div className="empty-state"><CheckCircle2 /><p>ยังไม่มีการเชื่อมต่อที่ต้องดูแล</p></div> : services.map(connection => <article key={connection.id} className={`health-card ${connection.status}`}><div className="health-card-heading"><h3><StatusIcon connection={connection} />{connection.name}</h3><span className="health-status-label">{restarting(connection) ? "กำลังเชื่อมใหม่" : statusLabels[connection.status]}</span></div><p>{restarting(connection) ? "กำลังรอให้ Gateway เริ่มทำงานและเชื่อม Discord อีกครั้ง ระบบจะตรวจสดเมื่อพร้อม" : connection.message}</p>{connection.details.length > 0 && <ul>{connection.details.map(detail => <li key={detail}>{detail}</li>)}</ul>}<footer><time>ตรวจ {time(connection.checkedAt)}</time>{connection.lastSuccessAt && connection.status !== "healthy" && <span>พร้อมล่าสุด {time(connection.lastSuccessAt)}</span>}</footer><div className="health-card-actions"><Button size="sm" variant="ghost" disabled={working} onClick={() => check(connection.id)}><RefreshCw size={13} />ตรวจอีกครั้ง</Button>{connection.status !== "healthy" && <Button size="sm" variant="secondary" disabled={working || restarting(connection)} onClick={() => repair(connection)}>{connection.problem === "gateway" ? <RefreshCw size={13} /> : <Settings2 size={13} />}{repairLabel(connection)}</Button>}</div></article>)}</div>
        <section className="health-history"><h3><History size={17} />ประวัติการเชื่อมต่อ</h3>{!feed?.events.length ? <p className="muted">ยังไม่มีเหตุขัดข้องหรือการกลับมาเชื่อมต่อที่บันทึกไว้</p> : feed.events.slice(0, 16).map(event => <div key={event.id} className="health-history-event">{event.kind === "recovered" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}<div><strong>{event.name} · {event.kind === "recovered" ? "กลับมาพร้อม" : "มีปัญหา"}</strong><p>{event.message}</p></div><time>{time(event.at)}</time></div>)}</section>
      </div>
    </Modal>
    <Settings open={settingsOpen} initialTab={settingsTab} onOpenChange={value => { setSettingsOpen(value); if (!value) { setOpen(true); void check(); } }} onSaved={() => { void check(); }} />
    <Modal open={!!loginAgent} onOpenChange={value => { if (!value) { setLoginAgent(""); setOpen(true); } }} title="เชื่อมบัญชี AI ใหม่" description="ล็อกอินผ่าน Hermes บนเครื่องนี้" className="health-login-modal"><div className="editor-body"><p>เปิด Terminal แล้วใช้คำสั่งนี้เพื่อล็อกอินบัญชีของ {loginAgent || "Agent"}</p><button className="command-copy" onClick={() => navigator.clipboard.writeText(`axercise login ${loginAgent}`).then(() => setMessage("คัดลอกคำสั่งแล้ว"))}><code>axercise login {loginAgent}</code><Copy size={16} /></button>{message === "คัดลอกคำสั่งแล้ว" && <p role="status">{message}</p>}<p>คำสั่งนี้จะหยุด Axercise ชั่วคราวเพื่อเชื่อมบัญชี เมื่อเสร็จแล้วพิมพ์ <code>axercise</code> เพื่อเปิดบริการกลับ จากนั้นกดตรวจสถานะอีกครั้ง</p><a className="text-link" href="https://auth.openai.com/codex/device" target="_blank" rel="noreferrer">หน้าเข้าสู่บัญชีสำหรับรหัสที่ Hermes แสดง <ExternalLink size={13} /></a></div></Modal>
  </>;
}
