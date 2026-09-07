"""Amazon Advertising API connector — Sponsored Products performance sync.

Pulls campaign, ad group, keyword metadata and daily performance reports for
the marketplaces in ACTIVE_AD_COUNTRIES (derived from ACTIVE_MARKETPLACES in
amazon_sp_api.py — the single LWA token returns profiles for more marketplaces
than that, and the extras are dropped in _fetch_profiles). Uses LWA OAuth2 —
separate credentials from SP-API.

Regional endpoints:
  EU  — advertising-api-eu.amazon.com  (GB, DE, FR, IT, ES, NL, BE, PL, SE, TR, IE, AE, SA)
  NA  — advertising-api.amazon.com     (US, CA, MX)
  FE  — advertising-api-fe.amazon.com  (JP, AU, SG)

Auth:
  The connector exchanges the refresh token against https://api.amazon.com/auth/o2/token
  (same LWA endpoint as SP-API) and then calls each regional Advertising API endpoint.
  Access to a region is determined by which marketplaces the Advertising Console app
  was authorised for.

Secrets required:
  amazon-ads-client-id       — LWA OAuth client ID (separate app from SP-API)
  amazon-ads-client-secret   — LWA OAuth client secret
  amazon-ads-refresh-token   — LWA refresh token (authorised for target regions)
  amazon-ads-profile-ids     — (Optional) Comma-separated profile IDs to restrict sync
                               further. If absent or empty, every profile in
                               ACTIVE_AD_COUNTRIES is synced.

Performance data pulled:
  spCampaigns  — daily campaign-level impressions, clicks, cost, purchases, sales
  spAdGroups   — daily ad group-level performance
  spKeywords   — daily keyword-level performance
  spSearchTerm — daily search term report (what shoppers typed)

Metadata pulled:
  SP campaigns, ad groups, keywords (state + budget attributes)

Report API:
  Uses the v3 Reporting API (async: submit → poll → download gzip-JSON from S3).
  Reports are polled for up to 20 minutes per report. A report that times out or
  fails is logged and skipped, but a run in which EVERY report was skipped raises
  rather than reporting success — see run().

Incremental interval: 60 minutes (last 2 days performance, fresh metadata).
Backfill: called by run_backfill.py with 30-day chunks.
"""

import gzip
import io
import json
import logging
import time
import uuid
from datetime import date, timedelta
from typing import Optional

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception,
)

from connectors.lib.secrets import get_secret, get_secrets
from connectors.lib.db import write_raw, upsert_clean_batch
from connectors.scheduler.jobs.amazon_sp_api import (
    ACCOUNTS as _SP_ACCOUNTS,
    ACTIVE_MARKETPLACES as _SP_ACTIVE_MARKETPLACES,
)

logger = logging.getLogger(__name__)

VERSION = "1.0.0"
SOURCE = "amazon_ads"
LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token"

# Regional endpoints — each may require separate refresh token authorisation
REGION_ENDPOINTS: dict[str, str] = {
    "EU": "https://advertising-api-eu.amazon.com",
    "NA": "https://advertising-api.amazon.com",
    "FE": "https://advertising-api-fe.amazon.com",
}

_COUNTRY_TO_REGION: dict[str, str] = {
    # Europe + Middle East
    "GB": "EU", "DE": "EU", "FR": "EU", "IT": "EU", "ES": "EU",
    "NL": "EU", "BE": "EU", "PL": "EU", "SE": "EU", "TR": "EU",
    "IE": "EU", "AE": "EU", "SA": "EU",
    # North America
    "US": "NA", "CA": "NA", "MX": "NA",
    # Far East / Asia-Pacific
    "JP": "FE", "AU": "FE", "SG": "FE",
}

