import { NextResponse } from "next/server";
import { body, fail, localRequest, AppError } from "@/server/http";
import { listEvents, saveEvent, removeEvent, listCalendars } from "@/server/calendar";
import { todayBangkok } from "@/lib/utils";
import { isCalendarDay } from "@/lib/calendar-view";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    localRequest(req);
    const q = new URL(req.url).searchParams;
    if (q.get("kind") === "calendars") return NextResponse.json(await listCalendars());
    const date = q.get("date") || todayBangkok();
    if (!isCalendarDay(date)) throw new AppError("วันที่ไม่ถูกต้อง");
    const count = q.get("days") ?? "1";
    const days = Number(count);
    if (!/^\d{1,3}$/.test(count) || days < 1 || days > 366) throw new AppError("เลือกช่วงปฏิทินได้ครั้งละ 1 ถึง 366 วัน");
    const from = `${date}T00:00:00+07:00`;
    const to = new Date(Date.parse(from) + days * 86_400_000).toISOString();
    return NextResponse.json(await listEvents(from, to));
  } catch (e) { return fail(e); }
}
async function mutate(req: Request) {
  try { localRequest(req); const id = new URL(req.url).searchParams.get("id") || undefined; if (req.method === "DELETE") { if (!id) throw new AppError("ต้องระบุนัดหมาย"); return NextResponse.json(await removeEvent(id)); } if (req.method === "PATCH" && !id) throw new AppError("ต้องระบุนัดหมาย"); return NextResponse.json(await saveEvent(await body(req, 20000), id)); } catch (e) { return fail(e); }
}
export const POST = mutate; export const PATCH = mutate; export const DELETE = mutate;
