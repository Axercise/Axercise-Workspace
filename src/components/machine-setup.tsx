"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import type { setupStatus } from "@/server/setup";
import { Settings } from "./settings";
import { Button } from "./ui/button";
import "./machine-setup.css";

type Status = ReturnType<typeof setupStatus>;
export function MachineSetup({ initial }: { initial: Status }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [directory, setDirectory] = useState(initial.runtime);
  const [mode, setMode] = useState(initial.approvalMode);
  const [tab, setTab] = useState<"AI" | "Notion">();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function refresh() {
    try { setStatus(await api<Status>("/api/setup")); } catch (e) { setMessage((e as Error).message); }
  }
  async function submit(action: "runtime" | "finish") {
    setBusy(true); setMessage("");
    try {
      const result = await api<Status>("/api/setup", { method: "POST", body: JSON.stringify(action === "finish" ? { action } : { action, directory, approvalMode: mode }) });
      setStatus(result);
      if (action === "finish") router.push("/");
      else { setDirectory(result.runtime); setMessage("บันทึกตำแหน่ง Hermes และสิทธิ์แล้ว"); }
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  return <main className="machine-setup"><article>
    <Link className="text-link" href="/docs">คู่มือติดตั้งและใช้งาน ↗</Link>
    <h1>ตั้งค่า Workspace ของคุณ</h1><p>เชื่อมบัญชีบนเครื่องนี้เพื่อเริ่มใช้แชท งาน และ Brain Dump</p>
    <section><h2>Hermes บนเครื่อง</h2>
      <label className="field"><span>โฟลเดอร์ hermes-agent</span><input value={directory} onChange={e => setDirectory(e.target.value)} placeholder="เว้นว่างเพื่อค้นหาตำแหน่งมาตรฐาน" /></label>
      <label className="field"><span>การรันคำสั่งบน Windows</span><select value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="manual">ถามก่อนรันคำสั่งที่ Hermes กำหนดให้ยืนยัน</option><option value="off">อนุญาตให้รันโดยไม่ถามอีก</option></select></label>
      <Button disabled={busy} variant="secondary" onClick={() => submit("runtime")}>ตรวจหาและเชื่อม Hermes</Button>
    </section>
    {(["AI", "Notion"] as const).map(name => <section key={name}><h2>{name === "AI" ? "บัญชี AI" : "ฐานข้อมูล Notion"}</h2><p>{name === "AI" ? "เลือก ChatGPT หรือ OpenRouter หนึ่งบัญชี" : "เชื่อมหน้าที่จะใช้เก็บ Tasks และ Brain Dump"}</p>
      <Button variant="secondary" onClick={() => setTab(name)}>{(name === "AI" ? status.ai : status.notion) ? "จัดการ" : "เชื่อม"} {name}</Button></section>)}
    <p>Google Calendar และ Discord เชื่อมภายหลังได้ในตั้งค่า</p>
    <Button disabled={busy} onClick={() => submit("finish")}>{busy ? "กำลังตรวจสอบ…" : "ตรวจการเชื่อมต่อและเข้า Workspace"}</Button>
    {status.complete && <Link className="text-link" href="/">กลับ Workspace</Link>}
    <p role="status">{message}</p>
    <Settings open={!!tab} initialTab={tab} onOpenChange={open => { if (!open) { setTab(undefined); void refresh(); } }} onSaved={refresh} />
  </article></main>;
}
