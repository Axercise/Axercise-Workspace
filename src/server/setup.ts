import fs from "node:fs";
import path from "node:path";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { config, DATA, type Config } from "./store";
import { locateHermes } from "../../bin/hermes-install.mjs";

export function setupStatus(c: Config = config()) {
  const runtime = locateHermes(c.hermesPath);
  const ai = c.defaultProvider === "openrouter" ? !!c.openrouterKey : fs.existsSync(path.join(DATA, "hermes", "hermes", "auth.json"));
  const notion = !!(c.notion.token && c.notion.tasksId && c.notion.notesId);
  // Keep established installs usable offline after updating.
  const complete = c.setupComplete ?? (!!runtime && ai && notion);
  return { runtime: runtime?.install || "", ai, notion, complete, approvalMode: c.approvalMode || "off" };
}

export async function requireSetup() {
  await connection();
  if (!setupStatus().complete) redirect("/setup");
}
