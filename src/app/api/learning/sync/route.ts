import { NextResponse } from "next/server";
import { z } from "zod";
import { body, fail, localRequest } from "@/server/http";
import { syncLearning } from "@/server/learning-notion";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(req: Request) { try { localRequest(req); const v = z.object({ id: z.uuid(), use: z.enum(["local", "remote"]) }).optional().parse(await body(req, 2000).then(v => Object.keys(v as object).length ? v : undefined)); return NextResponse.json(await syncLearning(v)); } catch (e) { return fail(e); } }