# Marketplace scope — kept in lockstep with ACTIVE_MARKETPLACES in
# amazon_sp_api.py so ad spend is only collected for marketplaces the
# sales/traffic reports also cover. The single LWA token returns profiles for
# every marketplace doddl advertises in (MX, TR, AE, SA, JP included); those
# are dropped at the profile-iteration point in _fetch_profiles rather than by
# pinning profile IDs, so re-enabling a marketplace upstream needs no change
# here.
#
# COUNTRY CODES: BOTH SIDES SAY "UK", AND THIS USED TO TRANSLATE ONE OF THEM.
# The comment here previously claimed the Advertising API reports ISO codes
# ("GB") while the SP-API ACCOUNTS table uses Amazon labels ("UK"), and mapped
# UK -> GB accordingly. The first half is false. /v2/profiles returns
# countryCode "UK" for both UK profiles (verified live 2026-09-07 across all 28
# profiles: AE AU BE CA DE ES FR IE IT JP MX NL PL SA SE SG TR UK US — no "GB"
# anywhere). So ACTIVE_AD_COUNTRIES held "GB", the profiles said "UK", the
# membership test failed, and BOTH UK profiles were dropped before
# amazon-ads-profile-ids was ever consulted — including 1842164754186650, which
# carries 388 campaigns and GBP 3,981 of spend in the last 30 days.
#
# It failed silently: the run logs "scoped 28 -> 13 profiles" and completes
# normally, so the biggest EU advertiser simply never appears.
#
# ACTIVE_AD_COUNTRIES keeps the SP-API-derived spelling (GB, because that is
# what the marketplace table yields after this map). Profiles are normalised TO
# that spelling at comparison time by _ads_country(), so the two vocabularies
# meet in exactly one place instead of being assumed identical.
_SP_LABEL_TO_ISO_COUNTRY: dict[str, str] = {"UK": "GB"}

# Advertising API countryCode -> the spelling ACTIVE_AD_COUNTRIES uses.
# Only codes that genuinely differ belong here; everything else passes through.
_ADS_COUNTRY_TO_SCOPE: dict[str, str] = {"UK": "GB"}


def _ads_country(country_code) -> str:
    """Normalise a /v2/profiles countryCode to the ACTIVE_AD_COUNTRIES spelling."""
    c = str(country_code or "").strip().upper()
    return _ADS_COUNTRY_TO_SCOPE.get(c, c)

ACTIVE_AD_COUNTRIES: set[str] = {
    _SP_LABEL_TO_ISO_COUNTRY.get(country, country)
    for account_cfg in _SP_ACCOUNTS.values()
    for (marketplace_id, country, _seller_id) in account_cfg["marketplaces"]
    if marketplace_id in _SP_ACTIVE_MARKETPLACES
}

# ---------------------------------------------------------------------------
# Report definitions
# ---------------------------------------------------------------------------

_REPORTS = [
    {
        "report_type_id": "spCampaigns",
        "group_by": ["campaign"],
        "columns": [
            "campaignId", "campaignName", "campaignStatus", "portfolioId",
            "impressions", "clicks", "cost",
            "purchases7d", "purchasesSameSku7d", "sales7d", "salesOtherSku7d",
            "unitsSoldClicks7d", "clickThroughRate", "costPerClick", "roasClicks7d",
            "date",
        ],
        "record_type": "sp_campaign_performance",
        "id_fields": ["campaignId", "date"],
    },
    {
        "report_type_id": "spAdGroups",
        "group_by": ["adGroup"],
        "columns": [
            "adGroupId", "adGroupName", "campaignId",
            "impressions", "clicks", "cost",
            "purchases7d", "sales7d",
            "clickThroughRate", "costPerClick",
            "date",
        ],
        "record_type": "sp_adgroup_performance",
        "id_fields": ["adGroupId", "date"],
    },
    {
        "report_type_id": "spKeywords",
        "group_by": ["keyword"],
        "columns": [
            "keywordId", "keyword", "matchType", "adGroupId", "campaignId",
            "impressions", "clicks", "cost",
            "purchases7d", "sales7d",
            "clickThroughRate", "costPerClick",
            "date",
        ],
        "record_type": "sp_keyword_performance",
        "id_fields": ["keywordId", "date"],
    },
    {
        "report_type_id": "spSearchTerm",
        "group_by": ["searchTerm"],
        "columns": [
            "searchTerm", "matchType", "keywordId", "adGroupId", "campaignId",
            "impressions", "clicks", "cost",
            "purchases7d", "sales7d",
            "clickThroughRate", "costPerClick",
            "date",
        ],
        "record_type": "sp_searchterm_performance",
        "id_fields": ["searchTerm", "keywordId", "date"],
    },
]

