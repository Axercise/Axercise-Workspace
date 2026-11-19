import { NextResponse } from "next/server";
import { z } from "zod";
import { body, fail, localRequest, AppError } from "@/server/http";
import { publicSettings, updateConfig } from "@/server/store";
export const runtime = "nodejs";
export async function GET(req: Request) { try { localRequest(req); return NextResponse.json(publicSettings()); } catch (e) { return fail(e); } }
const schema = z.object({
  defaultProvider: z.enum(["openrouter", "openai-codex"]).optional(), defaultModel: z.string().trim().min(1).max(200).optional(),
  openrouterKey: z.string().trim().max(1000).optional(), notionToken: z.string().trim().max(1000).optional(), notionParentPageId: z.string().trim().max(500).optional(),
  googleClientId: z.string().trim().max(500).optional(), googleClientSecret: z.string().trim().max(1000).optional(), calendarId: z.string().trim().min(1).max(500).optional(),
  discord: z.array(z.object({ agent: z.enum(["hermes", "secretary", "developer"]), token: z.string().trim().max(1000).optional(), allowedUserId: z.string().regex(/^\d{10,25}$|^$/), channelId: z.string().regex(/^\d{10,25}$|^$/), reminderMinutes: z.number().int().min(1).max(1440) })).max(3).optional(),
}).strict();
export async function PATCH(req: Request) {
  try {
    localRequest(req); const v = schema.parse(await body(req, 12000));
    const result = updateConfig(c => {
      if (v.defaultProvider) c.defaultProvider = v.defaultProvider;
      if (v.defaultModel) c.defaultModel = v.defaultModel;
      if (v.openrouterKey) c.openrouterKey = v.openrouterKey;
      if (v.notionToken) c.notion.token = v.notionToken;
      if (v.notionParentPageId !== undefined && v.notionParentPageId !== c.notion.parentPageId) {
        if (c.notion.tasksId || c.notion.notesId) throw new AppError("ฐานข้อมูลถูกสร้างแล้ว กรุณาใช้หน้า Notion เดิมเพื่อให้ข้อมูลต่อเนื่อง");
        c.notion.parentPageId = v.notionParentPageId;
      }
      if (v.googleClientId && v.googleClientId !== c.google.clientId) { c.google.clientId = v.googleClientId; c.google.refreshToken = ""; c.google.accessToken = ""; c.google.expiresAt = 0; }
      if (v.googleClientSecret) c.google.clientSecret = v.googleClientSecret;
      if (v.calendarId) c.google.calendarId = v.calendarId;
      for (const d of v.discord || []) { const row = c.discord.find(a => a.agent === d.agent)!; if (d.token) row.token = d.token; row.allowedUserId = d.allowedUserId; row.channelId = d.channelId; row.reminderMinutes = d.reminderMinutes; }
    });
    void result; return NextResponse.json({ ...publicSettings(), restartRequired: true });
  } catch (e) { return fail(e); }
}
