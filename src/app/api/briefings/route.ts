import { after, NextResponse } from "next/server";
import { z } from "zod";
import { body, fail, localRequest } from "@/server/http";
import { briefingFeed, dispatchBriefingDiscord, generateBriefing, markBriefingRead, queueBriefingDiscord, readBriefing, updateBriefingSettings } from "@/server/briefings";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), period: z.enum(["morning", "evening"]) }).strict(),
  z.object({ action: z.literal("settings"), settings: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ action: z.enum(["read", "send"]), id: z.string().regex(/^[a-f0-9]{24}$/) }).strict(),
]);
export async function GET(req: Request) { try { localRequest(req); const q = new URL(req.url).searchParams; return NextResponse.json(q.has("id") ? readBriefing(q.get("id")!) : briefingFeed(q.has("summary"))); } catch (e) { return fail(e); } }
export async function POST(req: Request) {
  try {
    localRequest(req); const input = schema.parse(await body(req, 4000));
    if (input.action === "generate") return NextResponse.json(await generateBriefing(input.period));
    if (input.action === "settings") return NextResponse.json(updateBriefingSettings(input.settings));
    if (input.action === "read") return NextResponse.json(markBriefingRead(input.id));
    const result = queueBriefingDiscord(input.id); after(() => dispatchBriefingDiscord()); return NextResponse.json(result);
  } catch (e) { return fail(e); }
}
