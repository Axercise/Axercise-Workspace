"use client";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useRef } from "react";
export function Modal({ open, onOpenChange, title, description, children, className, drawer = false }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode; className?: string; drawer?: boolean }) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="modal-overlay" /><DialogPrimitive.Content className={cn("modal-content", drawer && "drawer", className)} {...(!description ? { "aria-describedby": undefined } : {})} onOpenAutoFocus={() => { const target = document.activeElement; returnFocus.current = target instanceof HTMLElement && target !== document.body ? target : null; }} onCloseAutoFocus={event => { const target = returnFocus.current; returnFocus.current = null; const nextDialog = document.querySelector('[role="dialog"][data-state="open"]'); if (target?.isConnected && !target.matches(":disabled") && (!nextDialog || nextDialog.contains(target))) { event.preventDefault(); target.focus({ preventScroll: true }); } }}><div className="modal-heading"><div><DialogPrimitive.Title>{title}</DialogPrimitive.Title>{description && <DialogPrimitive.Description>{description}</DialogPrimitive.Description>}</div><DialogPrimitive.Close className="icon-button" aria-label="ปิด"><X size={18} /></DialogPrimitive.Close></div>{children}</DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>;
}
