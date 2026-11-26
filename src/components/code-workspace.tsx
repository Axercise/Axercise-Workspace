"use client";

import { useEffect, useRef, useState, type ComponentProps, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowUp, ChevronDown, ChevronRight, Code2, FileCode2, FilePlus2, Folder, FolderOpen, FolderPlus, GitCompareArrows, Loader2, PictureInPicture2, Save, Sparkles, Terminal, X } from "lucide-react";
import { api } from "@/lib/client";
import type { CodeEntry, CodeFile, CodeFolderListing, CodeProject, CodeVersion } from "@/lib/code-project";
import { AppMenu, WorkspaceBack } from "./app-menu";
import { CodeEditor } from "./code-editor";
import { CodeAfk } from "./code-afk";
import { TerminalDock } from "./terminal-dock";
import { CodeResizeHandle, useCodePanelSize } from "./code-resize";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import type { FloatingCodeView } from "./code-session";
import "./code-workspace.css";

const endpoint = "/api/code";
function get<T>(action: string, project?: string, path?: string, version?: string) {
  const query = new URLSearchParams({ action });
  if (project) query.set("project", project);
  if (path) query.set("path", path);
  if (version) query.set("version", version);
  return api<T>(endpoint + "?" + query);
}
const post = <T,>(value: object) => api<T>(endpoint, { method: "POST", body: JSON.stringify(value) });

type Tab = CodeFile & { draft: string };
type Comparison = { path: string; title: string; original: string; disk?: CodeFile };
type Proposal = { path: string; before: string; content: string; summary: string };
const nameOf = (file: string) => file.split("/").at(-1) || file;
const dirty = (tab: Tab) => tab.draft !== tab.content;

