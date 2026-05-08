"""Shopify connector — orders and products sync.

Incremental: pulls records updated since the last successful pull (or 90 days
on first run). Credentials fetched from Azure Key Vault on every run.

Secrets required:
  shopify-client-id      — App client ID
  shopify-client-secret  — App client secret (used as Admin API access token)
  shopify-shop-domain    — e.g. doddl.myshopify.com
"""

import logging
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Iterator

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from connectors.lib.secrets import get_secrets
from connectors.lib.db import write_raw, upsert_clean, last_pull_ts

logger = logging.getLogger(__name__)

VERSION = "1.0.0"
SOURCE = "shopify"
API_VERSION = "2024-01"


def _base(shop_domain: str) -> str:
    return f"https://{shop_domain}/admin/api/{API_VERSION}"


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception_type(httpx.HTTPStatusError),
    reraise=True,
)
def _get(client: httpx.Client, url: str, params: dict | None = None) -> httpx.Response:
    resp = client.get(url, params=params)
    resp.raise_for_status()
    return resp


def _paginate(client: httpx.Client, url: str, params: dict | None = None) -> Iterator[httpx.Response]:
    """Yield responses following Shopify Link-header cursor pagination."""
    resp = _get(client, url, params)
    yield resp
    while True:
        m = re.search(r'<([^>]+)>;\s*rel="next"', resp.headers.get("link", ""))
        if not m:
            break
        resp = _get(client, m.group(1))
        yield resp


def run() -> None:
    pull_id = str(uuid.uuid4())
    logger.info("shopify.run start pull_id=%s", pull_id)

    creds = get_secrets(["shopify-client-id", "shopify-client-secret", "shopify-shop-domain"])
    since = last_pull_ts(SOURCE) or (
        datetime.now(timezone.utc) - timedelta(days=90)
    ).isoformat()
    base = _base(creds["shopify-shop-domain"])
    headers = {
        "X-Shopify-Access-Token": creds["shopify-client-secret"],
        "Accept": "application/json",
    }
    with httpx.Client(headers=headers, timeout=30.0) as client:
        _sync_orders(client, pull_id, base, since)
        _sync_products(client, pull_id, base, since)
    logger.info("shopify.run complete pull_id=%s", pull_id)


def _sync_orders(client: httpx.Client, pull_id: str, base: str, since: str) -> None:
    params = {"status": "any", "limit": 250, "updated_at_min": since}
    count = 0
    for resp in _paginate(client, f"{base}/orders.json", params):
        body = resp.json()
        write_raw(
            source=SOURCE, pull_id=pull_id, endpoint="/orders.json",
            response_body=body, response_status=resp.status_code, connector_version=VERSION,
        )
        for order in body.get("orders", []):
            upsert_clean(
                source=SOURCE, record_type="order",
                source_record_id=str(order["id"]), data=order, pull_id=pull_id,
            )
            count += 1
    logger.info("shopify: %d orders synced pull_id=%s", count, pull_id)


def _sync_products(client: httpx.Client, pull_id: str, base: str, since: str) -> None:
    params = {"limit": 250, "updated_at_min": since}
    count = 0
    for resp in _paginate(client, f"{base}/products.json", params):
        body = resp.json()
        write_raw(
            source=SOURCE, pull_id=pull_id, endpoint="/products.json",
            response_body=body, response_status=resp.status_code, connector_version=VERSION,
        )
        for product in body.get("products", []):
            upsert_clean(
                source=SOURCE, record_type="product",
                source_record_id=str(product["id"]), data=product, pull_id=pull_id,
            )
            count += 1
    logger.info("shopify: %d products synced pull_id=%s", count, pull_id)
