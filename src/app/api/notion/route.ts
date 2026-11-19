import { NextResponse } from "next/server";
import { body, fail, localRequest, AppError } from "@/server/http";
import { listTasks, listNotes, saveTask, saveNote, archiveNotion, setupNotion } from "@/server/notion";
export const dynamic = "force-dynamic";
export async function GET(req: Request) { try { localRequest(req); const kind = new URL(req.url).searchParams.get("kind"); return NextResponse.json(kind === "notes" ? await listNotes() : await listTasks()); } catch (e) { return fail(e); } }
async function mutate(req: Request) {
  try {
    localRequest(req); const url = new URL(req.url), kind = url.searchParams.get("kind"), id = url.searchParams.get("id") || undefined;
    if (req.method === "DELETE") { if (!id) throw new AppError("ต้องระบุรายการ"); return NextResponse.json(await archiveNotion(kind === "notes" ? "note" : "task", id)); }
    if (kind === "setup") return NextResponse.json(await setupNotion());
    if (req.method === "PATCH" && !id) throw new AppError("ต้องระบุรายการ");
    return NextResponse.json(kind === "notes" ? await saveNote(await body(req, 30000), id) : await saveTask(await body(req, 80000), id));
  } catch (e) { return fail(e); }
}
export const POST = mutate; export const PATCH = mutate; export const DELETE = mutate;
