import { NextResponse } from "next/server";
import { z } from "zod";
import { body, fail, localRequest } from "@/server/http";
import { exportLearning, previewRestore, applyRestore, BACKUP_LIMIT } from "@/server/learning-backup";
import { limitedForm } from "@/server/learning-files";
export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
export async function GET(req: Request) { try { localRequest(req); const courseId = new URL(req.url).searchParams.get("course") || undefined; if (courseId) z.uuid().parse(courseId); return new Response(Buffer.from(exportLearning(courseId)), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="axercise-learning-${new Date().toISOString().slice(0, 10)}.zip"`, "Cache-Control": "no-store" } }); } catch (e) { return fail(e); } }
export async function POST(req: Request) {
  try {
    localRequest(req);
    if (req.headers.get("content-type")?.includes("multipart/form-data")) { const form = await limitedForm(req, BACKUP_LIMIT + 1024 * 1024), file = form.get("file"); if (!(file instanceof File)) throw new Error("Missing backup file"); return NextResponse.json(previewRestore(Buffer.from(await file.arrayBuffer()))); }
    const v = z.object({ stageId: z.uuid(), strategy: z.enum(["keep", "backup"]) }).parse(await body(req, 2000));
    return NextResponse.json(applyRestore(v.stageId, v.strategy));
  } catch (e) { return fail(e); }
}
