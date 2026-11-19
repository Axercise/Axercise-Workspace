import { NextResponse } from "next/server";
import { z } from "zod";
import { body, fail, localRequest } from "@/server/http";
import { deleteLibrary, libraryList, libraryRead, saveLibrary } from "@/server/library";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try { localRequest(req); const q = new URL(req.url).searchParams; if (q.has("id")) return NextResponse.json(libraryRead(q.get("id")!)); return NextResponse.json(libraryList({ query: q.get("query") || "", kind: q.get("kind") || "all", tag: q.get("tag") || "", favorite: q.get("favorite") === "1", trash: q.get("trash") === "1", offset: Number(q.get("offset") || 0), limit: Number(q.get("limit") || 80) })); } catch (e) { return fail(e); }
}
export async function POST(req: Request) { try { localRequest(req); return NextResponse.json(saveLibrary(await body(req, 1000000)), { status: 201 }); } catch (e) { return fail(e); } }
export async function PATCH(req: Request) {
  try { localRequest(req); const input = z.object({ id: z.uuid(), revision: z.number().int().positive(), data: z.record(z.string(), z.unknown()) }).strict().parse(await body(req, 1000000)); return NextResponse.json(saveLibrary(input.data, input.id, input.revision)); } catch (e) { return fail(e); }
}
export async function DELETE(req: Request) {
  try { localRequest(req); const input = z.object({ id: z.uuid(), revision: z.number().int().positive(), action: z.enum(["trash", "restore", "delete"]) }).strict().parse(await body(req, 2000)); return NextResponse.json(deleteLibrary(input.id, input.revision, input.action)); } catch (e) { return fail(e); }
}
