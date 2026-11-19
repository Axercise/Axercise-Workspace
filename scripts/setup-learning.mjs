import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { root, learningPython, findHermes } from "../bin/runtime.mjs";
const python = learningPython;
const env = path.dirname(path.dirname(python));
function run(command, args) { const result = spawnSync(command, args, { cwd: root, stdio: "inherit", windowsHide: true }); if (result.status !== 0) process.exit(result.status || 1); }
if (!fs.existsSync(python)) run(findHermes().python, ["-m", "venv", env]);
run(python, ["-m", "pip", "install", "--disable-pip-version-check", "--requirement", path.join(root, "scripts", "learning-requirements.txt")]);
console.log("Local document tools are ready.");