# Report polling configuration
#
# 300s WAS TOO SHORT AND FAILED QUIETLY.
# A v3 report is generated asynchronously and routinely takes longer than five
# minutes; scheduler.py budgets 45-80 minutes for this job and up to ~2h
# (misfire_grace_time=7200) precisely because of report generation latency. With
# a 300s deadline _poll_report_url raises TimeoutError, _sync_report catches it,
# logs a warning and RETURNS — so a run that never obtained a single report
# still finished and reported success. 20 minutes per report keeps the whole job
# inside its scheduled budget (4 reports x 9 profiles are sequential, but a
# report that needs more than 20 minutes is genuinely stuck, not slow) while no
# longer discarding reports that were merely still generating.
REPORT_POLL_TIMEOUT_S = 1200  # 20 minutes per report
REPORT_POLL_INTERVAL_S = 20   # check every 20 seconds

# ─────────────────────────────────────────────────────────────────────────────
# THE REQUESTED WINDOW, DEFINED ONCE
# ─────────────────────────────────────────────────────────────────────────────
# Amazon finalises a day's advertising figures roughly a day late, so the
# nightly run asks for a window that ENDS at D-2 rather than D-1. Asking for
# D-1 returns a report that completes normally and carries a partial or empty
# day — which is worse than not asking, because a partial day upserts over
# nothing and then looks like a real low-spend day until the next run corrects
# it. D-2 is the most recent day Amazon can be relied on to have closed.
#
# Two days wide, so the run always re-requests the day before the one it
# trusts. upsert_clean_batch is keyed on source_record_id, so re-requesting a
# day it already has corrects that day rather than duplicating it.
#
# These are named constants rather than inline arithmetic because run() and
# run_backfill() must not drift apart on what "recent" means, and because the
# only way to see this decision was previously to read two subtractions.
NIGHTLY_LAG_DAYS = 2      # end the window at D-2
NIGHTLY_WINDOW_DAYS = 2   # ...and start it one day before that


def nightly_window(today: Optional[date] = None) -> tuple:
    """The (start, end) dates the nightly run requests, as ISO strings.

    Exposed and pure so the choice is testable without credentials — the whole
    job needs Key Vault and a live Amazon token, this does not.
    """
    today = today or date.today()
    end = today - timedelta(days=NIGHTLY_LAG_DAYS)
    start = end - timedelta(days=NIGHTLY_WINDOW_DAYS - 1)
    return start.isoformat(), end.isoformat()

# HTTP 425 "Too Early" — the Reporting API returns this while a report is still
# being generated. It is a not-ready-yet signal, not a failure. Two things follow
# from that: tenacity must NOT burn retry attempts on it (only time resolves it),
# and _poll_report_url must treat it as another pending tick rather than letting
# it escape into _sync_report's catch-all, which would log an error and silently
# skip the report — leaving metadata present and performance rows absent.
REPORT_NOT_READY_STATUS = 425


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

def _headers(access_token: str, client_id: str, profile_id: Optional[str] = None) -> dict:
    h = {
        "Authorization": f"Bearer {access_token}",
        "Amazon-Advertising-API-ClientId": client_id,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if profile_id:
        h["Amazon-Advertising-API-Scope"] = str(profile_id)
    return h


def _is_retryable_http_error(exc: BaseException) -> bool:
    """Retry transport-level HTTP errors, but never 425 (report not ready yet).

    A 425 is surfaced to the caller on the first attempt so the poll loop can
    keep waiting on its own schedule, instead of spending three tenacity
    attempts plus backoff on a condition only elapsed time resolves.
    """
    if not isinstance(exc, httpx.HTTPStatusError):
        return False
    return exc.response.status_code != REPORT_NOT_READY_STATUS


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception(_is_retryable_http_error),
    reraise=True,
)
def _get(client: httpx.Client, url: str, params: Optional[dict] = None) -> object:
    resp = client.get(url, params=params or {})
    resp.raise_for_status()
    return resp.json()


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception(_is_retryable_http_error),
    reraise=True,
)
def _post(client: httpx.Client, url: str, payload: dict) -> dict:
    resp = client.post(url, json=payload)
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Profile discovery
# ---------------------------------------------------------------------------

