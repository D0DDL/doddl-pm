"""Amazon SP-API connector — orders, FBA inventory, and listings across all doddl marketplaces.

Covers all 5 marketplaces across 3 regional SP-API endpoints:

  NA endpoint (sellingpartnerapi-na.amazon.com):
    US  A2JUH74WYQ3T7U
    CA  A2J3OJ1QMM0AR5

  EU endpoint (sellingpartnerapi-eu.amazon.com):
    UK  A1F83G8C2ARO7P
    EU  A1PA6795UKMFR9  (DE / FR / IT / ES — single marketplace ID)

  FE endpoint (sellingpartnerapi-fe.amazon.com):
    JP  A1VC38T7YXB528

Each region has a separate LWA refresh token (different SP-API app authorisation).
Regions are processed in parallel in run(); sequentially in run_backfill() to stay
well within per-endpoint rate limits during long backfill sessions.

Secrets required:
  amazon-sp-api-client-id          — LWA client ID (shared across regions)
  amazon-sp-api-client-secret      — LWA client secret (shared across regions)
  amazon-sp-api-refresh-token-eu   — LWA refresh token for EU endpoint
  amazon-sp-api-refresh-token-na   — LWA refresh token for NA endpoint
  amazon-sp-api-refresh-token-fe   — LWA refresh token for FE endpoint
  amazon-sp-api-refresh-token      — (legacy) EU fallback — used if -eu secret absent

Optional secrets (enable listings sync if present):
  amazon-sp-api-seller-id-eu       — Seller ID for EU listings API
  amazon-sp-api-seller-id-na       — Seller ID for NA listings API
  amazon-sp-api-seller-id-fe       — Seller ID for FE listings API
  amazon-sp-api-seller-id          — Global fallback seller ID

Data pulled per marketplace:
  orders      — /orders/v0/orders (all statuses, paginated)
  fba_inventory — /fba/inventory/v1/summaries (FBA stock levels, current snapshot)
  listing     — /listings/2021-08-01/items/{sellerId} (active SKUs, if seller ID set)

marketplace_id is stored in the data field of every api_clean record.
"""

import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from typing import Iterator, Optional

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from connectors.lib.secrets import get_secret, get_secrets
from connectors.lib.db import write_raw, upsert_clean_batch, last_pull_ts

logger = logging.getLogger(__name__)

VERSION = "2.0.0"
SOURCE = "amazon_sp"
LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token"

# ---------------------------------------------------------------------------
# Region and marketplace configuration
# ---------------------------------------------------------------------------

REGIONS: dict[str, dict] = {
    "NA": {
        "endpoint": "https://sellingpartnerapi-na.amazon.com",
        "marketplaces": [
            ("A2JUH74WYQ3T7U", "US"),
            ("A2J3OJ1QMM0AR5", "CA"),
        ],
        "refresh_token_secret": "amazon-sp-api-refresh-token-na",
    },
    "EU": {
        "endpoint": "https://sellingpartnerapi-eu.amazon.com",
        "marketplaces": [
            ("A1F83G8C2ARO7P", "UK"),
            ("A1PA6795UKMFR9", "EU"),   # DE / FR / IT / ES
        ],
        "refresh_token_secret": "amazon-sp-api-refresh-token-eu",
        # Backward-compat: if -eu secret absent, fall back to the original single secret
        "refresh_token_fallback": "amazon-sp-api-refresh-token",
    },
    "FE": {
        "endpoint": "https://sellingpartnerapi-fe.amazon.com",
        "marketplaces": [
            ("A1VC38T7YXB528", "JP"),
        ],
        "refresh_token_secret": "amazon-sp-api-refresh-token-fe",
    },
}

# SP-API rate limits per endpoint (independent across regions)
# Orders:    burst=10, restore=0.0167 req/s
# Inventory: burst=2,  restore=2.0 req/s
# Listings:  burst=10, restore=5.0 req/s
_ORDERS_RATE, _ORDERS_BURST = 0.0167, 10
_INVENTORY_RATE, _INVENTORY_BURST = 2.0, 2
_LISTINGS_RATE, _LISTINGS_BURST = 5.0, 10


# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------

