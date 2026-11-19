import { NextResponse } from "next/server";
import { z } from "zod";
import { body, fail, localRequest } from "@/server/http";
import { briefingDesktopFeedback } from "@/server/briefings";
export async function POST(req: Request) { try { localRequest(req, true); const input = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/), action: z.enum(["sent", "failed"]) }).strict().parse(await body(req, 2000)); return NextResponse.json(briefingDesktopFeedback(input.id, input.action)); } catch (e) { return fail(e); } }
