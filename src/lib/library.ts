export const LIBRARY_FILE_LIMIT = 50 * 1024 * 1024;
export const LIBRARY_KINDS = ["all", "link", "image", "note", "file", "video", "audio"] as const;
export type LibraryKind = typeof LIBRARY_KINDS[number];
export type LibraryAsset = { id: string; name: string; size: number; mime: string; sha256: string; createdAt: string };
export type LibraryItem = { id: string; revision: number; title: string; content: string; urls: string[]; tags: string[]; favorite: boolean; fileIds: string[]; files: LibraryAsset[]; source: string; createdAt: string; updatedAt: string; deletedAt?: string };
export type LibraryFeed = { items: LibraryItem[]; total: number; offset: number; limit: number; counts: Record<LibraryKind | "trash" | "favorites", number>; tags: string[] };
export const libraryFileUrl = (id: string, download = false) => `/api/library/files/${encodeURIComponent(id)}${download ? "?download=1" : ""}`;
export function libraryHasKind(item: Pick<LibraryItem, "files" | "urls" | "content">, kind: LibraryKind) {
  if (kind === "all") return true;
  if (kind === "link") return item.urls.length > 0;
  if (kind === "note") return !!item.content.trim();
  if (kind === "file") return item.files.some(f => !/^(image|audio|video)\//.test(f.mime));
  return item.files.some(f => f.mime.startsWith(`${kind}/`));
}
export function readableBytes(size: number) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }
export const CHAT_ATTACHMENT_START = "<axercise_saved_attachments>";
export const CHAT_ATTACHMENT_END = "</axercise_saved_attachments>";
export function withoutLibraryContext(text: string) { return text.replace(/<axercise_saved_attachments>[\s\S]*?<\/axercise_saved_attachments>/g, "").trim(); }
export function chatLibraryFiles(text: string): Pick<LibraryAsset, "id" | "name">[] {
  const results: Pick<LibraryAsset, "id" | "name">[] = [];
  for (const match of text.matchAll(/<axercise_saved_attachments>([\s\S]*?)<\/axercise_saved_attachments>/g)) {
    try { const data = JSON.parse(match[1]); for (const file of data.files || []) if (/^[a-f0-9-]{36}$/.test(file.id) && typeof file.name === "string") results.push({ id: file.id, name: file.name.slice(0, 300) }); } catch {}
  }
  return results.slice(0, 20);
}
