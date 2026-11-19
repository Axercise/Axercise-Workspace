import { NextResponse } from "next/server";
import { z } from "zod";
import { body, fail, localRequest } from "@/server/http";
import { healthDesktopFeedback } from "@/server/health";
export const dynamic = "force-dynamic";
export async function POST(req: Request) { try { localRequest(req, true); const input = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/), action: z.enum(["sent", "failed"]) }).strict().parse(await body(req, 1000)); return NextResponse.json(healthDesktopFeedback(input.id, input.action)); } catch (error) { return fail(error); } }