def _fetch_profiles(
    access_token: str,
    client_id: str,
    filter_ids: Optional[set] = None,
) -> list:
    """Fetch advertiser profiles from all regional endpoints.

    Profiles that the LWA token has no access to are skipped gracefully.
    Profiles outside ACTIVE_AD_COUNTRIES are always dropped (marketplace scope,
    matched to the sales/traffic reports). If filter_ids is also provided, it
    narrows the result further to those profile IDs.
    """
    all_profiles: list = []

    for region, base_url in REGION_ENDPOINTS.items():
        hdrs = _headers(access_token, client_id)
        try:
            with httpx.Client(headers=hdrs, timeout=20.0) as client:
                result = _get(client, f"{base_url}/v2/profiles")

            profiles = result if isinstance(result, list) else []
            for p in profiles:
                p["_region"] = region
                p["_base_url"] = base_url
            all_profiles.extend(profiles)
            logger.info("amazon_ads: %d profiles from %s region", len(profiles), region)

        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in (401, 403):
                logger.info("amazon_ads: no access to %s region (credentials not authorised)", region)
            else:
                logger.warning("amazon_ads: %s region HTTP %s — skipping", region, exc.response.status_code)
        except Exception as exc:
            logger.warning("amazon_ads: %s region unreachable (%s) — skipping", region, exc)

    # Marketplace scope: keep only profiles in ACTIVE_AD_COUNTRIES.
    before = len(all_profiles)
    all_profiles = [
        p for p in all_profiles
        if _ads_country(p.get("countryCode")) in ACTIVE_AD_COUNTRIES
    ]
    dropped = before - len(all_profiles)
    if dropped:
        logger.info(
            "amazon_ads: scoped %d -> %d profiles to active marketplaces (%s); dropped %d",
            before, len(all_profiles), ", ".join(sorted(ACTIVE_AD_COUNTRIES)), dropped,
        )

    if filter_ids:
        before = len(all_profiles)
        all_profiles = [p for p in all_profiles if str(p.get("profileId", "")) in filter_ids]
        logger.info("amazon_ads: filtered %d -> %d profiles by amazon-ads-profile-ids", before, len(all_profiles))

    return all_profiles


def _load_filter_ids() -> Optional[set]:
    """Load optional profile ID filter from Key Vault. Returns None if not configured."""
    try:
        raw = get_secret("amazon-ads-profile-ids")
        ids = {p.strip() for p in raw.split(",") if p.strip()}
        if ids:
            logger.info("amazon_ads: restricting to %d configured profile IDs", len(ids))
            return ids
    except Exception:
        logger.info("amazon_ads: amazon-ads-profile-ids not configured; syncing all profiles")
    return None


# ---------------------------------------------------------------------------
# Metadata sync (v2 Sponsored Products API)
# ---------------------------------------------------------------------------

def _sync_metadata_entity(
    base_url: str,
    access_token: str,
    client_id: str,
    profile_id: str,
    pull_id: str,
    v2_path: str,
    record_type: str,
    list_key: str,
    id_key: str,
) -> None:
    """Generic metadata fetch for campaigns, ad groups, or keywords via v2 API."""
    hdrs = _headers(access_token, client_id, profile_id)
    try:
        with httpx.Client(headers=hdrs, timeout=30.0) as client:
            result = _get(client, f"{base_url}{v2_path}", {"stateFilter": "enabled,paused,archived"})
    except httpx.HTTPStatusError as exc:
        logger.warning("amazon_ads: %s metadata profile=%s HTTP %s — skipping",
                       record_type, profile_id, exc.response.status_code)
        return
    except Exception as exc:
        logger.warning("amazon_ads: %s metadata profile=%s error %s — skipping",
                       record_type, profile_id, exc)
        return

    entities = result if isinstance(result, list) else result.get(list_key, [])

    write_raw(
        source=SOURCE, pull_id=pull_id,
        endpoint=f"{v2_path}/{profile_id}",
        response_body={"profileId": profile_id, list_key: entities, "count": len(entities)},
        response_status=200, connector_version=VERSION,
    )

    batch = [
        {
            "source": SOURCE,
            "record_type": record_type,
            "source_record_id": f"{profile_id}_{entity[id_key]}",
            "data": {**entity, "profileId": profile_id},
            "last_pull_id": pull_id,
        }
        for entity in entities
    ]
    upsert_clean_batch(batch)
    logger.info("amazon_ads: %d %s metadata synced profile=%s", len(batch), record_type, profile_id)