class _RateLimiter:
    """Thread-safe token bucket rate limiter.

    Instantiated once per region per API type so that requests to separate
    SP-API endpoints never share state.
    """

    def __init__(self, rate_per_second: float, burst: int) -> None:
        self._rate = rate_per_second
        self._burst = float(burst)
        self._tokens = float(burst)          # Start full — use the burst budget first
        self._last = time.monotonic()
        self._lock = threading.Lock()

    def acquire(self) -> None:
        """Block until a token is available."""
        with self._lock:
            now = time.monotonic()
            # Refill tokens based on elapsed time
            self._tokens = min(
                self._burst,
                self._tokens + (now - self._last) * self._rate,
            )
            self._last = now
            if self._tokens >= 1.0:
                self._tokens -= 1.0
                return
            wait = (1.0 - self._tokens) / self._rate

        time.sleep(wait)
        with self._lock:
            self._tokens = max(0.0, self._tokens - 1.0)


# ---------------------------------------------------------------------------
# Auth helpers
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


def _load_region_token(
    region_name: str,
    region_cfg: dict,
    client_id: str,
    client_secret: str,
) -> Optional[str]:
    """Load the refresh token for a region and exchange it for an access token.

    Returns None and logs a warning if credentials are not configured — the
    region is silently skipped so one missing region doesn't abort everything.
    """
    refresh_token: Optional[str] = None

    try:
        refresh_token = get_secret(region_cfg["refresh_token_secret"])
    except Exception:
        pass

    # EU: fall back to the original single-token secret for backward compat
    if refresh_token is None and "refresh_token_fallback" in region_cfg:
        try:
            refresh_token = get_secret(region_cfg["refresh_token_fallback"])
            logger.info("amazon_sp: %s region using legacy refresh token secret", region_name)
        except Exception:
            pass

    if refresh_token is None:
        logger.info(
            "amazon_sp: no refresh token for %s region "
            "(set %s in Key Vault to enable it)",
            region_name, region_cfg["refresh_token_secret"],
        )
        return None

    try:
        token = _get_access_token(client_id, client_secret, refresh_token)
        logger.info("amazon_sp: %s region LWA token obtained", region_name)
        return token
    except Exception as exc:
        logger.warning("amazon_sp: %s region auth failed — %s", region_name, exc)
        return None


def _load_seller_id(region_name: str) -> Optional[str]:
    """Load an optional seller ID for the Listings API.

    Tries the region-specific secret first, then a global fallback.
    Returns None if neither is configured — listings sync is skipped.
    """
    for secret_name in [
        f"amazon-sp-api-seller-id-{region_name.lower()}",
        "amazon-sp-api-seller-id",
    ]:
        try:
            sid = get_secret(secret_name)
            if sid:
                return sid
        except Exception:
            pass
    return None


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------

@retry(
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=5, max=60),
    retry=retry_if_exception_type(httpx.HTTPStatusError),
    reraise=True,
)
def _get(
    client: httpx.Client,
    url: str,
    params: dict,
    rl: Optional[_RateLimiter] = None,
) -> dict:
    """GET with optional pre-request rate limiting and automatic 429 retry."""
    if rl:
        rl.acquire()
    resp = client.get(url, params=params)
    if resp.status_code == 429:
        # Use the header value as the retry-after hint (seconds)
        wait_s = float(resp.headers.get("x-amzn-RateLimit-Limit", "60"))
        logger.warning("amazon_sp: 429 rate limited on %s — waiting %.0fs", url, wait_s)
        time.sleep(wait_s)
        raise httpx.HTTPStatusError("Rate limited", request=resp.request, response=resp)
    if not resp.is_success:
        logger.error("amazon_sp: HTTP %s for %s: %s", resp.status_code, url, resp.text[:300])
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Orders sync
# ---------------------------------------------------------------------------

def _paginate_orders(
    client: httpx.Client,
    base_url: str,
    marketplace_id: str,
    params: dict,
    rl: _RateLimiter,
) -> Iterator[dict]:
    """Yield SP-API order pages, following NextToken cursor."""
    url = f"{base_url}/orders/v0/orders"
    page = _get(client, url, params, rl)
    yield page
    while True:
        next_token = page.get("payload", {}).get("NextToken")
        if not next_token:
            break
        # NextToken continuation: only these two params are accepted
        page = _get(client, url, {
            "MarketplaceIds": marketplace_id,
            "NextToken": next_token,
        }, rl)
        yield page


