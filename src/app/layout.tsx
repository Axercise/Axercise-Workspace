import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./learning.css";
import { NotificationCenter } from "@/components/notification-center";
import { HealthCenter } from "@/components/health-center";
const workspaceFont = localFont({
  src: "./fonts/NotoSansThai-Variable.ttf",
  variable: "--font-workspace",
  weight: "100 900",
  display: "swap",
  fallback: ["Segoe UI", "Tahoma", "Arial", "sans-serif"],
});
export const metadata: Metadata = { title: "Axercise — your space to do", description: "พื้นที่ทำงานส่วนตัว พร้อม Hermes AI, Calendar, Tasks และ Brain Dump" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="th" className={`dark ${workspaceFont.variable}`}><body>{children}<NotificationCenter /><HealthCenter /></body></html>; }
