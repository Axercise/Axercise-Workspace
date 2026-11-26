"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Moon } from "lucide-react";
import { Button } from "./ui/button";
import "./code-afk.css";

export function CodeAfk() {
  const [portal, setPortal] = useState<HTMLElement>();
  const [active, setActive] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const running = useRef(false);
  const ownsFullscreen = useRef(false);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => { setPortal(document.body); }, []);

  useEffect(() => {
    const node = surface.current;
    if (!active || !node) return;
    running.current = true;
    const overflow = document.body.style.overflow;
    const background = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== node)
      .map(element => ({ element, inert: element.inert }));
    for (const { element } of background) element.inert = true;
    document.body.style.overflow = "hidden";
    node.focus({ preventScroll: true });

    function keyboard(event: KeyboardEvent) {
      // Keep keys out of the editor and the running terminal while away.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") setActive(false);
    }
    function fullscreenChanged() {
      if (document.fullscreenElement === node) ownsFullscreen.current = true;
      else if (ownsFullscreen.current) setActive(false);
    }
    window.addEventListener("keydown", keyboard, true);
    document.addEventListener("fullscreenchange", fullscreenChanged);
    return () => {
      running.current = false;
      ownsFullscreen.current = false;
      window.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("fullscreenchange", fullscreenChanged);
      for (const { element, inert } of background) element.inert = inert;
      document.body.style.overflow = overflow;
      const focus = previousFocus.current;
      if (focus?.isConnected) focus.focus({ preventScroll: true });
      if (document.fullscreenElement === node) {
        void document.exitFullscreen().catch(() => {}).then(() => {
          if (!running.current && focus?.isConnected) focus.focus({ preventScroll: true });
        });
      }
    };
  }, [active]);

  async function enter() {
    const node = surface.current;
    if (!node || running.current) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Show the surface within the click gesture so the browser can enter fullscreen.
    flushSync(() => setActive(true));
    try {
      await node.requestFullscreen?.({ navigationUI: "hide" });
      if (!running.current && document.fullscreenElement === node) await document.exitFullscreen();
    } catch {
      // The same screen fills the viewport if native fullscreen is unavailable.
    }
  }

  return <>
    <Button type="button" variant="secondary" size="sm" disabled={!portal}
      title="AFK mode · Esc to return" onClick={() => void enter()}><Moon size={15} />AFK</Button>
    {portal && createPortal(<div ref={surface} className="code-afk" hidden={!active}
      role="dialog" aria-modal="true" aria-label="AFK mode" aria-describedby="code-afk-message"
      aria-keyshortcuts="Escape" tabIndex={-1} onContextMenu={event => event.preventDefault()}>
      <figure className="code-afk-scene">
        <CodexMascot />
        <figcaption id="code-afk-message" role="status">Codex is running<span className="code-afk-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span><span className="sr-only">...</span></figcaption>
      </figure>
    </div>, portal)}
  </>;
}

function CodexMascot() {
  return <svg className="code-afk-mascot" viewBox="0 0 280 250" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="afk-shell" x1="85" y1="55" x2="190" y2="170" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fff" /><stop offset="1" stopColor="#a6a6a6" />
      </linearGradient>
      <linearGradient id="afk-laptop" x1="110" y1="159" x2="165" y2="223" gradientUnits="userSpaceOnUse">
        <stop stopColor="#3a3a3a" /><stop offset="1" stopColor="#171717" />
      </linearGradient>
    </defs>
    <ellipse cx="140" cy="233" rx="76" ry="5" fill="#fff" opacity=".07" />
    <g className="code-afk-robot">
      <rect x="103" y="191" width="25" height="34" rx="12" fill="#bcbcbc" />
      <rect x="152" y="191" width="25" height="34" rx="12" fill="#bcbcbc" />
      <rect x="97" y="215" width="34" height="14" rx="7" fill="#eee" />
      <rect x="149" y="215" width="34" height="14" rx="7" fill="#eee" />
      <rect x="94" y="134" width="92" height="73" rx="29" fill="url(#afk-shell)" />
      <path d="M131 151h18" stroke="#888" strokeWidth="4" strokeLinecap="round" />
      <g className="code-afk-head">
        <path d="M140 47V32" stroke="#bbb" strokeWidth="5" strokeLinecap="round" />
        <circle className="code-afk-antenna" cx="140" cy="27" r="7" fill="#f5f5f5" />
        <rect x="67" y="85" width="13" height="33" rx="6.5" fill="#999" />
        <rect x="200" y="85" width="13" height="33" rx="6.5" fill="#999" />
        <rect x="77" y="49" width="126" height="96" rx="33" fill="url(#afk-shell)" />
        <rect x="88" y="62" width="104" height="70" rx="24" fill="#151515" stroke="#777" />
        <g className="code-afk-eyes" fill="#f5f5f5">
          <rect x="108" y="81" width="12" height="20" rx="6" />
          <rect x="160" y="81" width="12" height="20" rx="6" />
        </g>
        <path d="M131 109q9 8 18 0" stroke="#ddd" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="103" cy="108" rx="6" ry="3" fill="#626262" />
        <ellipse cx="177" cy="108" rx="6" ry="3" fill="#626262" />
      </g>
      <path d="M97 158q-17 2-19 23" stroke="#bcbcbc" strokeWidth="15" strokeLinecap="round" />
      <path d="M183 158q17 2 19 23" stroke="#bcbcbc" strokeWidth="15" strokeLinecap="round" />
      <g className="code-afk-hand code-afk-hand-left"><ellipse cx="85" cy="185" rx="13" ry="10" fill="#eee" /></g>
      <g className="code-afk-hand code-afk-hand-right"><ellipse cx="195" cy="185" rx="13" ry="10" fill="#eee" /></g>
      <rect x="92" y="163" width="96" height="57" rx="9" fill="url(#afk-laptop)" stroke="#888" strokeWidth="1.5" />
      <path d="m124 183 9 8-9 8" stroke="#eee" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path className="code-afk-cursor" d="M145 199h12" stroke="#eee" strokeWidth="3" strokeLinecap="round" />
      <path d="M87 220h106l-5 5H92l-5-5Z" fill="#a6a6a6" />
    </g>
  </svg>;
}
