import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AppError } from "./http";
import { DATA, atomicJSON } from "./store";
import type { CodeEntry, CodeFile, CodeFolderListing, CodeProject, CodeVersion } from "../lib/code-project";

const run = promisify(execFile);
const storage = path.join(DATA, "code");
const registry = path.join(storage, "projects.json");
export const codeFileLimit = 1_000_000;
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const privateNames = /^(?:\.git|\.axercise|node_modules|\.next|\.venv|\.ssh|\.aws|\.npmrc|\.netrc|auth\.json|credentials\.json|tokens?\.json|client_secret.*\.json)$/i;
const privateFiles = /(?:\.(?:pem|key|p12|pfx|sqlite3?|db|exe|dll|zip)$|^\.env(?:\.|$))/i;

function allowedName(name: string) {
  return !!name && !/[<>:"|?*\\/\u0000-\u001f]/.test(name) && !/[. ]$/.test(name)
    && !/^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(name)
    && !privateNames.test(name) && (name === ".env.example" || !privateFiles.test(name));
}

function within(root: string, full: string) {
  const relative = path.relative(root, full);
  return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

export function projects(): CodeProject[] {
  return fs.existsSync(registry) ? JSON.parse(fs.readFileSync(registry, "utf8")) : [];
}

function rootDirectory(directory: string, browse = false) {
  if (!path.isAbsolute(directory) || (process.platform === "win32" && !/^[a-z]:[\\/]/i.test(directory))) throw new AppError("ระบุตำแหน่งโฟลเดอร์บนเครื่องให้ครบ");
  let resolved: string;
  try { resolved = fs.realpathSync(directory); } catch { throw new AppError("ไม่พบโฟลเดอร์นี้", 404); }
  const suffix = resolved.slice(path.parse(resolved).root.length);
  if (!fs.statSync(resolved).isDirectory() || (!browse && !suffix) || within(DATA, resolved)
    || (suffix && suffix.split(path.sep).some(name => !allowedName(name)))) {
    throw new AppError("เลือกโฟลเดอร์โปรเจกต์ที่ต้องการเปิด");
  }
  return resolved;
}

export function openProject(directory: string) {
  // Explorer's "Copy as path" surrounds a folder with double quotes.
  const resolved = rootDirectory(directory.trim().replace(/^"([^"]+)"$/, "$1"));
  const existing = projects();
  const match = existing.find(item => path.relative(item.directory, resolved) === "");
  const project = match ?? { id: randomUUID(), directory: resolved, name: path.basename(resolved) };
  atomicJSON(registry, [project, ...existing.filter(item => item.id !== project.id)].slice(0, 30));
  return project;
}

export function browseCodeFolders(directory = homedir()): CodeFolderListing {
  const current = rootDirectory(directory.trim().replace(/^"([^"]+)"$/, "$1"), true);
  const selectable = current !== path.parse(current).root;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(current, { withFileTypes: true });
  } catch {
    throw new AppError("อ่านรายการโฟลเดอร์นี้ไม่ได้ ลองเลือกตำแหน่งอื่น", 403);
  }
  return {
    directory: current,
    parent: selectable ? path.dirname(current) : null,
    selectable,
    folders: entries
      .filter(entry => entry.isDirectory() && allowedName(entry.name) && !within(DATA, path.join(current, entry.name)))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map(entry => ({ name: entry.name, directory: path.join(current, entry.name) })),
  };
}

export function projectById(id: string) {
  const project = projects().find(item => item.id === id);
  if (!project) throw new AppError("เปิดโฟลเดอร์โปรเจกต์ก่อน", 404);
  if (path.relative(project.directory, rootDirectory(project.directory)) !== "") throw new AppError("ตำแหน่งโปรเจกต์เปลี่ยนไป กรุณาเปิดใหม่", 409);
  return project;
}

function resolveEntry(project: CodeProject, relative: string, create = false) {
  if (!relative && !create) return project.directory;
  const segments = relative.split("/");
  if (segments.some(name => !allowedName(name))) throw new AppError("ไม่สามารถเปิดตำแหน่งไฟล์นี้ได้", 403);
  let cursor = project.directory;
  for (const [index, segment] of segments.entries()) {
    cursor = path.join(cursor, segment);
    const stats = fs.lstatSync(cursor, { throwIfNoEntry: false });
    if (!stats) {
      if (create && index === segments.length - 1) return cursor;
      throw new AppError("ไม่พบไฟล์หรือโฟลเดอร์นี้", 404);
    }
    const real = fs.realpathSync(cursor);
    if (stats.isSymbolicLink() || !within(project.directory, real) || path.relative(real, cursor) !== "") {
      throw new AppError("เปิดได้เฉพาะไฟล์ในโฟลเดอร์โปรเจกต์", 403);
    }
  }
  return cursor;
}

export function listCodeEntries(project: CodeProject, folder: string): CodeEntry[] {
  const target = resolveEntry(project, folder);
  if (!fs.statSync(target).isDirectory()) throw new AppError("เลือกโฟลเดอร์เพื่อดูรายการไฟล์");
  return fs.readdirSync(target, { withFileTypes: true })
    .filter(entry => allowedName(entry.name) && (entry.isDirectory() || entry.isFile()))
    .map(entry => ({ name: entry.name, path: folder ? folder + "/" + entry.name : entry.name, kind: entry.isDirectory() ? "folder" as const : "file" as const }))
    .sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.kind === "folder" ? -1 : 1);
}

