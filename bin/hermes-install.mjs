import fs from "node:fs";
import path from "node:path";

// Only select a local Windows source installation with its own interpreter.
export function inspectHermes(directory) {
  if (!directory || !/^[a-z]:[\\/]/i.test(directory)) return null;
  const install = path.resolve(directory);
  if (!fs.existsSync(path.join(install, "hermes_cli", "main.py"))) return null;
  for (const env of ["venv", ".venv"]) {
    const python = path.join(install, env, "Scripts", "python.exe");
    if (fs.statSync(python, { throwIfNoEntry: false })?.isFile()) return { install, python };
  }
  return null;
}

export function locateHermes(configured) {
  if (configured) return inspectHermes(configured);
  const standard = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "hermes", "hermes-agent");
  return inspectHermes(process.env.AXERCISE_HERMES_PATH) || inspectHermes(standard);
}