def _sync_metadata(
    base_url: str, access_token: str, client_id: str,
    profile_id: str, pull_id: str,
) -> None:
    """Sync campaign, ad group, and keyword metadata for one profile."""
    _sync_metadata_entity(
        base_url, access_token, client_id, profile_id, pull_id,
        v2_path="/v2/sp/campaigns",
        record_type="sp_campaign_metadata",
        list_key="campaigns",
        id_key="campaignId",
    )
    _sync_metadata_entity(
        base_url, access_token, client_id, profile_id, pull_id,
        v2_path="/v2/sp/adGroups",
        record_type="sp_adgroup_metadata",
        list_key="adGroups",
        id_key="adGroupId",
    )
    _sync_metadata_entity(
        base_url, access_token, client_id, profile_id, pull_id,
        v2_path="/v2/sp/keywords",
        record_type="sp_keyword_metadata",
        list_key="keywords",
        id_key="keywordId",
    )


# ---------------------------------------------------------------------------
# Performance reports (v3 Reporting API — async submit / poll / download)
# ---------------------------------------------------------------------------

def _submit_report(
    base_url: str, access_token: str, client_id: str, profile_id: str,
    start_date: str, end_date: str,
    report_type_id: str, group_by: list, columns: list,
) -> str:
    """Submit a v3 Reporting API report request. Returns reportId."""
    hdrs = _headers(access_token, client_id, profile_id)
    payload = {
        "name": f"{report_type_id} {start_date} to {end_date} profile {profile_id}",
        "startDate": start_date,
        "endDate": end_date,
        "configuration": {
            "adProduct": "SPONSORED_PRODUCTS",
            "groupBy": group_by,
            "columns": columns,
            "reportTypeId": report_type_id,
            "timeUnit": "DAILY",
            "format": "GZIP_JSON",
        },
    }
    with httpx.Client(headers=hdrs, timeout=30.0) as client:
        resp = _post(client, f"{base_url}/reporting/reports", payload)

    report_id = resp.get("reportId")
    if not report_id:
        raise ValueError(f"No reportId in Advertising API response: {resp}")
    logger.info("amazon_ads: submitted %s report reportId=%s profile=%s", report_type_id, report_id, profile_id)
    return report_id


def _poll_report_url(
    base_url: str, access_token: str, client_id: str,
    profile_id: str, report_id: str,
) -> str:
    """Poll until report is COMPLETED. Returns the S3 download URL."""
    hdrs = _headers(access_token, client_id, profile_id)
    deadline = time.time() + REPORT_POLL_TIMEOUT_S

    while time.time() < deadline:
        try:
            with httpx.Client(headers=hdrs, timeout=20.0) as client:
                resp = _get(client, f"{base_url}/reporting/reports/{report_id}")
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code != REPORT_NOT_READY_STATUS:
                raise
            # 425 Too Early — report still generating. Same as a PENDING tick.
            logger.debug(
                "amazon_ads: reportId=%s HTTP 425 not ready — waiting %ss",
                report_id, REPORT_POLL_INTERVAL_S,
            )
            time.sleep(REPORT_POLL_INTERVAL_S)
            continue

        status = resp.get("status", "UNKNOWN")
        if status == "COMPLETED":
            url = resp.get("url")
            if not url:
                raise ValueError(f"Report {report_id} COMPLETED but no url: {resp}")
            logger.info("amazon_ads: reportId=%s COMPLETED profile=%s", report_id, profile_id)
            return url
        if status == "FAILED":
            raise RuntimeError(
                f"Report {report_id} FAILED for profile {profile_id}: "
                f"{resp.get('failureReason', 'unknown reason')}"
            )

        logger.debug("amazon_ads: reportId=%s status=%s — waiting %ss", report_id, status, REPORT_POLL_INTERVAL_S)
        time.sleep(REPORT_POLL_INTERVAL_S)

    raise TimeoutError(
        f"Report {report_id} did not complete within {REPORT_POLL_TIMEOUT_S}s (profile {profile_id})"
    )


def _download_gzip_json(url: str) -> list:
    """Download a gzip-compressed JSON array from an S3 pre-signed URL."""
    resp = httpx.get(url, timeout=120.0, follow_redirects=True)
    resp.raise_for_status()
    with gzip.open(io.BytesIO(resp.content), "rt", encoding="utf-8") as f:
        return json.loads(f.read())


