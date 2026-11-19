import path from "node:path";
import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { root, agents, agentEnv, findHermes } from "./runtime.mjs";
import { currentCodexCredential, probeCurrentCodex } from "./codex-health.mjs";
const agent = agents.find(item => item.id === process.argv[2]);
let quickResult;
if (agent) {
  try {
    const auth = JSON.parse(fs.readFileSync(path.join(root, ".axercise", "hermes", agent.id, "auth.json"), "utf8"));
    const credential = currentCodexCredential(auth);
    if (credential) quickResult = await probeCurrentCodex(credential);
  } catch {}
}
if (quickResult) console.log(JSON.stringify(quickResult));
else {
try {
  if (!agent) throw new Error("Invalid agent");
  const { python, install } = findHermes();
  const child = spawn(python, ["-u", path.join(root, "scripts", "check-ai-connection.py")], { cwd: install, env: { ...agentEnv(agent), HERMES_CODEX_REFRESH_TIMEOUT_SECONDS: "8" }, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  let output = "", settled = false;
  function finish(result) { if (settled) return; settled = true; clearTimeout(timer); console.log(JSON.stringify(result)); }
  const timer = setTimeout(() => { if (process.platform === "win32" && child.pid) spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", timeout: 5000 }); else child.kill(); finish({ status: "offline", code: "timeout" }); }, 30000);
  child.stdout.on("data", data => { output += data; if (output.length > 8000) { child.kill(); finish({ status: "degraded", code: "probe_unavailable" }); } });
  child.once("error", () => finish({ status: "degraded", code: "runtime_missing" }));
  child.once("exit", code => { try { const result = JSON.parse(output); if (code !== 0 || !["healthy", "degraded", "offline", "auth_required", "unconfigured"].includes(result.status) || !["missing_auth", "invalid_auth_store", "rate_limit", "login_required", "permission", "provider_unavailable", "empty_catalog", "ok", "network", "probe_unavailable"].includes(result.code)) throw new Error(); finish(result); } catch { finish({ status: "degraded", code: "probe_unavailable" }); } });
} catch { console.log(JSON.stringify({ status: "degraded", code: "runtime_missing" })); }
}
