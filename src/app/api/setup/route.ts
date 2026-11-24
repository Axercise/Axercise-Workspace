import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { body, localRequest, fail, AppError } from "@/server/http";
import { config, updateConfig, ROOT } from "@/server/store";
import { setupStatus } from "@/server/setup";
import { probeConnections } from "@/server/health-probes";
import { inspectHermes, locateHermes } from "../../../../bin/hermes-install.mjs";

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("runtime"), directory: z.string().trim().max(1024), approvalMode: z.enum(["manual", "off"]) }),
  z.object({ action: z.literal("login") }),
  z.object({ action: z.literal("finish") }),
]);
export async function GET(req: Request) {
  try { localRequest(req); return Response.json(setupStatus()); } catch (error) { return fail(error); }
}
export async function POST(req: Request) {
  try {
    localRequest(req);
    const input = action.parse(await body(req, 3000));
    if (input.action === "runtime") {
      const runtime = input.directory ? inspectHermes(input.directory) : locateHermes(undefined);
      if (!runtime) throw new AppError("ไม่พบ Hermes เลือกโฟลเดอร์ hermes-agent ที่มี venv หรือ .venv");
      updateConfig(c => { c.hermesPath = runtime.install; c.approvalMode = input.approvalMode; });
    } else if (input.action === "login") {
      if (!setupStatus().runtime) throw new AppError("เชื่อม Hermes ก่อนเข้าสู่ระบบ");
      if (process.platform !== "win32" || process.env.AXERCISE_MANAGED !== "1") throw new AppError("เปิด Workspace ด้วยคำสั่ง axercise บน Windows หรือล็อกอินด้วย axercise login");
      // All arguments are fixed. Pass the Node path as data even when it contains spaces.
      await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop'; Start-Process -FilePath $env:AXERCISE_LOGIN_NODE -ArgumentList 'bin/interactive-login.mjs' -WorkingDirectory (Get-Location).Path"], {
        cwd: ROOT, windowsHide: true, timeout: 10000, env: { ...process.env, AXERCISE_LOGIN_NODE: process.execPath },
      });
    } else {
      const status = setupStatus(config());
      if (!status.runtime || !status.ai || !status.notion) throw new AppError("เชื่อม Hermes บัญชี AI และฐานข้อมูล Notion ให้ครบก่อน");
      const checks = (await Promise.all([probeConnections("ai:hermes"), probeConnections("notion")])).flat();
      const issue = checks.find(check => check.status !== "healthy");
      if (issue) throw new AppError(issue.name + " · " + issue.message);
      updateConfig(c => { c.setupComplete = true; });
    }
    return Response.json(setupStatus());
  } catch (error) { return fail(error); }
}
