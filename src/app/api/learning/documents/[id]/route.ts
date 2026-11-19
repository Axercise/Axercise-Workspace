import { NextResponse } from "next/server";
import { z } from "zod";
import { body, fail, localRequest } from "@/server/http";
import { deleteDocument, documentDeletionDetails } from "@/server/learning-delete";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, ctx: Context) { try { localRequest(req); const id = z.uuid().parse((await ctx.params).id); return NextResponse.json(documentDeletionDetails(id)); } catch (e) { return fail(e); } }
export async function DELETE(req: Request, ctx: Context) { try { localRequest(req); const id = z.uuid().parse((await ctx.params).id), v = z.object({ revision: z.number().int().positive() }).strict().parse(await body(req, 2000)); return NextResponse.json(deleteDocument(id, v.revision)); } catch (e) { return fail(e); } }