def _sync_report(
    base_url: str, access_token: str, client_id: str,
    profile_id: str, pull_id: str,
    start_date: str, end_date: str,
    report_def: dict,
) -> str:
    """Submit, poll, download, and upsert one performance report for one profile.

    Returns an outcome so the caller can tell an empty result from a lost one:
      'ok'      — the report was obtained (row count may legitimately be 0)
      'timeout' — still generating when the poll deadline expired
      'failed'  — submit/poll/download raised

    A per-report failure stays non-fatal: one stuck report must not cost the
    other eleven marketplaces their data. But it is no longer INVISIBLE, which
    it was while this function returned None either way — run() now refuses to
    report success if nothing at all was obtained.
    """
    report_type_id = report_def["report_type_id"]
    record_type = report_def["record_type"]
    id_fields = report_def["id_fields"]

    try:
        report_id = _submit_report(
            base_url, access_token, client_id, profile_id,
            start_date, end_date,
            report_type_id, report_def["group_by"], report_def["columns"],
        )
        download_url = _poll_report_url(base_url, access_token, client_id, profile_id, report_id)
        rows = _download_gzip_json(download_url)

    except TimeoutError as exc:
        logger.warning("amazon_ads: %s report timed out profile=%s: %s", report_type_id, profile_id, exc)
        return "timeout"
    except Exception as exc:
        logger.error("amazon_ads: %s report FAILED profile=%s: %s", report_type_id, profile_id, exc, exc_info=True)
        return "failed"

    # Raw record: report summary only (rows can be large; individual rows go to api_clean)
    write_raw(
        source=SOURCE, pull_id=pull_id,
        endpoint=f"/reporting/reports/{report_type_id}/{profile_id}",
        response_body={
            "profileId": profile_id,
            "reportId": report_id,
            "reportTypeId": report_type_id,
            "startDate": start_date,
            "endDate": end_date,
            "rowCount": len(rows),
        },
        response_status=200, connector_version=VERSION,
    )

    # Upsert rows in batches of 500
    batch: list = []
    for row in rows:
        id_parts = [str(row.get(f, "")) for f in id_fields]
        record_id = f"{profile_id}_{'_'.join(id_parts)}"
        batch.append({
            "source": SOURCE,
            "record_type": record_type,
            "source_record_id": record_id,
            "data": {**row, "profileId": profile_id},
            "last_pull_id": pull_id,
        })
        if len(batch) >= 500:
            upsert_clean_batch(batch)
            batch = []
    if batch:
        upsert_clean_batch(batch)

    logger.info(
        "amazon_ads: %d %s rows upserted profile=%s %s to %s",
        len(rows), record_type, profile_id, start_date, end_date,
    )
    return "ok"


# ---------------------------------------------------------------------------
# Per-profile orchestration
# ---------------------------------------------------------------------------

def _sync_profile(
    profile: dict,
    access_token: str,
    client_id: str,
    pull_id: str,
    start_date: str,
    end_date: str,
    include_metadata: bool,
) -> dict:
    """Sync one profile. Returns {outcome: count} across its four reports."""
    profile_id = str(profile["profileId"])
    base_url: str = profile["_base_url"]
    region: str = profile.get("_region", "?")
    country: str = profile.get("countryCode", "?")
    account_name: str = profile.get("accountInfo", {}).get("name", "?")

    logger.info(
        "amazon_ads: syncing profile %s | %s | %s | %s",
        profile_id, account_name, country, region,
    )

    if include_metadata:
        _sync_metadata(base_url, access_token, client_id, profile_id, pull_id)

    outcomes: dict = {}
    for report_def in _REPORTS:
        result = _sync_report(
            base_url, access_token, client_id, profile_id, pull_id,
            start_date, end_date, report_def,
        )
        outcomes[result] = outcomes.get(result, 0) + 1
    return outcomes


# ---------------------------------------------------------------------------
# Entry points
# ---------------------------------------------------------------------------

