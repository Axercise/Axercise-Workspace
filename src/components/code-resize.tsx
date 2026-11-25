"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export function useCodePanelSize(key: string) {
  const [size, setSize] = useState<number>();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(key));
      if (Number.isFinite(saved) && saved >= 100 && saved <= 3000) setSize(saved);
    } catch { /* Use the responsive default when storage is unavailable. */ }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    try {
      if (size === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, String(size));
    } catch { /* Resizing remains available without persistence. */ }
  }, [key, ready, size]);
  return [size, setSize] as const;
}

export function CodeResizeHandle({ label, axis, measure, bounds, onChange, reverse = false }: {
  label: string;
  axis: "width" | "height";
  measure: () => number;
  bounds: () => { min: number; max: number };
  onChange: (value?: number) => void;
  reverse?: boolean;
}) {
  const drag = useRef<{ id: number; start: number; size: number; body: HTMLElement } | null>(null);
  const [value, setValue] = useState<number>();
  const [limits, setLimits] = useState({ min: 0, max: 3000 });
  const width = axis === "width";

  useEffect(() => () => {
    if (drag.current) delete drag.current.body.dataset.codeResizing;
  }, []);

  function change(next: number) {
    const range = bounds();
    const clamped = Math.round(Math.max(range.min, Math.min(range.max, next)));
    setLimits(range);
    setValue(clamped);
    onChange(clamped);
  }
  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const body = event.currentTarget.ownerDocument.body;
    drag.current = { id: event.pointerId, start: width ? event.clientX : event.clientY, size: measure(), body };
    event.currentTarget.setPointerCapture(event.pointerId);
    body.dataset.codeResizing = axis;
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const delta = (width ? event.clientX : event.clientY) - current.start;
    change(current.size + (reverse ? -delta : delta));
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    delete current.body.dataset.codeResizing;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 60 : 20;
    if (event.key === "Home") change(bounds().min);
    else if (event.key === "End") change(bounds().max);
    else if (event.key === (width ? "ArrowRight" : "ArrowDown")) change(measure() + step * (reverse ? -1 : 1));
    else if (event.key === (width ? "ArrowLeft" : "ArrowUp")) change(measure() - step * (reverse ? -1 : 1));
    else if (event.key === "Enter") onChange(undefined);
    else return;
    event.preventDefault();
  }
  return <div className={`code-resize-handle code-resize-${axis}`} role="separator" tabIndex={0}
    aria-label={label} aria-orientation={width ? "vertical" : "horizontal"}
    aria-valuemin={limits.min} aria-valuemax={limits.max} aria-valuenow={value}
    title={`${label} · ลากเพื่อปรับ · ดับเบิลคลิกคืนขนาดเดิม`}
    onFocus={() => { setValue(Math.round(measure())); setLimits(bounds()); }}
    onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
    onDoubleClick={() => onChange(undefined)} onKeyDown={keyboard}><span /></div>;
}
