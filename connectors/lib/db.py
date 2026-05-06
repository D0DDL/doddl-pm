"""Shared database helpers for connector jobs.

Each connector job calls get_connection() at the start of its run and closes
it on completion. Connections are not shared across threads.
"""

import psycopg2
import psycopg2.extras

from connectors.lib.secrets import get_secret


def get_connection() -> psycopg2.extensions.connection:
    """Create and return a new psycopg2 connection. Caller must close."""
    return psycopg2.connect(get_secret("supabase-scheduler-db-url"))


def write_raw(
    cur,
    *,
    source: str,
    pull_id: str,
    endpoint: str,
    response_body: dict,
    response_status: int,
    connector_version: str,
) -> None:
    cur.execute(
        "INSERT INTO api_raw (source, pull_id, endpoint, response_body, response_status, connector_version) "
        "VALUES (%s, %s::uuid, %s, %s, %s, %s)",
        (source, pull_id, endpoint, psycopg2.extras.Json(response_body), response_status, connector_version),
    )


def upsert_clean(
    cur,
    *,
    source: str,
    record_type: str,
    source_record_id: str,
    data: dict,
    pull_id: str,
) -> None:
    cur.execute(
        "INSERT INTO api_clean (source, record_type, source_record_id, data, last_pull_id) "
        "VALUES (%s, %s, %s, %s, %s::uuid) "
        "ON CONFLICT (source, record_type, source_record_id) DO UPDATE SET "
        "  data            = EXCLUDED.data, "
        "  last_updated_at = NOW(), "
        "  last_pull_id    = EXCLUDED.last_pull_id",
        (source, record_type, source_record_id, psycopg2.extras.Json(data), pull_id),
    )


def last_pull_ts(cur, source: str) -> str | None:
    """Return ISO timestamp of the most recent api_raw row for a source, or None."""
    cur.execute("SELECT MAX(received_at) FROM api_raw WHERE source = %s", (source,))
    row = cur.fetchone()
    return row[0].isoformat() if row and row[0] else None