export function CodeWorkspace({ floating = false, floatingView = "terminal", onProjectChange, onMinimize, onExit }: {
  floating?: boolean;
  floatingView?: FloatingCodeView;
  onProjectChange?: (project?: CodeProject) => void;
  onMinimize?: () => void;
  onExit?: () => void;
}) {
  const [recent, setRecent] = useState<CodeProject[]>([]);
  const [project, setProject] = useState<CodeProject>();
  const [directory, setDirectory] = useState("");
  const [choosing, setChoosing] = useState(false);
  const directoryInput = useRef<HTMLInputElement>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseBusy, setBrowseBusy] = useState(false);
  const [listing, setListing] = useState<CodeFolderListing>();
  const [browsePath, setBrowsePath] = useState("");
  const [browseError, setBrowseError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(true);
  const [message, setMessage] = useState("");
  const [hasDrafts, setHasDrafts] = useState(false);
  const currentDrafts = useRef(false);
  useEffect(() => { currentDrafts.current = hasDrafts; }, [hasDrafts]);
  useEffect(() => { onProjectChange?.(project); }, [project, onProjectChange]);
  useEffect(() => { if (floating) setBrowseOpen(false); }, [floating]);
  const leave: ComponentProps<typeof Link>["onNavigate"] = event => {
    if (currentDrafts.current && !confirm("ปิดหน้า Code และ Terminal และละทิ้งการแก้ไขที่ยังไม่เซฟ?")) { event.preventDefault(); return; }
    onExit?.();
  };

  useEffect(() => {
    get<CodeProject[]>("projects").then(setRecent).catch(error => setMessage(error.message));
  }, []);

  async function browse(target?: string) {
    setBrowseBusy(true);
    setBrowseError("");
    try {
      const query = new URLSearchParams({ action: "folders" });
      if (target) query.set("directory", target);
      const result = await api<CodeFolderListing>(endpoint + "?" + query);
      setListing(result);
      setBrowsePath(result.directory);
    } catch (error) { setBrowseError((error as Error).message); }
    finally { setBrowseBusy(false); }
  }

  async function openFolder(target: string) {
    setChoosing(true);
    setMessage("");
    setBrowseError("");
    try {
      const next = await post<CodeProject>({ action: "open", directory: target });
      if (next.id !== project?.id && currentDrafts.current && !confirm("เปลี่ยนโปรเจกต์และละทิ้งการแก้ไขที่ยังไม่เซฟ?")) return;
      setRecent(items => [next, ...items.filter(item => item.id !== next.id)].slice(0, 30));
      setProject(next);
      setDirectory(next.directory);
      setPickerOpen(false);
      setBrowseOpen(false);
    } catch (error) { (browseOpen ? setBrowseError : setMessage)((error as Error).message); }
    finally { setChoosing(false); }
  }

  return <main className="code-workspace" role={floating ? "region" : undefined} aria-label="ตัวแก้โค้ดและ Terminal">
    <header className="code-header">
      <div><WorkspaceBack onNavigate={leave} /><h1><Code2 size={24} />Code</h1></div>
      <div><Link className="button button-secondary button-sm" href="/" onNavigate={onMinimize} title="ใช้หน้าอื่นโดยเก็บ Code และ CLI เป็นหน้าต่างลอย"><PictureInPicture2 size={16} />ย่อเป็นหน้าต่าง</Link><CodeAfk />{project && <Button variant="secondary" size="sm" aria-expanded={pickerOpen} disabled={choosing} onClick={() => {
        setPickerOpen(!pickerOpen);
        if (!pickerOpen) requestAnimationFrame(() => directoryInput.current?.focus());
      }}><FolderOpen size={16} />เปลี่ยนโปรเจกต์</Button>}<AppMenu current="code" compact onNavigate={leave} /></div>
    </header>
    {pickerOpen && <section className="code-picker" aria-label="เปิดโปรเจกต์บนเครื่อง">
      <form onSubmit={event => { event.preventDefault(); void openFolder(directory); }}>
        <label className="field"><span>ตำแหน่งโฟลเดอร์โปรเจกต์</span><input ref={directoryInput} value={directory} onChange={event => setDirectory(event.target.value)} placeholder="C:\Projects\my-app" /></label>
        <Button type="submit" disabled={choosing || !directory.trim()}>เปิดโปรเจกต์</Button>
        <Button type="button" variant="secondary" disabled={choosing} onClick={() => { setBrowsePath(directory); setBrowseOpen(true); void browse(directory.trim() || undefined); }}><FolderOpen size={16} />เลือกโฟลเดอร์</Button>
      </form>
      {recent.length > 0 && <label className="field code-recent"><span>โปรเจกต์ล่าสุด</span><select value={recent.some(item => item.directory === directory) ? directory : ""} onChange={event => setDirectory(event.target.value)}>
        <option value="">เลือกโปรเจกต์</option>{recent.map(item => <option key={item.id} value={item.directory}>{item.name} · {item.directory}</option>)}
      </select></label>}
      <p role="status">{message}</p>
    </section>}
    <Modal open={browseOpen} onOpenChange={value => { if (!choosing) setBrowseOpen(value); }} title="เลือกโฟลเดอร์โปรเจกต์" className="code-folder-dialog">
      <div className="code-folder-body">
        <form className="code-folder-address" onSubmit={event => { event.preventDefault(); void browse(browsePath.trim() || undefined); }}>
          <label className="field"><span>ตำแหน่งที่ต้องการเปิด</span><input value={browsePath} placeholder="C:\Projects" onChange={event => setBrowsePath(event.target.value)} /></label>
          <Button variant="secondary" type="submit" disabled={browseBusy || choosing}>ไปที่</Button>
        </form>
        <div className="code-folder-nav">
          <Button variant="secondary" size="sm" disabled={browseBusy || choosing || !listing?.parent} onClick={() => void browse(listing?.parent ?? undefined)}><ArrowUp size={15} />ขึ้นหนึ่งระดับ</Button>
          <Button variant="ghost" size="sm" disabled={browseBusy || choosing} onClick={() => void browse()}>โฟลเดอร์ผู้ใช้</Button>
        </div>
        {browseError && <p role="alert">{browseError}</p>}
        {browseBusy ? <p role="status">กำลังอ่านโฟลเดอร์…</p> : <div className="code-folder-list" aria-label="รายการโฟลเดอร์">
          {listing?.folders.map(item => <button type="button" key={item.directory} onClick={() => void browse(item.directory)} disabled={choosing}><Folder size={16} /><span>{item.name}</span><ChevronRight size={15} /></button>)}
          {listing && !listing.folders.length && <p>ไม่มีโฟลเดอร์ย่อย</p>}
        </div>}
      </div>
      <div className="modal-footer"><span className="code-folder-selected" title={listing?.directory}>{listing?.directory}</span><Button disabled={browseBusy || choosing || !!browseError || !listing?.selectable} onClick={() => { if (listing) void openFolder(listing.directory); }}>ใช้โฟลเดอร์นี้</Button></div>
    </Modal>
    {project ? <ProjectEditor key={project.id} project={project} floating={floating} floatingView={floatingView} onEditState={setHasDrafts} /> : <div className="code-empty"><FolderOpen size={34} /><p>เลือกโฟลเดอร์เพื่อเปิดไฟล์ในโปรเจกต์</p></div>}
  </main>;
}

