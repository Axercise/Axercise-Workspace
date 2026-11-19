import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { WindowsToaster } from "node-notifier";
import { dataDir, readConfig, root, writeJSON } from "./runtime.mjs";

const appID = "Axercise.Workspace", active = new Map();
let installed = false, initializing;
const toaster = new WindowsToaster({ withFallback: false });
async function feedback(data, endpoint = "reminders") {
  try { const r = await fetch(`http://127.0.0.1:3210/api/internal/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${readConfig().serviceToken}` }, body: JSON.stringify(data), signal: AbortSignal.timeout(5000) }); return r.ok; } catch { return false; }
}
export async function sendDesktopHealthNotifications(deliveries = []) {
  if (!deliveries.length) return;
  const ready = await initializeDesktopNotifications();
  for (const item of deliveries) {
    const report = action => feedback({ id: item.id, action }, "health");
    if (!ready) { await report("failed"); continue; }
    const key = `health:${item.id}`;
    if (active.has(key)) continue;
    active.set(key, Date.now()); let failed = false;
    try {
      toaster.notify({ title: item.title, message: item.message, appID, id: 0x10000000 + parseInt(item.id.slice(0, 7), 16), sound: item.sound, duration: "long", actions: ["เปิดศูนย์สถานะ"] }, async (error, response, metadata) => {
        active.delete(key);
        if (error) { failed = true; await report("failed"); return; }
        const action = metadata?.activationType || metadata?.activationValue || response;
        if (["เปิดศูนย์สถานะ", "activate", "click"].includes(action)) spawn("rundll32.exe", ["url.dll,FileProtocolHandler", "http://127.0.0.1:3210/?health=open"], { detached: true, stdio: "ignore", windowsHide: true }).unref();
      });
      setTimeout(() => { if (!failed) void report("sent"); }, 1500).unref();
    } catch { active.delete(key); await report("failed"); }
  }
}
export async function initializeDesktopNotifications() {
  if (process.platform !== "win32") { await feedback({ action: "health", available: false, error: "การแจ้งเตือน native รองรับ Windows; ใช้การแจ้งเตือนจากเบราว์เซอร์แทนได้" }); return false; }
  if (installed) { await feedback({ action: "health", available: true }); return true; }
  if (initializing) return initializing;
  initializing = (async () => {
    try {
      const shortcut = path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Axercise Workspace.lnk");
      const marker = path.join(dataDir, "desktop-notifications.json");
      let registered; try { registered = JSON.parse(fs.readFileSync(marker, "utf8")); } catch {}
      if (!fs.existsSync(shortcut) || registered?.root !== root) {
        const exe = path.join(root, "node_modules", "node-notifier", "vendor", "snoreToast", process.arch === "x64" ? "snoretoast-x64.exe" : "snoretoast-x86.exe");
        const launcher = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "rundll32.exe");
        const install = spawnSync(exe, ["-install", "Axercise Workspace.lnk", launcher, appID], { windowsHide: true, encoding: "utf8", timeout: 20000 });
        if (install.status !== 0 || !fs.existsSync(shortcut)) throw new Error("Desktop registration failed");
        const literal = value => `'${value.replaceAll("'", "''")}'`;
        const script = `$shortcutShell=New-Object -ComObject WScript.Shell; $appShortcut=$shortcutShell.CreateShortcut(${literal(shortcut)}); $appShortcut.Arguments='url.dll,FileProtocolHandler http://127.0.0.1:3210/?reminders=open'; $appShortcut.WindowStyle=7; $appShortcut.Save();`;
        const edit = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { windowsHide: true, encoding: "utf8", timeout: 20000 });
        if (edit.status !== 0) throw new Error("Desktop shortcut failed");
        writeJSON(marker, { appID, root, shortcut });
      }
      installed = true;
      await feedback({ action: "health", available: true });
      return true;
    } catch {
      await feedback({ action: "health", available: false, error: "ลงทะเบียนแจ้งเตือน Windows ไม่สำเร็จ ลองเปิด Axercise ใหม่" });
      return false;
    } finally { initializing = undefined; }
  })();
  return initializing;
}

function openWorkspace(url) {
  if (!/^http:\/\/127\.0\.0\.1:3210\/\?reminder=[a-f0-9]{24}$/.test(url)) return;
  spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
}
export async function sendDesktopNotifications(deliveries = []) {
  if (!deliveries.length) return;
  if (!await initializeDesktopNotifications()) {
    for (const item of deliveries) await feedback({ action: "failed", deliveryId: item.deliveryId });
    return;
  }
  for (const item of deliveries) {
    if (active.has(item.deliveryId)) continue;
    let failed = false;
    active.set(item.deliveryId, Date.now());
    try {
      toaster.notify({ title: item.title, message: item.message, appID, id: parseInt(item.reminderId.slice(0, 7), 16), sound: item.sound, duration: "long", actions: ["รับทราบ", "เลื่อน 10 นาที", "เปิดดู"] }, async (error, response, metadata) => {
        active.delete(item.deliveryId);
        if (error) { failed = true; await feedback({ action: "failed", deliveryId: item.deliveryId }); return; }
        const action = metadata?.activationType || metadata?.activationValue || response;
        if (action === "รับทราบ") await feedback({ action: "acknowledge", deliveryId: item.deliveryId });
        else if (action === "เลื่อน 10 นาที") await feedback({ action: "snooze", deliveryId: item.deliveryId });
        else if (action === "เปิดดู" || action === "activate" || action === "click") openWorkspace(item.url);
      });
      // The native process keeps listening for buttons. Persist dispatch separately
      // so a notification left in Action Center does not get sent every tick.
      setTimeout(() => { if (!failed) void feedback({ action: "sent", deliveryId: item.deliveryId }); }, 1500).unref();
    } catch { active.delete(item.deliveryId); await feedback({ action: "failed", deliveryId: item.deliveryId }); }
  }
}
