"""Amazon SP-API connector — orders, FBA inventory, and listings across all doddl marketplaces.

Covers every marketplace visible in the doddl Amazon Seller Central account,
grouped by seller account (each has its own LWA refresh token):

  EU account  — sellingpartnerapi-eu.amazon.com  seller A95LVHANDHOSF
    UK  A1F83G8C2ARO7P      DE  A1PA6795UKMFR9      FR  A13V1IB3VIYZZH
    IT  APJ6JRA9NG5V4       ES  A1RKKUPIHCS9HS      NL  A1805IZSGTT6HS
    BE  AMEN7PMS3EDWL       PL  A1C3SOZRARQ6R3      SE  A2NODRKZP88ZB9
    TR  A33AVAJ2PDY3EV      IE  A28R8C7NBKEWEA
    AE  A2VIGQ35RCS4UG      SA  A17E79C6D8DWNP

  NA account  — sellingpartnerapi-na.amazon.com   seller A2JUH74WYQ3T7U
    US  ATVPDKIKX0DER

  NA-2 account — sellingpartnerapi-na.amazon.com  seller A2J3OJ1QMMOAR5
    CA  A2EUQ1WTGCTBG2      MX  A1AM78C64UM0Y8

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
  amazon-sp-api-refresh-token-na   — NA account (US)
  amazon-sp-api-refresh-token-na-2 — NA-2 account (CA, MX)
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

    # ── North America — primary account (US only) ──────────────────────────
    "NA": {
        "endpoint": "https://sellingpartnerapi-na.amazon.com",
        "refresh_token_secret": "amazon-sp-api-refresh-token-na",
        "marketplaces": [
            ("ATVPDKIKX0DER", "US", "A2JUH74WYQ3T7U"),
        ],
    },

    # ── North America — secondary account (CA + MX) ────────────────────────
    # This appears as a separate seller group in Seller Central.
    # Set amazon-sp-api-refresh-token-na-2 in Key Vault to activate.
    "NA-2": {
        "endpoint": "https://sellingpartnerapi-na.amazon.com",
        "refresh_token_secret": "amazon-sp-api-refresh-token-na-2",
        "marketplaces": [
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
    try:
        for page in _paginate_listings(client, base_url, seller_id, marketplace_id, rl):
            items = page.get("items", [])
            write_raw(
                source=SOURCE, pull_id=pull_id,
                endpoint=f"/listings/2021-08-01/items/{marketplace_id}",
                response_body={**page, "marketplace_id": marketplace_id},
                response_status=200, connector_version=VERSION,
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
            "amazon_sp: listings error marketplace=%s HTTP %s",
            marketplace_id, exc.response.status_code,
        )
        return 0

    if count:
        logger.info(
            "amazon_sp: listings  marketplace=%s (%s) count=%d",
            marketplace_id, marketplace_name, count,
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
