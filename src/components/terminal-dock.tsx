"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Columns2, ExternalLink, Maximize2, Minimize2, PanelBottom, Terminal, X } from "lucide-react";
import { CodeTerminal } from "./code-terminal";
import { CodeResizeHandle, useCodePanelSize } from "./code-resize";
import { Button } from "./ui/button";

export function TerminalDock({ project, hidden, onClose }: { project: string; hidden: boolean; onClose: () => void }) {
  const placeholder = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const popup = useRef<Window | null>(null);
  const restore = useRef<() => void>(() => {});
  const [container, setContainer] = useState<HTMLDivElement>();
  const [ownerWindow, setOwnerWindow] = useState<Window>();
  const [detached, setDetached] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState("");
  const [panes, setPanes] = useState([1]);
  const nextPane = useRef(2);
  const [height, setHeight] = useCodePanelSize("axercise-code-terminal-height-v1");
  const [splitWidth, setSplitWidth] = useState(50);

  useEffect(() => {
    const node = document.createElement("div");
    node.className = "code-terminal-portal";
    placeholder.current?.append(node);
    setContainer(node);
    setOwnerWindow(window);
    function beforeUnload() { popup.current?.close(); }
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      const child = popup.current;
      popup.current = null;
      child?.removeEventListener("pagehide", restore.current);
      child?.close();
      node.remove();
    };
  }, []);

  // Move the stable portal target, preserving CMD, xterm buffers and React state.
  function dock() {
    if (!container) return;
    const child = popup.current;
    popup.current = null;
    child?.removeEventListener("pagehide", restore.current);
    placeholder.current?.append(container);
    setDetached(false);
    setOwnerWindow(window);
    child?.close();
  }
  function popout() {
    if (!container) return;
    if (popup.current && !popup.current.closed) { popup.current.focus(); return; }
    const child = window.open("", "_blank", "popup=yes,width=1000,height=650,resizable=yes,scrollbars=no");
    if (!child) { setMessage("เบราว์เซอร์บล็อกหน้าต่างใหม่ อนุญาต Pop-up สำหรับ Workspace แล้วลองอีกครั้ง"); return; }
    setMessage("");
    child.document.title = "Terminal · Axercise Workspace";
    const icon = child.document.createElement("link");
    icon.rel = "icon";
    icon.href = "/icon.svg";
    child.document.head.append(icon);
    child.document.documentElement.className = document.documentElement.className;
    child.document.documentElement.lang = "th";
    for (const style of document.querySelectorAll('link[rel="stylesheet"], style')) child.document.head.append(style.cloneNode(true));
    child.document.body.className = "code-terminal-window";
    child.document.body.append(container);
    popup.current = child;
    restore.current = dock;
    child.addEventListener("pagehide", restore.current, { once: true });
    setDetached(true);
    setOwnerWindow(child);
    child.focus();
  }

  useLayoutEffect(() => {
    if (container) container.hidden = hidden && !detached;
  }, [container, hidden, detached]);

  const bounds = () => ({
    min: 150,
    max: Math.max(150, (placeholder.current?.parentElement?.clientHeight ?? window.innerHeight) - 130),
  });
  function changeHeight(next?: number) {
    setExpanded(false);
    setHeight(next);
  }
  const width = () => surface.current?.querySelector(".code-terminal-panes")?.clientWidth || 1000;

  return <>
    <div ref={placeholder} className={`code-terminal-dock${expanded ? " expanded" : ""}${detached ? " detached" : ""}`} hidden={hidden && !detached}
      style={height === undefined ? undefined : { height }}>
      {detached ? <div className="code-terminal-away"><span>Terminal เปิดในหน้าต่างแยก</span>
        <Button variant="secondary" size="sm" onClick={() => popup.current?.focus()}>ไปที่ Terminal</Button>
        <Button variant="secondary" size="sm" onClick={dock}>กลับเข้าเว็บ</Button>
      </div> : <CodeResizeHandle label="ปรับความสูง Terminal" axis="height" reverse
        measure={() => placeholder.current?.getBoundingClientRect().height || 300} bounds={bounds} onChange={changeHeight} />}
    </div>
    {container && createPortal(<div className="code-terminal-surface" ref={surface}>
      <div className="code-terminal-dock-bar">
        <strong><Terminal size={15} />Terminal</strong>
        <button className="icon-button" aria-label="แบ่ง Terminal" title="แบ่ง Terminal" disabled={panes.length >= 2}
          onClick={() => setPanes(items => [...items, nextPane.current++])}><Columns2 size={16} /></button>
        <div className="code-terminal-controls">
          {detached
            ? <button className="icon-button" aria-label="กลับเข้าเว็บ" title="กลับเข้าเว็บ" onClick={dock}><PanelBottom size={16} /></button>
            : <><button className="icon-button" aria-label="แยก Terminal เป็นหน้าต่างใหม่" title="แยก Terminal เป็นหน้าต่างใหม่" onClick={popout}><ExternalLink size={16} /></button>
              <button className="icon-button" aria-label={expanded ? "ย่อ Terminal" : "ขยาย Terminal"} title={expanded ? "ย่อ Terminal" : "ขยาย Terminal"}
                onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button></>}
          <button className="icon-button" aria-label="ปิด Terminal ทั้งหมด" title="ปิด Terminal ทั้งหมด" onClick={onClose}><X size={16} /></button>
        </div>
      </div>
      {message && <p className="code-terminal-message" role="status">{message}</p>}
      <div className={`code-terminal-panes${panes.length > 1 ? " split" : ""}`}
        style={panes.length < 2 ? undefined : { gridTemplateColumns: `minmax(0, ${splitWidth}fr) 6px minmax(0, ${100 - splitWidth}fr)` }}>
        {panes.map((id, index) => <div key={id} className="code-terminal-slot" style={{ gridColumn: index * 2 + 1 }}>
          <CodeTerminal project={project} label={`CMD ${id}`} ownerWindow={ownerWindow} onClose={() => {
            if (panes.length === 1) onClose();
            else setPanes(items => items.filter(item => item !== id));
          }} />
        </div>)}
        {panes.length > 1 && <CodeResizeHandle label="ปรับสัดส่วน Terminal" axis="width"
          measure={() => width() * splitWidth / 100}
          bounds={() => ({ min: width() * .2, max: width() * .8 })}
          onChange={value => setSplitWidth(value === undefined ? 50 : value / width() * 100)} />}
      </div>
    </div>, container)}
  </>;
}
