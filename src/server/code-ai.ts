import path from "node:path";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { agents, agentEnv, findHermes } from "../../bin/runtime.mjs";
import { AppError } from "./http";
import { codeFileLimit } from "./code-project";
import { config, ROOT } from "./store";

let running = false;

export async function proposeCode(file: string, content: string, instruction: string, signal: AbortSignal) {
  if (running) throw new AppError("Developer กำลังเสนอการแก้ไขอีกไฟล์อยู่", 409);
  running = true;
  try {
    const runtime = findHermes(), account = config();
    const developer = agents.find(agent => agent.id === "developer")!;
    const prompt = JSON.stringify({ instruction, file, content });
    const answer = await new Promise<string>((resolve, reject) => {
      const child = execFile(runtime.python, ["-u", path.join(ROOT, "scripts", "learning-ai.py")], {
        cwd: runtime.install,
        env: { ...agentEnv(developer), AXERCISE_HERMES_INSTALL: runtime.install },
        signal, timeout: 180000, maxBuffer: 2 * codeFileLimit, windowsHide: true,
      }, (error, stdout) => error ? reject(error) : resolve(stdout));
      child.stdin?.on("error", () => {});
      child.stdin?.end(JSON.stringify({ purpose: "code", requestId: `code_${randomUUID()}`, provider: account.defaultProvider, model: account.defaultModel, prompt }));
    });
    const response = JSON.parse(answer).content;
    const proposal = z.object({ content: z.string().max(codeFileLimit), summary: z.string().max(4000) }).parse(JSON.parse(response.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")));
    if (proposal.content.includes("\0") || Buffer.byteLength(proposal.content) > codeFileLimit) throw new Error();
    return proposal;
  } catch {
    throw new AppError("Developer เสนอการแก้ไขไม่สำเร็จ ตรวจบัญชี AI หรือเลือกไฟล์ขนาดเล็กลงแล้วลองอีกครั้ง", 502);
  } finally { running = false; }
}
