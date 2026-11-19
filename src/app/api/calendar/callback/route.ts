import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { config, updateConfig, DATA } from "@/server/store";
import { localRequest, AppError } from "@/server/http";
export async function GET(req: NextRequest) {
  const origin = `http://${req.headers.get("host")}`, pendingFile = path.join(DATA, "oauth-pending.json");
  try {
    localRequest(req); const q = req.nextUrl.searchParams, pending = JSON.parse(fs.readFileSync(pendingFile, "utf8"));
    if (!q.get("state") || q.get("state") !== pending.state || req.cookies.get("axercise_oauth")?.value !== pending.state || pending.expires < Date.now()) throw new AppError("การเชื่อมต่อหมดอายุ กรุณาเริ่มใหม่");
    fs.unlinkSync(pendingFile);
    if (q.has("error") || !q.get("code")) throw new AppError("ไม่ได้อนุญาตการเชื่อมต่อ Google");
    const g = config().google;
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ client_id: g.clientId, client_secret: g.clientSecret, code: q.get("code")!, redirect_uri: pending.redirect, grant_type: "authorization_code", code_verifier: pending.verifier }), signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new AppError("แลกสิทธิ์ Google ไม่สำเร็จ กรุณาตรวจ Client ID และ redirect URI");
    const t = await r.json(); if (!t.refresh_token && !g.refreshToken) throw new AppError("ไม่ได้รับสิทธิ์ทำงานเบื้องหลัง กรุณาเชื่อม Google ใหม่");
    updateConfig(c => { c.google.refreshToken = t.refresh_token || c.google.refreshToken; c.google.accessToken = t.access_token; c.google.expiresAt = Date.now() + t.expires_in * 1000; });
    const response = NextResponse.redirect(`${origin}/?connected=google`); response.cookies.delete("axercise_oauth"); return response;
  } catch { const response = NextResponse.redirect(`${origin}/?connection_error=google`); response.cookies.delete("axercise_oauth"); return response; }
}
