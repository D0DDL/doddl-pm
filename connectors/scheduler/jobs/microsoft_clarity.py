"""Microsoft Clarity connector — session metrics sync.

Pulls project-level engagement metrics (clicks, scrolls, dead clicks, rage
clicks, JS errors, session counts) from the Microsoft Clarity REST API.
Uses Azure AD client credentials flow for authentication.

Secrets required:
  clarity-project-id     — Clarity project ID (alphanumeric, from Clarity dashboard URL)
  clarity-client-id      — Azure AD app client ID (app registered with Clarity API access)
  clarity-client-secret  — Azure AD app client secret
  clarity-tenant-id      — Azure AD tenant ID
"""

import logging
import uuid
from datetime import date, timedelta

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from connectors.lib.secrets import get_secrets
from connectors.lib.db import write_raw, upsert_clean

logger = logging.getLogger(__name__)

VERSION = "1.0.0"
SOURCE = "microsoft_clarity"
CLARITY_API_BASE = "https://www.clarity.ms/api/v1"
CLARITY_SCOPE = "https://clarity.microsoft.com/.default"


def _get_clarity_token(client_id: str, client_secret: str, tenant_id: str) -> str:
    """Obtain an Azure AD access token for the Clarity API."""
    url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    resp = httpx.post(
        url,
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": CLARITY_SCOPE,
        },
        timeout=15.0,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception_type(httpx.HTTPStatusError),
    reraise=True,
)
def _get(client: httpx.Client, path: str, params: dict | None = None) -> dict:
    resp = client.get(f"{CLARITY_API_BASE}{path}", params=params)
    resp.raise_for_status()
    return resp.json()


def run() -> None:
    pull_id = str(uuid.uuid4())
    logger.info("microsoft_clarity.run start pull_id=%s", pull_id)

    creds = get_secrets([
        "clarity-project-id",
        "clarity-client-id",
        "clarity-client-secret",
        "clarity-tenant-id",
    ])

    access_token = _get_clarity_token(
        creds["clarity-client-id"],
        creds["clarity-client-secret"],
        creds["clarity-tenant-id"],
    )
    project_id = creds["clarity-project-id"]

    with httpx.Client(
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=30.0,
    ) as client:
        _sync_metrics(client, pull_id, project_id)
    logger.info("microsoft_clarity.run complete pull_id=%s", pull_id)


def _sync_metrics(
    client: httpx.Client, pull_id: str, project_id: str
) -> None:
    """Sync daily engagement metrics for the last 30 days."""
    end_date = date.today() - timedelta(days=1)
    start_date = end_date - timedelta(days=30)

    params = {
        "startDate": start_date.strftime("%Y-%m-%d"),
        "endDate": end_date.strftime("%Y-%m-%d"),
        "granularity": "daily",
        "metrics": ",".join([
            "TotalSessionCount",
            "TotalPageViewCount",
            "TotalEngagedSessionCount",
            "DeadClickCount",
            "RageClickCount",
            "ErrorClickCount",
            "ExcessiveScrollCount",
            "QuickBackCount",
            "JsErrorCount",
        ]),
    }

    data = _get(client, f"/{project_id}/metrics", params)
    metrics = data.get("metrics", [])

    write_raw(
        source=SOURCE, pull_id=pull_id, endpoint="/metrics",
        response_body=data, response_status=200, connector_version=VERSION,
    )

    count = 0
    for metric_day in metrics:
        day = metric_day.get("date", "unknown")
        record = {"date": day, **metric_day}
        upsert_clean(
            source=SOURCE, record_type="daily_metrics",
            source_record_id=f"{project_id}_{day}",
            data=record, pull_id=pull_id,
        )
        count += 1

    logger.info("microsoft_clarity: %d metric days synced pull_id=%s", count, pull_id)
