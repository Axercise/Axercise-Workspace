import type { Draft } from "./types";
export const DRAFTS_KEY = "axercise-drafts-v1";
type DraftStorage = Pick<Storage, "getItem" | "setItem">;
export function readDrafts(storage: DraftStorage): Draft[] {
  try {
    const raw: unknown = JSON.parse(storage.getItem(DRAFTS_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((v): v is Draft => !!v && typeof v === "object" && typeof v.id === "string" && ["task", "note"].includes(v.kind) && typeof v.title === "string" && typeof v.content === "string" && typeof v.savedAt === "string") : [];
  } catch { return []; }
}
export function writeDrafts(storage: DraftStorage, drafts: Draft[]) { storage.setItem(DRAFTS_KEY, JSON.stringify(drafts)); }
