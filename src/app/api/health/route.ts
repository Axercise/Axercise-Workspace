import { after, NextResponse } from "next/server";
import { z } from "zod";
import { HEALTH_IDS } from "@/lib/health";
import { body, fail, localRequest } from "@/server/http";
import { dispatchHealthDiscord, healthFeed, repairHealthGateway, runHealthCheck, updateHealthSettings } from "@/server/health";
import { readGateway } from "@/server/health-probes";
import type { AgentId } from "@/lib/types";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 210;
export async function GET(req: Request) { try { localRequest(req); return NextResponse.json(healthFeed()); } catch (error) { return fail(error); } }
const schema = z.discriminatedUnion("action", [z.object({ action: z.literal("check"), id: z.enum(HEALTH_IDS).optional() }).strict(), z.object({ action: z.literal("repair"), id: z.enum(HEALTH_IDS) }).strict(), z.object({ action: z.literal("settings"), settings: z.object({ alertsEnabled: z.boolean().optional(), desktop: z.boolean().optional(), discord: z.boolean().optional() }).strict() }).strict()]);
export async function POST(req: Request) {
  try {
    localRequest(req); const input = schema.parse(await body(req, 2000));
    if (input.action === "settings") return NextResponse.json(updateHealthSettings(input.settings));
    if (input.action === "repair") { const result = await repairHealthGateway(input.id); after(async () => { const deadline = Date.now() + 75000; while (Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 2000)); const gateway = await readGateway(input.id.split(":")[1] as AgentId); if (gateway.reachable && gateway.discordState === "connected") break; } await runHealthCheck(true, undefined, true); }); return NextResponse.json(result); }
    await runHealthCheck(true, input.id); after(() => dispatchHealthDiscord()); return NextResponse.json(healthFeed());
  } catch (error) { return fail(error); }
}
