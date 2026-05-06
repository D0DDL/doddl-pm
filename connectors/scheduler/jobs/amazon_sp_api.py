"""Amazon SP-API connector job — orders and inventory sync."""

import logging
import uuid

from connectors.lib.secrets import get_secrets

logger = logging.getLogger(__name__)


def run() -> None:
    pull_id = str(uuid.uuid4())
    logger.info("amazon_sp_api.run start pull_id=%s", pull_id)
    creds = get_secrets([
        "amazon-sp-api-client-id",
        "amazon-sp-api-client-secret",
        "amazon-sp-api-refresh-token",
    ])
    # TODO: implement in Phase 1 (requires SP-API OAuth token exchange)
    logger.info("amazon_sp_api.run complete pull_id=%s (placeholder)", pull_id)
