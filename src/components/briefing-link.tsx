"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Sunrise } from "lucide-react";
import { api } from "@/lib/client";
import type { BriefingFeed } from "@/lib/briefings";
export function BriefingLink({ className = "sidebar-link", disabled = false }: { className?: string; disabled?: boolean }) {
  const [unread, setUnread] = useState(0);
  useEffect(() => { let alive = true; const load = () => api<BriefingFeed>("/api/briefings?summary=1").then(r => { if (alive) setUnread(r.unread); }).catch(() => {}); void load(); const timer = setInterval(load, 60000); window.addEventListener("focus", load); return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", load); }; }, []);
  return <Link href="/briefing" className={className} aria-disabled={disabled || undefined} onClick={e => { if (disabled) e.preventDefault(); }}><Sunrise size={17} /><span>Daily Briefing</span>{unread > 0 && <span className="count-badge">{unread > 99 ? "99+" : unread}</span>}</Link>;
}
