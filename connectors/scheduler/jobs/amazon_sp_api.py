"""Amazon SP-API connector — orders, FBA inventory, and listings across all doddl marketplaces.

Covers every marketplace visible in the doddl Amazon Seller Central account,
grouped by seller account (each has its own LWA refresh token):

  EU account  — sellingpartnerapi-eu.amazon.com  seller A95LVHANDHOSF
    UK  A1F83G8C2ARO7P      DE  A1PA6795UKMFR9      FR  A13V1IB3VIYZZH
    IT  APJ6JRA9NG5V4       ES  A1RKKUPIHCS9HS      NL  A1805IZSGTT6HS
    BE  AMEN7PMS3EDWL       PL  A1C3SOZRARQ6R3      SE  A2NODRKZP88ZB9
    TR  A33AVAJ2PDY3EV      IE  A28R8C7NBKEWEA
    AE  A2VIGQ35RCS4UG      SA  A17E79C6D8DWNP

  NA account  — sellingpartnerapi-na.amazon.com   seller A2J3OJ1QMMOAR5
    US  ATVPDKIKX0DER       CA  A2EUQ1WTGCTBG2      MX  A1AM78C64UM0Y8

  FE-JP account — sellingpartnerapi-fe.amazon.com  seller A3HUZ3EE07Z6DX
    JP  A1VC38T7YXB528

  FE-AU account — sellingpartnerapi-fe.amazon.com  seller A1LAIASXD1QDDB
    AU  A39IBJ37TRP1C6

  FE-SG account — sellingpartnerapi-fe.amazon.com  seller A3N8BDRT3JKMZ7
    SG  A19VAU5U5O7RUS

Each account requires its own LWA refresh token (SP-API authorization is per seller).
Accounts whose refresh token secret is absent are silently skipped — add the secret
to Key Vault to enable that account, no code change needed.

Secrets required:
  amazon-sp-api-client-id          — LWA client ID (shared across all accounts)
  amazon-sp-api-client-secret      — LWA client secret (shared across all accounts)
  amazon-sp-api-refresh-token-eu   — EU account
  amazon-sp-api-refresh-token      — (legacy alias for EU — used if -eu absent)
  amazon-sp-api-refresh-token-na-2 — NA account (US, CA, MX — single seller A2J3OJ1QMMOAR5)
  amazon-sp-api-refresh-token-fe-jp — FE Japan account
  amazon-sp-api-refresh-token-fe-au — FE Australia account
  amazon-sp-api-refresh-token-fe-sg — FE Singapore account

Data pulled per marketplace:
  order         — /orders/v0/orders (all statuses, cursor-paginated)
  fba_inventory — /fba/inventory/v1/summaries (current FBA stock snapshot)
  listing       — /listings/2021-08-01/items/{sellerId} (active SKUs)

marketplace_id is stored in the data field of every api_clean record.
Seller IDs (merchant tokens) are embedded in this file; they are not secret.
"""

import csv
import gzip
import io
import json
import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta, date
from typing import Iterator, Optional

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from connectors.lib.secrets import get_secret, get_secrets
from connectors.lib.db import write_raw, upsert_clean_batch, last_pull_ts, upsert_table, select_rows

logger = logging.getLogger(__name__)

VERSION = "3.0.0"
SOURCE = "amazon_sp"
LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token"

# ---------------------------------------------------------------------------
# Account and marketplace configuration
#
# Each top-level key is a "seller account" — a distinct Amazon seller identity
# with its own LWA refresh token. Multiple accounts can share an API endpoint.
#
# Marketplace tuple: (amazon_marketplace_id, display_name, merchant_token)
#   amazon_marketplace_id — passed to MarketplaceIds param and stored on every record
#   display_name          — human-readable label for logs
#   merchant_token        — seller ID used for the Listings Items API
# ---------------------------------------------------------------------------

ACCOUNTS: dict[str, dict] = {
    # ── EU + Middle East ───────────────────────────────────────────────────
    # One unified EU seller account covers all 13 markets.
    "EU": {
        "endpoint": "https://sellingpartnerapi-eu.amazon.com",
        "refresh_token_secret": "amazon-sp-api-refresh-token-eu",
        "refresh_token_fallback": "amazon-sp-api-refresh-token",  # legacy compat
        "marketplaces": [
            ("A1F83G8C2ARO7P", "UK", "A95LVHANDHOSF"),
            ("A1PA6795UKMFR9", "DE", "A95LVHANDHOSF"),
            ("A13V1IB3VIYZZH", "FR", "A95LVHANDHOSF"),
            ("APJ6JRA9NG5V4",  "IT", "A95LVHANDHOSF"),
            ("A1RKKUPIHCS9HS", "ES", "A95LVHANDHOSF"),
            ("A1805IZSGTT6HS", "NL", "A95LVHANDHOSF"),
            ("AMEN7PMS3EDWL",  "BE", "A95LVHANDHOSF"),
            ("A1C3SOZRARQ6R3", "PL", "A95LVHANDHOSF"),
            ("A2NODRKZP88ZB9", "SE", "A95LVHANDHOSF"),
            ("A33AVAJ2PDY3EV", "TR", "A95LVHANDHOSF"),
            ("A28R8C7NBKEWEA", "IE", "A95LVHANDHOSF"),
            # Middle East — uses EU endpoint
            ("A2VIGQ35RCS4UG", "AE", "A95LVHANDHOSF"),
            ("A17E79C6D8DWNP", "SA", "A95LVHANDHOSF"),
        ],
    },

    # ── North America — US, CA, MX all share seller A2J3OJ1QMMOAR5 ──────────
    # One token covers all three marketplaces.
    # Secret: amazon-sp-api-refresh-token-na-2 (already stored in Key Vault).
    "NA": {
        "endpoint": "https://sellingpartnerapi-na.amazon.com",
        "refresh_token_secret": "amazon-sp-api-refresh-token-na-2",
        "marketplaces": [
            ("ATVPDKIKX0DER",  "US", "A2J3OJ1QMMOAR5"),
            ("A2EUQ1WTGCTBG2", "CA", "A2J3OJ1QMMOAR5"),
            ("A1AM78C64UM0Y8", "MX", "A2J3OJ1QMMOAR5"),
        ],
    },

    # ── Far East — separate seller accounts per marketplace ────────────────
    # Each FE marketplace is a distinct seller account with its own token.
    "FE-JP": {
        "endpoint": "https://sellingpartnerapi-fe.amazon.com",
        "refresh_token_secret": "amazon-sp-api-refresh-token-fe-jp",
        "refresh_token_fallback": "amazon-sp-api-refresh-token-fe",  # single-FE compat
        "marketplaces": [
            ("A1VC38T7YXB528", "JP", "A3HUZ3EE07Z6DX"),
        ],
    },
    "FE-AU": {
        "endpoint": "https://sellingpartnerapi-fe.amazon.com",
        "refresh_token_secret": "amazon-sp-api-refresh-token-fe-au",
        "marketplaces": [
            ("A39IBJ37TRP1C6", "AU", "A1LAIASXD1QDDB"),
        ],
    },
    "FE-SG": {
        "endpoint": "https://sellingpartnerapi-fe.amazon.com",
        "refresh_token_secret": "amazon-sp-api-refresh-token-fe-sg",
        "marketplaces": [
            ("A19VAU5U5O7RUS", "SG", "A3N8BDRT3JKMZ7"),
        ],
    },
}

# SP-API rate limits (per endpoint; accounts on the same endpoint share the bucket)
_ORDERS_RATE,    _ORDERS_BURST    = 0.0167, 10   # 1 req/60s restore, burst 10
_INVENTORY_RATE, _INVENTORY_BURST = 2.0,    2    # 2 req/s, burst 2
_LISTINGS_RATE,  _LISTINGS_BURST  = 5.0,    10   # 5 req/s, burst 10


# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------

class _RateLimiter:
    """Thread-safe token bucket rate limiter.

    Each seller account on each endpoint gets its own instance so accounts
    that share an endpoint (NA and NA-2) do not steal each other's budget.
    """

    def __init__(self, rate_per_second: float, burst: int) -> None:
        self._rate = rate_per_second
        self._burst = float(burst)
        self._tokens = float(burst)      # Start full — spend the burst allowance first
        self._last = time.monotonic()
        self._lock = threading.Lock()

    def acquire(self) -> None:
        with self._lock:
            now = time.monotonic()
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


def _load_account_token(
    account_name: str,
    account_cfg: dict,
    client_id: str,
    client_secret: str,
) -> Optional[str]:
    """Fetch the refresh token for a seller account and exchange it for an access token.

    Returns None if no refresh token secret is configured — that account is skipped.
    """
    refresh_token: Optional[str] = None

    try:
        refresh_token = get_secret(account_cfg["refresh_token_secret"])
    except Exception:
        pass

    if refresh_token is None and "refresh_token_fallback" in account_cfg:
        try:
            refresh_token = get_secret(account_cfg["refresh_token_fallback"])
            logger.info("amazon_sp: %s account using fallback refresh token secret", account_name)
        except Exception:
            pass

    if refresh_token is None:
        logger.info(
            "amazon_sp: %s account not configured "
            "(add %s to Key Vault to enable)",
            account_name, account_cfg["refresh_token_secret"],
        )
        return None

    try:
        token = _get_access_token(client_id, client_secret, refresh_token)
        logger.info("amazon_sp: %s account LWA token obtained", account_name)
        return token
    except Exception as exc:
        logger.warning("amazon_sp: %s account auth failed — %s", account_name, exc)
        return None


def _get_access_token_full(client_id: str, client_secret: str, refresh_token: str) -> dict:
    """Same LWA exchange as _get_access_token, but returns the full parsed
    response (access_token + expires_in) instead of just the token string.

    Added for _TokenHolder (rev 3), which tracks real expiry instead of an
    assumed elapsed-time margin. _get_access_token itself is untouched —
    existing run()/run_backfill() callers are unaffected.
    """
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
    body = resp.json()
    if not body.get("access_token"):
        raise ValueError(f"No access_token in LWA response: {body}")
    return body


