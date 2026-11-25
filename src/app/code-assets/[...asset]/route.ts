import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "@/server/store";

const mime: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".ttf": "font/ttf", ".woff2": "font/woff2" };

export async function GET(_req: Request, ctx: { params: Promise<{ asset: string[] }> }) {
  const { asset } = await ctx.params;
  const contentType = mime[path.extname(asset.at(-1) ?? "")];
  if (!contentType || asset.some(segment => !/^[a-z0-9_-][a-z0-9_.-]*$/i.test(segment))) return new Response(null, { status: 404 });
  try {
    const bytes = await fs.readFile(path.join(ROOT, "node_modules", "monaco-editor", "min", "vs", ...asset));
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response(null, { status: 404 }); }
}
