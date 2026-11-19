import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { root, dataDir } from "./runtime.mjs";

fs.mkdirSync(dataDir, { recursive: true });
const logPath = path.join(dataDir, "startup.log");
const log = fs.openSync(logPath, "a");
fs.writeSync(log, `\n[${new Date().toISOString()}] Starting Axercise after Windows sign-in.\n`);
const child = spawn(process.execPath, [path.join(root, "bin", "axercise.mjs"), "start", "--no-open"], { cwd: root, env: { ...process.env, AXERCISE_ROOT: root }, windowsHide: true, stdio: ["ignore", log, log] });
child.once("error", () => { fs.writeSync(log, `[${new Date().toISOString()}] Could not start the Axercise launcher.\n`); fs.closeSync(log); process.exitCode = 1; });
child.once("exit", code => { fs.writeSync(log, `[${new Date().toISOString()}] Startup ${code === 0 ? "completed" : "failed; check daemon.log and web.log"}.\n`); fs.closeSync(log); process.exitCode = code === 0 ? 0 : 1; });
