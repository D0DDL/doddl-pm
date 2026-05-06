"""
Klaviyo connector job — contacts and campaigns sync.

Fetches credentials from Azure Key Vault on every run (not cached) so that
key rotation takes effect immediately without a restart.
"""

import logging
import uuid
from datetime import datetime, timezone

from connectors.lib.secrets import get_secret

logger = logging.getLogger(__name__)


def run() -> None:
    """Entry point called by the scheduler. Raises on unrecoverable error."""
    pull_id = str(uuid.uuid4())
    logger.info("klaviyo.run start pull_id=%s", pull_id)

    api_key = get_secret("klaviyo-api-key")

    # TODO: implement Klaviyo API calls and write to api_raw / api_clean
    # Pattern:
    #   1. Fetch from Klaviyo API using api_key
    #   2. INSERT raw response into api_raw (pull_id, source='klaviyo', endpoint, response_body)
    #   3. Parse and UPSERT normalised records into api_clean
    #
    # Placeholder — replace with real implementation in Phase 1
    logger.info("klaviyo.run complete pull_id=%s (placeholder)", pull_id)
