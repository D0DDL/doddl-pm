"""Klaviyo connector — campaigns and flows sync.

Pulls campaign metadata and flow definitions. Credentials fetched from
Azure Key Vault on every run so rotation takes effect without a restart.

Secrets required:
  klaviyo-api-key  — Klaviyo private API key (pk_...)
"""

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Iterator

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from connectors.lib.secrets import get_secret
from connectors.lib.db import get_connection, write_raw, upsert_clean, last_pull_ts

logger = logging.getLogger(__name__)

VERSION = "1.0.0"
SOURCE = "klaviyo"
BASE_URL = "https://a.klaviyo.com"
REVISION = "2024-02-15"


def _auth_headers(api_key: str) -> dict:
    return {
        "Authorization": f"Klaviyo-API-Key {api_key}",
        "revision": REVISION,
        "Accept": "application/json",
    }


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception_type(httpx.HTTPStatusError),
    reraise=True,
)
def _get(client: httpx.Client, path: str, params: dict | None = None) -> dict:
    resp = client.get(f"{BASE_URL}{path}", params=params)
    resp.raise_for_status()
    return resp.json()


def _paginate(client: httpx.Client, path: str, params: dict | None = None) -> Iterator[dict]:
    """Yield every page from a Klaviyo cursor-paginated endpoint."""
    next_url: str | None = None
    next_params = params
    while True:
        if next_url:
            resp = client.get(next_url)
            resp.raise_for_status()
            page = resp.json()
        else:
            page = _get(client, path, next_params)
        yield page
        next_url = page.get("links", {}).get("next")
        if not next_url:
            break


def run() -> None:
    pull_id = str(uuid.uuid4())
    logger.info("klaviyo.run start pull_id=%s", pull_id)

    api_key = get_secret("klaviyo-api-key")
    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                since = last_pull_ts(cur, SOURCE) or (
                    datetime.now(timezone.utc) - timedelta(days=90)
                ).isoformat()
                with httpx.Client(headers=_auth_headers(api_key), timeout=30.0) as client:
                    _sync_campaigns(client, cur, pull_id, since)
                    _sync_flows(client, cur, pull_id, since)
        logger.info("klaviyo.run complete pull_id=%s", pull_id)
    finally:
        conn.close()


def _sync_campaigns(client: httpx.Client, cur, pull_id: str, since: str) -> None:
    params = {
        "filter": f"greater-or-equal(updated_at,{since})",
        "fields[campaign]": "name,status,send_time,archived,created_at,updated_at",
        "page[size]": 50,
    }
    count = 0
    for page in _paginate(client, "/api/campaigns/", params):
        write_raw(
            cur, source=SOURCE, pull_id=pull_id, endpoint="/api/campaigns/",
            response_body=page, response_status=200, connector_version=VERSION,
        )
        for item in page.get("data", []):
            upsert_clean(
                cur, source=SOURCE, record_type="campaign",
                source_record_id=item["id"],
                data={"id": item["id"], **item.get("attributes", {})},
                pull_id=pull_id,
            )
            count += 1
    logger.info("klaviyo: %d campaigns synced pull_id=%s", count, pull_id)


def _sync_flows(client: httpx.Client, cur, pull_id: str, since: str) -> None:
    params = {
        "filter": f"greater-or-equal(updated,{since})",
        "fields[flow]": "name,status,created,updated,trigger_type",
        "page[size]": 50,
    }
    count = 0
    for page in _paginate(client, "/api/flows/", params):
        write_raw(
            cur, source=SOURCE, pull_id=pull_id, endpoint="/api/flows/",
            response_body=page, response_status=200, connector_version=VERSION,
        )
        for item in page.get("data", []):
            upsert_clean(
                cur, source=SOURCE, record_type="flow",
                source_record_id=item["id"],
                data={"id": item["id"], **item.get("attributes", {})},
                pull_id=pull_id,
            )
            count += 1
    logger.info("klaviyo: %d flows synced pull_id=%s", count, pull_id)