def run() -> None:
    """Incremental sync: metadata + last 2 days performance for all profiles.

    Ads data has a ~1 day reporting lag; pulling last 2 days ensures no gaps.
    """
    pull_id = str(uuid.uuid4())
    logger.info("amazon_ads.run start pull_id=%s", pull_id)

    creds = get_secrets([
        "amazon-ads-client-id",
        "amazon-ads-client-secret",
        "amazon-ads-refresh-token",
    ])
    access_token = _get_access_token(
        creds["amazon-ads-client-id"],
        creds["amazon-ads-client-secret"],
        creds["amazon-ads-refresh-token"],
    )
    logger.info("amazon_ads: LWA token obtained")

    filter_ids = _load_filter_ids()
    profiles = _fetch_profiles(access_token, creds["amazon-ads-client-id"], filter_ids)
    if not profiles:
        logger.warning("amazon_ads: no profiles found — check credentials and profile ID config")
        return

    start_date, end_date = nightly_window()
    logger.info("amazon_ads: requesting %s to %s (window ends at D-%d)",
                start_date, end_date, NIGHTLY_LAG_DAYS)

    totals: dict = {}
    for profile in profiles:
        try:
            outcomes = _sync_profile(
                profile, access_token, creds["amazon-ads-client-id"],
                pull_id, start_date, end_date,
                include_metadata=True,
            )
            for k, v in outcomes.items():
                totals[k] = totals.get(k, 0) + v
        except Exception as exc:
            totals["profile_error"] = totals.get("profile_error", 0) + 1
            logger.error(
                "amazon_ads: profile %s failed — %s",
                profile.get("profileId"), exc, exc_info=True,
            )

    logger.info(
        "amazon_ads.run complete pull_id=%s profiles=%d outcomes=%s",
        pull_id, len(profiles), totals,
    )

    # A RUN THAT OBTAINED NOTHING IS A FAILED RUN, AND MUST SAY SO.
    # Every per-report error above is caught and logged so one stuck report
    # cannot cost the other marketplaces their data. Taken to its conclusion
    # that meant a run where all 36 reports timed out still returned normally,
    # logged "complete", and left the scheduler believing the connector was
    # healthy while api_clean stayed empty. That is the same silent-zero failure
    # the reports app just had to be rescued from. Raising here surfaces it to
    # the APScheduler error listener and the incident log.
    if not totals.get("ok"):
        raise RuntimeError(
            f"amazon_ads.run obtained no reports at all across {len(profiles)} profiles "
            f"({start_date}..{end_date}); outcomes={totals}. Nothing was written to api_clean. "
            f"A 425/timeout on every report points at report-generation latency "
            f"(REPORT_POLL_TIMEOUT_S={REPORT_POLL_TIMEOUT_S}s); a 'failed' count points at "
            f"credentials or profile scope."
        )


def run_backfill(start_date, end_date) -> None:
    """Pull performance reports for a date range. No metadata sync (structural only).

    Called per 30-day chunk by scripts/run_backfill.py.
    Amazon Ads Reporting API supports up to 90 days per report request.
    """
    pull_id = str(uuid.uuid4())
    start_str = start_date.isoformat() if hasattr(start_date, "isoformat") else str(start_date)
    end_str = end_date.isoformat() if hasattr(end_date, "isoformat") else str(end_date)
    logger.info("amazon_ads.run_backfill %s to %s pull_id=%s", start_str, end_str, pull_id)

    creds = get_secrets([
        "amazon-ads-client-id",
        "amazon-ads-client-secret",
        "amazon-ads-refresh-token",
    ])
    access_token = _get_access_token(
        creds["amazon-ads-client-id"],
        creds["amazon-ads-client-secret"],
        creds["amazon-ads-refresh-token"],
    )

    filter_ids = _load_filter_ids()
    profiles = _fetch_profiles(access_token, creds["amazon-ads-client-id"], filter_ids)
    if not profiles:
        logger.warning("amazon_ads: no profiles found for backfill")
        return

    totals: dict = {}
    for profile in profiles:
        try:
            outcomes = _sync_profile(
                profile, access_token, creds["amazon-ads-client-id"],
                pull_id, start_str, end_str,
                include_metadata=False,
            )
            for k, v in outcomes.items():
                totals[k] = totals.get(k, 0) + v
        except Exception as exc:
            totals["profile_error"] = totals.get("profile_error", 0) + 1
            logger.error(
                "amazon_ads: profile %s backfill failed — %s",
                profile.get("profileId"), exc, exc_info=True,
            )

    logger.info("amazon_ads.run_backfill complete pull_id=%s outcomes=%s", pull_id, totals)

    # Same rule as run(): a chunk that obtained nothing must not look done.
    # run_backfill.py walks chunks in sequence, and a silently empty chunk would
    # leave a hole in the middle of a backfill that reported success throughout.
    if not totals.get("ok"):
        raise RuntimeError(
            f"amazon_ads.run_backfill obtained no reports for {start_str}..{end_str} "
            f"across {len(profiles)} profiles; outcomes={totals}. Nothing was written."
        )