def _load_account_token_with_expiry(
    account_name: str,
    account_cfg: dict,
    client_id: str,
    client_secret: str,
) -> Optional[dict]:
    """Same refresh-token lookup and fallback as _load_account_token, but
    returns the full LWA response (access_token + expires_in) via
    _get_access_token_full. Used only by the Reports API section (rev 3);
    _load_account_token itself is untouched.
    """
    refresh_token: Optional[str] = None

    try:
        refresh_token = get_secret(account_cfg["refresh_token_secret"])
    except Exception:
        pass

    if refresh_token is None and "refresh_token_fallback" in account_cfg:
        try:
            refresh_token = get_secret(account_cfg["refresh_token_fallback"])
            logger.info("amazon_sp: %s account using fallback refresh token secret", account_name)
        except Exception:
            pass

    if refresh_token is None:
        logger.info(
            "amazon_sp: %s account not configured "
            "(add %s to Key Vault to enable)",
            account_name, account_cfg["refresh_token_secret"],
        )
        return None

    try:
        body = _get_access_token_full(client_id, client_secret, refresh_token)
        logger.info(
            "amazon_sp: %s account LWA token obtained (expires_in=%s)",
            account_name, body.get("expires_in"),
        )
        return body
    except Exception as exc:
        logger.warning("amazon_sp: %s account auth failed — %s", account_name, exc)
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
        wait_s = float(resp.headers.get("x-amzn-RateLimit-Limit", "60"))
        logger.warning("amazon_sp: 429 on %s — backing off %.0fs", url, wait_s)
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
    """Yield order pages following NextToken cursor."""
    url = f"{base_url}/orders/v0/orders"
    page = _get(client, url, params, rl)
    yield page
    while True:
        next_token = page.get("payload", {}).get("NextToken")
        if not next_token:
            break
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
    params: dict = {
        "MarketplaceIds": marketplace_id,
        "LastUpdatedAfter": since,
        "MaxResultsPerPage": 100,
    }
    if until:
        params["LastUpdatedBefore"] = until

    count = 0
    for page in _paginate_orders(client, base_url, marketplace_id, params, rl):
        orders = page.get("payload", {}).get("Orders", [])
        write_raw(
            source=SOURCE, pull_id=pull_id,
            endpoint=f"/orders/v0/orders/{marketplace_id}",
            response_body={**page, "marketplace_id": marketplace_id},
            response_status=200, connector_version=VERSION,
        )
        batch = [
            {
                "source": SOURCE,
                "record_type": "order",
                "source_record_id": order["AmazonOrderId"],   # globally unique
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
        "amazon_sp: orders  marketplace=%s (%s) count=%d",
        marketplace_id, marketplace_name, count,
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
    """Yield FBA inventory summary pages following nextToken cursor."""
    url = f"{base_url}/fba/inventory/v1/summaries"
    base_params: dict = {
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
                source=SOURCE, pull_id=pull_id,
                endpoint=f"/fba/inventory/v1/summaries/{marketplace_id}",
                response_body={**page, "marketplace_id": marketplace_id},
                response_status=200, connector_version=VERSION,
            )
            batch: list = []
            for s in summaries:
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
            logger.info(
                "amazon_sp: FBA inventory not available for marketplace=%s (%s)",
                marketplace_id, marketplace_name,
            )
        else:
            logger.warning(
                "amazon_sp: inventory error marketplace=%s HTTP %s",
                marketplace_id, exc.response.status_code,
            )
        return 0

    if count:
        logger.info(
            "amazon_sp: inventory marketplace=%s (%s) count=%d",
            marketplace_id, marketplace_name, count,
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
    """Yield listing item pages following nextToken cursor."""
    url = f"{base_url}/listings/2021-08-01/items/{seller_id}"
    base_params: dict = {
        "marketplaceIds": marketplace_id,
        "pageSize": 10,
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
    count = 0
    skipped = 0
    try:
        for page in _paginate_listings(client, base_url, seller_id, marketplace_id, rl):
            items = page.get("items", [])
            write_raw(
                source=SOURCE, pull_id=pull_id,
                endpoint=f"/listings/2021-08-01/items/{marketplace_id}",
                response_body={**page, "marketplace_id": marketplace_id},
                response_status=200, connector_version=VERSION,
            )
            batch = []
            for item in items:
                sku = item.get("sku")
                if not sku:
                    # Fixed 2026-08-17 (rev 3): this used to fall back to the
                    # literal string "unknown", which collapsed every SKU-less
                    # item in a marketplace into one row that overwrote itself
                    # on each subsequent item — silent data loss that looked
                    # like a successful upsert. Skip and count instead.
                    logger.warning(
                        "amazon_sp: listings marketplace=%s: item without sku, skipping: asin=%s",
                        marketplace_id, item.get("asin"),
                    )
                    skipped += 1
                    continue
                batch.append({
                    "source": SOURCE,
                    "record_type": "listing",
                    "source_record_id": f"{marketplace_id}_{sku}",
                    "data": {
                        **item,
                        "marketplace_id": marketplace_id,
                        "marketplace_name": marketplace_name,
                    },
                    "last_pull_id": pull_id,
                })
            if batch:
                upsert_clean_batch(batch)
            count += len(batch)

    except httpx.HTTPStatusError as exc:
        logger.warning(
            "amazon_sp: listings error marketplace=%s HTTP %s",
            marketplace_id, exc.response.status_code,
        )
        return 0

    if count:
        logger.info(
            "amazon_sp: listings  marketplace=%s (%s) count=%d",
            marketplace_id, marketplace_name, count,
        )
    if skipped:
        logger.warning(
            "amazon_sp: listings marketplace=%s (%s) skipped=%d item(s) with no sku — investigate if this is ever non-zero",
            marketplace_id, marketplace_name, skipped,
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
    seller_id: str,
    pull_id: str,
    *,
    orders_rl: _RateLimiter,
    inventory_rl: _RateLimiter,
    listings_rl: _RateLimiter,
    since: str,
    until: Optional[str] = None,
    include_inventory: bool = True,
    include_listings: bool = True,
) -> None:
    logger.info(
        "amazon_sp: marketplace=%s (%s) since=%s",
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
        _sync_listings(
            client, base_url, seller_id, marketplace_id, marketplace_name,
            pull_id, listings_rl,
        )


# ---------------------------------------------------------------------------
# Per-account orchestration
# ---------------------------------------------------------------------------

def _sync_account(
    account_name: str,
    account_cfg: dict,
    access_token: str,
    pull_id: str,
    since: str,
    until: Optional[str] = None,
    include_inventory: bool = True,
    include_listings: bool = True,
) -> None:
    """Process all marketplaces under one seller account."""
    base_url = account_cfg["endpoint"]
    headers = {
        "x-amz-access-token": access_token,
        "Accept": "application/json",
    }
    # Each account gets independent rate limiters
    orders_rl    = _RateLimiter(_ORDERS_RATE,    _ORDERS_BURST)
    inventory_rl = _RateLimiter(_INVENTORY_RATE, _INVENTORY_BURST)
    listings_rl  = _RateLimiter(_LISTINGS_RATE,  _LISTINGS_BURST)

    with httpx.Client(headers=headers, timeout=30.0) as client:
        for marketplace_id, marketplace_name, seller_id in account_cfg["marketplaces"]:
            try:
                _sync_marketplace(
                    client, base_url, marketplace_id, marketplace_name, seller_id,
                    pull_id,
                    orders_rl=orders_rl,
                    inventory_rl=inventory_rl,
                    listings_rl=listings_rl,
                    since=since,
                    until=until,
                    include_inventory=include_inventory,
                    include_listings=include_listings,
                )
            except Exception as exc:
                logger.error(
                    "amazon_sp: marketplace=%s (%s) FAILED: %s",
                    marketplace_id, marketplace_name, exc, exc_info=True,
                )

    logger.info("amazon_sp: %s account complete pull_id=%s", account_name, pull_id)


# ---------------------------------------------------------------------------
# Entry points
# ---------------------------------------------------------------------------

def run() -> None:
    """Incremental sync: orders, FBA inventory, and listings for all accounts.

    Loads tokens for whichever accounts are configured in Key Vault, then runs
    all active accounts in parallel (each has its own access token and rate limits).
    """
    pull_id = str(uuid.uuid4())
    logger.info("amazon_sp.run start pull_id=%s", pull_id)

    creds = get_secrets([
        "amazon-sp-api-client-id",
        "amazon-sp-api-client-secret",
    ])
    client_id     = creds["amazon-sp-api-client-id"]
    client_secret = creds["amazon-sp-api-client-secret"]

    # Build access tokens for every account that has a refresh token configured
    active: dict[str, str] = {}   # account_name -> access_token
    for account_name, account_cfg in ACCOUNTS.items():
        token = _load_account_token(account_name, account_cfg, client_id, client_secret)
        if token:
            active[account_name] = token

    if not active:
        logger.error("amazon_sp: no accounts accessible — add refresh token secrets to Key Vault")
        return

    _since_raw = last_pull_ts(SOURCE) or (
        datetime.now(timezone.utc) - timedelta(days=90)
    ).isoformat()
    since = datetime.fromisoformat(
        _since_raw.replace("Z", "+00:00")
    ).strftime("%Y-%m-%dT%H:%M:%SZ")

    logger.info(
        "amazon_sp: %d/%d accounts active since=%s pull_id=%s",
        len(active), len(ACCOUNTS), since, pull_id,
    )

    # Accounts are independent — run in parallel
    with ThreadPoolExecutor(
        max_workers=len(active),
        thread_name_prefix="amazon_sp",
    ) as executor:
        futures = {
            executor.submit(
                _sync_account,
                account_name, ACCOUNTS[account_name], token, pull_id, since,
                include_inventory=True, include_listings=True,
            ): account_name
            for account_name, token in active.items()
        }
        for future in as_completed(futures):
            account_name = futures[future]
            try:
                future.result()
            except Exception as exc:
                logger.error(
                    "amazon_sp: %s account FAILED: %s", account_name, exc, exc_info=True,
                )

    logger.info("amazon_sp.run complete pull_id=%s", pull_id)


def run_backfill(start_date, end_date) -> None:
    """Pull orders for all configured accounts within the given date range.

    Accounts run sequentially to stay well within rate limits during long
    backfill sessions. Inventory and listings are skipped — they are current
    state only, not historical data.
    """
    pull_id = str(uuid.uuid4())

    since = datetime(
        start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc,
    ).strftime("%Y-%m-%dT%H:%M:%SZ")

    # SP-API: LastUpdatedBefore must be at least 2 minutes in the past
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
    client_id     = creds["amazon-sp-api-client-id"]
    client_secret = creds["amazon-sp-api-client-secret"]

    for account_name, account_cfg in ACCOUNTS.items():
        token = _load_account_token(account_name, account_cfg, client_id, client_secret)
        if token is None:
            continue
        try:
            _sync_account(
                account_name, account_cfg, token, pull_id, since, until,
                include_inventory=False,   # point-in-time only
                include_listings=False,
            )
        except Exception as exc:
            logger.error(
                "amazon_sp: %s account backfill FAILED: %s", account_name, exc, exc_info=True,
            )

    logger.info("amazon_sp.run_backfill complete pull_id=%s", pull_id)


# ═══════════════════════════════════════════════════════════════════════════
# Reports API (v2021-06-30) — added alongside the above, does not modify it.
#
# Covers three report types not available through getOrders:
#   GET_MERCHANT_LISTINGS_ALL_DATA                          -> run_listings()
#   GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL      -> run_order_items()
#   GET_SALES_AND_TRAFFIC_REPORT                             -> run_sales_traffic_nightly()
#                                                               run_sales_traffic_backfill()
#
# None of these are registered in scheduler.py yet — call manually or via the
# dry-run CLI at the bottom of this file. See reports/amazon-reports-api.md.
# ═══════════════════════════════════════════════════════════════════════════

# ---------------------------------------------------------------------------
# Reports API rate limits
#
# Confirmed 2026-08-17 from the official SP-API OpenAPI model
# (github.com/amzn/selling-partner-api-models, reports-api-model/reports_2021-06-30.json)
# — these three numbers are source-verified. The date-range/retention constants
# further down are NOT verified the same way; see the comments on each and
# reports/amazon-reports-api.md.
# ---------------------------------------------------------------------------
_REPORTS_CREATE_RATE,   _REPORTS_CREATE_BURST   = 0.0167, 15   # createReport:      1 req/60s, burst 15
_REPORTS_POLL_RATE,     _REPORTS_POLL_BURST     = 2.0,    15   # getReport:         2 req/s,   burst 15
_REPORTS_DOCUMENT_RATE, _REPORTS_DOCUMENT_BURST = 0.0167, 15   # getReportDocument: 1 req/60s, burst 15

_REPORT_TERMINAL_STATUSES = {"DONE", "CANCELLED", "FATAL"}
_REPORT_POLL_INITIAL_DELAY_S = 10.0
_REPORT_POLL_MAX_DELAY_S = 120.0
_REPORT_POLL_MAX_WAIT_S = 30 * 60   # give up after 30 minutes of IN_QUEUE / IN_PROGRESS

# ---------------------------------------------------------------------------
# Configurable, UNVERIFIED date-range/retention limits — moved here (top of
# the Reports API section) so they're easy to find and edit in one place.
#
# Neither number was confirmed this session. developer-docs.amazon.com
# redirected to a non-resolving host ("developer-docs.amazon", no TLD) for
# every path tried; a GitHub docs mirror and the Wayback Machine were also
# both unreachable; there were no live Amazon credentials to test against
# either (Key Vault access is broken locally — WON'T FIX, see
# reports/scheduler-deploy-prep.md). Full detail in reports/amazon-reports-api.md.
#
# Both are STARTING POINTS, not hard walls:
#   - _ORDER_ITEMS_CHUNK_DAYS: run_order_items() halves a chunk and retries if
#     Amazon rejects it as too wide (_create_report_adaptive below), so the
#     real limit is discovered at runtime instead of assumed.
#   - _SALES_TRAFFIC_RETENTION_DAYS: only used to flag an empty result as a
#     "possible retention limit" in the log — never to block a request.
# ---------------------------------------------------------------------------
_ORDER_ITEMS_CHUNK_DAYS = 30        # UNVERIFIED — commonly cited for BY_ORDER_DATE flat-file reports
_SALES_TRAFFIC_RETENTION_DAYS = 730 # UNVERIFIED — used only to flag an empty result as a possible
                                     # retention hit in the log; NEVER blocks a request (fixed 2026-08-17
                                     # rev 4 — it used to skip the call entirely, which silently truncated
                                     # a backfill if this number was wrong).

_MAX_ATTEMPTS = 3
# Sales & traffic backfill: a day marked 'gap' or 'parse_failed' this many
# times stops being retried on resume and is logged as needing manual
# investigation instead — see amazon_asin_daily_status.attempts,
# _resume_skip_info, run_sales_traffic_backfill.

ACTIVE_MARKETPLACES: set[str] = {
    # Filled in 2026-08-17 per Jon: every marketplace_id in ACCOUNTS above
    # EXCEPT Mexico, Australia and Singapore (16 of 19). IDs copied directly
    # from ACCOUNTS, not from any external source. Filtering happens at the
    # iteration point in run_sales_traffic_nightly / run_sales_traffic_backfill
    # — not by removing entries from ACCOUNTS — so re-enabling a marketplace
    # later is one line here, no other code changes.

    # EU (13) — all included
    "A1F83G8C2ARO7P",  # UK
    "A1PA6795UKMFR9",  # DE
    "A13V1IB3VIYZZH",  # FR
    "APJ6JRA9NG5V4",   # IT
    "A1RKKUPIHCS9HS",  # ES
    "A1805IZSGTT6HS",  # NL
    "AMEN7PMS3EDWL",   # BE
    "A1C3SOZRARQ6R3",  # PL
    "A2NODRKZP88ZB9",  # SE
    "A33AVAJ2PDY3EV",  # TR
    "A28R8C7NBKEWEA",  # IE
    "A2VIGQ35RCS4UG",  # AE
    "A17E79C6D8DWNP",  # SA

    # NA (2 of 3) — MX excluded
    "ATVPDKIKX0DER",   # US
    "A2EUQ1WTGCTBG2",  # CA

    # FE (1 of 3) — AU and SG excluded
    "A1VC38T7YXB528",  # JP
}

class AccountSkipped(Exception):
    """Raised by _TokenHolder.ensure_fresh when a token refresh is needed and
    fails. Callers should catch this per-account (see _run_reports_for_all_accounts
    and run_sales_traffic_backfill) so one bad account/expired-credential
    doesn't waste further calls on a token that will just fail again, while
    other accounts in the same run continue unaffected.
    """

    def __init__(self, account_name: str, reason: str) -> None:
        self.account_name = account_name
        self.reason = reason
        super().__init__(f"{account_name}: {reason}")


_TOKEN_MARGIN_S = 300   # refresh 5 minutes before the token's OWN reported expiry


class _TokenHolder:
    """Tracks one account's LWA access token using the token's own expires_in
    from Amazon — not an assumed elapsed-time margin.

    Fixed 2026-08-17 (rev 3): the previous version measured staleness from when
    the token was first loaded *in this process* (45 minutes, assuming ~1h TTL).
    A token that happened to already be partially aged when fetched (e.g.
    reused from a recent prior call, or Amazon issuing a shorter TTL than
    assumed) would be treated as fresh for a further 45 minutes here, then
    expire mid-run. Tracking the real expires_in removes that assumption.
    """

    def __init__(
        self, account_name: str, account_cfg: dict, client_id: str, client_secret: str, initial_token_body: dict,
    ) -> None:
        self._account_name = account_name
        self._account_cfg = account_cfg
        self._client_id = client_id
        self._client_secret = client_secret
        self.token: str = initial_token_body["access_token"]
        self._expires_at = self._compute_expiry(initial_token_body)

    @staticmethod
    def _compute_expiry(token_body: dict) -> Optional[float]:
        expires_in = token_body.get("expires_in")
        return time.time() + float(expires_in) if expires_in is not None else None

    def ensure_fresh(self, client: httpx.Client) -> None:
        """Call before every report request (each create/poll/download cycle).

        Raises AccountSkipped if a refresh is needed and fails — see the class
        docstring above for why this is fatal-for-this-account rather than a
        silent continue-with-stale-token: continuing on a token that just
        failed to refresh would most likely just fail again on the next real
        HTTP call, after already spending a createReport call to find out.
        """
        now = time.time()
        if self.token and self._expires_at and now < self._expires_at - _TOKEN_MARGIN_S:
            return
        logger.info(
            "amazon_sp: %s access token needs refresh (expires_at=%s) — refreshing before next report request",
            self._account_name, self._expires_at,
        )
        body = _load_account_token_with_expiry(
            self._account_name, self._account_cfg, self._client_id, self._client_secret,
        )
        if body is None:
            logger.error("amazon_sp: %s token refresh failed — skipping account", self._account_name)
            raise AccountSkipped(self._account_name, "token refresh failed")
        self.token = body["access_token"]
        self._expires_at = self._compute_expiry(body)
        client.headers["x-amz-access-token"] = self.token
        logger.info(
            "amazon_sp: %s access token refreshed, valid %ss", self._account_name, body.get("expires_in"),
        )


class ReportsRateLimiters:
    """One create/poll/document _RateLimiter triplet per seller account.

    Mirrors the existing per-account orders_rl/inventory_rl/listings_rl pattern in
    _sync_account: a fresh instance per account so accounts on the same Amazon
    endpoint don't share a budget. _RateLimiter itself needed no changes to support
    this — it was already generic, just instantiated per-endpoint before.
    """

    def __init__(self) -> None:
        self.create = _RateLimiter(_REPORTS_CREATE_RATE, _REPORTS_CREATE_BURST)
        self.poll = _RateLimiter(_REPORTS_POLL_RATE, _REPORTS_POLL_BURST)
        self.document = _RateLimiter(_REPORTS_DOCUMENT_RATE, _REPORTS_DOCUMENT_BURST)


def _create_report(
    client: httpx.Client,
    base_url: str,
    rl: ReportsRateLimiters,
    report_type: str,
    marketplace_ids: list[str],
    data_start_time: Optional[str] = None,
    data_end_time: Optional[str] = None,
    report_options: Optional[dict] = None,
) -> str:
    rl.create.acquire()
    body: dict = {"reportType": report_type, "marketplaceIds": marketplace_ids}
    if data_start_time:
        body["dataStartTime"] = data_start_time
    if data_end_time:
        body["dataEndTime"] = data_end_time
    if report_options:
        body["reportOptions"] = report_options
    resp = client.post(f"{base_url}/reports/2021-06-30/reports", json=body)
    resp.raise_for_status()
    report_id = resp.json()["reportId"]
    logger.info(
        "amazon_sp: report requested type=%s id=%s marketplaces=%s",
        report_type, report_id, marketplace_ids,
    )
    return report_id


def _poll_report(client: httpx.Client, base_url: str, rl: ReportsRateLimiters, report_id: str) -> dict:
    """Poll GET /reports/{reportId} until processingStatus is terminal.

    Exponential backoff from 10s up to a 120s cap, logging each status
    transition (not every poll). Gives up after 30 minutes total.
    """
    delay = _REPORT_POLL_INITIAL_DELAY_S
    waited = 0.0
    last_status: Optional[str] = None
    while True:
        rl.poll.acquire()
        resp = client.get(f"{base_url}/reports/2021-06-30/reports/{report_id}")
        resp.raise_for_status()
        body = resp.json()
        status = body.get("processingStatus")
        if status != last_status:
            logger.info("amazon_sp: report %s status=%s (waited %.0fs)", report_id, status, waited)
            last_status = status
        if status in _REPORT_TERMINAL_STATUSES:
            return body
        if waited >= _REPORT_POLL_MAX_WAIT_S:
            raise TimeoutError(f"amazon_sp: report {report_id} still {status} after {waited:.0f}s — giving up")
        time.sleep(delay)
        waited += delay
        delay = min(delay * 1.5, _REPORT_POLL_MAX_DELAY_S)


def _download_report_document(
    client: httpx.Client, base_url: str, rl: ReportsRateLimiters, report_document_id: str,
) -> tuple[bytes, dict]:
    """Fetch document metadata, then download from its pre-signed URL.

    The pre-signed URL is not an SP-API endpoint — no LWA token belongs on it —
    so it's fetched with a bare httpx.get, not the authenticated `client`.
    Decompresses GZIP when compressionAlgorithm says so.
    """
    rl.document.acquire()
    resp = client.get(f"{base_url}/reports/2021-06-30/documents/{report_document_id}")
    resp.raise_for_status()
    doc_meta = resp.json()
    download_resp = httpx.get(doc_meta["url"], timeout=120.0)
    download_resp.raise_for_status()
    raw = download_resp.content
    if doc_meta.get("compressionAlgorithm") == "GZIP":
        raw = gzip.decompress(raw)
    return raw, doc_meta


def _decode_report_bytes(raw: bytes) -> str:
    """Amazon flat-file reports are documented as cp1252-ish "ANSI"; some come
    back plain UTF-8 or UTF-8 with a BOM. Try in order rather than assuming.
    """
    for encoding in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("cp1252", errors="replace")


def _parse_tsv(text: str) -> list[dict]:
    """Parse a tab-separated flat file using its own header row — no hardcoded columns."""
    if not text.strip():
        return []
    reader = csv.DictReader(io.StringIO(text), delimiter="\t")
    return [dict(row) for row in reader]


def run_report_sync(
    client: httpx.Client,
    base_url: str,
    rl: ReportsRateLimiters,
    report_type: str,
    marketplace_ids: list[str],
    *,
    data_start_time: Optional[str] = None,
    data_end_time: Optional[str] = None,
    report_options: Optional[dict] = None,
    report_format: str = "tsv",
):
    """Create, poll, download and parse one report end-to-end.

    Returns (parsed, columns, status_body):
      report_format="tsv"  -> parsed is list[dict], one dict per row keyed by the
                               report's own header row; columns is that header list.
      report_format="json" -> parsed is the decoded JSON document (dict); columns is [].
    status_body is the final GET /reports/{reportId} response — returned even on
    CANCELLED/FATAL so callers can log or inspect it; parsed is [] / {} in that case.
    """
    report_id = _create_report(
        client, base_url, rl, report_type, marketplace_ids,
        data_start_time, data_end_time, report_options,
    )
    status_body = _poll_report(client, base_url, rl, report_id)
    status = status_body.get("processingStatus")
    if status != "DONE":
        logger.warning("amazon_sp: report %s ended %s (not DONE) — %s", report_id, status, status_body)
        return ([] if report_format == "tsv" else {}), [], status_body

    raw, _doc_meta = _download_report_document(client, base_url, rl, status_body["reportDocumentId"])
    text = _decode_report_bytes(raw)

    if report_format == "json":
        return json.loads(text), [], status_body

    rows = _parse_tsv(text)
    columns = list(rows[0].keys()) if rows else []
    return rows, columns, status_body


def _looks_like_range_too_wide(exc: httpx.HTTPStatusError) -> bool:
    """Heuristic only — NOT confirmed against a real Amazon error body this
    session (no live credentials, docs unreachable; see
    reports/amazon-reports-api.md). A 400 on createReport for a date-scoped
    report is most plausibly a date-range validation error, but if Amazon's
    actual reason is something else (bad marketplace ID, malformed
    reportOptions, etc.) this will misfire and treat an unrelated 400 as "too
    wide". Always logged loudly either way (see _create_report_adaptive), so a
    misfire is visible rather than silent.
    """
    resp = exc.response
    if resp is None or resp.status_code != 400:
        return False
    try:
        text = json.dumps(resp.json()).lower()
    except Exception:
        text = (resp.text or "").lower()
    keywords = ("date", "range", "too large", "too wide", "exceed", "period", "interval")
    return any(kw in text for kw in keywords)


def _create_report_adaptive(
    client: httpx.Client,
    base_url: str,
    rl: ReportsRateLimiters,
    token_holder: _TokenHolder,
    report_type: str,
    marketplace_ids: list[str],
    chunk_start: date,
    chunk_end: date,
    *,
    report_options: Optional[dict] = None,
    report_format: str = "tsv",
    min_days: int = 1,
):
    """Request one report for [chunk_start, chunk_end]. If Amazon rejects the
    range as too wide (per _looks_like_range_too_wide), halve it and retry each
    half, recursing down to min_days. Logs the accepted width once a sub-range
    succeeds, so the real limit gets discovered at runtime instead of assumed.
    Refreshes the account's access token first if it's getting stale.

    Yields (sub_start, sub_end, parsed, columns, status_body) for every
    sub-range actually requested. A failure for any reason other than "too
    wide" propagates as an exception rather than yielding.
    """
    token_holder.ensure_fresh(client)

    data_start = datetime(
        chunk_start.year, chunk_start.month, chunk_start.day, tzinfo=timezone.utc,
    ).strftime("%Y-%m-%dT%H:%M:%SZ")
    data_end_dt = min(
        datetime(chunk_end.year, chunk_end.month, chunk_end.day, 23, 59, 59, tzinfo=timezone.utc),
        datetime.now(timezone.utc) - timedelta(minutes=5),   # dataEndTime must be in the past
    )
    data_end = data_end_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        parsed, columns, status = run_report_sync(
            client, base_url, rl, report_type, marketplace_ids,
            data_start_time=data_start, data_end_time=data_end,
            report_options=report_options, report_format=report_format,
        )
        width = (chunk_end - chunk_start).days + 1
        logger.info(
            "amazon_sp: %s accepted width=%d day(s) (%s..%s)",
            report_type, width, chunk_start, chunk_end,
        )
        yield chunk_start, chunk_end, parsed, columns, status
    except httpx.HTTPStatusError as exc:
        span_days = (chunk_end - chunk_start).days + 1
        if span_days > min_days and _looks_like_range_too_wide(exc):
            mid = chunk_start + timedelta(days=max(span_days // 2 - 1, 0))
            logger.warning(
                "amazon_sp: %s rejected width=%d day(s) (%s..%s) status=%s — halving and retrying",
                report_type, span_days, chunk_start, chunk_end,
                exc.response.status_code if exc.response is not None else "?",
            )
            yield from _create_report_adaptive(
                client, base_url, rl, token_holder, report_type, marketplace_ids,
                chunk_start, mid,
                report_options=report_options, report_format=report_format, min_days=min_days,
            )
            yield from _create_report_adaptive(
                client, base_url, rl, token_holder, report_type, marketplace_ids,
                mid + timedelta(days=1), chunk_end,
                report_options=report_options, report_format=report_format, min_days=min_days,
            )
        else:
            raise


# ---------------------------------------------------------------------------
# Date-range chunking
# ---------------------------------------------------------------------------

def _chunk_date_range(start_date: date, end_date: date, max_days: int) -> list[tuple[date, date]]:
    """Split [start_date, end_date] (inclusive) into consecutive chunks of at most max_days days."""
    if start_date > end_date:
        raise ValueError(f"start_date {start_date} is after end_date {end_date}")
    chunks: list[tuple[date, date]] = []
    cur = start_date
    while cur <= end_date:
        chunk_end = min(cur + timedelta(days=max_days - 1), end_date)
        chunks.append((cur, chunk_end))
        cur = chunk_end + timedelta(days=1)
    return chunks


# ---------------------------------------------------------------------------
# Per-account orchestration shared by all three report entry points below
# ---------------------------------------------------------------------------

def _run_reports_for_all_accounts(
    pull_id: str, label: str, per_marketplace, *, marketplace_filter: Optional[set] = None,
) -> int:
    """Load tokens for every configured account, then call per_marketplace for
    every (account, marketplace) pair.

    marketplace_filter, if given, restricts iteration to marketplace_ids in
    that set — used by run_sales_traffic_nightly to scope to ACTIVE_MARKETPLACES
    without removing anything from ACCOUNTS. run_listings/run_order_items pass
    nothing and cover all configured marketplaces, unchanged.

    Accounts run in parallel (one thread each, mirroring run()'s ThreadPoolExecutor
    use — accounts are independent, each with its own token and rate-limit budget).
    Marketplaces within one account run sequentially, because they share that
    account's ReportsRateLimiters instance — same reasoning as the existing
    _sync_account, which loops its marketplaces in a plain for loop for the same
    per-account-shared-budget reason.

    per_marketplace(client, base_url, rl, marketplace_id, marketplace_name, account_name, token_holder) -> int (row count)
    Call token_holder.ensure_fresh(client) before each report request inside
    per_marketplace — see _TokenHolder above.
    """
    creds = get_secrets(["amazon-sp-api-client-id", "amazon-sp-api-client-secret"])
    client_id, client_secret = creds["amazon-sp-api-client-id"], creds["amazon-sp-api-client-secret"]

    active: dict[str, tuple[dict, dict]] = {}
    for account_name, account_cfg in ACCOUNTS.items():
        token_body = _load_account_token_with_expiry(account_name, account_cfg, client_id, client_secret)
        if token_body:
            active[account_name] = (account_cfg, token_body)

    if not active:
        logger.error("amazon_sp: %s — no accounts accessible (add refresh token secrets to Key Vault)", label)
        return 0

    def _run_account(account_name: str, account_cfg: dict, token_body: dict) -> int:
        base_url = account_cfg["endpoint"]
        headers = {"x-amz-access-token": token_body["access_token"], "Accept": "application/json"}
        rl = ReportsRateLimiters()
        token_holder = _TokenHolder(account_name, account_cfg, client_id, client_secret, token_body)
        count = 0
        with httpx.Client(headers=headers, timeout=60.0) as client:
            for marketplace_id, marketplace_name, _seller_id in account_cfg["marketplaces"]:
                if marketplace_filter is not None and marketplace_id not in marketplace_filter:
                    continue
                try:
                    count += per_marketplace(
                        client, base_url, rl, marketplace_id, marketplace_name, account_name, token_holder,
                    )
                except AccountSkipped as exc:
                    logger.error(
                        "amazon_sp: %s — %s — aborting remaining marketplaces for this account",
                        label, exc,
                    )
                    break
                except Exception as exc:
                    logger.error(
                        "amazon_sp: %s FAILED account=%s marketplace=%s (%s): %s",
                        label, account_name, marketplace_id, marketplace_name, exc, exc_info=True,
                    )
        return count

    total = 0
    with ThreadPoolExecutor(max_workers=len(active), thread_name_prefix=f"amazon_sp_{label}") as executor:
        futures = {
            executor.submit(_run_account, name, cfg, token_body): name
            for name, (cfg, token_body) in active.items()
        }
        for future in as_completed(futures):
            account_name = futures[future]
            try:
                total += future.result()
            except Exception as exc:
                logger.error("amazon_sp: %s account=%s FAILED: %s", label, account_name, exc, exc_info=True)

    return total


# ---------------------------------------------------------------------------
# 3a. GET_MERCHANT_LISTINGS_ALL_DATA -> record_type "listing"
#
# Current-snapshot report, no date range. Requested one marketplace at a time
# (not all 13 EU marketplaces in one call) because the flat file has no
# marketplace-id column of its own to key off — same reason _sync_listings
# above loops marketplaces individually and stamps marketplace_id on afterward.
#
# source_record_id = f"{marketplace_id}_{seller_sku}" — underscore-separated,
# matching the EXISTING Listings-Items-API-sourced 'listing' rows written by
# _sync_listings above. Corrected 2026-08-17 — the original colon-separated
# spec was wrong and would have produced two rows per real listing (one per
# source). Same format, same record_type='listing' -> both sources now upsert
# into the SAME row per real listing, whichever ran most recently wins
# (merge-duplicates), matching upsert_clean_batch's
# (source, record_type, source_record_id) unique key.
#
# _sync_listings itself was also fixed the same day: it used to fall back to
# the literal string "unknown" for SKU-less items, collapsing them into one
# overwriting row — see its docstring-adjacent comment above for the fix.
# ---------------------------------------------------------------------------

def run_listings() -> None:
    """Pull the current merchant listings snapshot for every configured marketplace.

    Not registered in scheduler.py. Call directly, e.g. from a one-off script
    or the dry-run CLI at the bottom of this file.
    """
    pull_id = str(uuid.uuid4())
    logger.info("amazon_sp.run_listings start pull_id=%s", pull_id)

    def _one_marketplace(client, base_url, rl, marketplace_id, marketplace_name, account_name, token_holder) -> int:
        token_holder.ensure_fresh(client)
        rows, columns, status = run_report_sync(
            client, base_url, rl,
            report_type="GET_MERCHANT_LISTINGS_ALL_DATA",
            marketplace_ids=[marketplace_id],
        )
        write_raw(
            source=SOURCE, pull_id=pull_id,
            endpoint=f"/reports/2021-06-30/reports/GET_MERCHANT_LISTINGS_ALL_DATA/{marketplace_id}",
            response_body={
                "processingStatus": status.get("processingStatus"),
                "row_count": len(rows), "columns": columns,
            },
            response_status=200, connector_version=VERSION,
        )
        batch = []
        for row in rows:
            seller_sku = row.get("seller-sku")
            if not seller_sku:
                continue
            batch.append({
                "source": SOURCE, "record_type": "listing",
                "source_record_id": f"{marketplace_id}_{seller_sku}",
                "data": {**row, "marketplace_id": marketplace_id, "marketplace_name": marketplace_name},
                "last_pull_id": pull_id,
            })
        if batch:
            upsert_clean_batch(batch)
        logger.info(
            "amazon_sp: listings marketplace=%s (%s) rows=%d",
            marketplace_id, marketplace_name, len(batch),
        )
        return len(batch)

    total = _run_reports_for_all_accounts(pull_id, "listings", _one_marketplace)
    logger.info("amazon_sp.run_listings complete pull_id=%s total_rows=%d", pull_id, total)


# ---------------------------------------------------------------------------
# 3b. GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL -> record_type "order_item"
#
# source_record_id = f"{amazon_order_id}:{seller_sku}". This cannot collide with
# the existing record_type='order' rows regardless of the ID string chosen,
# because (source, record_type, source_record_id) is the full unique key and
# record_type differs ('order' vs 'order_item') — see Step 1(d) in the chat
# report for the full explanation. The colon join with seller_sku is what keeps
# multiple line items *within the same order* from colliding with each other,
# which is the real job this ID format is doing.
#
# Starting chunk width: _ORDER_ITEMS_CHUNK_DAYS, defined near the top of the
# Reports API section above (UNVERIFIED — see the comment there). If Amazon
# rejects a chunk as too wide, _create_report_adaptive (above) halves it and
# retries, discovering and logging the real accepted width at runtime instead
# of trusting the assumed 30-day figure.
# ---------------------------------------------------------------------------

def run_order_items(start_date: date, end_date: date) -> None:
    """Pull order line items (ASIN, SKU, qty, item price/tax) for every configured
    marketplace over [start_date, end_date], starting from _ORDER_ITEMS_CHUNK_DAYS
    windows and adaptively halving any window Amazon rejects as too wide.

    Not registered in scheduler.py. Call directly, e.g. from a one-off script
    or the dry-run CLI at the bottom of this file.
    """
    pull_id = str(uuid.uuid4())
    logger.info("amazon_sp.run_order_items start %s to %s pull_id=%s", start_date, end_date, pull_id)

    chunks = _chunk_date_range(start_date, end_date, _ORDER_ITEMS_CHUNK_DAYS)
    logger.info(
        "amazon_sp: order_items %d starting chunk(s) of up to %d day(s) each (may be halved further at runtime)",
        len(chunks), _ORDER_ITEMS_CHUNK_DAYS,
    )

    def _one_marketplace(client, base_url, rl, marketplace_id, marketplace_name, account_name, token_holder) -> int:
        count = 0
        for chunk_start, chunk_end in chunks:
            for sub_start, sub_end, rows, columns, status in _create_report_adaptive(
                client, base_url, rl, token_holder,
                "GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL", [marketplace_id],
                chunk_start, chunk_end,
            ):
                write_raw(
                    source=SOURCE, pull_id=pull_id,
                    endpoint=f"/reports/2021-06-30/reports/GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL/{marketplace_id}",
                    response_body={
                        "processingStatus": status.get("processingStatus"), "row_count": len(rows),
                        "columns": columns, "chunk_start": str(sub_start), "chunk_end": str(sub_end),
                    },
                    response_status=200, connector_version=VERSION,
                )
                batch = []
                for row in rows:
                    order_id = row.get("amazon-order-id")
                    sku = row.get("sku")
                    if not order_id or not sku:
                        continue
                    batch.append({
                        "source": SOURCE, "record_type": "order_item",
                        "source_record_id": f"{order_id}:{sku}",
                        "data": {**row, "marketplace_id": marketplace_id, "marketplace_name": marketplace_name},
                        "last_pull_id": pull_id,
                    })
                if batch:
                    upsert_clean_batch(batch)
                count += len(batch)
                logger.info(
                    "amazon_sp: order_items marketplace=%s (%s) %s..%s rows=%d",
                    marketplace_id, marketplace_name, sub_start, sub_end, len(batch),
                )
        return count

    total = _run_reports_for_all_accounts(pull_id, "order_items", _one_marketplace)
    logger.info("amazon_sp.run_order_items complete pull_id=%s total_rows=%d", pull_id, total)


# ---------------------------------------------------------------------------
# 3c. GET_SALES_AND_TRAFFIC_REPORT -> amazon_asin_daily (NOT api_clean)
#
# Rewritten 2026-08-17 (rev 3, corrected rev 4 same day).
#
# CONFIRMED 2026-08-17, live run against real credentials (upgraded from
# "believed, pending first live run" at rev 4). Evidence: requested UK,
# 2026-08-12 to 2026-08-14 (3-day range, dataStartTime != dataEndTime) —
# response came back with exactly 33 salesAndTrafficByAsin entries, 33
# distinct childAsin values (one entry per ASIN, no duplicates), and ZERO
# entries carrying any date-like field (checked for date, reportDate,
# startDate, endDate, dataStartTime, dataEndTime — none present on any of the
# 33). Compare: the same marketplace on a single day (2026-08-14 alone)
# returned 28 entries. A 3-day request does not return ~3x the entries with a
# date per entry — it returns one blended total per ASIN with no way to
# attribute a figure back to a specific day. salesAndTrafficByAsin IS
# aggregated across whatever dataStartTime/dataEndTime range is requested.
# dateGranularity=DAY only affects the separate salesAndTrafficByDate section.
# Day-level ASIN data requires dataStartTime == dataEndTime — one report per
# calendar day, no exceptions. _create_report_adaptive (halving) does NOT
# apply here regardless — there is nothing to halve, width is always exactly
# 1 day.
#
# asinGranularity is "CHILD" (confirmed 2026-08-17 — rev 3's switch to "SKU"
# was wrong, reverted). _parse_sales_traffic_asin's field nesting is also now
# CONFIRMED — observed verbatim on the same live run (UK, 2026-08-14): every
# field it assumes (childAsin, salesByAsin.{unitsOrdered,orderedProductSales.
# {amount,currencyCode}}, trafficByAsin.{sessions,pageViews,browserSessions,
# mobileAppSessions,buyBoxPercentage,unitSessionPercentage}) matched exactly,
# 0 mismatches. The real response carries substantially more fields than were
# originally captured — see _parse_sales_traffic_asin's docstring for what was
# added 2026-08-17 (totalOrderItems, unitsShipped, ordersShipped,
# shippedProductSales, unitsRefunded, refundRate, browserPageViews,
# mobileAppPageViews, and a full set of B2B counterparts) and what's still
# deliberately skipped (the "...Percentage" share-of-total fields).
#
# Storage: a NEW table, amazon_asin_daily, keyed on
# (marketplace_id, asin, report_date) — not api_clean. No `sku` column: CHILD
# granularity has nothing to key it on cleanly, and an always-null column
# invites someone to populate it later and reintroduce a PK collision.
# report_date as a real `date` column is what makes daily/weekly/monthly
# rollups valid; that's only true because every row is exactly one day's data,
# never a blended range. amazon_asin_daily_status tracks which days have been
# pulled per marketplace — status is 'ok' / 'gap' / 'parse_failed', each with a
# reason and an attempts counter (see _MAX_ATTEMPTS) — making backfills
# resumable, gaps visible instead of indistinguishable from a genuine zero, and
# permanent failures stop being retried forever. See
# lib/migrations/14-amazon-asin-daily.sql — NOT YET APPLIED, see
# reports/amazon-reports-api.md.
#
# Retention (_SALES_TRAFFIC_RETENTION_DAYS) is used ONLY to interpret an empty
# result after the fact ("possible retention limit") — fixed 2026-08-17 rev 4.
# It used to skip the request entirely for old dates, which meant a wrong
# constant would silently truncate a backfill and leave gap rows that looked
# like real findings instead of an untested assumption. Every day is always
# attempted now; Amazon's own response is the only authority on whether a date
# is actually out of range.
#
# Marketplace scope: iterate ACTIVE_MARKETPLACES, not every configured
# marketplace — doddl sells in a subset of the 19 configured. Two entry
# points, not one, because of the throughput math even at that narrower scope:
# createReport is rate-limited to ~1/60s (source-verified, see the rate-limit
# table above), so a historical backfill is realistically hours, not minutes.
#   - run_sales_traffic_nightly()   — yesterday only, ACTIVE_MARKETPLACES.
#     Cheap, safe to run every night.
#   - run_sales_traffic_backfill()  — ONE marketplace (explicit argument, not
#     necessarily restricted to ACTIVE_MARKETPLACES — see its docstring),
#     a date range, resumable via amazon_asin_daily_status, meant to be run in
#     slices and survive being killed and restarted without re-fetching
#     completed days or endlessly retrying permanent failures.
# ---------------------------------------------------------------------------


def _daterange(start: date, end: date):
    """Inclusive day-by-day iterator."""
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def _resume_skip_info(marketplace_id: str, start: date, end: date) -> tuple[set, set]:
    """For run_sales_traffic_backfill's resume=True: which days to skip and why.

    Returns (ok_days, permanently_failed_days):
      ok_days                — status='ok', genuinely done, skip silently.
      permanently_failed_days — status in ('gap','parse_failed') AND
                                attempts >= _MAX_ATTEMPTS. Stop retrying these
                                automatically; caller logs them as needing
                                manual investigation rather than silently
                                skipping forever.
    A day with attempts < _MAX_ATTEMPTS and status != 'ok' is NOT in either
    set — it gets retried, which is the point of resume.
    """
    rows = select_rows(
        "amazon_asin_daily_status",
        select="report_date,status,attempts",
        filters={
            "marketplace_id": f"eq.{marketplace_id}",
            "report_date": [f"gte.{start.isoformat()}", f"lte.{end.isoformat()}"],
        },
    )
    ok_days: set = set()
    failed_days: set = set()
    for r in rows:
        d = datetime.strptime(r["report_date"], "%Y-%m-%d").date()
        if r.get("status") == "ok":
            ok_days.add(d)
        elif (r.get("attempts") or 0) >= _MAX_ATTEMPTS:
            failed_days.add(d)
    return ok_days, failed_days


def _next_attempt_count(marketplace_id: str, d: date) -> int:
    """Current amazon_asin_daily_status.attempts for this (marketplace, day),
    plus one. 0 (-> 1) if no row exists yet.
    """
    rows = select_rows(
        "amazon_asin_daily_status",
        select="attempts",
        filters={"marketplace_id": f"eq.{marketplace_id}", "report_date": f"eq.{d.isoformat()}"},
    )
    current = rows[0].get("attempts") if rows else 0
    return (current or 0) + 1


def _mark_fetched(marketplace_id: str, d: date) -> None:
    """status='ok'. Deliberately does not touch attempts — PostgREST's
    merge-duplicates upsert only updates columns present in the payload, so
    leaving attempts out preserves whatever it already was (irrelevant once
    status='ok', since _resume_skip_info only checks attempts for non-'ok'
    rows).
    """
    upsert_table(
        "amazon_asin_daily_status",
        [{"marketplace_id": marketplace_id, "report_date": d.isoformat(), "status": "ok", "reason": None}],
        on_conflict="marketplace_id,report_date",
    )


def _mark_gap(marketplace_id: str, d: date, reason: str) -> None:
    """status='gap' — report succeeded (or was rejected) but there is nothing
    to parse: pre-retention (no longer used to SKIP the call, only reachable
    now via an empty result near the cutoff — see run comment above), a 400,
    or exhausted rate-limit retries. Increments attempts.
    """
    attempts = _next_attempt_count(marketplace_id, d)
    upsert_table(
        "amazon_asin_daily_status",
        [{
            "marketplace_id": marketplace_id, "report_date": d.isoformat(),
            "status": "gap", "reason": reason, "attempts": attempts,
        }],
        on_conflict="marketplace_id,report_date",
    )


def _mark_parse_failed(marketplace_id: str, d: date, reason: str) -> None:
    """status='parse_failed' — Amazon returned DONE with a real response body,
    but _parse_sales_traffic_asin's field-name assumptions did not match it
    (missing key, wrong type, or every entry lacked childAsin). Distinct from
    'gap' on purpose: this is a US bug/wrong-assumption signal, not something
    Amazon reported as absent. The raw response is in api_raw (see
    _fetch_sales_traffic_day) so the transform can be re-run once the real
    field names are known, without re-fetching from Amazon. Increments
    attempts, same as 'gap'.
    """
    attempts = _next_attempt_count(marketplace_id, d)
    upsert_table(
        "amazon_asin_daily_status",
        [{
            "marketplace_id": marketplace_id, "report_date": d.isoformat(),
            "status": "parse_failed", "reason": reason, "attempts": attempts,
        }],
        on_conflict="marketplace_id,report_date",
    )


def _upsert_asin_daily(rows: list[dict]) -> None:
    if rows:
        upsert_table("amazon_asin_daily", rows, on_conflict="marketplace_id,asin,report_date")


def _parse_sales_traffic_asin(report: dict, marketplace_id: str, report_date: date) -> tuple[list[dict], int]:
    """Extract one amazon_asin_daily row per ASIN entry from a single-day
    GET_SALES_AND_TRAFFIC_REPORT response, assuming report["salesAndTrafficByAsin"]
    is already known to be a non-empty list (callers check that — see
    _fetch_sales_traffic_day).

    Under CHILD granularity every entry should carry a childAsin. An entry
    without one is skipped and counted, NEVER folded into a parentAsin-keyed
    row — that would put a parent-level total into the same table as child
    rows under the same-shaped key, and any SUM over asin would double-count.

    Returns (rows, skipped_no_child_asin_count). Callers aggregate the skip
    count across a whole run and report it at the end (a non-zero total means
    the CHILD-granularity assumption itself may be wrong — see run_sales_
    traffic_nightly / run_sales_traffic_backfill).

    Field names CONFIRMED 2026-08-17 against a real GET_SALES_AND_TRAFFIC_REPORT
    response (UK, single day) — see the module comment above for the evidence.
    The real response carries roughly twice as many fields as are captured
    here: every metric below has a B2B counterpart (captured, `_b2b` suffix),
    plus a full set of "...Percentage" share-of-marketplace-total fields
    (browserSessionPercentage, pageViewsPercentage, etc., and their B2B
    counterparts) which are deliberately NOT captured — they're derivable from
    the absolute figures already stored here, per Jon 2026-08-17.
    """
    entries = report.get("salesAndTrafficByAsin", []) if isinstance(report, dict) else []
    rows = []
    skipped = 0
    for entry in entries:
        child_asin = entry.get("childAsin")
        if not child_asin:
            logger.warning(
                "amazon_sp: sales_traffic marketplace=%s date=%s: entry with no childAsin, skipping: keys=%s",
                marketplace_id, report_date, list(entry.keys()) if isinstance(entry, dict) else type(entry).__name__,
            )
            skipped += 1
            continue
        sales = entry.get("salesByAsin", {}) or {}
        traffic = entry.get("trafficByAsin", {}) or {}
        revenue = sales.get("orderedProductSales")
        revenue = revenue if isinstance(revenue, dict) else {}
        revenue_b2b = sales.get("orderedProductSalesB2B")
        revenue_b2b = revenue_b2b if isinstance(revenue_b2b, dict) else {}
        shipped_sales = sales.get("shippedProductSales")
        shipped_sales = shipped_sales if isinstance(shipped_sales, dict) else {}
        rows.append({
            "marketplace_id": marketplace_id,
            "asin": child_asin,
            "report_date": report_date.isoformat(),
            "units_ordered": sales.get("unitsOrdered"),
            "ordered_revenue": revenue.get("amount"),
            "currency": revenue.get("currencyCode"),
            "total_order_items": sales.get("totalOrderItems"),
            "units_shipped": sales.get("unitsShipped"),
            "orders_shipped": sales.get("ordersShipped"),
            "shipped_product_sales": shipped_sales.get("amount"),
            "units_refunded": sales.get("unitsRefunded"),
            "refund_rate": sales.get("refundRate"),
            "sessions": traffic.get("sessions"),
            "page_views": traffic.get("pageViews"),
            "browser_sessions": traffic.get("browserSessions"),
            "mobile_app_sessions": traffic.get("mobileAppSessions"),
            "browser_page_views": traffic.get("browserPageViews"),
            "mobile_app_page_views": traffic.get("mobileAppPageViews"),
            "buy_box_pct": traffic.get("buyBoxPercentage"),
            "unit_session_pct": traffic.get("unitSessionPercentage"),
            # B2B counterparts
            "units_ordered_b2b": sales.get("unitsOrderedB2B"),
            "ordered_revenue_b2b": revenue_b2b.get("amount"),
            "total_order_items_b2b": sales.get("totalOrderItemsB2B"),
            "sessions_b2b": traffic.get("sessionsB2B"),
            "browser_sessions_b2b": traffic.get("browserSessionsB2B"),
            "mobile_app_sessions_b2b": traffic.get("mobileAppSessionsB2B"),
            "page_views_b2b": traffic.get("pageViewsB2B"),
            "buy_box_pct_b2b": traffic.get("buyBoxPercentageB2B"),
            "unit_session_pct_b2b": traffic.get("unitSessionPercentageB2B"),
        })
    return rows, skipped


_SALES_TRAFFIC_RATE_LIMIT_RETRIES = 5


def _fetch_sales_traffic_day(
    client: httpx.Client, base_url: str, rl: ReportsRateLimiters, token_holder: _TokenHolder,
    marketplace_id: str, marketplace_name: str, d: date, pull_id: str,
) -> tuple[int, int]:
    """Fetch, parse and store ONE day of GET_SALES_AND_TRAFFIC_REPORT for one
    marketplace. dataStartTime == dataEndTime == d, always. No
    _create_report_adaptive: there is nothing to halve, width is always 1.

    ALWAYS attempts the request — _SALES_TRAFFIC_RETENTION_DAYS never blocks a
    call, only interprets an empty result afterward (fixed 2026-08-17 rev 4).

    Returns (row_count, no_child_asin_skipped_count). row_count is 0 on any
    gap/parse failure. Writes to amazon_asin_daily / amazon_asin_daily_status,
    NOT api_clean; writes the FULL response to api_raw regardless of whether
    parsing succeeds, so a wrong field-name assumption can be re-transformed
    later without re-fetching. Raises AccountSkipped (propagated from
    token_holder.ensure_fresh) if the account's token cannot be refreshed —
    callers must catch this.
    """
    cutoff = date.today() - timedelta(days=_SALES_TRAFFIC_RETENTION_DAYS)
    near_or_past_cutoff = d < cutoff   # interpretation only — never gates the call, see module comment above

    day_start_str = d.strftime("%Y-%m-%dT00:00:00Z")
    day_end_str = d.strftime("%Y-%m-%dT23:59:59Z")

    parsed = None
    status: dict = {}
    for attempt in range(1, _SALES_TRAFFIC_RATE_LIMIT_RETRIES + 1):
        token_holder.ensure_fresh(client)   # may raise AccountSkipped — propagates to caller
        try:
            parsed, _columns, status = run_report_sync(
                client, base_url, rl,
                report_type="GET_SALES_AND_TRAFFIC_REPORT",
                marketplace_ids=[marketplace_id],
                data_start_time=day_start_str, data_end_time=day_end_str,
                report_options={"dateGranularity": "DAY", "asinGranularity": "CHILD"},
                report_format="json",
            )
            break
        except httpx.HTTPStatusError as exc:
            code = exc.response.status_code if exc.response is not None else None
            if code == 429:
                retry_after = 60.0
                if exc.response is not None:
                    try:
                        retry_after = float(exc.response.headers.get("Retry-After", 60))
                    except (TypeError, ValueError):
                        pass
                logger.warning(
                    "amazon_sp: sales_traffic marketplace=%s (%s) date=%s: 429, backing off %.0fs (attempt %d/%d)",
                    marketplace_id, marketplace_name, d, retry_after, attempt, _SALES_TRAFFIC_RATE_LIMIT_RETRIES,
                )
                time.sleep(retry_after)
                continue
            if code == 400:
                body_text = exc.response.text if exc.response is not None else "?"
                logger.error(
                    "amazon_sp: sales_traffic marketplace=%s (%s) date=%s: 400 body=%s",
                    marketplace_id, marketplace_name, d, body_text,
                )
                _mark_gap(marketplace_id, d, reason="http_400")
                return 0, 0
            raise
    else:
        logger.error(
            "amazon_sp: sales_traffic marketplace=%s (%s) date=%s: giving up after %d rate-limit retries",
            marketplace_id, marketplace_name, d, _SALES_TRAFFIC_RATE_LIMIT_RETRIES,
        )
        _mark_gap(marketplace_id, d, reason="rate_limited_exhausted")
        return 0, 0

    # Full response stored regardless of what happens next — fix for rev 4:
    # previously only {"processingStatus", "date"} was stored, discarding the
    # actual body, so a wrong field-name assumption meant every affected day
    # had to be re-fetched at 1/60s just to re-attempt the transform.
    write_raw(
        source=SOURCE, pull_id=pull_id,
        endpoint=f"/reports/2021-06-30/reports/GET_SALES_AND_TRAFFIC_REPORT/{marketplace_id}",
        response_body={"processingStatus": status.get("processingStatus"), "date": str(d), "report": parsed},
        response_status=200, connector_version=VERSION,
    )

    if not isinstance(parsed, dict) or "salesAndTrafficByAsin" not in parsed:
        top_level = list(parsed.keys()) if isinstance(parsed, dict) else f"<{type(parsed).__name__}>"
        logger.error(
            "amazon_sp: sales_traffic marketplace=%s (%s) date=%s: response missing/malformed "
            "salesAndTrafficByAsin — top-level keys=%s — the field-name assumption may be wrong "
            "(full response is in api_raw for this pull_id)",
            marketplace_id, marketplace_name, d, top_level,
        )
        _mark_parse_failed(marketplace_id, d, reason="missing_salesAndTrafficByAsin_key")
        return 0, 0

    by_asin_raw = parsed["salesAndTrafficByAsin"]
    if not isinstance(by_asin_raw, list):
        logger.error(
            "amazon_sp: sales_traffic marketplace=%s (%s) date=%s: salesAndTrafficByAsin is not a list (type=%s)",
            marketplace_id, marketplace_name, d, type(by_asin_raw).__name__,
        )
        _mark_parse_failed(marketplace_id, d, reason="salesAndTrafficByAsin_not_list")
        return 0, 0

    if not by_asin_raw:
        # Genuinely empty list -> a real "no ASIN entries" result, not a parse
        # failure. status='ok' either way; only the log line differs.
        if near_or_past_cutoff:
            logger.warning(
                "amazon_sp: sales_traffic marketplace=%s (%s) date=%s: empty, and the date is at/before "
                "the assumed (UNVERIFIED) retention cutoff %s — possible retention limit, not necessarily "
                "a genuine zero",
                marketplace_id, marketplace_name, d, cutoff,
            )
        else:
            logger.info(
                "amazon_sp: sales_traffic marketplace=%s (%s) date=%s: empty (no sales that day)",
                marketplace_id, marketplace_name, d,
            )
        _mark_fetched(marketplace_id, d)
        return 0, 0

    rows, skipped = _parse_sales_traffic_asin(parsed, marketplace_id, d)
    if not rows:
        # Entries existed but none yielded a row (all lacked childAsin) — this
        # is a parse failure, not a genuine empty day. Distinguishing this from
        # the empty-list case above is the whole point of fix 3: a wrong
        # field-name assumption must never look like success.
        logger.error(
            "amazon_sp: sales_traffic marketplace=%s (%s) date=%s: %d entries present but 0 rows "
            "extracted (all lacked childAsin) — treating as parse failure, not a genuine empty day",
            marketplace_id, marketplace_name, d, len(by_asin_raw),
        )
        _mark_parse_failed(marketplace_id, d, reason="zero_rows_extracted_all_missing_child_asin")
        return 0, skipped

    _upsert_asin_daily(rows)
    _mark_fetched(marketplace_id, d)
    return len(rows), skipped


def run_sales_traffic_nightly() -> None:
    """Pull yesterday only, for every marketplace in ACTIVE_MARKETPLACES.
    Cheap enough to run every night — this is NOT a backfill. Use
    run_sales_traffic_backfill for historical ranges.

    Refuses to run if ACTIVE_MARKETPLACES is empty (see its definition near
    the top of the Reports API section) rather than silently doing nothing or
    falling back to all 19 configured marketplaces.

    Not registered in scheduler.py. Call directly, e.g. from a one-off script
    or the dry-run CLI at the bottom of this file.
    """
    if not ACTIVE_MARKETPLACES:
        logger.error(
            "amazon_sp: sales_traffic_nightly — ACTIVE_MARKETPLACES is empty, refusing to run. "
            "Fill in the marketplace_id values doddl actually sells in near the top of the "
            "Reports API section before using this.",
        )
        return

    pull_id = str(uuid.uuid4())
    yesterday = date.today() - timedelta(days=1)
    logger.info(
        "amazon_sp.run_sales_traffic_nightly start date=%s marketplaces=%d pull_id=%s",
        yesterday, len(ACTIVE_MARKETPLACES), pull_id,
    )

    skip_lock = threading.Lock()
    skip_total = [0]   # mutable cell, closed over by _one_marketplace across threads

    def _one_marketplace(client, base_url, rl, marketplace_id, marketplace_name, account_name, token_holder) -> int:
        row_count, skipped = _fetch_sales_traffic_day(
            client, base_url, rl, token_holder, marketplace_id, marketplace_name, yesterday, pull_id,
        )
        if skipped:
            with skip_lock:
                skip_total[0] += skipped
        return row_count

    total = _run_reports_for_all_accounts(
        pull_id, "sales_traffic_nightly", _one_marketplace, marketplace_filter=ACTIVE_MARKETPLACES,
    )
    logger.info("amazon_sp.run_sales_traffic_nightly complete pull_id=%s total_rows=%d", pull_id, total)
    if skip_total[0]:
        logger.warning(
            "amazon_sp: sales_traffic_nightly: %d entries skipped for missing childAsin across this run "
            "— the CHILD granularity assumption may be wrong, investigate",
            skip_total[0],
        )


def run_sales_traffic_backfill(
    account_name: str, marketplace_id: str, start_date: date, end_date: date, *, resume: bool = True,
) -> None:
    """Backfill GET_SALES_AND_TRAFFIC_REPORT for ONE marketplace over a date
    range, one report per calendar day. Deliberately separate from the nightly
    job — see the module comment above for the throughput math.

    marketplace_id is NOT restricted to ACTIVE_MARKETPLACES — this is an
    explicit, deliberate single-marketplace call, so a marketplace outside
    that list is allowed (e.g. testing a newly-launched market) but logged as
    a warning, since it is usually a mistake given the 1/60s cost.

    resume=True (default) skips days already marked 'ok', AND days that have
    hit _MAX_ATTEMPTS without succeeding (logged separately as needing manual
    investigation — see _resume_skip_info) — so a killed-and-restarted backfill
    does not re-fetch completed days, and a permanently-broken day does not
    get retried forever at 1/60s. Run in slices, e.g.:
        run_sales_traffic_backfill("EU", "A1F83G8C2ARO7P", date(2025,1,1), date(2025,3,31))

    Requires lib/migrations/14-amazon-asin-daily.sql to have been applied first
    (amazon_asin_daily / amazon_asin_daily_status must exist) — not done this
    session, see reports/amazon-reports-api.md.

    Not registered in scheduler.py.
    """
    if marketplace_id not in ACTIVE_MARKETPLACES:
        logger.warning(
            "amazon_sp: sales_traffic_backfill marketplace=%s is not in ACTIVE_MARKETPLACES — "
            "proceeding anyway since this is an explicit single-marketplace call, but confirm "
            "this marketplace actually has sales before spending 1/60s-rate-limited quota on it",
            marketplace_id,
        )

    pull_id = str(uuid.uuid4())
    account_cfg = ACCOUNTS[account_name]
    marketplace_name = next(
        (name for mid, name, _sid in account_cfg["marketplaces"] if mid == marketplace_id),
        marketplace_id,
    )
    logger.info(
        "amazon_sp.run_sales_traffic_backfill start account=%s marketplace=%s (%s) %s to %s resume=%s pull_id=%s",
        account_name, marketplace_id, marketplace_name, start_date, end_date, resume, pull_id,
    )

    days = list(_daterange(start_date, end_date))
    if resume:
        ok_days, failed_days = _resume_skip_info(marketplace_id, start_date, end_date)
        before = len(days)
        days = [d for d in days if d not in ok_days and d not in failed_days]
        logger.info(
            "amazon_sp: sales_traffic_backfill marketplace=%s %d day(s) to fetch (%d already ok, "
            "%d permanently failed after %d+ attempts)",
            marketplace_id, len(days), len(ok_days), len(failed_days), _MAX_ATTEMPTS,
        )
        if failed_days:
            logger.warning(
                "amazon_sp: sales_traffic_backfill marketplace=%s: %d day(s) need manual investigation "
                "(hit %d attempts without succeeding): %s",
                marketplace_id, len(failed_days), _MAX_ATTEMPTS, sorted(failed_days),
            )

    creds = get_secrets(["amazon-sp-api-client-id", "amazon-sp-api-client-secret"])
    client_id, client_secret = creds["amazon-sp-api-client-id"], creds["amazon-sp-api-client-secret"]
    token_body = _load_account_token_with_expiry(account_name, account_cfg, client_id, client_secret)
    if token_body is None:
        logger.error(
            "amazon_sp: sales_traffic_backfill account=%s — no token obtainable, aborting", account_name,
        )
        return

    base_url = account_cfg["endpoint"]
    headers = {"x-amz-access-token": token_body["access_token"], "Accept": "application/json"}
    rl = ReportsRateLimiters()
    token_holder = _TokenHolder(account_name, account_cfg, client_id, client_secret, token_body)

    total = 0
    skip_total = 0
    with httpx.Client(headers=headers, timeout=60.0) as client:
        for d in days:
            try:
                row_count, skipped = _fetch_sales_traffic_day(
                    client, base_url, rl, token_holder, marketplace_id, marketplace_name, d, pull_id,
                )
                total += row_count
                skip_total += skipped
            except AccountSkipped as exc:
                logger.error(
                    "amazon_sp: sales_traffic_backfill account=%s — %s — aborting backfill",
                    account_name, exc,
                )
                break

    logger.info(
        "amazon_sp.run_sales_traffic_backfill complete account=%s marketplace=%s pull_id=%s total_rows=%d",
        account_name, marketplace_id, pull_id, total,
    )
    if skip_total:
        logger.warning(
            "amazon_sp: sales_traffic_backfill marketplace=%s: %d entries skipped for missing childAsin "
            "across this run — the CHILD granularity assumption may be wrong, investigate",
            marketplace_id, skip_total,
        )


# ---------------------------------------------------------------------------
# Dry-run mode — Step 5. Creates, polls, downloads and parses ONE real report
# against live Amazon credentials, prints a preview, and writes nothing to
# api_raw or api_clean. Needs Key Vault access for the Amazon LWA secrets,
# which is documented as broken on this machine (see
# reports/scheduler-deploy-prep.md, "Known local-tooling issue — WON'T FIX").
# This code has NOT been executed against live Amazon credentials — see
# reports/amazon-reports-api.md for exactly what is and isn't tested.
# ---------------------------------------------------------------------------

def dry_run_report(
    account_name: str,
    marketplace_id: str,
    report_type: str,
    *,
    data_start_time: Optional[str] = None,
    data_end_time: Optional[str] = None,
    report_options: Optional[dict] = None,
    report_format: str = "tsv",
) -> None:
    """Request/poll/download/parse a single report and print a preview. No DB writes."""
    account_cfg = ACCOUNTS[account_name]
    creds = get_secrets(["amazon-sp-api-client-id", "amazon-sp-api-client-secret"])
    token = _load_account_token(account_name, account_cfg, creds["amazon-sp-api-client-id"], creds["amazon-sp-api-client-secret"])
    if token is None:
        print(f"Could not obtain an access token for account {account_name} "
              f"— check Key Vault secret {account_cfg['refresh_token_secret']}")
        return

    base_url = account_cfg["endpoint"]
    headers = {"x-amz-access-token": token, "Accept": "application/json"}
    rl = ReportsRateLimiters()
    with httpx.Client(headers=headers, timeout=60.0) as client:
        parsed, columns, status = run_report_sync(
            client, base_url, rl, report_type, [marketplace_id],
            data_start_time=data_start_time, data_end_time=data_end_time,
            report_options=report_options, report_format=report_format,
        )

    print(f"\n=== {report_type} — account={account_name} marketplace={marketplace_id} ===")
    print(f"processingStatus: {status.get('processingStatus')}")
    if status.get("processingStatus") != "DONE":
        print(f"Full status body: {json.dumps(status, indent=2)}")
        return

    if report_format == "json":
        if isinstance(parsed, dict):
            print("Top-level keys:", list(parsed.keys()))
            sample = parsed.get("salesAndTrafficByAsin", [])[:5]
        else:
            print("Unexpected top-level type:", type(parsed))
            sample = []
        print(f"\nFirst {len(sample)} salesAndTrafficByAsin entries:")
        for entry in sample:
            print(json.dumps(entry, indent=2))
    else:
        print(f"Columns ({len(columns)}): {columns}")
        print(f"\nFirst {min(5, len(parsed))} of {len(parsed)} rows:")
        for row in parsed[:5]:
            print(json.dumps(row, indent=2))


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Dry-run one SP-API report: create, poll, download, parse, print. No DB writes.",
    )
    parser.add_argument("report", choices=["listings", "order_items", "sales_traffic"])
    parser.add_argument("--account", default="EU", choices=list(ACCOUNTS.keys()))
    parser.add_argument("--marketplace", default=None, help="marketplace_id; defaults to the account's first marketplace")
    parser.add_argument("--start", default=None, help="YYYY-MM-DD (order_items / sales_traffic only)")
    parser.add_argument("--end", default=None, help="YYYY-MM-DD (order_items only; sales_traffic always uses one day, --start)")
    args = parser.parse_args()

    _account_cfg = ACCOUNTS[args.account]
    _marketplace_id = args.marketplace or _account_cfg["marketplaces"][0][0]

    if args.report == "listings":
        dry_run_report(args.account, _marketplace_id, "GET_MERCHANT_LISTINGS_ALL_DATA")

    elif args.report == "order_items":
        _start = (
            datetime.strptime(args.start, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            if args.start else datetime.now(timezone.utc) - timedelta(days=1)
        )
        _end = (
            datetime.strptime(args.end, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            if args.end else datetime.now(timezone.utc)
        )
        dry_run_report(
            args.account, _marketplace_id, "GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL",
            data_start_time=_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            data_end_time=_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        )

    elif args.report == "sales_traffic":
        _day = (
            datetime.strptime(args.start, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            if args.start else datetime.now(timezone.utc) - timedelta(days=3)
        )
        dry_run_report(
            args.account, _marketplace_id, "GET_SALES_AND_TRAFFIC_REPORT",
            data_start_time=_day.strftime("%Y-%m-%dT00:00:00Z"),
            data_end_time=_day.strftime("%Y-%m-%dT23:59:59Z"),
            report_options={"dateGranularity": "DAY", "asinGranularity": "CHILD"},   # rev 4: reverted from rev 3's SKU
            report_format="json",
        )
