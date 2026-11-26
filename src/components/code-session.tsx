"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Code2, GripVertical, Maximize2, Terminal } from "lucide-react";
import type { CodeProject } from "@/lib/code-project";
import "./code-session.css";

const CodeWorkspace = dynamic(() => import("./code-workspace").then(module => module.CodeWorkspace), {
  ssr: false,
  loading: () => <div className="code-session-loading" role="status">กำลังเปิด Code…</div>,
});
const StartCode = createContext<(() => void) | null>(null);
export type FloatingCodeView = "code" | "terminal";

export function CodeSession({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [display, setDisplay] = useState<"closed" | "page" | "floating">("closed");
  const [project, setProject] = useState<CodeProject>();
  const [view, setView] = useState<FloatingCodeView>("terminal");
  const start = useCallback(() => setDisplay("page"), []);
  const minimize = useCallback(() => setDisplay("floating"), []);
  const full = pathname === "/code";

  useEffect(() => {
    setDisplay(value => full ? (value === "floating" ? "page" : value) : (value === "page" ? "closed" : value));
  }, [full]);
  useEffect(() => {
    if (display === "closed") { setProject(undefined); setView("terminal"); }
  }, [display]);

  return <StartCode.Provider value={start}>
    {children}
    {display !== "closed" && (full || display === "floating") && <CodeWindow full={full} view={view} onView={setView} project={project?.name}>
      <CodeWorkspace floating={!full} floatingView={view} onProjectChange={setProject} onMinimize={minimize} onExit={start} />
    </CodeWindow>}
  </StartCode.Provider>;
}

// The server page runs its setup check before this marker activates the session.
export function CodeRoute() {
  const start = useContext(StartCode);
  useEffect(() => { start?.(); }, [start]);
  return null;
}

type Geometry = { x: number; y: number; width: number; height: number };
const storageKey = "axercise-code-window-v1";
const margin = 12;

function CodeWindow({ full, view, onView, project, children }: {
  full: boolean;
  view: FloatingCodeView;
  onView: (view: FloatingCodeView) => void;
  project?: string;
  children: ReactNode;
}) {
  const host = useRef<HTMLElement>(null);
  const geometry = useRef<Geometry>({ x: 20, y: 20, width: 660, height: 460 });
  const initialized = useRef(false);
  const drag = useRef<{ id: number; clientX: number; clientY: number; x: number; y: number } | null>(null);
  const frame = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(geometry.current)); } catch { /* Keep dragging available without storage. */ }
  }
  function paint() {
    const node = host.current;
    if (!node) return;
    const value = geometry.current;
    value.x = Math.max(margin, Math.min(value.x, window.innerWidth - node.offsetWidth - margin));
    value.y = Math.max(margin, Math.min(value.y, window.innerHeight - node.offsetHeight - margin));
    node.style.transform = `translate3d(${value.x}px, ${value.y}px, 0)`;
  }

  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    if (full) {
      node.style.removeProperty("width");
      node.style.removeProperty("height");
      node.style.removeProperty("transform");
      return;
    }
    if (!initialized.current) {
      initialized.current = true;
      geometry.current.y = Math.max(margin, window.innerHeight - geometry.current.height - 24);
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
        if (saved && [saved.x, saved.y, saved.width, saved.height].every(Number.isFinite)
          && saved.width >= 300 && saved.width <= 2000 && saved.height >= 220 && saved.height <= 1600) geometry.current = saved;
      } catch { /* Start in the lower left corner. */ }
    }
    function fit() {
      node!.style.width = `${Math.min(geometry.current.width, Math.max(180, window.innerWidth - margin * 2))}px`;
      node!.style.height = `${Math.min(geometry.current.height, Math.max(160, window.innerHeight - margin * 2))}px`;
      paint();
    }
    fit();
    const observer = new ResizeObserver(() => {
      if (!collapsed) {
        geometry.current.width = node.offsetWidth;
        geometry.current.height = node.offsetHeight;
      }
      paint();
      save();
    });
    observer.observe(node);
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      drag.current = null;
      delete document.body.dataset.codeFloatingDrag;
    };
  }, [full, collapsed]);

  useEffect(() => {
    setDragging(false);
    if (full) setCollapsed(false);
  }, [full]);

  function start(event: PointerEvent<HTMLDivElement>) {
    const control = (event.target as Element).closest("button, a");
    if (full || event.button !== 0 || (control && !control.hasAttribute("data-window-drag"))) return;
    event.preventDefault();
    event.currentTarget.querySelector<HTMLElement>("[data-window-drag]")?.focus({ preventScroll: true });
    drag.current = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: geometry.current.x, y: geometry.current.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.dataset.codeFloatingDrag = "true";
    setDragging(true);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    geometry.current.x = current.x + event.clientX - current.clientX;
    geometry.current.y = current.y + event.clientY - current.clientY;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => { frame.current = null; paint(); });
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    paint();
    save();
    drag.current = null;
    delete document.body.dataset.codeFloatingDrag;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 60 : 20;
    if (event.key === "ArrowLeft") geometry.current.x -= step;
    else if (event.key === "ArrowRight") geometry.current.x += step;
    else if (event.key === "ArrowUp") geometry.current.y -= step;
    else if (event.key === "ArrowDown") geometry.current.y += step;
    else if (event.key === "Home") { geometry.current.x = margin; geometry.current.y = window.innerHeight; }
    else return;
    event.preventDefault();
    paint();
    save();
  }

  return <>
    <section ref={host} className={`code-session-window ${full ? "full" : "floating"}${collapsed ? " collapsed" : ""}`}
      data-view={view} data-dragging={dragging || undefined} aria-label={full ? "Code workspace" : "หน้าต่าง Code ลอย"}>
      <div className="code-window-frame">
        <div className="code-window-bar" hidden={full} onPointerDown={start} onPointerMove={move}
          onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
          <button className="code-window-grip" data-window-drag aria-label="ลากหน้าต่าง Code"
            title="ลากเพื่อย้าย · ใช้ปุ่มลูกศรได้" onKeyDown={keyboard}><GripVertical size={17} /></button>
          <span className="code-window-title" title={project || "Code"}><Code2 size={16} /><strong>{project || "Code"}</strong></span>
          <div className="code-window-views" hidden={collapsed} role="group" aria-label="มุมมองหน้าต่าง Code">
            <button aria-label="ดูโค้ดในหน้าต่างลอย" aria-pressed={view === "code"} onClick={() => onView("code")}><Code2 size={14} />Code</button>
            <button aria-label="ดู CLI ในหน้าต่างลอย" aria-pressed={view === "terminal"} onClick={() => onView("terminal")}><Terminal size={14} />CLI</button>
          </div>
          <button className="icon-button" aria-label={collapsed ? "เปิดหน้าต่าง Code" : "ย่อหน้าต่าง Code เป็นแถบ"}
            title={collapsed ? "เปิดหน้าต่าง Code" : "ย่อเป็นแถบ"} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>
            {collapsed ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
          <Link className="icon-button" href="/code" aria-label="ขยายกลับหน้า Code" title="ขยายกลับหน้า Code"><Maximize2 size={16} /></Link>
        </div>
        <div className="code-window-content" hidden={!full && collapsed}>{children}</div>
      </div>
    </section>
    {dragging && createPortal(<div className="code-window-drag-shield" aria-hidden="true" />, document.body)}
  </>;
}