def _sync_orders(
    client: httpx.Client,
    base_url: str,
    marketplace_id: str,
    marketplace_name: str,
    pull_id: str,
    rl: _RateLimiter,
    since: str,
    until: Optional[str] = None,
) -> int:
    """Pull all orders for one marketplace between since and until."""
    params: dict = {
        "MarketplaceIds": marketplace_id,
        "LastUpdatedAfter": since,
        "MaxResultsPerPage": 100,
    }
    if until:
        params["LastUpdatedBefore"] = until

    count = 0
    for page in _paginate_orders(client, base_url, marketplace_id, params, rl):
        payload = page.get("payload", {})
        orders = payload.get("Orders", [])

        write_raw(
            source=SOURCE,
            pull_id=pull_id,
            endpoint=f"/orders/v0/orders/{marketplace_id}",
            response_body={**page, "marketplace_id": marketplace_id},
            response_status=200,
            connector_version=VERSION,
        )

        batch = [
            {
                "source": SOURCE,
                "record_type": "order",
                # AmazonOrderId is globally unique across all marketplaces
                "source_record_id": order["AmazonOrderId"],
                "data": {
                    **order,
                    "marketplace_id": marketplace_id,
                    "marketplace_name": marketplace_name,
                },
                "last_pull_id": pull_id,
            }
            for order in orders
        ]
        upsert_clean_batch(batch)
        count += len(batch)

    logger.info(
        "amazon_sp: orders synced marketplace=%s (%s) count=%d pull_id=%s",
        marketplace_id, marketplace_name, count, pull_id,
    )
    return count


# ---------------------------------------------------------------------------
# FBA inventory sync
# ---------------------------------------------------------------------------

def _paginate_inventory(
    client: httpx.Client,
    base_url: str,
    marketplace_id: str,
    rl: _RateLimiter,
) -> Iterator[dict]:
    """Yield FBA inventory summary pages, following nextToken cursor."""
    url = f"{base_url}/fba/inventory/v1/summaries"
    base_params = {
        "details": "true",
        "granularityType": "Marketplace",
        "granularityId": marketplace_id,
        "marketplaceIds": marketplace_id,
    }
    page = _get(client, url, base_params, rl)
    yield page
    while True:
        next_token = page.get("pagination", {}).get("nextToken")
        if not next_token:
            break
        page = _get(client, url, {**base_params, "nextToken": next_token}, rl)
        yield page


def _sync_inventory(
    client: httpx.Client,
    base_url: str,
    marketplace_id: str,
    marketplace_name: str,
    pull_id: str,
    rl: _RateLimiter,
) -> int:
    """Pull current FBA inventory snapshot for one marketplace."""
    count = 0
    try:
        for page in _paginate_inventory(client, base_url, marketplace_id, rl):
            summaries = page.get("payload", {}).get("inventorySummaries", [])

            write_raw(
                source=SOURCE,
                pull_id=pull_id,
                endpoint=f"/fba/inventory/v1/summaries/{marketplace_id}",
                response_body={**page, "marketplace_id": marketplace_id},
                response_status=200,
                connector_version=VERSION,
            )

            # Batch upsert in chunks of 500
            batch: list = []
            for s in summaries:
                # fnSku is unique per fulfillment network item; fall back to asin
                sku_key = s.get("fnSku") or s.get("asin") or s.get("sellerSku", "unknown")
                batch.append({
                    "source": SOURCE,
                    "record_type": "fba_inventory",
                    "source_record_id": f"{marketplace_id}_{sku_key}",
                    "data": {
                        **s,
                        "marketplace_id": marketplace_id,
                        "marketplace_name": marketplace_name,
                    },
                    "last_pull_id": pull_id,
                })
                if len(batch) >= 500:
                    upsert_clean_batch(batch)
                    count += len(batch)
                    batch = []
            if batch:
                upsert_clean_batch(batch)
                count += len(batch)

    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 400:
            # FBA not enabled for this marketplace — not an error worth surfacing
            logger.info(
                "amazon_sp: FBA inventory not available for marketplace=%s (%s) — skipping",
                marketplace_id, marketplace_name,
            )
        else:
            logger.warning(
                "amazon_sp: inventory sync failed marketplace=%s HTTP %s — skipping",
                marketplace_id, exc.response.status_code,
            )
        return 0

    if count:
        logger.info(
            "amazon_sp: inventory synced marketplace=%s (%s) count=%d pull_id=%s",
            marketplace_id, marketplace_name, count, pull_id,
        )
    return count


# ---------------------------------------------------------------------------
# Listings sync (Listings Items API v2021-08-01)
# ---------------------------------------------------------------------------

def _paginate_listings(
    client: httpx.Client,
    base_url: str,
    seller_id: str,
    marketplace_id: str,
    rl: _RateLimiter,
) -> Iterator[dict]:
    """Yield listing item pages, following nextToken cursor."""
    url = f"{base_url}/listings/2021-08-01/items/{seller_id}"
    base_params = {
        "marketplaceIds": marketplace_id,
        "pageSize": 10,   # API maximum
        "includedData": "summaries,attributes,offers,fulfillmentAvailability",
    }
    page = _get(client, url, base_params, rl)
    yield page
    while True:
        next_token = page.get("pagination", {}).get("nextToken")
        if not next_token:
            break
        page = _get(client, url, {**base_params, "pageToken": next_token}, rl)
        yield page


