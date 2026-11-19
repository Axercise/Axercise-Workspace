import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { root, dataDir } from "./runtime.mjs";

const description = "Axercise Workspace automatic sign-in launch (v1)";
const shortcutName = "Axercise Workspace.lnk";
const shortcutCode = fs.readFileSync(new URL("./windows-shortcut.cs", import.meta.url), "utf8");
const literal = value => `'${value.replaceAll("'", "''")}'`;
function powershell(script, shortcut = false) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(`[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $ErrorActionPreference='Stop'; ${shortcut ? `Add-Type -TypeDefinition ${literal(shortcutCode)}; ` : ''}${script}`, "utf16le").toString("base64")], { windowsHide: true, encoding: "utf8", timeout: 15000 });
  if (result.status !== 0) throw new Error("ไม่สามารถจัดการการเปิดพร้อม Windows ได้ กรุณาลองอีกครั้ง", { cause: result.error?.message || result.stderr });
  return result.stdout.trim();
}
function locations(options = {}) {
  const startupDir = options.startupDir || powershell("[Environment]::GetFolderPath('Startup')");
  if (!startupDir || !path.isAbsolute(startupDir)) throw new Error("ไม่พบโฟลเดอร์ Startup ของบัญชี Windows นี้");
  const installRoot = path.resolve(options.root || root), stateDir = path.resolve(options.dataDir || dataDir);
  return {
    startupDir, shortcut: path.join(startupDir, shortcutName), root: installRoot, dataDir: stateDir,
    launcher: path.join(stateDir, "startup-launcher.js"), runner: path.join(installRoot, "bin", "startup-runner.mjs"),
    node: options.node || process.execPath,
    host: path.join(process.env.SystemRoot || "C:\\Windows", "System32", "wscript.exe"),
  };
}
export function startupScript(paths) {
  const js = value => JSON.stringify(value).replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
  const command = `"${paths.node}" "${paths.runner}"`;
  if ([paths.node, paths.runner, paths.root].some(value => /["%\r\n]/.test(value))) throw new Error("ตำแหน่งติดตั้งมีอักขระที่ไม่รองรับการเปิดอัตโนมัติ กรุณาย้ายโฟลเดอร์แล้วเปิดใช้ใหม่");
  return `// ${description}\r\nvar startupShell = new ActiveXObject("WScript.Shell");\r\nstartupShell.CurrentDirectory = ${js(paths.root)};\r\nWScript.Quit(startupShell.Run(${js(command)}, 0, true));\r\n`;
}
function inspect(paths) {
  return JSON.parse(powershell(String.raw`$itemPath=${literal(paths.shortcut)}; $exists=Test-Path -LiteralPath $itemPath; $owned=$false; $target=''; $arguments=''; $workingDirectory=''; $windowStyle=0; if($exists){ $item=[Axercise.StartupShortcut]::Read($itemPath); $owned=$item.Description -eq ${literal(description)}; $target=$item.TargetPath; $arguments=$item.Arguments; $workingDirectory=$item.WorkingDirectory; $windowStyle=$item.WindowStyle }; $approval=$null; try { $approval=Get-ItemPropertyValue -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder' -Name ${literal(shortcutName)} -ErrorAction Stop } catch {}; @{ exists=$exists; owned=$owned; target=$target; arguments=$arguments; workingDirectory=$workingDirectory; windowStyle=$windowStyle; windowsDisabled=($null -ne $approval -and $approval.Length -gt 0 -and ($approval[0] -eq 3 -or $approval[0] -eq 7)) } | ConvertTo-Json -Compress`, true));
}
function statusFor(paths) {
  const entry = inspect(paths);
  let scriptMatches = false;
  try { scriptMatches = fs.readFileSync(paths.launcher, "utf16le") === `\uFEFF${startupScript(paths)}`; } catch {}
  const valid = entry.owned && entry.target.toLowerCase() === paths.host.toLowerCase() && entry.arguments === `//B //NoLogo //E:JScript "${paths.launcher}"` && entry.workingDirectory.toLowerCase() === paths.root.toLowerCase() && entry.windowStyle === 7 && scriptMatches && fs.existsSync(paths.node) && fs.existsSync(paths.runner);
  const enabled = !!(valid && !entry.windowsDisabled);
  return { supported: true, installed: !!entry.exists, enabled, windowsDisabled: !!entry.windowsDisabled,
    message: entry.windowsDisabled ? "Windows ปิดรายการนี้ไว้ เปิด Axercise Workspace ใน Windows Settings → Apps → Startup" : entry.exists && !valid ? "พบรายการ Startup ที่ต้องตั้งค่าใหม่ เปิดตัวเลือกนี้เพื่อติดตั้งสำหรับโฟลเดอร์ปัจจุบัน" : undefined };
}
export function getStartupStatus(options = {}) {
  if (process.platform !== "win32") return { supported: false, installed: false, enabled: false, windowsDisabled: false, message: "การเปิดพร้อมระบบรองรับ Windows" };
  return statusFor(locations(options));
}
export function setStartupEnabled(enabled, options = {}) {
  if (typeof enabled !== "boolean") throw new Error("Startup enabled must be a boolean");
  if (process.platform !== "win32") throw new Error("การเปิดพร้อมระบบรองรับ Windows");
  const paths = locations(options), entry = inspect(paths);
  if (entry.exists && !entry.owned) throw new Error("มี Startup shortcut ชื่อ Axercise Workspace ของโปรแกรมอื่นอยู่แล้ว กรุณาตรวจรายการนั้นก่อน");
  if (!enabled) {
    if (entry.exists) fs.unlinkSync(paths.shortcut);
    return statusFor(paths);
  }
  for (const required of [paths.node, paths.runner, paths.host]) if (!fs.existsSync(required)) throw new Error("ไม่พบโปรแกรมที่ใช้เปิด Axercise กรุณาตรวจตำแหน่งติดตั้ง");
  const content = startupScript(paths);
  fs.mkdirSync(paths.dataDir, { recursive: true });
  const probe = path.join(paths.dataDir, `startup-engine-${process.pid}.js`);
  try {
    fs.writeFileSync(probe, "\uFEFFWScript.Quit(0);\r\n", "utf16le");
    const result = spawnSync(paths.host, ["//B", "//NoLogo", "//E:JScript", probe], { windowsHide: true, timeout: 15000 });
    if (result.status !== 0) throw new Error("Windows Script Host ไม่พร้อมใช้งาน จึงยังเปิดอัตโนมัติไม่ได้");
  } finally { fs.rmSync(probe, { force: true }); }
  fs.writeFileSync(paths.launcher, `\uFEFF${content}`, "utf16le");
  fs.mkdirSync(paths.startupDir, { recursive: true });
  powershell(`[Axercise.StartupShortcut]::Write(${literal(paths.shortcut)}, ${literal(paths.host)}, ${literal(`//B //NoLogo //E:JScript "${paths.launcher}"`)}, ${literal(paths.root)}, ${literal(description)}, ${literal(paths.node)})`, true);
  const status = statusFor(paths);
  if (!status.enabled) throw new Error(status.message || "Windows ยังไม่พร้อมเปิด Axercise อัตโนมัติ");
  return status;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const action = process.argv[2] || "status";
    if (!["on", "off", "status"].includes(action)) throw new Error("Use on, off or status");
    console.log(JSON.stringify(action === "status" ? getStartupStatus() : setStartupEnabled(action === "on")));
  } catch (error) { console.log(JSON.stringify({ error: error.message || "Could not update Windows startup" })); process.exitCode = 1; }
}
