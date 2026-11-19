import { NextResponse } from "next/server";
import { z } from "zod";
import { body, fail, localRequest } from "@/server/http";
import { windowsStartup } from "@/server/startup";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) { try { localRequest(req); return NextResponse.json(await windowsStartup("status")); } catch (error) { return fail(error); } }
export async function PATCH(req: Request) {
  try {
    localRequest(req);
    const input = z.object({ enabled: z.boolean() }).strict().parse(await body(req, 1000));
    return NextResponse.json(await windowsStartup(input.enabled ? "on" : "off"));
  } catch (error) { return fail(error); }
}
