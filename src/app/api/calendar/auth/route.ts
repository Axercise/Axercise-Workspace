import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { config, atomicJSON, DATA } from "@/server/store";
import { fail, localRequest, AppError } from "@/server/http";
import path from "node:path";
export async function POST(req: Request) {
  try {
    localRequest(req); const g = config().google;
    if (!g.clientId || !g.clientSecret) throw new AppError("บันทึก Google Client ID และ Client Secret ก่อน");
    const state = randomBytes(32).toString("hex"), verifier = randomBytes(48).toString("base64url");
    const origin = `http://${req.headers.get("host")}`;
    atomicJSON(path.join(DATA, "oauth-pending.json"), { state, verifier, expires: Date.now() + 600000, redirect: `${origin}/api/calendar/callback` });
    const params = new URLSearchParams({ client_id: g.clientId, redirect_uri: `${origin}/api/calendar/callback`, response_type: "code", scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly", access_type: "offline", prompt: "consent", state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
    const res = NextResponse.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    res.cookies.set("axercise_oauth", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/api/calendar/callback" }); return res;
  } catch (e) { return fail(e); }
}
