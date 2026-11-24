import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { AGENTS, type AgentId, type PublicSettings } from "../lib/types";

export const ROOT = process.env.AXERCISE_ROOT || process.cwd();
export const DATA = process.env.AXERCISE_DATA_DIR || path.join(ROOT, ".axercise");
export type Config = {
  version: 1; setupComplete?: boolean; approvalMode?: "manual" | "off"; hermesPath?: string; serviceToken: string; gatewayKeys: Record<AgentId, string>;
  timezone: string; defaultProvider: string; defaultModel: string; openrouterKey: string;
  notion: { token: string; parentPageId: string; tasksId: string; notesId: string; learningId?: string };
  google: { clientId: string; clientSecret: string; refreshToken: string; accessToken: string; expiresAt: number; calendarId: string };
  discord: { agent: AgentId; token: string; allowedUserId: string; channelId: string; reminderMinutes: number }[];
  notifications: Record<string, number>;
};
export function atomicJSON(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}
export function config(): Config {
  const file = path.join(DATA, "config.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const value: Config = {
    version: 1, setupComplete: false, approvalMode: "manual", serviceToken: randomBytes(32).toString("hex"),
    gatewayKeys: Object.fromEntries(AGENTS.map(a => [a.id, randomBytes(32).toString("hex")])) as Record<AgentId, string>,
    timezone: "Asia/Bangkok", defaultProvider: "openrouter", defaultModel: "openrouter/free", openrouterKey: "",
    notion: { token: "", parentPageId: "", tasksId: "", notesId: "" },
    google: { clientId: "", clientSecret: "", refreshToken: "", accessToken: "", expiresAt: 0, calendarId: "primary" },
    discord: AGENTS.map(a => ({ agent: a.id, token: "", allowedUserId: "", channelId: "", reminderMinutes: 15 })), notifications: {},
  };
  atomicJSON(file, value); return value;
}
export function updateConfig(fn: (value: Config) => void) { const value = config(); fn(value); atomicJSON(path.join(DATA, "config.json"), value); return value; }
export function publicSettings(): PublicSettings {
  const c = config();
  return {
    timezone: c.timezone, defaultProvider: c.defaultProvider, defaultModel: c.defaultModel, openrouterConfigured: !!c.openrouterKey,
    notion: { configured: !!c.notion.token, parentPageId: c.notion.parentPageId, tasksReady: !!c.notion.tasksId, notesReady: !!c.notion.notesId },
    google: { configured: !!(c.google.clientId && c.google.clientSecret), connected: !!c.google.refreshToken, clientId: c.google.clientId, calendarId: c.google.calendarId },
    discord: c.discord.map(({ token, ...d }) => ({ ...d, tokenConfigured: !!token })),
  };
}
