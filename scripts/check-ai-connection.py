"""Read-only provider connectivity check. Never emit credentials, account IDs, or raw errors."""
import contextlib
import io
import json
import logging
import os
from pathlib import Path

logging.disable(logging.CRITICAL)


def check():
    home = Path(os.environ["HERMES_HOME"])
    try:
        auth = json.loads((home / "auth.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {"status": "unconfigured", "code": "missing_auth"}
    except Exception:
        return {"status": "auth_required", "code": "invalid_auth_store"}
    if not isinstance(auth, dict) or not isinstance(auth.get("credential_pool", {}), dict) or not isinstance(auth.get("providers", {}), dict):
        return {"status": "auth_required", "code": "invalid_auth_store"}
    pool = auth.get("credential_pool", {}).get("openai-codex", [])
    provider = auth.get("providers", {}).get("openai-codex", {})
    if not pool and not provider:
        return {"status": "unconfigured", "code": "missing_auth"}
    try:
        # Hermes owns refresh-token locking and credential-pool renewal.
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            from hermes_cli.auth import get_codex_auth_status
            from hermes_cli.codex_models import _extract_chatgpt_account_id
            status = get_codex_auth_status()
        if status.get("rate_limited"):
            return {"status": "degraded", "code": "rate_limit"}
        token = status.get("api_key")
        if not status.get("logged_in") or not token:
            return {"status": "auth_required", "code": "login_required"}
        import httpx
        headers = {"Authorization": f"Bearer {token}", "Accept-Encoding": "identity"}
        account = _extract_chatgpt_account_id(token)
        if account:
            headers["ChatGPT-Account-Id"] = account
        response = httpx.get("https://chatgpt.com/backend-api/codex/models?client_version=1.0.0", headers=headers, timeout=8)
        if response.status_code == 401:
            return {"status": "auth_required", "code": "login_required"}
        if response.status_code == 429:
            return {"status": "degraded", "code": "rate_limit"}
        if response.status_code == 403:
            return {"status": "degraded", "code": "permission"}
        if response.status_code != 200:
            return {"status": "degraded", "code": "provider_unavailable"}
        if not response.json().get("models"):
            return {"status": "degraded", "code": "empty_catalog"}
        return {"status": "healthy", "code": "ok"}
    except Exception as error:
        if type(error).__name__ in {"ConnectError", "ConnectTimeout", "ReadTimeout", "TimeoutException", "NetworkError"}:
            return {"status": "offline", "code": "network"}
        return {"status": "degraded", "code": "probe_unavailable"}


if __name__ == "__main__":
    print(json.dumps(check()), flush=True)
