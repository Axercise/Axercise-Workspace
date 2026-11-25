"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DropdownMenu } from "radix-ui";
import { ArrowLeft, ArrowUpRight, BookOpen, Bookmark, Brain, CalendarDays, Check, ChevronUp, Code2, LayoutDashboard, ListTodo, Menu, Settings2, Sunrise } from "lucide-react";
import { api } from "@/lib/client";
import type { BriefingFeed } from "@/lib/briefings";

const systems = [
  { id: "workspace", href: "/", label: "Workspace", description: "คุยกับ Hermes และผู้ช่วยของคุณ", icon: LayoutDashboard },
  { id: "briefing", href: "/briefing", label: "Daily Briefing", description: "สรุปวันนี้และเตรียมพร้อมพรุ่งนี้", icon: Sunrise },
  { id: "learning", href: "/learning", label: "การเรียน", description: "รายวิชา เอกสาร และการบ้าน", icon: BookOpen },
  { id: "library", href: "/library", label: "คลังบันทึก", description: "ลิงก์ รูปภาพ และสิ่งที่เก็บไว้", icon: Bookmark },
  { id: "code", href: "/code", label: "Code", description: "เปิดโปรเจกต์ แก้ไฟล์ และดู Diff", icon: Code2 },
] as const;
type SystemId = typeof systems[number]["id"];
type QuickPanel = "brain" | "tasks" | "calendar" | "settings";
type Props = { current: SystemId; disabled?: boolean; compact?: boolean; drafts?: number; onPanel?: (panel: QuickPanel) => void };

export function AppMenu({ current, disabled = false, compact = false, drafts = 0, onPanel }: Props) {
  const [unread, setUnread] = useState(0), [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), pendingPanel = useRef<QuickPanel | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => api<BriefingFeed>("/api/briefings?summary=1").then(feed => { if (alive) setUnread(feed.unread); }).catch(() => {});
    void refresh(); const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const selected = systems.find(item => item.id === current)!;
  const quickItem = (panel: QuickPanel, label: string, Icon: typeof Brain, shortcut?: string) => {
    const content = <><Icon size={18} /><span>{label}</span>{panel === "brain" && drafts > 0 ? <span className="app-menu-count">{drafts}</span> : shortcut ? <kbd>{shortcut}</kbd> : <ArrowUpRight size={14} className="app-menu-item-arrow" />}</>;
    return onPanel ? <DropdownMenu.Item className="app-menu-quick" onSelect={() => { pendingPanel.current = panel; }}>{content}</DropdownMenu.Item> : <DropdownMenu.Item asChild><Link className="app-menu-quick" href={`/?panel=${panel}`}>{content}</Link></DropdownMenu.Item>;
  };
  return <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
    <DropdownMenu.Trigger asChild><button ref={trigger} className={`app-menu-trigger ${compact ? "compact" : ""}`} disabled={disabled} aria-label="เปิดเมนูระบบ" title={disabled ? "รอให้งานที่กำลังทำเสร็จก่อนเปลี่ยนหน้า" : "เปิดเมนูระบบ"}><span className="app-menu-trigger-icon"><Menu size={21} />{unread > 0 && <i aria-hidden="true" />}</span><span className="app-menu-trigger-copy"><strong>เมนูระบบ</strong><small>{selected.label}</small></span><ChevronUp size={16} className="app-menu-trigger-chevron" /></button></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className="app-menu-content" side="top" align="start" sideOffset={12} collisionPadding={14} loop aria-label="เมนูระบบ" onCloseAutoFocus={event => { if (pendingPanel.current) { const panel = pendingPanel.current; pendingPanel.current = null; event.preventDefault(); trigger.current?.focus(); onPanel?.(panel); } }}>
      <DropdownMenu.Label className="app-menu-heading"><span>พื้นที่ของคุณ</span><small>AXERCISE</small></DropdownMenu.Label>
      {systems.map(item => <DropdownMenu.Item asChild key={item.id}><Link className={`app-menu-system ${current === item.id ? "current" : ""}`} href={item.href} aria-current={current === item.id ? "page" : undefined}><span className="app-menu-system-icon"><item.icon size={20} /></span><span className="app-menu-system-copy"><strong>{item.label}</strong><small>{item.description}</small></span>{item.id === "briefing" && unread > 0 ? <span className="app-menu-count" aria-label={`${unread} สรุปที่ยังไม่อ่าน`}>{unread > 99 ? "99+" : unread}</span> : current === item.id ? <Check size={16} aria-label="หน้าปัจจุบัน" /> : <ArrowUpRight size={15} className="app-menu-item-arrow" />}</Link></DropdownMenu.Item>)}
      <DropdownMenu.Separator className="app-menu-separator" /><DropdownMenu.Label className="app-menu-section-label">เครื่องมือด่วน</DropdownMenu.Label>
      {quickItem("brain", "Brain Dump", Brain, onPanel ? "Ctrl B" : undefined)}{quickItem("tasks", "To-do / Eisenhower", ListTodo)}{quickItem("calendar", "ปฏิทิน", CalendarDays)}
      <DropdownMenu.Separator className="app-menu-separator" />{quickItem("settings", "ตั้งค่าและการเชื่อมต่อ", Settings2)}
      <DropdownMenu.Arrow className="app-menu-arrow" width={16} height={8} />
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

export function WorkspaceBack({ disabled = false }: { disabled?: boolean }) {
  return <Link href="/" className="workspace-back" aria-disabled={disabled || undefined} onClick={event => { if (disabled) event.preventDefault(); }}><ArrowLeft size={17} /><span>กลับ Workspace</span></Link>;
}
