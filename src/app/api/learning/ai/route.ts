import { NextResponse } from "next/server";
import { body, fail, localRequest } from "@/server/http";
import { studyAI } from "@/server/learning-ai";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(req: Request) { try { localRequest(req); return NextResponse.json(await studyAI(await body(req, 40000))); } catch (e) { return fail(e); } }
