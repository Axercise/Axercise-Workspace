import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function todayBangkok() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
export function quadrant(task: { important: boolean; urgent: boolean }) { return task.important ? (task.urgent ? 0 : 1) : (task.urgent ? 2 : 3); }
export const QUADRANTS = [
  { name: "ทำทันที", subtitle: "สำคัญ · เร่งด่วน", color: "rose" },
  { name: "วางแผน", subtitle: "สำคัญ · ไม่เร่งด่วน", color: "blue" },
  { name: "มอบหมาย", subtitle: "ไม่สำคัญ · เร่งด่วน", color: "amber" },
  { name: "ตัดออก", subtitle: "ไม่สำคัญ · ไม่เร่งด่วน", color: "gray" },
];