def _sync_listings(
    client: httpx.Client,
    base_url: str,
    seller_id: str,
    marketplace_id: str,
    marketplace_name: str,
    pull_id: str,
    rl: _RateLimiter,
) -> int:
    """Pull current active listings snapshot for one marketplace."""
    count = 0
    try:
        for page in _paginate_listings(client, base_url, seller_id, marketplace_id, rl):
            items = page.get("items", [])

            write_raw(
                source=SOURCE,
                pull_id=pull_id,
                endpoint=f"/listings/2021-08-01/items/{marketplace_id}",
                response_body={**page, "marketplace_id": marketplace_id},
                response_status=200,
                connector_version=VERSION,
            )

            batch = [
                {
                    "source": SOURCE,
                    "record_type": "listing",
                    "source_record_id": f"{marketplace_id}_{item.get('sku', 'unknown')}",
                    "data": {
                        **item,
                        "marketplace_id": marketplace_id,
                        "marketplace_name": marketplace_name,
                    },
                    "last_pull_id": pull_id,
                }
                for item in items
            ]
            upsert_clean_batch(batch)
            count += len(batch)

    except httpx.HTTPStatusError as exc:
        logger.warning(
            "amazon_sp: listings sync failed marketplace=%s HTTP %s — skipping",
            marketplace_id, exc.response.status_code,
        )
        return 0

    if count:
        logger.info(
            "amazon_sp: listings synced marketplace=%s (%s) count=%d pull_id=%s",
            marketplace_id, marketplace_name, count, pull_id,
        )
    return count


# ---------------------------------------------------------------------------
# Per-marketplace orchestration
# ---------------------------------------------------------------------------

def _sync_marketplace(
    client: httpx.Client,
    base_url: str,
    marketplace_id: str,
    marketplace_name: str,
    pull_id: str,
    *,
    orders_rl: _RateLimiter,
    inventory_rl: _RateLimiter,
    listings_rl: _RateLimiter,
    since: str,
    until: Optional[str] = None,
    seller_id: Optional[str] = None,
    include_inventory: bool = True,
    include_listings: bool = True,
) -> None:
    logger.info(
        "amazon_sp: syncing marketplace=%s (%s) since=%s",
        marketplace_id, marketplace_name, since,
    )

    _sync_orders(
        client, base_url, marketplace_id, marketplace_name,
        pull_id, orders_rl, since, until,
    )

    if include_inventory:
        _sync_inventory(
            client, base_url, marketplace_id, marketplace_name, pull_id, inventory_rl,
        )

    if include_listings:
        if seller_id:
            _sync_listings(
                client, base_url, seller_id, marketplace_id, marketplace_name,
                pull_id, listings_rl,
            )
        else:
            logger.debug(
                "amazon_sp: listings skipped for marketplace=%s "
                "(add amazon-sp-api-seller-id-%s to Key Vault to enable)",
                marketplace_id, marketplace_name.lower(),
            )


# ---------------------------------------------------------------------------
# Per-region orchestration
# ---------------------------------------------------------------------------

def _sync_region(
    region_name: str,
    region_cfg: dict,
    access_token: str,
    pull_id: str,
    since: str,
    until: Optional[str] = None,
    seller_id: Optional[str] = None,
    include_inventory: bool = True,
    include_listings: bool = True,
) -> None:
    """Process all marketplaces in one region under their own rate limiters."""
    base_url = region_cfg["endpoint"]
    headers = {
        "x-amz-access-token": access_token,
        "Accept": "application/json",
    }

    # Each region gets independent rate limiters — separate SP-API endpoints
    orders_rl = _RateLimiter(_ORDERS_RATE, _ORDERS_BURST)
    inventory_rl = _RateLimiter(_INVENTORY_RATE, _INVENTORY_BURST)
    listings_rl = _RateLimiter(_LISTINGS_RATE, _LISTINGS_BURST)

    with httpx.Client(headers=headers, timeout=30.0) as client:
        for marketplace_id, marketplace_name in region_cfg["marketplaces"]:
            try:
                _sync_marketplace(
                    client, base_url, marketplace_id, marketplace_name, pull_id,
                    orders_rl=orders_rl,
                    inventory_rl=inventory_rl,
                    listings_rl=listings_rl,
                    since=since,
                    until=until,
                    seller_id=seller_id,
                    include_inventory=include_inventory,
                    include_listings=include_listings,
                )
            except Exception as exc:
                logger.error(
                    "amazon_sp: marketplace %s (%s) FAILED: %s",
                    marketplace_id, marketplace_name, exc, exc_info=True,
                )

    logger.info("amazon_sp: %s region complete pull_id=%s", region_name, pull_id)