function decode(bytes: Buffer) {
  if (bytes.length > codeFileLimit) throw new AppError("ไฟล์ใหญ่เกิน 1 MB", 413);
  if (bytes.includes(0)) throw new AppError("เปิดได้เฉพาะไฟล์ข้อความ UTF-8", 415);
  try { return decoder.decode(bytes); } catch { throw new AppError("ไฟล์นี้ไม่ได้ใช้ UTF-8", 415); }
}

function revision(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

export function readCodeFile(project: CodeProject, relative: string): CodeFile {
  const target = resolveEntry(project, relative);
  const fd = fs.openSync(target, "r");
  try {
    const stats = fs.fstatSync(fd);
    if (!stats.isFile() || stats.nlink > 1) throw new AppError("เปิดได้เฉพาะไฟล์ข้อความในโปรเจกต์");
    if (stats.size > codeFileLimit) throw new AppError("ไฟล์ใหญ่เกิน 1 MB", 413);
    const bytes = Buffer.allocUnsafe(codeFileLimit + 1);
    let used = 0;
    while (used < bytes.length) {
      const n = fs.readSync(fd, bytes, used, bytes.length - used, null);
      if (!n) break;
      used += n;
    }
    const content = decode(bytes.subarray(0, used));
    return { path: relative, content, revision: revision(content) };
  } finally { fs.closeSync(fd); }
}

function versionPath(project: CodeProject, relative: string, version: "checkpoint" | "previous") {
  const key = revision(process.platform === "win32" ? relative.toLowerCase() : relative);
  return path.join(storage, "history", project.id, key + "-" + version + ".json");
}

export function checkpoint(project: CodeProject, relative: string) {
  const file = readCodeFile(project, relative);
  atomicJSON(versionPath(project, relative, "checkpoint"), { content: file.content, date: new Date().toISOString() });
}

export function saveCodeFile(project: CodeProject, relative: string, content: string, expected: string) {
  if (content.includes("\0") || Buffer.byteLength(content) > codeFileLimit) throw new AppError("บันทึกได้เฉพาะไฟล์ข้อความไม่เกิน 1 MB", 413);
  const target = resolveEntry(project, relative);
  const current = readCodeFile(project, relative);
  if (current.revision !== expected) throw new AppError("ไฟล์เปลี่ยนบนดิสก์แล้ว เปิด Diff กับไฟล์บนดิสก์ก่อนบันทึกอีกครั้ง", 409);
  if (content === current.content) return current;
  const temp = path.join(path.dirname(target), "." + randomUUID() + ".axercise-tmp");
  try {
    fs.writeFileSync(temp, content, { flag: "wx", mode: fs.statSync(target).mode });
    if (readCodeFile(project, relative).revision !== expected) throw new AppError("ไฟล์เปลี่ยนบนดิสก์แล้ว", 409);
    atomicJSON(versionPath(project, relative, "previous"), { content: current.content, date: new Date().toISOString() });
    fs.renameSync(temp, target);
  } finally { try { fs.unlinkSync(temp); } catch {} }
  return { path: relative, content, revision: revision(content) };
}

export function createCodeEntry(project: CodeProject, relative: string, kind: CodeEntry["kind"]) {
  const target = resolveEntry(project, relative, true);
  if (fs.existsSync(target)) throw new AppError("มีไฟล์หรือโฟลเดอร์ชื่อนี้อยู่แล้ว", 409);
  if (kind === "folder") fs.mkdirSync(target);
  else fs.writeFileSync(target, "", { flag: "wx" });
}

function git(project: CodeProject, args: string[]) {
  return run("git", ["--literal-pathspecs", ...args], { cwd: project.directory, windowsHide: true, timeout: 10000, maxBuffer: codeFileLimit + 1, encoding: "buffer" });
}

export async function codeVersions(project: CodeProject, relative: string): Promise<CodeVersion[]> {
  resolveEntry(project, relative);
  const versions: CodeVersion[] = [];
  for (const id of ["checkpoint", "previous"] as const) {
    const file = versionPath(project, relative, id);
    if (fs.existsSync(file)) versions.push({ id, label: id === "checkpoint" ? "จุดที่บันทึกก่อนแก้" : "ก่อนเซฟครั้งล่าสุด", date: JSON.parse(fs.readFileSync(file, "utf8")).date });
  }
  try {
    const { stdout } = await git(project, ["log", "-n", "20", "--format=%H%x00%h%x00%aI%x00%s", "--", relative]);
    for (const line of stdout.toString("utf8").trim().split("\n")) {
      const [id, hash, date, subject] = line.split("\0");
      if (id) versions.push({ id, label: hash + " · " + subject, date });
    }
  } catch { /* The project or file may have no Git history. */ }
  return versions;
}

export async function readCodeVersion(project: CodeProject, relative: string, id: string) {
  resolveEntry(project, relative);
  if (id === "checkpoint" || id === "previous") {
    const file = versionPath(project, relative, id);
    if (!fs.existsSync(file)) throw new AppError("ยังไม่มีเวอร์ชันนี้", 404);
    return JSON.parse(fs.readFileSync(file, "utf8")).content as string;
  }
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(id)) throw new AppError("เลือกเวอร์ชัน Git จากรายการ");
  try {
    const { stdout: prefix } = await git(project, ["rev-parse", "--show-prefix"]);
    const { stdout } = await git(project, ["cat-file", "blob", `${id}:${prefix.toString("utf8").replace(/\r?\n$/, "")}${relative}`]);
    return decode(stdout);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("เวอร์ชันนี้ไม่มีไฟล์ดังกล่าว หรือไฟล์ใหญ่เกิน 1 MB", 404);
  }
}
