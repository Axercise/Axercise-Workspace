// Read-only connection diagnostics. Never print credentials or message content.
import fs from "node:fs";
import path from "node:path";
import { agents, dataDir, readConfig } from "../bin/runtime.mjs";

const expectedServer = process.argv[2];
const config = readConfig();
let failed = false;
for (const agent of agents) {
  const bot = config.discord.find(row => row.agent === agent.id);
  const result = { agent: agent.id, tokenConfigured: !!bot?.token, ownerRestricted: !!bot?.allowedUserId };
  try {
    const file = path.join(dataDir, "hermes", agent.id, "gateway_state.json");
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    process.kill(state.pid, 0);
    result.gateway = state.platforms?.discord?.state || "not-enabled";
  } catch { result.gateway = "not-running"; }
  if (bot?.token) {
    try {
      const get = async endpoint => {
        const response = await fetch(`https://discord.com/api/v10/${endpoint}`, { headers: { Authorization: `Bot ${bot.token}` }, signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error("Discord request failed");
        return response.json();
      };
      const application = await get("oauth2/applications/@me");
      const guilds = await get("users/@me/guilds");
      result.botId = application.id;
      result.name = application.name;
      result.ownerMatches = application.owner?.id === bot.allowedUserId;
      result.messageContentEnabled = !!(application.flags & ((1 << 18) | (1 << 19)));
      result.servers = guilds.map(guild => ({ id: guild.id, name: guild.name }));
      result.serverInstalled = expectedServer ? guilds.some(guild => guild.name === expectedServer) : guilds.length > 0;
    } catch { result.api = "unavailable"; }
  }
  result.ready = !!(result.tokenConfigured && result.ownerRestricted && result.ownerMatches && result.messageContentEnabled && result.serverInstalled && result.gateway === "connected");
  if (!result.ready) failed = true;
  console.log(JSON.stringify(result));
}
if (failed) process.exitCode = 1;
