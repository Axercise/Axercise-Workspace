import fs from "node:fs";
import { Readable } from "node:stream";
import { fail, localRequest, AppError } from "@/server/http";
import { libraryAsset, libraryAssetPath } from "@/server/library";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, ctx: Context) {
  try {
    localRequest(req); const { id } = await ctx.params, asset = libraryAsset(id), file = libraryAssetPath(id);
    if (!fs.existsSync(file)) throw new AppError("ไฟล์ต้นฉบับหาย กรุณานำกลับจากชุดสำรอง", 404);
    const size = fs.statSync(file).size; if (size !== asset.size) throw new AppError("ไฟล์ไม่ครบหรือเสียหาย กรุณากู้ต้นฉบับ", 409);
    const range = req.headers.get("range"); let start = 0, end = size - 1;
    const invalid = () => new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range); if (!match || (!match[1] && !match[2])) return invalid();
      if (!match[1]) { const tail = Number(match[2]); if (!tail || !Number.isSafeInteger(tail)) return invalid(); start = Math.max(0, size - tail); } else start = Number(match[1]);
      if (match[1] && match[2]) end = Math.min(end, Number(match[2]));
      if (start >= size || start > end || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return invalid();
    }
    const download = new URL(req.url).searchParams.has("download") || asset.mime === "application/octet-stream";
    const filename = encodeURIComponent(asset.name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    const headers: Record<string, string> = { "Content-Type": asset.mime, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${filename}` };
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream, { status: range ? 206 : 200, headers });
  } catch (e) { return fail(e); }
}
