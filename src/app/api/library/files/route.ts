import { NextResponse } from "next/server";
import { fail, localRequest, AppError } from "@/server/http";
import { limitedForm } from "@/server/learning-files";
import { stageLibraryFile } from "@/server/library";
import { LIBRARY_FILE_LIMIT } from "@/lib/library";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try { localRequest(req); const form = await limitedForm(req, LIBRARY_FILE_LIMIT + 1024 * 1024), file = form.get("file"); if (!(file instanceof File)) throw new AppError("เลือกไฟล์ที่ต้องการเก็บ"); return NextResponse.json(stageLibraryFile(Buffer.from(await file.arrayBuffer()), file.name), { status: 201 }); } catch (e) { return fail(e); }
}
