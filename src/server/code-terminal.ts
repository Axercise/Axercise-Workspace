import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, type IPty } from "node-pty";
import { AppError } from "./http";
import type { CodeProject } from "../lib/code-project";

type TerminalSession = {
  id: string;
  project: string;
  pty: IPty;
  pending: string;
  attached?: { output: (data: string) => void; exit: (code: number | null) => void };
  timer?: NodeJS.Timeout;
};

const sessions = new Map<string, TerminalSession>();
const limit = 4;

function end(session: TerminalSession, code: number | null, terminate = false) {
  if (!sessions.delete(session.id)) return;
  clearTimeout(session.timer);
  session.attached?.exit(code);
  session.attached = undefined;
  if (terminate) {
    try { session.pty.kill(); } catch { /* The shell may have already exited. */ }
  }
}

function expireIfDetached(session: TerminalSession) {
  clearTimeout(session.timer);
  session.timer = setTimeout(() => end(session, null, true), 30_000);
  session.timer.unref();
}

export function createTerminal(project: CodeProject, mode: "cmd" | "resume", cols: number, rows: number) {
  if (process.platform !== "win32") throw new AppError("Terminal นี้ใช้ Windows CMD", 409);
  if (sessions.size >= limit) throw new AppError("เปิด Terminal ครบ 4 ตัวแล้ว ปิดตัวที่ไม่ได้ใช้ก่อน", 409);
  const shell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "cmd.exe");
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(AXERCISE_|HERMES_|API_SERVER_|DISCORD_|TERM$|COLORTERM$)/i.test(name)));
  // The managed daemon can inherit TERM=dumb. Windows node-pty does not set it
  // from the PTY name, so advertise the capabilities of xterm.js explicitly.
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  let pty: IPty;
  try {
    pty = spawn(shell, ["/D", "/K", mode === "resume" ? "chcp 65001>nul & codex resume" : "chcp 65001>nul"], {
      cwd: project.directory,
      name: "xterm-256color",
      cols,
      rows,
      env,
      // Use the bundled modern ConPTY rather than the legacy inbox conhost.
      useConptyDll: true,
    });
  } catch {
    throw new AppError("เปิด Windows CMD ไม่สำเร็จ ตรวจว่าโฟลเดอร์ยังอยู่และติดตั้ง dependencies ครบ", 503);
  }
  const session: TerminalSession = { id: randomUUID(), project: project.id, pty, pending: "" };
  sessions.set(session.id, session);
  pty.onData(chunk => {
    if (!sessions.has(session.id)) return;
    if (session.attached) session.attached.output(chunk);
    else session.pending = (session.pending + chunk).slice(-131072);
  });
  pty.onExit(({ exitCode }) => end(session, exitCode));
  expireIfDetached(session);
  return session.id;
}

function terminal(project: string, id: string) {
  const session = sessions.get(id);
  if (!session || session.project !== project) throw new AppError("Terminal ปิดแล้ว เปิดใหม่เพื่อใช้งานต่อ", 404);
  return session;
}

export function terminalInput(project: string, id: string, data: string) {
  terminal(project, id).pty.write(data);
}

export function terminalResize(project: string, id: string, cols: number, rows: number) {
  terminal(project, id).pty.resize(cols, rows);
}

export function closeTerminal(project: string, id: string) {
  const session = sessions.get(id);
  if (session?.project === project) end(session, null, true);
}

export function terminalOutput(project: string, id: string, signal: AbortSignal) {
  const session = terminal(project, id);
  if (session.attached) throw new AppError("Terminal นี้เปิดอยู่ในอีกหน้าหนึ่ง", 409);
  const encoder = new TextEncoder();
  let detach = () => {};
  return new ReadableStream<Uint8Array>({
    start(controller) {
      clearTimeout(session.timer);
      detach = () => {
        signal.removeEventListener("abort", detach);
        session.attached = undefined;
        if (sessions.has(id)) expireIfDetached(session);
      };
      const emit = (event: string, data: object) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      session.attached = {
        output: data => emit("output", { data }),
        exit: code => {
          emit("exit", { code });
          detach();
          controller.close();
        },
      };
      signal.addEventListener("abort", detach, { once: true });
      if (signal.aborted) { detach(); controller.close(); return; }
      emit("ready", {});
      if (session.pending) {
        session.attached.output(session.pending);
        session.pending = "";
      }
    },
    cancel() { detach(); },
  });
}
