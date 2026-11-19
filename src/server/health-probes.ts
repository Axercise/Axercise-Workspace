import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AGENTS, type AgentId } from "../lib/types";
import { HEALTH_IDS, type HealthId, type HealthProblem, type HealthResult, type HealthStatus } from "../lib/health";
import { config, DATA, ROOT } from "./store";
import { AppError } from "./http";
import { hermes } from "./hermes";
import { probeCalendarAccess } from "./calendar";
import { reminderState } from "./reminders";
import { requestControl } from "../../bin/control.mjs";
const execute = promisify(execFile);
type Probe = { status: HealthStatus; problem: HealthProblem; message: string; details?: string[] };
type Gateway = { reachable: boolean; discordState: string; active: number };
class ProbeFailure extends Error { constructor(public statusCode: number) { super("Service request failed"); } }
const healthy = (message: string, details: string[] = []): Probe => ({ status: "healthy", problem: "none", message, details });
const missing = (message: string): Probe => ({ status: "unconfigured", problem: "setup", message });
function classify(error: unknown): Probe {
  const status = error instanceof ProbeFailure ? error.statusCode : error instanceof AppError ? error.status : 0;
  if (status === 401) return { status: "auth_required", problem: "auth", message: "บัญชีหรือ Token ใช้ไม่ได้แล้ว กรุณาเชื่อมใหม่" };
  if (status === 403 || status === 404) return { status: "degraded", problem: "permission", message: "บริการปฏิเสธสิทธิ์ หรือไม่พบรายการที่เชื่อมไว้ ตรวจการตั้งค่าอีกครั้ง" };
  if (status === 429) return { status: "degraded", problem: "rate_limit", message: "บริการจำกัดการเรียกชั่วคราว ระบบจะลองใหม่ให้อัตโนมัติ" };
  if (status >= 500) return { status: "degraded", problem: "service", message: "บริการปลายทางยังไม่พร้อม ระบบจะลองใหม่ให้อัตโนมัติ" };
  if (status === 409) return { status: "degraded", problem: "setup", message: "การตั้งค่าการเชื่อมต่อยังไม่ครบ กรุณาตรวจในตั้งค่า" };
  return { status: "offline", problem: "network", message: "ติดต่อบริการไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง" };
}
async function jsonRequest(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!response.ok) throw new ProbeFailure(response.status);
  return response.json();
}
export async function readGateway(agent: AgentId): Promise<Gateway> {
  try { const response = await hermes(agent, "health/detailed", { signal: AbortSignal.timeout(2500) }); if (!response.ok) throw new Error(); const data = await response.json(), work = data.readiness?.checks?.background_queues || {}; return { reachable: data.platform === "hermes-agent" && data.gateway_state === "running", discordState: typeof data.platforms?.discord?.state === "string" ? data.platforms.discord.state : "disconnected", active: Math.max(Number(data.active_agents) || 0, data.gateway_busy ? 1 : 0, Number(work.active_api_runs) || 0, Number(work.active_delegations) || 0, Number(work.process_completions) || 0) }; }
  catch { let active = 0; try { const data = JSON.parse(fs.readFileSync(path.join(DATA, "hermes", agent, "gateway_state.json"), "utf8")); process.kill(Number(data.pid), 0); active = Math.max(0, Number(data.active_agents) || 0); } catch {} return { reachable: false, discordState: "disconnected", active }; }
}
async function codexProbe(agent: AgentId): Promise<Probe> {
  try {
    const { stdout } = await execute(process.execPath, [path.join(ROOT, "bin", "check-provider.mjs"), agent], { cwd: ROOT, windowsHide: true, timeout: 38000, maxBuffer: 8000 });
    const result = JSON.parse(stdout);
    if (result.status === "healthy" && result.code === "ok") return healthy("เชื่อมบัญชี ChatGPT ได้", ["ตรวจบัญชีผ่านรายการโมเดล โดยไม่ส่งข้อความเข้า AI"]);
    if (result.status === "unconfigured") return missing("ยังไม่ได้เชื่อมบัญชี ChatGPT สำหรับ Agent นี้");
    if (result.status === "auth_required") return { status: "auth_required", problem: "auth", message: "บัญชี ChatGPT ต้องล็อกอินใหม่ ใช้คำสั่งเชื่อมบัญชีของ Agent นี้" };
    if (result.code === "rate_limit") return classify(new ProbeFailure(429));
    if (result.code === "permission") return { status: "degraded", problem: "permission", message: "ผู้ให้บริการปฏิเสธการตรวจบัญชี กรุณาลองอีกครั้งหรือตรวจสิทธิ์บัญชี" };
    if (result.code === "network") return classify(new Error());
    if (result.code === "timeout") return { status: "degraded", problem: "service", message: "ตัวตรวจบัญชี AI ใช้เวลานานกว่ากำหนด ระบบจะลองใหม่ให้อัตโนมัติ" };
    return { status: "degraded", problem: "service", message: "ตรวจบัญชี AI ไม่สำเร็จ กรุณาลองอีกครั้งและตรวจการติดตั้ง Hermes" };
  } catch { return { status: "degraded", problem: "service", message: "ตัวตรวจบัญชี AI ยังไม่พร้อม กรุณาลองอีกครั้ง" }; }
}
async function openrouterProbe(): Promise<Probe> {
  const key = config().openrouterKey;
  if (!key) return missing("ยังไม่ได้ตั้ง OpenRouter API Key");
  try { await jsonRequest("https://openrouter.ai/api/v1/key", { Authorization: `Bearer ${key}` }); return healthy("OpenRouter ยอมรับ API Key", ["การตรวจนี้ไม่เรียกโมเดลและไม่ใช้โทเคนสนทนา"]); } catch (error) { return classify(error); }
}
async function notionProbe(): Promise<Probe> {
  const n = config().notion;
  if (!n.token) return missing("ยังไม่ได้เชื่อม Notion");
  const headers = { Authorization: `Bearer ${n.token}`, "Notion-Version": "2025-09-03" };
  try {
    await jsonRequest("https://api.notion.com/v1/users/me", headers);
    const definitions = [{ name: "Tasks", id: n.tasksId, columns: ["Name", "Details", "Deadline", "Important", "Urgent", "Status"] }, { name: "Brain Dump", id: n.notesId, columns: ["Name", "Content", "Tags"] }, ...(n.learningId ? [{ name: "การเรียน", id: n.learningId, columns: [] }] : [])];
    const results = await Promise.all(definitions.map(async item => {
      if (!item.id) return { ...missing(`${item.name}: ยังไม่ตั้งฐานข้อมูล`), label: item.name };
      try { const source = await jsonRequest(`https://api.notion.com/v1/data_sources/${encodeURIComponent(item.id)}`, headers); const absent = item.columns.filter(name => !source.properties?.[name]); return { ...(source.archived || source.in_trash ? { status: "degraded", problem: "permission", message: `${item.name}: ฐานข้อมูลอยู่ในถังขยะ` } as Probe : absent.length ? { status: "degraded", problem: "setup", message: `${item.name}: ขาดคอลัมน์ ${absent.join(", ")}` } as Probe : healthy(`${item.name}: พร้อม`)), label: item.name }; }
      catch (error) { return { ...classify(error), label: item.name }; }
    }));
    const failed = results.find(item => item.status !== "healthy");
    const details = results.map(item => `${item.label}: ${item.status === "healthy" ? "พร้อม" : item.message}`);
    return failed ? { ...failed, status: failed.status === "unconfigured" ? "degraded" : failed.status, details } : healthy("Token และฐานข้อมูล Notion ใช้งานได้", details);
  } catch (error) { return classify(error); }
}
async function calendarProbe(): Promise<Probe> {
  if (!config().google.refreshToken) return missing("ยังไม่ได้เชื่อมบัญชี Google Calendar");
  try { await probeCalendarAccess(); return healthy("อ่านปฏิทินที่เลือกได้", ["ต่ออายุ access token อัตโนมัติเมื่อจำเป็น"]); } catch (error) { return classify(error); }
}
export function channelPermissions(guildId: string, botId: string, roles: { id: string; permissions: string }[], memberRoleIds: string[], overwrites: { id: string; type: number; allow: string; deny: string }[]) {
  let permissions = BigInt(roles.find(role => role.id === guildId)?.permissions || "0");
  for (const role of roles) if (memberRoleIds.includes(role.id)) permissions |= BigInt(role.permissions);
  if (permissions & 8n) return (1n << 63n) - 1n;
  const everyone = overwrites.find(overwrite => overwrite.type === 0 && overwrite.id === guildId);
  if (everyone) permissions = (permissions & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
  let allow = 0n, deny = 0n;
  for (const overwrite of overwrites) if (overwrite.type === 0 && memberRoleIds.includes(overwrite.id)) { allow |= BigInt(overwrite.allow); deny |= BigInt(overwrite.deny); }
  permissions = (permissions & ~deny) | allow;
  const member = overwrites.find(overwrite => overwrite.type === 1 && overwrite.id === botId);
  if (member) permissions = (permissions & ~BigInt(member.deny)) | BigInt(member.allow);
  return permissions;
}
async function discordProbe(agent: AgentId, gateway: Gateway, context: Promise<any>): Promise<Probe> {
  const bot = config().discord.find(item => item.agent === agent);
  if (!bot?.token || !bot.allowedUserId) return missing("ยังไม่ตั้ง Bot Token หรือบัญชีผู้สั่งงาน");
  const headers = { Authorization: `Bot ${bot.token}` };
  const get = (endpoint: string) => jsonRequest(`https://discord.com/api/v10/${endpoint}`, headers);
  try {
    const [application, guilds, channel] = await Promise.all([get("oauth2/applications/@me"), get("users/@me/guilds"), context]);
    if (!Array.isArray(guilds) || !guilds.length || (channel?.guild_id && !guilds.some((guild: { id: string }) => guild.id === channel.guild_id))) return { status: "degraded", problem: "permission", message: "บอทยังไม่ได้อยู่ในเซิร์ฟเวอร์ที่ใช้แจ้งเตือน ตรวจการเชิญบอทเข้าเซิร์ฟเวอร์" };
    if (!(Number(application.flags) & ((1 << 18) | (1 << 19)))) return { status: "degraded", problem: "permission", message: "ยังไม่ได้เปิด Message Content Intent ใน Discord Developer Portal" };
    const details = ["Bot Token ใช้ได้", "พบเซิร์ฟเวอร์ที่เชื่อมไว้", "จำกัดบัญชีผู้สั่งงานแล้ว"];
    if (agent === "secretary") {
      if (!bot.channelId) return { status: "degraded", problem: "setup", message: "Secretary ยังไม่มีห้องปลายทางสำหรับแจ้งเตือน", details };
      if (!channel) return { status: "degraded", problem: "permission", message: "Secretary เข้าถึงห้องแจ้งเตือนไม่ได้ ตรวจ Channel ID และสิทธิ์ของห้อง", details };
      if (![0, 5].includes(channel.type)) return { status: "degraded", problem: "setup", message: "เลือก Text Channel สำหรับส่งแจ้งเตือน", details };
      const botId = application.bot?.id || application.id;
      const [roles, member] = await Promise.all([get(`guilds/${channel.guild_id}/roles`), get(`guilds/${channel.guild_id}/members/${botId}`)]);
      const permissions = channelPermissions(channel.guild_id, botId, roles, member.roles || [], channel.permission_overwrites || []);
      const required = [[10, "ดูห้อง"], [11, "ส่งข้อความ"], [16, "อ่านประวัติ"], [6, "เพิ่ม Reaction"]] as const;
      const absent = required.filter(([bit]) => !(permissions & (1n << BigInt(bit)))).map(([, name]) => name);
      if (absent.length || Date.parse(member.communication_disabled_until || "") > Date.now()) return { status: "degraded", problem: "permission", message: `ห้องแจ้งเตือนยังขาดสิทธิ์: ${absent.join(", ") || "Bot ถูก Timeout"}`, details };
      details.push("ห้องแจ้งเตือน: อ่าน/ส่งข้อความและใช้ Reaction ได้ตามสิทธิ์");
    }
    if (!gateway.reachable || gateway.discordState !== "connected") return { status: "degraded", problem: "gateway", message: "Token ใช้ได้ แต่ Gateway Discord ยังไม่เชื่อม กดเริ่มการเชื่อมต่อใหม่ได้", details };
    return healthy("บอทเชื่อม Gateway Discord แล้ว", details);
  } catch (error) { return classify(error); }
}
async function workspaceProbe(): Promise<Probe> {
  try {
    const controller = await requestControl("status", config().serviceToken);
    if (!controller || process.env.AXERCISE_MANAGED !== "1" || controller.instanceId !== process.env.AXERCISE_INSTANCE_ID) return { status: "degraded", problem: "gateway", message: "เว็บยังไม่ได้เชื่อมบริการเบื้องหลังของชุดนี้ เปิดระบบด้วยคำสั่ง axercise" };
    const native = reminderState().native;
    if (!native.available || native.updatedAt < Date.now() - 120000) return { status: "degraded", problem: "service", message: "บริการทำงานอยู่ แต่การแจ้งเตือน Windows ยังไม่พร้อม ตรวจระบบแจ้งเตือนอีกครั้ง", details: ["ตัวจัดการเบื้องหลังตอบกลับแล้ว"] };
    return healthy("เว็บและบริการเบื้องหลังทำงานร่วมกัน", ["ระบบแจ้งเตือน Windows ส่ง heartbeat ล่าสุดแล้ว"]);
  } catch { return { status: "degraded", problem: "gateway", message: "ติดต่อบริการเบื้องหลังไม่ได้ ใช้ axercise status หรือลอง axercise restart" }; }
}
export async function probeConnections(id?: HealthId): Promise<HealthResult[]> {
  const c = config(), selected = id ? [id] : [...HEALTH_IDS];
  // Each Hermes auth helper loads Python dependencies. Keep only one in memory
  // while the other HTTP and local Gateway checks continue independently.
  let providerQueue: Promise<unknown> = Promise.resolve();
  const codex = (agent: AgentId) => { const pending = providerQueue.then(() => codexProbe(agent)); providerQueue = pending.catch(() => undefined); return pending; };
  const gateways = new Map<AgentId, Promise<Gateway>>();
  const gateway = (agent: AgentId) => { if (!gateways.has(agent)) gateways.set(agent, readGateway(agent)); return gateways.get(agent)!; };
  let openrouter: Promise<Probe> | undefined, channel: Promise<any> | undefined;
  const router = () => openrouter ||= openrouterProbe();
  const discordContext = () => channel ||= (async () => { const bot = c.discord.find(item => item.agent === "secretary"); if (!bot?.token || !bot.channelId) return undefined; try { return await jsonRequest(`https://discord.com/api/v10/channels/${encodeURIComponent(bot.channelId)}`, { Authorization: `Bot ${bot.token}` }); } catch { return undefined; } })();
  return Promise.all(selected.map(async serviceId => {
    const start = Date.now(); let result: Probe, name: string, group: HealthResult["group"];
    if (serviceId === "workspace") { name = "Axercise บนเครื่อง"; group = "workspace"; result = await workspaceProbe(); }
    else if (serviceId === "notion") { name = "Notion"; group = "notion"; result = await notionProbe(); }
    else if (serviceId === "calendar") { name = "Google Calendar"; group = "calendar"; result = await calendarProbe(); }
    else if (serviceId === "openrouter") { name = "OpenRouter"; group = "ai"; result = await router(); }
    else {
      const agent = serviceId.split(":")[1] as AgentId, profile = AGENTS.find(item => item.id === agent)!;
      if (serviceId.startsWith("discord:")) { name = `Discord · ${profile.name}`; group = "discord"; result = await discordProbe(agent, await gateway(agent), discordContext()); }
      else {
        name = `AI · ${profile.name}`; group = "ai";
        const [provider, runtime] = await Promise.all([c.defaultProvider === "openrouter" ? router() : codex(agent), gateway(agent)]);
        result = provider.status !== "healthy" ? provider : !runtime.reachable ? { status: "degraded", problem: "gateway", message: "บัญชี AI ผ่านการตรวจ แต่ Gateway ของ Agent ยังไม่พร้อม กดเริ่ม Agent ใหม่ได้" } : healthy("Gateway และบัญชี AI ผ่านการตรวจ", [...(provider.details || []), `โมเดลเริ่มต้น: ${c.defaultModel}`]);
      }
    }
    return { id: serviceId, name, group, ...result, ...(serviceId.startsWith("ai:") ? { provider: c.defaultProvider as "openai-codex" | "openrouter" } : {}), details: result.details || [], checkedAt: Date.now(), latencyMs: Date.now() - start, ...(serviceId === "openrouter" && c.defaultProvider !== "openrouter" ? { optional: true } : {}) };
  }));
}
