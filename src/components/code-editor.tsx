"use client";

import { useEffect, useRef, useState } from "react";
import type * as Monaco from "monaco-editor";

type Engine = typeof Monaco;
type Loader = ((modules: string[], ready: () => void, error: (error: unknown) => void) => void) & {
  config: (value: { paths: Record<string, string> }) => void;
};
let loading: Promise<Engine> | undefined;

function loadMonaco() {
  const host = window as typeof window & { monaco?: Engine; require?: Loader };
  if (host.monaco) return Promise.resolve(host.monaco);
  if (!loading) {
    loading = new Promise<Engine>((resolve, reject) => {
      const script = document.createElement("script");
      const fail = (error: unknown) => { script.remove(); reject(error); };
      script.src = "/code-assets/loader.js";
      script.onerror = fail;
      script.onload = () => {
        if (!host.require?.config) { fail(new Error()); return; }
        host.require.config({ paths: { vs: "/code-assets" } });
        host.require(["vs/editor/editor.main"], () => {
          if (host.monaco) resolve(host.monaco);
          else fail(new Error());
        }, fail);
      };
      document.head.append(script);
    }).catch(error => { loading = undefined; throw error; });
  }
  return loading;
}

export function CodeEditor({ path, value, original, readOnly, onChange }: {
  path: string; value: string; original?: string; readOnly?: boolean; onChange: (value: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef({ value, onChange });
  const model = useRef<Monaco.editor.ITextModel | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const comparing = original !== undefined;
  useEffect(() => { current.current = { value, onChange }; }, [value, onChange]);

  useEffect(() => {
    let alive = true;
    let dispose: (() => void) | undefined;
    setStatus("loading");
    loadMonaco().then(engine => {
      if (!alive || !host.current) return;
      const uri = engine.Uri.from({ scheme: "inmemory", path: "/project/" + path, query: crypto.randomUUID() });
      const modified = engine.editor.createModel(current.current.value, undefined, uri);
      const options = { automaticLayout: true, readOnly, fontSize: 14, theme: "vs-dark", minimap: { enabled: false }, scrollBeyondLastLine: false };
      let editor: Monaco.editor.IStandaloneCodeEditor | Monaco.editor.IStandaloneDiffEditor;
      let before: Monaco.editor.ITextModel | undefined;
      if (original !== undefined) {
        before = engine.editor.createModel(original, modified.getLanguageId());
        const diff = engine.editor.createDiffEditor(host.current, { ...options, originalEditable: false, renderSideBySide: true });
        diff.setModel({ original: before, modified });
        editor = diff;
      } else {
        editor = engine.editor.create(host.current, { ...options, model: modified, ariaLabel: "แก้โค้ด " + path });
      }
      const changes = modified.onDidChangeContent(() => current.current.onChange(modified.getValue(undefined, true)));
      model.current = modified;
      dispose = () => { changes.dispose(); editor.dispose(); modified.dispose(); before?.dispose(); model.current = null; };
      setStatus("ready");
    }).catch(() => { if (alive) setStatus("fallback"); });
    return () => { alive = false; dispose?.(); };
  }, [path, original, readOnly]);

  useEffect(() => {
    const textModel = model.current;
    if (textModel && textModel.getValue(undefined, true) !== value) textModel.setValue(value);
  }, [value]);

  return <div className="code-editor">
    <div ref={host} className="code-monaco" aria-hidden={status !== "ready"} />
    {status === "loading" && <p className="code-editor-message" role="status">กำลังเปิดตัวแก้โค้ด…</p>}
    {status === "fallback" && <div className="code-editor-fallback">
      <p role="status">เปิด Monaco ไม่สำเร็จ กำลังใช้ตัวแก้ข้อความ</p>
      <div>
        {comparing && <textarea aria-label="โค้ดก่อนแก้" readOnly spellCheck={false} value={original} />}
        <textarea aria-label="โค้ดปัจจุบัน" readOnly={readOnly} spellCheck={false} value={value} onChange={e => onChange(e.target.value)} />
      </div>
    </div>}
  </div>;
}
