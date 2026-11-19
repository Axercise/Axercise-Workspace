import type { ModelOption } from "./types";
export function normalizeModels(raw: unknown): ModelOption[] {
  if (!raw || typeof raw !== "object") return [];
  const payload = raw as Record<string, unknown>;
  if (!Array.isArray(payload.providers)) return [];
  const options: ModelOption[] = [], seen = new Set<string>();
  for (const value of payload.providers) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>, provider = String(row.slug || row.provider || row.id || "");
    if (!provider || !Array.isArray(row.models)) continue;
    for (const entry of row.models) {
      const model = typeof entry === "string" ? { id: entry } : entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      const id = String(model.id || model.model || ""); if (!id || seen.has(`${provider}:${id}`)) continue;
      const caps = row.capabilities && typeof row.capabilities === "object" ? (row.capabilities as Record<string, Record<string, unknown>>)[id] : undefined;
      seen.add(`${provider}:${id}`); options.push({ id, provider, label: String(model.name || model.label || id), vision: typeof caps?.vision === "boolean" ? caps.vision : undefined });
    }
  }
  return options;
}
