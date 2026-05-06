"""Google Ads connector — campaign and ad group performance sync.

Pulls last-30-days performance for all active campaigns and ad groups using
GAQL. Credentials fetched from Azure Key Vault on every run.

Secrets required:
  google-ads-developer-token  — Google Ads developer token
  google-ads-client-id        — OAuth2 client ID
  google-ads-client-secret    — OAuth2 client secret
  google-ads-refresh-token    — OAuth2 refresh token
  google-ads-customer-id      — Google Ads customer/account ID (digits only)
"""

import logging
import uuid

from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

from connectors.lib.secrets import get_secrets
from connectors.lib.db import get_connection, write_raw, upsert_clean

logger = logging.getLogger(__name__)

VERSION = "1.0.0"
SOURCE = "google_ads"

CAMPAIGN_QUERY = """
    SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.all_conversions_value,
        metrics.ctr,
        metrics.average_cpc,
        segments.date
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
        AND campaign.status != 'REMOVED'
    ORDER BY segments.date DESC
    LIMIT 10000
"""

AD_GROUP_QUERY = """
    SELECT
        campaign.id,
        campaign.name,
        ad_group.id,
        ad_group.name,
        ad_group.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        segments.date
    FROM ad_group
    WHERE segments.date DURING LAST_30_DAYS
        AND ad_group.status != 'REMOVED'
    ORDER BY segments.date DESC
    LIMIT 10000
"""


def _build_client(creds: dict) -> GoogleAdsClient:
    return GoogleAdsClient.load_from_dict(
        {
            "developer_token": creds["google-ads-developer-token"],
            "client_id": creds["google-ads-client-id"],
            "client_secret": creds["google-ads-client-secret"],
            "refresh_token": creds["google-ads-refresh-token"],
            "login_customer_id": creds["google-ads-customer-id"],
            "use_proto_plus": True,
        }
    )


def _campaign_row_to_dict(row) -> dict:
    return {
        "campaign_id": str(row.campaign.id),
        "campaign_name": row.campaign.name,
        "status": row.campaign.status.name,
        "channel_type": row.campaign.advertising_channel_type.name,
        "impressions": row.metrics.impressions,
        "clicks": row.metrics.clicks,
        "cost_micros": row.metrics.cost_micros,
        "conversions": row.metrics.conversions,
        "all_conversions_value": row.metrics.all_conversions_value,
        "ctr": row.metrics.ctr,
        "average_cpc": row.metrics.average_cpc,
        "date": row.segments.date,
    }


def _ad_group_row_to_dict(row) -> dict:
    return {
        "campaign_id": str(row.campaign.id),
        "campaign_name": row.campaign.name,
        "ad_group_id": str(row.ad_group.id),
        "ad_group_name": row.ad_group.name,
        "status": row.ad_group.status.name,
        "impressions": row.metrics.impressions,
        "clicks": row.metrics.clicks,
        "cost_micros": row.metrics.cost_micros,
        "conversions": row.metrics.conversions,
        "date": row.segments.date,
    }


def run() -> None:
    pull_id = str(uuid.uuid4())
    logger.info("google_ads.run start pull_id=%s", pull_id)

    creds = get_secrets([
        "google-ads-developer-token",
        "google-ads-client-id",
        "google-ads-client-secret",
        "google-ads-refresh-token",
        "google-ads-customer-id",
    ])
    customer_id = creds["google-ads-customer-id"]
    client = _build_client(creds)
    service = client.get_service("GoogleAdsService")

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                _sync_campaigns(service, customer_id, cur, pull_id)
                _sync_ad_groups(service, customer_id, cur, pull_id)
        logger.info("google_ads.run complete pull_id=%s", pull_id)
    except GoogleAdsException as ex:
        for error in ex.failure.errors:
            logger.error("google_ads: API error %s — %s", error.error_code, error.message)
        raise
    finally:
        conn.close()


def _sync_campaigns(service, customer_id: str, cur, pull_id: str) -> None:
    rows = list(service.search(customer_id=customer_id, query=CAMPAIGN_QUERY))
    records = [_campaign_row_to_dict(r) for r in rows]

    write_raw(
        cur, source=SOURCE, pull_id=pull_id, endpoint="campaign/LAST_30_DAYS",
        response_body={"rows": records, "count": len(records)},
        response_status=200, connector_version=VERSION,
    )
    for record in records:
        upsert_clean(
            cur, source=SOURCE, record_type="campaign",
            source_record_id=f"{record['campaign_id']}_{record['date']}",
            data=record, pull_id=pull_id,
        )
    logger.info("google_ads: %d campaign rows synced pull_id=%s", len(records), pull_id)


def _sync_ad_groups(service, customer_id: str, cur, pull_id: str) -> None:
    rows = list(service.search(customer_id=customer_id, query=AD_GROUP_QUERY))
    records = [_ad_group_row_to_dict(r) for r in rows]

    write_raw(
        cur, source=SOURCE, pull_id=pull_id, endpoint="ad_group/LAST_30_DAYS",
        response_body={"rows": records, "count": len(records)},
        response_status=200, connector_version=VERSION,
    )
    for record in records:
        upsert_clean(
            cur, source=SOURCE, record_type="ad_group",
            source_record_id=f"{record['ad_group_id']}_{record['date']}",
            data=record, pull_id=pull_id,
        )
    logger.info("google_ads: %d ad group rows synced pull_id=%s", len(records), pull_id)
