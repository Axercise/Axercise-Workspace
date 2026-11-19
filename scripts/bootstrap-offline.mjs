import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const root = process.cwd();
const sources = process.argv.slice(2).map(p => path.resolve(p));
if (!sources.length) throw new Error("Pass existing project directories containing installed node_modules.");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const modules = path.join(root, "node_modules"); fs.mkdirSync(modules, { recursive: true });
const installed = new Map(); let count = 0;
function locate(name, from) {
  for (const start of [from, ...sources]) {
    let current = start;
    while (true) {
      const candidate = path.join(current, "node_modules", name, "package.json");
      if (fs.existsSync(candidate)) return fs.realpathSync(path.dirname(candidate));
      const parent = path.dirname(current); if (parent === current) break; current = parent;
    }
  }
  return null;
}
function copy(name, from, optional = false, parentTarget = root) {
  const source = locate(name, from);
  if (!source) { if (optional) return; throw new Error(`Installed dependency missing: ${name}`); }
  const meta = JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf8"));
  if (meta.os && !meta.os.includes(process.platform) && !meta.os.includes(`!${process.platform}`)) return;
  if (meta.cpu && !meta.cpu.includes(process.arch)) return;
  let target = path.join(modules, name);
  if (fs.existsSync(path.join(target, "package.json"))) {
    const present = JSON.parse(fs.readFileSync(path.join(target, "package.json"), "utf8"));
    if (present.version !== meta.version) target = path.join(parentTarget, "node_modules", name);
  }
  const key = `${name}@${meta.version}:${target}`;
  if (installed.has(key)) return meta.version;
  if (!path.resolve(target).startsWith(path.resolve(modules) + path.sep)) throw new Error("Invalid dependency target");
  if (path.resolve(source) !== path.resolve(target)) fs.cpSync(source, target, { recursive: true, filter: src => !path.relative(source, src).split(path.sep).includes("node_modules") });
  installed.set(key, true); count++;
  for (const dep of Object.keys(meta.dependencies || {})) copy(dep, source, !!meta.optionalDependencies?.[dep], target);
  for (const dep of Object.keys(meta.optionalDependencies || {})) copy(dep, source, true, target);
  const bin = typeof meta.bin === "string" ? { [name.split("/").at(-1)]: meta.bin } : meta.bin || {};
  for (const [cmd, file] of Object.entries(bin)) { const binDir = path.join(modules, ".bin"); fs.mkdirSync(binDir, { recursive: true }); const executable = path.join(target, file); fs.writeFileSync(path.join(binDir, `${cmd}.cmd`), `@echo off\r\nnode "${executable}" %*\r\n`); }
  return meta.version;
}
for (const section of ["dependencies", "devDependencies"]) for (const name of Object.keys(manifest[section] || {})) { const version = copy(name, root); if (version) manifest[section][name] = version; }
fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Copied ${count} installed dependency packages without network access.`);
