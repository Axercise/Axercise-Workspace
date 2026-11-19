"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type KeyboardEvent } from "react";

type Panel = "width" | "calendar" | "tasks";
type Sizes = Partial<Record<Panel, number>>;
const STORAGE_KEY = "axercise-panel-layout-v1";
const VARIABLES: Record<Panel, string> = { width: "--workspace-right-width", calendar: "--workspace-calendar-height", tasks: "--workspace-tasks-height" };
const LABELS: Record<Panel, string> = { width: "ปรับความกว้าง Calendar และ To-do", calendar: "ปรับความสูง Calendar", tasks: "ปรับความสูง To-do" };

export function useWorkspaceLayout() {
  const [sizes, setSizes] = useState<Sizes>({});
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved && typeof saved === "object") {
        const valid: Sizes = {};
        for (const key of Object.keys(VARIABLES) as Panel[]) {
          const value = (saved as Sizes)[key];
          if (typeof value === "number" && Number.isFinite(value)) valid[key] = Math.max(key === "width" ? 306 : key === "calendar" ? 320 : 280, Math.min(key === "width" ? 840 : 1600, value));
        }
        setSizes(valid);
      }
    } catch { /* Keep the default layout when browser storage is unavailable. */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes)); } catch {} }
  }, [sizes, loaded]);
  const style = Object.fromEntries(Object.entries(sizes).map(([key, value]) => [VARIABLES[key as Panel], `${value}px`])) as CSSProperties;
  function resize(panel: Panel, value?: number) {
    setSizes(previous => { const next = { ...previous }; if (value === undefined) delete next[panel]; else next[panel] = Math.round(value); return next; });
  }
  return { style, resize };
}

export function WorkspaceResizeHandle({ panel, onResize }: { panel: Panel; onResize: (panel: Panel, value?: number) => void }) {
  const horizontal = panel === "width";
  const handle = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; start: number; size: number } | null>(null);
  const [current, setCurrent] = useState<number>();
  const [maximum, setMaximum] = useState(horizontal ? 840 : 1600);
  const minimum = horizontal ? 306 : panel === "calendar" ? 320 : 280;
  const target = () => handle.current?.parentElement;
  function bounds() {
    const shell = handle.current?.closest(".workspace-shell");
    const sidebar = shell?.querySelector(".sidebar");
    if (!horizontal || !shell || !sidebar) return { min: minimum, max: 1600 };
    const css = getComputedStyle(shell);
    const available = shell.getBoundingClientRect().width - sidebar.getBoundingClientRect().width - parseFloat(css.columnGap) * 2 - parseFloat(css.paddingRight) - parseFloat(css.paddingLeft) - 330;
    return { min: minimum, max: Math.max(minimum, Math.min(840, Math.floor(available))) };
  }
  const measure = () => {
    const box = target()?.getBoundingClientRect();
    return box ? (horizontal ? box.width : box.height) : minimum;
  };
  useEffect(() => {
    const element = handle.current?.parentElement;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const box = element.getBoundingClientRect();
      setCurrent(Math.round(horizontal ? box.width : box.height));
      if (horizontal) {
        const shell = element.closest(".workspace-shell"), sidebar = shell?.querySelector(".sidebar");
        if (shell && sidebar) {
          const css = getComputedStyle(shell);
          setMaximum(Math.max(306, Math.min(840, Math.floor(shell.getBoundingClientRect().width - sidebar.getBoundingClientRect().width - parseFloat(css.columnGap) * 2 - parseFloat(css.paddingRight) - parseFloat(css.paddingLeft) - 330))));
        }
      }
    });
    observer.observe(element);
    return () => { observer.disconnect(); if (drag.current) delete document.body.dataset.workspaceResizing; };
  }, [horizontal]);
  function change(value: number) {
    const { min, max } = bounds();
    onResize(panel, Math.max(min, Math.min(max, value)));
  }
  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !window.matchMedia("(min-width: 981px)").matches) return;
    event.preventDefault();
    drag.current = { id: event.pointerId, start: horizontal ? event.clientX : event.clientY, size: measure() };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.dataset.workspaceResizing = horizontal ? "width" : "height";
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    const delta = (horizontal ? event.clientX : event.clientY) - active.start;
    change(active.size + (horizontal ? -delta : delta));
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    delete document.body.dataset.workspaceResizing;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 64 : 24;
    let value: number;
    if (event.key === "Home") value = bounds().min;
    else if (event.key === "End") value = bounds().max;
    else if (event.key === (horizontal ? "ArrowLeft" : "ArrowDown")) value = measure() + step;
    else if (event.key === (horizontal ? "ArrowRight" : "ArrowUp")) value = measure() - step;
    else if (event.key === "Enter") { event.preventDefault(); onResize(panel); return; }
    else return;
    event.preventDefault(); change(value);
  }
  return <div ref={handle} className={`workspace-resize-handle ${horizontal ? "resize-width" : "resize-height"}`} role="separator" tabIndex={0} aria-label={LABELS[panel]} aria-orientation={horizontal ? "vertical" : "horizontal"} aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={current} aria-valuetext={current === undefined ? undefined : `${current} พิกเซล`} title={`${LABELS[panel]} · ลากเพื่อปรับ · ดับเบิลคลิกเพื่อคืนขนาดเดิม`} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onDoubleClick={() => onResize(panel)} onKeyDown={keyboard}><span /></div>;
}
