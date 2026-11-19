import { AGENTS, type AgentId } from "../lib/types";
import { config } from "./store";
import { AppError } from "./http";

export function agentById(id: string) { const agent = AGENTS.find(a => a.id === id); if (!agent) throw new AppError("ไม่พบ Agent", 404); return agent; }
export async function hermes(id: string, endpoint: string, init: RequestInit = {}) {
  const agent = agentById(id), c = config();
  try {
    return await fetch(`http://127.0.0.1:${agent.port}/${endpoint}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.gatewayKeys[agent.id]}` }, signal: init.signal || AbortSignal.timeout(15000), cache: "no-store" });
  } catch { throw new AppError("Hermes ยังไม่พร้อม เปิดด้วยคำสั่ง axercise และตรวจการเชื่อมต่อ AI ในการตั้งค่า", 503); }
}
export async function agentStatus() {
  return Promise.all(AGENTS.map(async a => { try { const r = await hermes(a.id, "v1/capabilities", { signal: AbortSignal.timeout(1500) }); return { ...a, ready: r.ok }; } catch { return { ...a, ready: false }; } }));
}
export async function delegate(from: string, target: string, prompt: string) {
  if (from !== "hermes" || target === "hermes") throw new AppError("มอบหมายงานได้จาก Hermes หลักไปยังผู้ช่วยเท่านั้น", 403);
  agentById(target);
  if (!prompt.trim() || prompt.length > 10000) throw new AppError("คำสั่งมอบหมายงานไม่ถูกต้อง");
  const created = await hermes(target, "api/sessions", { method: "POST", body: JSON.stringify({ title: `งานจาก Hermes · ${prompt.slice(0, 50)}`, source: "axercise" }) });
  if (!created.ok) throw new AppError("สร้าง Session ของผู้ช่วยไม่สำเร็จ", 502);
  const raw = await created.json(), session = raw.session || raw;
  const response = await hermes(target, `api/sessions/${encodeURIComponent(session.id)}/chat`, { method: "POST", body: JSON.stringify({ message: prompt }), signal: AbortSignal.timeout(300000) });
  if (!response.ok) throw new AppError("ผู้ช่วยทำงานไม่สำเร็จ กรุณาเปิด Session เพื่อตรวจสอบ", 502);
  return { agent: target as AgentId, sessionId: session.id, result: await response.json() };
}
