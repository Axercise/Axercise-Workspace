import test from "node:test";
import assert from "node:assert/strict";
import { currentCodexCredential, probeCurrentCodex } from "../bin/codex-health.mjs";
const now = Date.now();
const token = `header.${Buffer.from(JSON.stringify({ exp: now / 1000 + 3600, "https://api.openai.com/auth": { chatgpt_account_id: "test-account" } })).toString("base64url")}.signature`;
const entry = { auth_type: "oauth", last_status: null, access_token: token };
const auth = (entries: unknown[]) => ({ credential_pool: { "openai-codex": entries } });
test("the light Codex probe only uses a single current OAuth credential and delegates ambiguous or expiring stores to Hermes", () => {
  assert.deepEqual(currentCodexCredential(auth([entry]), now), { token, account: "test-account" });
  for (const value of [auth([]), auth([entry, entry]), auth([{ ...entry, last_status: "exhausted" }]), auth([{ ...entry, last_error_code: "revoked" }]), auth([{ ...entry, auth_type: "api_key" }]), auth([{ ...entry, access_token: "malformed" }]), {}]) assert.equal(currentCodexCredential(value, now), undefined);
  assert.equal(currentCodexCredential(auth([entry]), now + 3590000), undefined);
});
test("a live Codex probe uses only the fixed account catalog and returns no credentials", async () => {
  const result = await probeCurrentCodex({ token, account: "test-account" }, async (url, options) => {
    assert.equal(url, "https://chatgpt.com/backend-api/codex/models?client_version=1.0.0");
    assert.equal(options?.redirect, "error"); assert.equal((options?.headers as Record<string, string>)["ChatGPT-Account-Id"], "test-account");
    return Response.json({ models: [{ slug: "test-model" }] });
  });
  assert.deepEqual(result, { status: "healthy", code: "ok" }); assert.ok(!JSON.stringify(result).includes(token));
});
test("a rejected access token delegates refresh to Hermes while service errors retain their real classification", async () => {
  for (const [status, code] of [[401, undefined], [403, "permission"], [429, "rate_limit"], [503, "provider_unavailable"]] as const) {
    const result = await probeCurrentCodex({ token, account: "test-account" }, async () => Response.json({}, { status }));
    assert.equal(result?.code, code);
  }
  assert.equal((await probeCurrentCodex({ token, account: "test-account" }, async () => Response.json({ models: [] })))?.code, "empty_catalog");
});
test("network and malformed catalog errors never include upstream text or credentials", async () => {
  const network = await probeCurrentCodex({ token, account: "test-account" }, async () => { throw new Error(token); });
  assert.deepEqual(network, { status: "offline", code: "network" });
  const malformed = await probeCurrentCodex({ token, account: "test-account" }, async () => new Response("private upstream body"));
  assert.deepEqual(malformed, { status: "degraded", code: "probe_unavailable" });
});
