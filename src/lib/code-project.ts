export type CodeProject = { id: string; name: string; directory: string };
export type CodeEntry = { name: string; path: string; kind: "folder" | "file" };
export type CodeFile = { path: string; content: string; revision: string };
export type CodeVersion = { id: string; label: string; date?: string };
