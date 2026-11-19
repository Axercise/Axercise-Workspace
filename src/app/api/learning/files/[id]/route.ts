import fs from "node:fs";
import { Readable } from "node:stream";
import { fail, localRequest, AppError } from "@/server/http";
import { findVersion, fileLocation } from "@/server/learning-store";
import { mime, readDocumentText, extractFile, checkFile } from "@/server/learning-files";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, ctx: Context) {
  try {
    localRequest(req); const { id } = await ctx.params, { version } = findVersion(id), url = new URL(req.url);
    if (url.searchParams.has("check")) return NextResponse.json(checkFile(id));
    if (url.searchParams.has("text")) return NextResponse.json(readDocumentText(id));
    const file = fileLocation(id); if (!fs.existsSync(file)) throw new AppError("ไฟล์ต้นฉบับหาย กรุณานำกลับจากชุดสำรอง", 404);
    const size = fs.statSync(file).size, range = req.headers.get("range");
    let start = 0, end = size - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      if (!match[1]) start = Math.max(0, size - Number(match[2])); else start = Number(match[1]);
      if (match[1] && match[2]) end = Math.min(end, Number(match[2]));
      if (start >= size || start > end || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const headers: Record<string, string> = { "Content-Type": mime[version.extension] || "application/octet-stream", "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `${url.searchParams.has("download") || !mime[version.extension] ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(version.name)}` };
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream, { status: range ? 206 : 200, headers });
  } catch (e) { return fail(e); }
}
export async function POST(req: Request, ctx: Context) { try { localRequest(req); const { id } = await ctx.params; return NextResponse.json(await extractFile(id)); } catch (e) { return fail(e); } }
