"""Shopify connector job — orders and products sync."""

import logging
import uuid

from connectors.lib.secrets import get_secret

logger = logging.getLogger(__name__)


def run() -> None:
    pull_id = str(uuid.uuid4())
    logger.info("shopify.run start pull_id=%s", pull_id)
    api_token = get_secret("shopify-admin-api-token")
    # TODO: implement in Phase 1
    logger.info("shopify.run complete pull_id=%s (placeholder)", pull_id)
