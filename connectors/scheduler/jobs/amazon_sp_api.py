"""Amazon SP-API connector — orders sync for UK marketplace.

Incremental: pulls orders updated since the last successful pull (or 90 days
on first run). Uses LWA OAuth2 to exchange the refresh token for a short-lived
access token on every run.

Secrets required:
  amazon-sp-api-client-id      — LWA OAuth client ID (amzn1.application-oa2-client.*)
  amazon-sp-api-client-secret  — LWA OAuth client secret (amzn1.oa2-cs.v1.*)
  amazon-sp-api-refresh-token  — LWA refresh token (covers UK + EU marketplaces)
"""

import logging
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Iterator

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from connectors.lib.secrets import get_secrets
from connectors.lib.db import write_raw, upsert_clean, last_pull_ts

logger = logging.getLogger(__name__)

VERSION = "1.0.0"
SOURCE = "amazon_sp"
LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token"
SP_API_BASE = "https://sellingpartnerapi-eu.amazon.com"
MARKETPLACE_ID = "A1F83G8C2ARO7P"  # Amazon UK


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def _get_access_token(client_id: str, client_secret: str, refresh_token: str) -> str:
    """Exchange LWA refresh token for a short-lived access token (~1h TTL)."""
    resp = httpx.post(
        LWA_TOKEN_URL,
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
            "client_secret": client_secret,
        },
        timeout=15.0,
    )
    resp.raise_for_status()
    token = resp.json().get("access_token")
    if not token:
        raise ValueError(f"No access_token in LWA response: {resp.json()}")
    return token


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

@retry(
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=5, max=60),
    retry=retry_if_exception_type(httpx.HTTPStatusError),
    reraise=True,
)
def _get(client: httpx.Client, path: str, params: dict) -> dict:
    resp = client.get(f"{SP_API_BASE}{path}", params=params)
    if resp.status_code == 429:
        retry_after = int(resp.headers.get("x-amzn-RateLimit-Limit", "5"))
        logger.warning("amazon_sp: rate limited on %s, waiting %ss", path, retry_after)
        time.sleep(retry_after)
        raise httpx.HTTPStatusError("Rate limited", request=resp.request, response=resp)
    if not resp.is_success:
        logger.error("amazon_sp: %s %s → %s", resp.status_code, path, resp.text)
    resp.raise_for_status()
    return resp.json()


def _paginate_orders(client: httpx.Client, params: dict) -> Iterator[dict]:
    """Yield SP-API order pages, following NextToken cursor."""
    page = _get(client, "/orders/v0/orders", params)
    yield page
    while True:
        next_token = page.get("payload", {}).get("NextToken")
        if not next_token:
            break
        # NextToken requests only accept NextToken + MarketplaceIds
        page = _get(client, "/orders/v0/orders", {
            "MarketplaceIds": MARKETPLACE_ID,
            "NextToken": next_token,
        })
        yield page


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def run() -> None:
    pull_id = str(uuid.uuid4())
    logger.info("amazon_sp.run start pull_id=%s", pull_id)

    creds = get_secrets([
        "amazon-sp-api-client-id",
        "amazon-sp-api-client-secret",
        "amazon-sp-api-refresh-token",
    ])

    access_token = _get_access_token(
        creds["amazon-sp-api-client-id"],
        creds["amazon-sp-api-client-secret"],
        creds["amazon-sp-api-refresh-token"],
    )
    logger.info("amazon_sp: LWA token obtained")

    _since_raw = last_pull_ts(SOURCE) or (
        datetime.now(timezone.utc) - timedelta(days=90)
    ).isoformat()
    # SP-API requires ISO8601 with Z suffix and no microseconds
    since = datetime.fromisoformat(_since_raw.replace("Z", "+00:00")).strftime("%Y-%m-%dT%H:%M:%SZ")

    headers = {
        "x-amz-access-token": access_token,
        "Accept": "application/json",
    }

    with httpx.Client(headers=headers, timeout=30.0) as client:
        _sync_orders(client, pull_id, since)

    logger.info("amazon_sp.run complete pull_id=%s", pull_id)


# ---------------------------------------------------------------------------
# Sync functions
# ---------------------------------------------------------------------------

def _sync_orders(client: httpx.Client, pull_id: str, since: str, until: str | None = None) -> None:
    params = {
        "MarketplaceIds": MARKETPLACE_ID,
        "LastUpdatedAfter": since,
        "MaxResultsPerPage": 100,
    }
    if until:
        params["LastUpdatedBefore"] = until
    count = 0
    for page in _paginate_orders(client, params):
        payload = page.get("payload", {})
        write_raw(
            source=SOURCE,
            pull_id=pull_id,
            endpoint="/orders/v0/orders",
            response_body=page,
            response_status=200,
            connector_version=VERSION,
        )
        for order in payload.get("Orders", []):
            upsert_clean(
                source=SOURCE,
                record_type="order",
                source_record_id=order["AmazonOrderId"],
                data=order,
                pull_id=pull_id,
            )
            count += 1
    logger.info("amazon_sp: %d orders synced pull_id=%s", count, pull_id)


# ---------------------------------------------------------------------------
# Backfill entry point
# ---------------------------------------------------------------------------

def run_backfill(start_date, end_date) -> None:
    """Pull orders updated between start_date and end_date (inclusive).

    Called per-chunk by the backfill runner. SP-API hard limit is 2 years;
    caller is responsible for keeping chunks within that window.
    """
    pull_id = str(uuid.uuid4())
    since = datetime(
        start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc
    ).strftime("%Y-%m-%dT%H:%M:%SZ")
    until = datetime(
        end_date.year, end_date.month, end_date.day, 23, 59, 59, tzinfo=timezone.utc
    ).strftime("%Y-%m-%dT%H:%M:%SZ")
    logger.info("amazon_sp.run_backfill %s → %s pull_id=%s", since, until, pull_id)

    creds = get_secrets([
        "amazon-sp-api-client-id",
        "amazon-sp-api-client-secret",
        "amazon-sp-api-refresh-token",
    ])
    access_token = _get_access_token(
        creds["amazon-sp-api-client-id"],
        creds["amazon-sp-api-client-secret"],
        creds["amazon-sp-api-refresh-token"],
    )
    headers = {"x-amz-access-token": access_token, "Accept": "application/json"}

    with httpx.Client(headers=headers, timeout=30.0) as client:
        _sync_orders(client, pull_id, since, until)
    logger.info("amazon_sp.run_backfill complete pull_id=%s", pull_id)
