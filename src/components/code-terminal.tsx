"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import { Terminal as TerminalIcon, X } from "lucide-react";
import { api, consumeSSE } from "@/lib/client";
import { Button } from "./ui/button";
import "@xterm/xterm/css/xterm.css";
import "./code-terminal.css";

const endpoint = "/api/code/terminal";
const headers = { "Content-Type": "application/json", "X-Axercise-Client": "workspace" };
type Connection = { id: string; abort: AbortController };

function dimensions(term: Terminal) {
  return { cols: Math.max(10, Math.min(400, term.cols)), rows: Math.max(4, Math.min(200, term.rows)) };
}

function request<T>(action: object) {
  return api<T>(endpoint, { method: "POST", body: JSON.stringify(action) });
}

function endConnection(project: string, current: Connection) {
  current.abort.abort();
  void fetch(endpoint, {
    method: "POST", headers, keepalive: true, body: JSON.stringify({ action: "close", project, id: current.id }),
  }).catch(() => {});
}

export function CodeTerminal({ project, label, ownerWindow, onClose }: { project: string; label: string; ownerWindow?: Window; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const emulator = useRef<Terminal | null>(null);
  const connection = useRef<Connection | null>(null);
  const mounted = useRef(false);
  const fitTerminal = useRef<() => void>(() => {});
  const [phase, setPhase] = useState<"loading" | "idle" | "starting" | "running">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    mounted.current = true;
    let canceled = false, dispose: (() => void) | undefined;
    Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]).then(([{ Terminal }, { FitAddon }]) => {
      if (canceled || !host.current) return;
      const node = host.current;
      const term = new Terminal({
        fontFamily: '"Cascadia Mono", Consolas, monospace', fontSize: 14,
        theme: { background: "#171717", foreground: "#eee", cursor: "#ddd", selectionBackground: "#555" },
        cursorBlink: true, scrollback: 3000, windowsPty: { backend: "conpty" },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(node);
      emulator.current = term;
      fitTerminal.current = () => {
        if (!node.clientWidth || !node.clientHeight) return;
        term.open(node);
        fit.fit();
      };
      let inputQueue = Promise.resolve();
      const inputs = term.onData(data => {
        const current = connection.current;
        if (!current) return;
        // Preserve key and paste order even while an HTTP request is pending.
        for (let offset = 0; offset < data.length; offset += 16384) {
          const chunk = data.slice(offset, offset + 16384);
          inputQueue = inputQueue.then(async () => {
            if (connection.current === current) await request({ action: "input", project, id: current.id, data: chunk });
          }).catch(() => {
            if (connection.current === current) setMessage("ส่งคำสั่งไม่ได้ ตรวจว่า CMD ยังเปิดอยู่");
          });
        }
      });
      let resizeTimer: ReturnType<typeof setTimeout> | undefined;
      const resized = new ResizeObserver(() => {
        if (!node.clientWidth || !node.clientHeight) return;
        fitTerminal.current();
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          const current = connection.current;
          if (current) void request({ action: "resize", project, id: current.id, ...dimensions(term) }).catch(() => {});
        }, 80);
      });
      resized.observe(node);
      if (node.clientWidth && node.clientHeight) fit.fit();
      setPhase("idle");
      dispose = () => {
        clearTimeout(resizeTimer);
        resized.disconnect();
        inputs.dispose();
        term.dispose();
        emulator.current = null;
        fitTerminal.current = () => {};
      };
    }).catch(() => { if (!canceled) setMessage("โหลดตัวแสดง Terminal ไม่สำเร็จ ลองปิดแล้วเปิด Terminal ใหม่"); });
    return () => {
      canceled = true;
      mounted.current = false;
      const current = connection.current;
      connection.current = null;
      if (current) endConnection(project, current);
      dispose?.();
    };
  }, [project]);

  useLayoutEffect(() => {
    fitTerminal.current();
    const frame = ownerWindow?.requestAnimationFrame(() => {
      fitTerminal.current();
      emulator.current?.focus();
    });
    return () => { if (frame !== undefined) ownerWindow?.cancelAnimationFrame(frame); };
  }, [ownerWindow]);

  async function start(mode: "cmd" | "resume") {
    const term = emulator.current;
    if (!term || phase !== "idle") return;
    setPhase("starting");
    setMessage("");
    term.reset();
    let current: Connection | undefined;
    try {
      const { id } = await request<{ id: string }>({ action: "start", project, mode, ...dimensions(term) });
      current = { id, abort: new AbortController() };
      if (!mounted.current) { endConnection(project, current); return; }
      connection.current = current;
      const url = endpoint + "?" + new URLSearchParams({ project, id });
      const response = await fetch(url, { headers, signal: current.abort.signal });
      await consumeSSE(response, (event, value) => {
        if (event === "ready") { setPhase("running"); term.focus(); }
        if (event === "output" && typeof value.data === "string") term.write(value.data);
        if (event === "exit") setMessage(typeof value.code === "number" ? `CMD ปิดแล้ว · exit ${value.code}` : "CMD ปิดแล้ว");
      });
    } catch (error) {
      if (mounted.current && !current?.abort.signal.aborted) setMessage((error as Error).message);
    } finally {
      if (current && connection.current === current) {
        connection.current = null;
        endConnection(project, current);
      }
      if (mounted.current) setPhase("idle");
    }
  }

  return <section className="code-terminal" aria-label={label}>
    <div className="code-terminal-bar">
      <strong><TerminalIcon size={16} />{label}</strong>
      {phase === "idle" && <>
        <Button variant="secondary" size="sm" onClick={() => void start("cmd")}>เปิด CMD</Button>
        <Button size="sm" onClick={() => void start("resume")}><code>codex resume</code></Button>
      </>}
      {(phase === "starting" || phase === "loading") && <small role="status">{message || "กำลังเปิด Terminal…"}</small>}
      {phase === "idle" && message && <small role="status">{message}</small>}
      <div className="code-terminal-controls">
        <button className="icon-button" title="ปิด CMD และ Terminal" aria-label="ปิด CMD และ Terminal" onClick={onClose}><X size={17} /></button>
      </div>
    </div>
    <div className="code-terminal-screen" ref={host} />
  </section>;
}
