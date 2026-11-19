import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { ROOT } from "./store";
import { AppError } from "./http";
const execute = promisify(execFile);
const status = z.object({ supported: z.boolean(), installed: z.boolean(), enabled: z.boolean(), windowsDisabled: z.boolean(), message: z.string().optional() });
export async function windowsStartup(action: "on" | "off" | "status") {
  try {
    const result = await execute(process.execPath, [path.join(ROOT, "bin", "startup.mjs"), action], { cwd: ROOT, windowsHide: true, timeout: 60000, maxBuffer: 64000 });
    return status.parse(JSON.parse(result.stdout));
  } catch (error) {
    const output = (error as { stdout?: string }).stdout;
    if (output) { try { const parsed = JSON.parse(output); if (typeof parsed.error === "string") throw new AppError(parsed.error, 409); } catch (cause) { if (cause instanceof AppError) throw cause; } }
    throw new AppError("จัดการการเปิดพร้อม Windows ไม่สำเร็จ กรุณาลองอีกครั้ง", 502);
  }
}
