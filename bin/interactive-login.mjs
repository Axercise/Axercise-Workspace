// Start in an interactive Windows console so Hermes can use its model picker.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cli = fileURLToPath(new URL("./axercise.mjs", import.meta.url));
const run = command => spawnSync(process.execPath, [cli, command], { stdio: "inherit" });
const login = run("login");
run("start");
process.exitCode = login.status ?? 1;