function ProjectEditor({ project, floating, floatingView, onEditState }: { project: CodeProject; floating: boolean; floatingView: FloatingCodeView; onEditState: (open: boolean) => void }) {
  const layout = useRef<HTMLDivElement>(null);
  const explorer = useRef<HTMLElement>(null);
  const [explorerWidth, setExplorerWidth] = useCodePanelSize("axercise-code-explorer-width-v1");
  const [terminalPanel, setTerminalPanel] = useState<"closed" | "visible" | "hidden">("closed");
  useEffect(() => { if (floating && floatingView === "terminal") setTerminalPanel("visible"); }, [floating, floatingView]);
  const [tree, setTree] = useState<Record<string, CodeEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [folder, setFolder] = useState("");
  const [tabs, setTabs] = useState<Tab[]>([]);
  const liveDrafts = useRef(new Map<string, string>());
  const [selected, setSelected] = useState("");
  const [history, setHistory] = useState<{ path: string; items: CodeVersion[] }>();
  const [diff, setComparison] = useState<Comparison>();
  const [proposal, setProposal] = useState<Proposal>();
  const [instruction, setInstruction] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState<CodeEntry["kind"]>();
  const [entryName, setEntryName] = useState("");
  const [message, setMessage] = useState("");
  const tab = tabs.find(item => item.path === selected);
  const versions = history?.path === selected ? history.items : undefined;
  const comparison = diff?.path === selected ? diff : undefined;
  const suggested = proposal?.path === selected ? proposal : undefined;
  const unsaved = tabs.some(dirty);

  useEffect(() => { onEditState(unsaved); }, [unsaved, onEditState]);
  useEffect(() => {
    if (!unsaved) return;
    function beforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ""; }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [unsaved]);

  useEffect(() => {
    let active = true;
    get<CodeEntry[]>("list", project.id).then(entries => { if (active) setTree({ "": entries }); }).catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [project.id]);

  async function run(action: () => Promise<void>) {
    setMessage("");
    try { await action(); } catch (error) { setMessage((error as Error).message); }
  }

  async function loadFolder(target: string) {
    const entries = await get<CodeEntry[]>("list", project.id, target);
    setTree(value => ({ ...value, [target]: entries }));
  }

  function select(file: string) {
    setSelected(file);
    setComparison(undefined);
    setHistory(undefined);
  }

  async function openFile(file: string) {
    select(file);
    if (tabs.some(item => item.path === file)) return;
    const result = await get<CodeFile>("file", project.id, file);
    setTabs(items => items.some(item => item.path === file) ? items : [...items, { ...result, draft: result.content }]);
  }

  function closeFile(file: Tab) {
    if (dirty(file) && !confirm("ปิดแท็บและละทิ้งการแก้ไขที่ยังไม่เซฟ?")) return;
    const rest = tabs.filter(item => item.path !== file.path);
    liveDrafts.current.delete(file.path);
    setTabs(rest);
    if (selected === file.path) select(rest.at(-1)?.path ?? "");
  }

  async function save() {
    if (!tab || saving || suggested) return;
    const draft = liveDrafts.current.get(tab.path) ?? tab.draft;
    if (draft === tab.content) return;
    setSaving(true);
    await run(async () => {
      const file = await post<CodeFile>({ action: "save", project: project.id, path: tab.path, revision: tab.revision, content: draft });
      setTabs(items => items.map(item => item.path === file.path ? { ...item, ...file } : item));
      setMessage("บันทึก " + nameOf(file.path) + " ลงดิสก์แล้ว");
      if (!comparison) setHistory(undefined);
    });
    setSaving(false);
  }

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (!(event.target instanceof HTMLElement) || !event.target.closest(".code-workspace") || event.target.closest(".code-terminal")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); }
    }
    window.addEventListener("keydown", keyboard, true);
    return () => window.removeEventListener("keydown", keyboard, true);
  });

  async function compare(id: string) {
    if (!tab) return;
    if (id === "disk") {
      const disk = await get<CodeFile>("file", project.id, tab.path);
      setComparison({ path: tab.path, title: "ไฟล์บนดิสก์", original: disk.content, disk });
    } else {
      const result = await get<{ content: string }>("version", project.id, tab.path, id);
      setComparison({ path: tab.path, title: versions?.find(item => item.id === id)?.label || "ก่อนแก้", original: result.content });
    }
  }

  async function generate() {
    if (!tab || !instruction.trim() || generating) return;
    setGenerating(true);
    await run(async () => {
      const result = await post<{ content: string; summary: string }>({ action: "propose", project: project.id, path: tab.path, content: tab.draft, instruction });
      setProposal({ ...result, before: tab.draft, path: tab.path });
    });
    setGenerating(false);
  }

  async function createEntry() {
    if (!creating || !entryName.trim()) return;
    if (/[\\/]/.test(entryName)) throw new Error("ใส่ชื่อไฟล์หรือโฟลเดอร์ทีละชื่อ");
    const file = folder ? folder + "/" + entryName.trim() : entryName.trim();
    await post({ action: "create", kind: creating, project: project.id, path: file });
    const parent = file.split("/").slice(0, -1).join("/");
    await loadFolder(parent);
    if (parent) setExpanded(items => new Set([...items, parent]));
    if (creating === "file") await openFile(file);
    setCreating(undefined);
    setEntryName("");
  }

  function updateDraft(file: string, draft: string) {
    liveDrafts.current.set(file, draft);
    setTabs(items => items.map(item => item.path === file ? { ...item, draft } : item));
  }

  function rows(target: string, depth: number) {
    return tree[target]?.map(entry => <div key={entry.path}>
      <button className={`code-tree-row${entry.path === selected || entry.path === folder ? " selected" : ""}`}
        style={{ paddingLeft: 10 + depth * 15 }} title={entry.path}
        aria-expanded={entry.kind === "folder" ? expanded.has(entry.path) : undefined}
        onClick={() => void run(async () => {
          if (entry.kind === "file") { await openFile(entry.path); return; }
          setFolder(entry.path);
          if (expanded.has(entry.path)) setExpanded(items => new Set([...items].filter(item => item !== entry.path)));
          else {
            if (!tree[entry.path]) await loadFolder(entry.path);
            setExpanded(items => new Set([...items, entry.path]));
          }
        })}>
        {entry.kind === "folder" ? <>{expanded.has(entry.path) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<Folder size={15} /></> : <FileCode2 size={15} />}
        <span>{entry.name}</span>
      </button>
      {expanded.has(entry.path) && rows(entry.path, depth + 1)}
    </div>);
  }

  return <div className="code-layout" ref={layout} style={explorerWidth === undefined ? undefined : { "--code-explorer-width": `${explorerWidth}px` } as CSSProperties}>
    <aside className="code-explorer" ref={explorer} aria-label="ไฟล์โปรเจกต์">
      <div className="code-explorer-head">
        <button className="code-project-name" onClick={() => setFolder("")} title={project.directory}><FolderOpen size={18} /><strong>{project.name}</strong></button>
        <button className="icon-button" aria-label="สร้างไฟล์" title="สร้างไฟล์" onClick={() => setCreating("file")}><FilePlus2 size={16} /></button>
        <button className="icon-button" aria-label="สร้างโฟลเดอร์" title="สร้างโฟลเดอร์" onClick={() => setCreating("folder")}><FolderPlus size={16} /></button>
      </div>
      <small className="code-current-folder" title={folder}>{folder || "โฟลเดอร์หลัก"}</small>
      {creating && <form className="code-create" onSubmit={event => { event.preventDefault(); void run(createEntry); }}>
        <input aria-label={creating === "file" ? "ชื่อไฟล์ใหม่" : "ชื่อโฟลเดอร์ใหม่"} autoFocus value={entryName} onChange={event => setEntryName(event.target.value)} placeholder={creating === "file" ? "index.ts" : "src"} />
        <Button size="sm" disabled={!entryName.trim()}>สร้าง</Button>
        <button type="button" className="icon-button" aria-label="ยกเลิกสร้าง" onClick={() => setCreating(undefined)}><X size={14} /></button>
      </form>}
      <div className="code-tree">{rows("", 0)}</div>
      <Button variant="ghost" size="sm" onClick={() => void run(async () => { await Promise.all(["", ...expanded].map(loadFolder)); })}>โหลดรายการไฟล์ใหม่</Button>
    </aside>
    <CodeResizeHandle label="ปรับความกว้างโฟลเดอร์" axis="width"
      measure={() => explorer.current?.getBoundingClientRect().width || 260}
      bounds={() => ({ min: 110, max: Math.max(110, Math.min(650, (layout.current?.clientWidth || window.innerWidth) - 320)) })}
      onChange={setExplorerWidth} />
    <section className="code-main" aria-label="ตัวแก้โค้ด">
      <div className="code-project-actions"><Button variant="secondary" size="sm" aria-expanded={terminalPanel === "visible"} onClick={() => setTerminalPanel(value => value === "visible" ? "hidden" : "visible")}><Terminal size={16} />Terminal</Button></div>
      {tabs.length > 0 && <div className="code-tabs" role="group" aria-label="ไฟล์ที่เปิด">
        {tabs.map(item => <div key={item.path} className={item.path === selected ? "selected" : ""}>
          <button title={item.path} aria-pressed={item.path === selected} onClick={() => select(item.path)}>{dirty(item) ? "● " : ""}{nameOf(item.path)}</button>
          <button title="ปิดแท็บ" aria-label={"ปิด " + nameOf(item.path)} onClick={() => closeFile(item)}><X size={14} /></button>
        </div>)}
      </div>}
      {tab ? <>
        <div className="code-tools">
          <span title={tab.path}>{tab.path}</span>
          <Button size="sm" disabled={saving || !dirty(tab) || !!suggested} onClick={() => void save()}><Save size={15} />เซฟ <kbd>Ctrl+S</kbd></Button>
          <Button variant="secondary" size="sm" onClick={() => void run(async () => {
            if (versions) { setHistory(undefined); setComparison(undefined); }
            else setHistory({ path: tab.path, items: await get<CodeVersion[]>("versions", project.id, tab.path) });
          })}><GitCompareArrows size={15} />Diff</Button>
          <Button variant="secondary" size="sm" onClick={() => setAiOpen(value => !value)}><Sparkles size={15} />Developer</Button>
        </div>
        {versions && <div className="code-versions">
          <label className="field"><span>เทียบกับ</span><select defaultValue="" onChange={event => { if (event.target.value) void run(() => compare(event.target.value)); else setComparison(undefined); }}>
            <option value="">เลือกเวอร์ชัน</option><option value="disk">ไฟล์บนดิสก์</option>{versions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
          <Button variant="secondary" size="sm" onClick={() => void run(async () => {
            await post({ action: "checkpoint", project: project.id, path: tab.path });
            setHistory({ path: tab.path, items: await get<CodeVersion[]>("versions", project.id, tab.path) });
            setMessage("บันทึกจุดเทียบจากไฟล์บนดิสก์แล้ว");
          })}>เก็บจุดเทียบก่อนแก้</Button>
          {comparison?.disk && comparison.disk.revision !== tab.revision && <Button variant="secondary" size="sm" onClick={() => {
            const disk = comparison.disk!;
            setTabs(items => items.map(item => item.path === disk.path ? { ...item, ...disk } : item));
            setMessage("ใช้ไฟล์บนดิสก์เป็นฐานแล้ว ตรวจ Diff และเซฟได้");
          }}>ใช้ไฟล์บนดิสก์เป็นฐาน</Button>}
        </div>}
        {aiOpen && <form className="code-ai" onSubmit={event => { event.preventDefault(); void generate(); }}>
          <label className="field"><span>ให้ Developer เสนอการแก้ไฟล์นี้</span><input value={instruction} maxLength={6000} onChange={event => setInstruction(event.target.value)} placeholder="เช่น เพิ่มการตรวจค่าก่อนบันทึก" /></label>
          <Button size="sm" disabled={generating || !instruction.trim() || tab.draft.length > 48000}>{generating && <Loader2 size={15} className="spin" />}เสนอการแก้</Button>
          <small>{tab.draft.length > 48000 ? "เลือกไฟล์ที่มีขนาดไม่เกิน 48,000 ตัวอักษรเพื่อส่งให้ AI" : "ส่งคำขอกับเนื้อหาแท็บนี้ไปยังผู้ให้บริการ AI ที่เชื่อมไว้"}</small>
        </form>}
        {suggested && <div className="code-proposal">
          <p>{suggested.summary || "Developer เสนอเวอร์ชันใหม่สำหรับไฟล์นี้"}</p>
          <Button size="sm" disabled={tab.draft !== suggested.before} onClick={() => { updateDraft(tab.path, suggested.content); setProposal(undefined); }}>นำไปใช้กับแท็บ</Button>
          <Button variant="ghost" size="sm" onClick={() => setProposal(undefined)}>ปิดข้อเสนอ</Button>
          {tab.draft !== suggested.before && <small>แท็บเปลี่ยนจากตอนส่งคำขอ ให้เสนอการแก้ใหม่เพื่อใช้เนื้อหาล่าสุด</small>}
        </div>}
        {(suggested || comparison) && <div className="code-diff-labels"><span>{suggested ? "ก่อนแก้" : comparison?.title}</span><span>{suggested ? "ข้อเสนอจาก Developer" : "โค้ดปัจจุบัน"}</span></div>}
        <CodeEditor key={tab.path} path={tab.path} value={suggested?.content ?? tab.draft} original={suggested?.before ?? comparison?.original} readOnly={!!suggested} onChange={value => { if (!suggested) updateDraft(tab.path, value); }} />
      </> : <div className="code-empty"><FileCode2 size={34} /><p>{selected ? "กำลังเปิดไฟล์ หรือไฟล์นี้เปิดไม่ได้" : floating ? "ขยายกลับหน้า Code เพื่อเลือกไฟล์" : "เลือกไฟล์จากรายการทางซ้าย"}</p></div>}
      {floating && floatingView === "terminal" && terminalPanel === "closed" && <div className="code-terminal-reopen code-empty"><Terminal size={28} /><Button size="sm" onClick={() => setTerminalPanel("visible")}>เปิด Terminal</Button></div>}
      {terminalPanel !== "closed" && <TerminalDock project={project.id} hidden={terminalPanel === "hidden" || (floating && floatingView === "code")} onClose={() => setTerminalPanel("closed")} />}
      <div className="code-status" role="status">{message || (unsaved ? "มีไฟล์ที่ยังไม่เซฟ" : project.directory)}</div>
    </section>
  </div>;
}
