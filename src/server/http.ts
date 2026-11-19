import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { config } from "./store";

export class AppError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function localRequest(request: Request, internal = false) {
  const host = request.headers.get("host") || "";
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) throw new AppError("อนุญาตให้ใช้งานจากเครื่องนี้เท่านั้น", 403);
  if (internal) {
    const provided = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
    const expected = config().serviceToken;
    if (Buffer.byteLength(provided) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) throw new AppError("ไม่ได้รับอนุญาต", 401);
    return;
  }
  const origin = request.headers.get("origin");
  if (origin) { let valid = false; try { valid = new URL(origin).host === host; } catch {} if (!valid) throw new AppError("คำขอไม่ได้มาจาก Axercise", 403); }
  if (!["GET", "HEAD"].includes(request.method) && request.headers.get("x-axercise-client") !== "workspace") throw new AppError("คำขอไม่ถูกต้อง", 403);
}
export function fail(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: "เชื่อมต่อบริการไม่สำเร็จ กรุณาตรวจการตั้งค่าหรือลองอีกครั้ง" }, { status: 502 });
}
export async function body(request: Request, max = 16_000_000): Promise<unknown> {
  const text = await request.text();
  if (Buffer.byteLength(text) > max) throw new AppError("ข้อมูลมีขนาดใหญ่เกินไป", 413);
  try { return JSON.parse(text); } catch { throw new AppError("ข้อมูล JSON ไม่ถูกต้อง"); }
}