# ---------------------------------------------------------------------------
# Entry points
# ---------------------------------------------------------------------------

def run() -> None:
    """Incremental sync: orders, FBA inventory, and listings for all regions.

    Regions are processed in parallel since they use separate API endpoints
    and independent rate limit buckets. A missing region token is skipped
    rather than aborting the entire run.
    """
    pull_id = str(uuid.uuid4())
    logger.info("amazon_sp.run start pull_id=%s", pull_id)

    creds = get_secrets([
        "amazon-sp-api-client-id",
        "amazon-sp-api-client-secret",
    ])
    client_id = creds["amazon-sp-api-client-id"]
    client_secret = creds["amazon-sp-api-client-secret"]

    # Build access tokens and seller IDs for whichever regions are configured
    region_contexts: dict[str, tuple] = {}
    for region_name, region_cfg in REGIONS.items():
        token = _load_region_token(region_name, region_cfg, client_id, client_secret)
        if token is None:
            continue
        seller_id = _load_seller_id(region_name)
        region_contexts[region_name] = (token, seller_id)

    if not region_contexts:
        logger.error("amazon_sp: no regions accessible — check refresh token secrets in Key Vault")
        return

    # Determine incremental since timestamp
    _since_raw = last_pull_ts(SOURCE) or (
        datetime.now(timezone.utc) - timedelta(days=90)
    ).isoformat()
    since = datetime.fromisoformat(
        _since_raw.replace("Z", "+00:00")
    ).strftime("%Y-%m-%dT%H:%M:%SZ")

    logger.info(
        "amazon_sp: %d regions active since=%s pull_id=%s",
        len(region_contexts), since, pull_id,
    )

    # Parallel execution: 3 regions, each with its own endpoint + rate limits
    with ThreadPoolExecutor(
        max_workers=len(region_contexts),
        thread_name_prefix="amazon_sp_region",
    ) as executor:
        futures = {
            executor.submit(
                _sync_region,
                region_name,
                REGIONS[region_name],
                token,
                pull_id,
                since,
                seller_id=seller_id,
                include_inventory=True,
                include_listings=True,
            ): region_name
            for region_name, (token, seller_id) in region_contexts.items()
        }
        for future in as_completed(futures):
            region_name = futures[future]
            try:
                future.result()
            except Exception as exc:
                logger.error(
                    "amazon_sp: %s region FAILED: %s", region_name, exc, exc_info=True,
                )

    logger.info("amazon_sp.run complete pull_id=%s", pull_id)


def run_backfill(start_date, end_date) -> None:
    """Pull orders for all configured regions within the given date range.

    Runs regions sequentially to stay within per-endpoint rate limits across
    long backfill sessions. Inventory and listings are skipped — they reflect
    current state only, not historical state.

    Called per-chunk by scripts/run_backfill.py. SP-API hard limit is 2 years;
    the backfill runner keeps chunks within that window.
    """
    pull_id = str(uuid.uuid4())

    since = datetime(
        start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc,
    ).strftime("%Y-%m-%dT%H:%M:%SZ")

    # SP-API requires LastUpdatedBefore to be at least 2 minutes in the past
    until_dt = min(
        datetime(
            end_date.year, end_date.month, end_date.day,
            23, 59, 59, tzinfo=timezone.utc,
        ),
        datetime.now(timezone.utc) - timedelta(minutes=5),
    )
    until = until_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    logger.info("amazon_sp.run_backfill %s to %s pull_id=%s", since, until, pull_id)

    creds = get_secrets([
        "amazon-sp-api-client-id",
        "amazon-sp-api-client-secret",
    ])
    client_id = creds["amazon-sp-api-client-id"]
    client_secret = creds["amazon-sp-api-client-secret"]

    for region_name, region_cfg in REGIONS.items():
        token = _load_region_token(region_name, region_cfg, client_id, client_secret)
        if token is None:
            continue
        try:
            _sync_region(
                region_name, region_cfg, token, pull_id, since, until,
                seller_id=None,            # listings are point-in-time only
                include_inventory=False,   # same — no historical inventory
                include_listings=False,
            )
        except Exception as exc:
            logger.error(
                "amazon_sp: %s region backfill FAILED: %s", region_name, exc, exc_info=True,
            )

    logger.info("amazon_sp.run_backfill complete pull_id=%s", pull_id)
