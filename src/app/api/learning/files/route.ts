import { NextResponse } from "next/server";
import { fail, localRequest } from "@/server/http";
import { limitedForm, saveFile } from "@/server/learning-files";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(req: Request) { try { localRequest(req); return NextResponse.json(await saveFile(await limitedForm(req))); } catch (e) { return fail(e); } }
