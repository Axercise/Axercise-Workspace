"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Power, RefreshCw } from "lucide-react";
import { api } from "@/lib/client";
import type { StartupStatus } from "@/lib/startup";
import { Button } from "./ui/button";

export function StartupSettings() {
  const [status, setStatus] = useState<StartupStatus>(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function load() { try { setStatus(await api<StartupStatus>("/api/startup")); setError(""); } catch (cause) { setError((cause as Error).message); } }
  useEffect(() => { void load(); }, []);
  async function toggle(enabled: boolean) {
    setBusy(true); setError("");
    try { setStatus(await api<StartupStatus>("/api/startup", { method: "PATCH", body: JSON.stringify({ enabled }) })); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="setup-box startup-settings" aria-label="เปิดพร้อม Windows">
    <div className="startup-settings-heading"><div><Power size={17} /><strong>เปิดพร้อม Windows</strong></div>{status?.enabled && <span className="badge connected"><CheckCircle2 size={12} />เปิดอยู่</span>}</div>
    <p>เริ่มเว็บ บอท Discord และการแจ้งเตือนหลังล็อกอินบัญชี Windows ของคุณ ทำงานเบื้องหลังโดยไม่เปิดหน้าเว็บหรือหน้าต่าง CMD</p>
    <label className="startup-settings-toggle"><input type="checkbox" role="switch" checked={status?.enabled ?? false} disabled={busy || !status?.supported} onChange={event => toggle(event.target.checked)} /><span>เริ่ม Axercise อัตโนมัติเมื่อเข้าสู่ Windows</span>{busy && <Loader2 size={16} className="spin" />}</label>
    {!status && !error && <p className="small muted"><Loader2 size={13} className="spin" /> กำลังตรวจการตั้งค่า Windows</p>}
    {status?.message && <p className="small muted">{status.message}</p>}
    {error && <div className="form-alert error" role="alert">{error}<Button size="sm" variant="ghost" disabled={busy} onClick={load}><RefreshCw size={14} />ตรวจอีกครั้ง</Button></div>}
    <p className="small muted">ตัวเลือกนี้บันทึกทันที · ปิดตัวเลือกเพื่อยกเลิกการเปิดครั้งถัดไป บริการที่กำลังทำงานหยุดได้ด้วย <code>axercise stop</code></p>
  </section>;
}
