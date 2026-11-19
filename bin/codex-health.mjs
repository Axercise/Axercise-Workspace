// Read only the unambiguous, current OAuth entry. Hermes remains responsible
// for credential selection, cooldowns and refreshing expiring/rejected tokens.
export function currentCodexCredential(auth, now = Date.now()) {
  try {
    const pool = auth?.credential_pool?.["openai-codex"];
    if (!Array.isArray(pool) || pool.length !== 1) return;
    const entry = pool[0];
    if (entry.auth_type !== "oauth" || ![null, undefined, "ok"].includes(entry.last_status) || entry.last_error_code) return;
    const token = entry.access_token;
    if (typeof token !== "string" || token.split(".").length !== 3 || /[\r\n]/.test(token)) return;
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    const account = claims["https://api.openai.com/auth"]?.chatgpt_account_id;
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= now + 120000 || typeof account !== "string" || !account || /[\r\n]/.test(account)) return;
    return { token, account };
  } catch { return; }
}

export async function probeCurrentCodex(credential, request = fetch) {
  try {
    const response = await request("https://chatgpt.com/backend-api/codex/models?client_version=1.0.0", {
      headers: { Authorization: `Bearer ${credential.token}`, "ChatGPT-Account-Id": credential.account, "Accept-Encoding": "identity" },
      signal: AbortSignal.timeout(8000), redirect: "error", cache: "no-store",
    });
    if (response.status === 401) return; // Let Hermes refresh under its own lock.
    if (response.status === 429) return { status: "degraded", code: "rate_limit" };
    if (response.status === 403) return { status: "degraded", code: "permission" };
    if (!response.ok) return { status: "degraded", code: "provider_unavailable" };
    const data = await response.json();
    return Array.isArray(data?.models) && data.models.length ? { status: "healthy", code: "ok" } : { status: "degraded", code: "empty_catalog" };
  } catch (error) {
    return error instanceof SyntaxError ? { status: "degraded", code: "probe_unavailable" } : { status: "offline", code: "network" };
  }
}
