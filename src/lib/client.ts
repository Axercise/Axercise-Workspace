export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", "X-Axercise-Client": "workspace", ...init.headers } });
  const data = await res.json();
  if (!res.ok) { const error = data.error; throw new Error(typeof error === "string" ? error : error?.message || "ทำรายการไม่สำเร็จ"); }
  return data as T;
}
export async function consumeSSE(response: Response, onEvent: (event: string, value: Record<string, unknown>) => void) {
  if (!response.ok || !response.body) { const data = await response.json().catch(() => ({})); throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "เชื่อมต่อ Hermes ไม่สำเร็จ"); }
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true }); buffer = buffer.replaceAll("\r\n", "\n");
      let index: number;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, index); buffer = buffer.slice(index + 2);
        let event = "message"; const data: string[] = [];
        for (const line of block.split("\n")) { if (line.startsWith("event:")) event = line.slice(6).trim(); if (line.startsWith("data:")) data.push(line.slice(5).trimStart()); }
        if (data.length && data.join("\n") !== "[DONE]") { try { onEvent(event, JSON.parse(data.join("\n"))); } catch (e) { if (!(e instanceof SyntaxError)) throw e; } }
      }
    }
  } finally { reader.releaseLock(); }
}
