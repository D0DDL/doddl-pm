"""Shared database helpers for connector jobs — Supabase REST API.

Writes to api_raw and api_clean via the PostgREST HTTP endpoint.
Auth: supabase-service-role-key-prod fetched from Key Vault on each call.

No psycopg2 / direct TCP connection — works with IPv4-only hosts by going
through Cloudflare's CDN layer in front of Supabase.
"""

import httpx

from connectors.lib.secrets import get_secret

SUPABASE_URL = "https://ikcjciscttsvpxoijnqe.supabase.co/rest/v1"
_TIMEOUT = 30.0


def _key() -> str:
    return get_secret("supabase-service-role-key-prod")


def _headers(key: str, prefer: str | None = None) -> dict:
    h = {
        "Authorization": f"Bearer {key}",
        "apikey": key,
        "Content-Type": "application/json",
    }
    if prefer:
        h["Prefer"] = prefer
    return h


def write_raw(
    *,
    source: str,
    pull_id: str,
    endpoint: str,
    response_body: dict,
    response_status: int,
    connector_version: str,
) -> None:
    key = _key()
    payload = {
        "source": source,
        "pull_id": pull_id,
        "endpoint": endpoint,
        "response_body": response_body,
        "response_status": response_status,
        "connector_version": connector_version,
    }
    resp = httpx.post(
        f"{SUPABASE_URL}/api_raw",
        headers=_headers(key, prefer="return=minimal"),
        json=payload,
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()


def upsert_clean(
    *,
    source: str,
    record_type: str,
    source_record_id: str,
    data: dict,
    pull_id: str,
) -> None:
    key = _key()
    payload = {
        "source": source,
        "record_type": record_type,
        "source_record_id": source_record_id,
        "data": data,
        "last_pull_id": pull_id,
    }
    resp = httpx.post(
        f"{SUPABASE_URL}/api_clean",
        headers=_headers(key, prefer="resolution=merge-duplicates,return=minimal"),
        json=payload,
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()


def last_pull_ts(source: str) -> str | None:
    """Return ISO timestamp of the most recent api_raw row for a source, or None."""
    key = _key()
    resp = httpx.get(
        f"{SUPABASE_URL}/api_raw",
        headers=_headers(key),
        params={
            "select": "received_at",
            "source": f"eq.{source}",
            "order": "received_at.desc",
            "limit": "1",
        },
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    rows = resp.json()
    return rows[0]["received_at"] if rows else None
