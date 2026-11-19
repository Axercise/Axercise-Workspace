import { NextResponse } from "next/server";
import { z } from "zod";
import { body, fail, localRequest } from "@/server/http";
import { desktopFeedback } from "@/server/reminders";
export const dynamic = "force-dynamic";
const schema = z.object({ action: z.enum(["sent", "failed", "acknowledge", "snooze", "health"]), deliveryId: z.string().regex(/^[a-f0-9]{24}$/).optional(), error: z.string().max(300).optional(), available: z.boolean().optional() }).strict();
export async function POST(req: Request) { try { localRequest(req, true); return NextResponse.json(desktopFeedback(schema.parse(await body(req, 2000)))); } catch (e) { return fail(e); } }
