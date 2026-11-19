import { after, NextResponse } from "next/server";
import { z } from "zod";
import { body, fail, localRequest } from "@/server/http";
import { addTestReminder, reminderFeed, runReminderTick, updateReminder, updateReminderSettings, syncDraftReminders, dispatchDiscordReminders } from "@/server/reminders";
export const dynamic = "force-dynamic";
export async function GET(req: Request) { try { localRequest(req); return NextResponse.json(reminderFeed()); } catch (e) { return fail(e); } }
const actionSchema = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/), action: z.enum(["acknowledge", "snooze", "resume"]), minutes: z.number().int().min(1).max(1440).optional() }).strict();
const settingsSchema = z.object({ enabled: z.boolean().optional(), desktop: z.boolean().optional(), discord: z.boolean().optional(), sound: z.boolean().optional(), repeatMinutes: z.number().int().min(1).max(1440).optional() }).strict();
export async function PATCH(req: Request) { try { localRequest(req); const value = actionSchema.parse(await body(req, 2000)); updateReminder(value.id, value.action, value.minutes); return NextResponse.json(reminderFeed()); } catch (e) { return fail(e); } }
export async function POST(req: Request) {
  try {
    localRequest(req); const value = z.discriminatedUnion("action", [z.object({ action: z.literal("refresh") }).strict(), z.object({ action: z.literal("test") }).strict(), z.object({ action: z.literal("settings"), settings: settingsSchema }).strict(), z.object({ action: z.literal("drafts"), clientId: z.uuid(), drafts: z.array(z.object({ id: z.string().min(1).max(100), title: z.string().min(1).max(300), deadline: z.union([z.iso.date(), z.iso.datetime({ offset: true })]) }).strict()).max(1000) }).strict()]).parse(await body(req, 300000));
    if (value.action === "drafts") return NextResponse.json(syncDraftReminders(value.clientId, value.drafts));
    if (value.action === "settings") return NextResponse.json(updateReminderSettings(value.settings));
    if (value.action === "test") addTestReminder();
    await runReminderTick(value.action === "refresh");
    after(() => dispatchDiscordReminders());
    return NextResponse.json(reminderFeed());
  } catch (e) { return fail(e); }
}
