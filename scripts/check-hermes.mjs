import { spawnSync } from "node:child_process";
import { agents, findHermes, agentEnv, provision, root } from "../bin/runtime.mjs";
const { python, install } = findHermes(); provision();
const code = [
  "import json, os, pathlib, yaml",
  "from gateway.config import load_gateway_config, Platform",
  "c = load_gateway_config()",
  "api = c.platforms.get(Platform.API_SERVER)",
  "assert api and api.enabled, 'API server is not enabled'",
  "assert int(api.extra.get('port')) == int(os.environ['API_SERVER_PORT']), 'Incorrect API port'",
  "assert api.extra.get('key') == os.environ['API_SERVER_KEY'], 'Incorrect API authentication'",
  "home = pathlib.Path(os.environ['HERMES_HOME'])",
  "raw = yaml.safe_load((home / 'config.yaml').read_text(encoding='utf-8'))",
  "assert 'axercise' in raw['mcp_servers'], 'Workspace tools are not configured'",
  "assert raw['terminal']['backend'] == 'local', 'Unexpected terminal backend'",
  "assert raw['approvals']['mode'] == ('off' if os.environ['HERMES_YOLO_MODE'] == 'true' else 'manual'), 'Unexpected permission mode'",
  "print(json.dumps({'valid': True, 'api_enabled': True, 'workspace_tools': True}))",
].join("\n");
for (const agent of agents) {
  const r = spawnSync(python, ["-c", code], { cwd: install, env: agentEnv(agent), windowsHide: true, encoding: "utf8", timeout: 60000 });
  if (r.status !== 0) { console.error(`${agent.name}: configuration validation failed${r.error ? ` (${r.error.code})` : ""}\n${r.stderr}`); process.exitCode = 1; }
  else console.log(`${agent.name}: API configuration, port, authentication, local terminal and workspace MCP validated.`);
}
void root;
