import { NextResponse } from "next/server";
import { body, fail, localRequest, AppError } from "@/server/http";
import { hermes } from "@/server/hermes";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function proxy(req: Request, ctx: Context) {
  try {
    localRequest(req); const { path } = await ctx.params; const endpoint = path.join("/");
    if (!/^(api\/model\/options|v1\/capabilities|api\/sessions(?:\/[a-zA-Z0-9_.:-]+(?:\/(?:messages|fork|chat|chat\/stream))?)?|v1\/runs(?:\/[a-zA-Z0-9_.:-]+(?:\/(?:stop|events))?)?)$/.test(endpoint)) throw new AppError("ไม่พบเส้นทาง", 404);
    const url = new URL(req.url), agent = url.searchParams.get("agent") || "hermes"; url.searchParams.delete("agent");
    const payload = ["POST", "PATCH"].includes(req.method) ? JSON.stringify(await body(req)) : undefined;
    const response = await hermes(agent, `${endpoint}${url.searchParams.size ? `?${url.searchParams}` : ""}`, { method: req.method, body: payload, signal: req.signal });
    const type = response.headers.get("content-type") || "application/json";
    return new Response(response.body, { status: response.status, headers: { "Content-Type": type, "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
  } catch (e) { return fail(e); }
}
export const GET = proxy; export const POST = proxy; export const PATCH = proxy; export const DELETE = proxy;
