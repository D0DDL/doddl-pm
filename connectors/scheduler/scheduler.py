"""
doddl AI OS Connector Scheduler

Queue-based APScheduler setup with:
  - SQLAlchemy job store (PostgreSQL) — jobs survive restarts and crashes
  - ThreadPoolExecutor for I/O-bound connector jobs
  - Missed run recovery: misfire_grace_time set per job; if a scheduled run was
    missed (e.g. service was down), APScheduler fires it on resume unless the
    grace window has passed
  - Cron-based as of 2026-08-03: one run per source per day, staggered overnight
    on CronTrigger with timezone="Europe/London" set explicitly per job so the
    stagger holds across BST/GMT transitions

Configuration:
  - DATABASE_URL (Supabase connection string) — from Key Vault at runtime
  - AZURE_KEYVAULT_URI — the only credential that lives as an env var

Usage:
  python -m connectors.scheduler.scheduler
  or as a long-running service managed by systemd / container

Deployment note:
  Run as a single instance. APScheduler's SQLAlchemy job store uses advisory
  locks so multiple instances won't double-fire. However, for HA deployments
  use the 'cluster' mode with a single scheduler leader.
"""

import os
import logging
import signal
import time
from datetime import datetime, timedelta

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.events import (
    EVENT_JOB_EXECUTED, EVENT_JOB_ERROR, EVENT_JOB_MISSED,
    EVENT_JOB_ADDED, EVENT_JOB_REMOVED,
)

from connectors.lib.secrets import get_secret

logger = logging.getLogger(__name__)


# ── Build scheduler ───────────────────────────────────────────────────────────

def build_scheduler() -> BlockingScheduler:
    """
    Construct and return a configured scheduler.
    Does not start it — call scheduler.start() separately.
    """
    # Fetch the Supabase connection string from Key Vault at startup.
    # This is the only Key Vault call that happens at scheduler init;
    # individual connector jobs fetch their own credentials on each run.
    db_url = get_secret("supabase-scheduler-db-url")

    jobstores = {
        "default": SQLAlchemyJobStore(url=db_url, tablename="apscheduler_jobs"),
    }

    executors = {
        # Connector jobs are network I/O — ThreadPool is appropriate.
        # Max 10 concurrent connector runs; increase if connector count grows.
        "default": ThreadPoolExecutor(max_workers=10),
    }

    job_defaults = {
        # Missed run recovery window: if a job was missed and service resumes
        # within 1 hour of the scheduled time, fire the missed run immediately.
        # If more than 1 hour has elapsed, skip (stale data is not useful).
        # Override per-job for connectors with different tolerance.
        "misfire_grace_time": 3600,  # seconds
        # Coalesce: if multiple runs were missed, fire only once (not once per missed run).
        # Set to False for connectors where every run must be accounted for.
        "coalesce": True,
        # Maximum concurrent instances of the same job (prevents pile-up during slow runs)
        "max_instances": 1,
    }

    scheduler = BlockingScheduler(
        jobstores=jobstores,
        executors=executors,
        job_defaults=job_defaults,
        timezone="UTC",
    )

    _attach_listeners(scheduler)
    return scheduler


# ── Event listeners ───────────────────────────────────────────────────────────

def _attach_listeners(scheduler: BlockingScheduler) -> None:
    def on_job_executed(event):
        logger.info("JOB EXECUTED  job_id=%s runtime=%s", event.job_id, event.scheduled_run_time)

    def on_job_error(event):
        logger.error(
            "JOB ERROR     job_id=%s exception=%s",
            event.job_id, event.exception, exc_info=event.traceback,
        )
        try:
            from connectors.scheduler.alerting import create_incident_task
            create_incident_task(event.job_id, event.exception)
        except Exception as alert_err:
            logger.error("JOB ERROR alerting failed: %s", alert_err)

    def on_job_missed(event):
        # Fired when a job was missed and coalesce=True skipped extra runs,
        # or when misfire_grace_time was exceeded.
        logger.warning(
            "JOB MISSED    job_id=%s scheduled_at=%s (now=%s)",
            event.job_id, event.scheduled_run_time, datetime.utcnow().isoformat(),
        )

    def on_job_added(event):
        logger.info("JOB ADDED     job_id=%s", event.job_id)

    def on_job_removed(event):
        logger.info("JOB REMOVED   job_id=%s", event.job_id)

    scheduler.add_listener(on_job_executed, EVENT_JOB_EXECUTED)
    scheduler.add_listener(on_job_error, EVENT_JOB_ERROR)
    scheduler.add_listener(on_job_missed, EVENT_JOB_MISSED)
    scheduler.add_listener(on_job_added, EVENT_JOB_ADDED)
    scheduler.add_listener(on_job_removed, EVENT_JOB_REMOVED)


# ── Graceful shutdown ─────────────────────────────────────────────────────────

def _install_shutdown_handler(scheduler: BlockingScheduler) -> None:
    def handle_signal(signum, frame):
        logger.info("Shutdown signal received (sig=%s) — stopping scheduler", signum)
        scheduler.shutdown(wait=True)

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)


# ── Register connector jobs ───────────────────────────────────────────────────

def register_jobs(scheduler: BlockingScheduler) -> None:
    """
    Register all connector jobs. Each job specifies a CronTrigger with an
    explicit timezone="Europe/London" — one run per source per day, staggered
    at 30-minute offsets from 01:00 so no two connectors run concurrently.
    Jobs are persisted in the SQLAlchemy job store — re-registering an existing
    job with replace_existing=True is idempotent and updates the schedule if changed.

    Missed run recovery behaviour:
      coalesce=True  → if N runs were missed, fire exactly once on resume
      misfire_grace_time=7200 → if service was down > 2h, skip the missed run

    To add a new connector: import its run() function and add a scheduler.add_job() call.
    """
    from connectors.scheduler.jobs import (
        klaviyo, shopify, amazon_sp_api, amazon_advertising, google_ads, meta_ads,
        google_search_console, google_analytics, semrush,
        xero, opinew, microsoft_clarity, mintsoft,
    )

    # ── Shopify — orders + products (daily 01:00 Europe/London) ───────────────
    scheduler.add_job(
        func=shopify.run,
        trigger="cron",
        hour=1,
        minute=0,
        timezone="Europe/London",
        id="shopify-sync",
        name="Shopify orders + products sync",
        replace_existing=True,
        misfire_grace_time=7200,
        coalesce=True,
    )

    # ── Amazon SP-API — orders + inventory (daily 01:30 Europe/London) ────────
    scheduler.add_job(
        func=amazon_sp_api.run,
        trigger="cron",
        hour=1,
        minute=30,
        timezone="Europe/London",
        id="amazon-sp-api-sync",
        name="Amazon SP-API orders + inventory sync",
        replace_existing=True,
        misfire_grace_time=7200,
        coalesce=True,
    )

    # ── Klaviyo — campaigns + flows (daily 02:00 Europe/London) ───────────────
    scheduler.add_job(
        func=klaviyo.run,
        trigger="cron",
        hour=2,
        minute=0,
        timezone="Europe/London",
        id="klaviyo-sync",
        name="Klaviyo campaigns + flows sync",
        replace_existing=True,
        misfire_grace_time=7200,
        coalesce=True,
    )

    # ── Meta Ads — campaign + ad set + insights (daily 02:30 Europe/London) ───
    scheduler.add_job(
        func=meta_ads.run,
        trigger="cron",
        hour=2,
        minute=30,
        timezone="Europe/London",
        id="meta-ads-sync",
        name="Meta Ads campaign + ad set + insights sync",
        replace_existing=True,
        misfire_grace_time=7200,
        coalesce=True,
    )

    # ── Google Ads — campaign + ad group performance (daily 03:00 Europe/London)
    scheduler.add_job(
        func=google_ads.run,
        trigger="cron",
        hour=3,
        minute=0,
        timezone="Europe/London",
        id="google-ads-sync",
        name="Google Ads campaign + ad group performance sync",
        replace_existing=True,
        misfire_grace_time=7200,
        coalesce=True,
    )

    # ── Google Search Console — search analytics (daily 03:30 Europe/London) ──
    scheduler.add_job(
        func=google_search_console.run,
        trigger="cron",
        hour=3,
        minute=30,
        timezone="Europe/London",
        id="google-search-console-sync",
        name="Google Search Console search analytics sync",
        replace_existing=True,
        misfire_grace_time=7200,
        coalesce=True,
    )

    # ── Google Analytics 4 — traffic + pages (daily 04:00 Europe/London) ──────
    scheduler.add_job(
        func=google_analytics.run,
        trigger="cron",
        hour=4,
        minute=0,
        timezone="Europe/London",
        id="google-analytics-sync",
        name="Google Analytics 4 traffic + pages sync",
        replace_existing=True,
        misfire_grace_time=7200,
        coalesce=True,
    )

    # out of scope 2026-08-03 — re-enable by uncommenting
    # Amazon Advertising API partner registration was REJECTED — no credentials
    # exist, so this connector cannot function. Left registered it would fail
    # every night and bury genuine errors in the incident log.
    # ── Amazon Advertising — SP campaigns, ad groups, keywords, search terms ──
    # scheduler.add_job(
    #     func=amazon_advertising.run,
    #     trigger="cron",
    #     hour=4,
    #     minute=30,
    #     timezone="Europe/London",
    #     id="amazon-advertising-sync",
    #     name="Amazon Advertising SP campaigns + performance sync",
    #     replace_existing=True,
    #     misfire_grace_time=7200,
    #     coalesce=True,
    # )

    # out of scope 2026-08-03 — re-enable by uncommenting
    # ── SEMrush — domain analytics + keywords (every 24 hours) ───────────────
    # scheduler.add_job(
    #     func=semrush.run,
    #     trigger="interval",
    #     hours=24,
    #     id="semrush-sync",
    #     name="SEMrush domain analytics + organic keywords sync",
    #     replace_existing=True,
    #     misfire_grace_time=7200,
    #     coalesce=True,
    # )

    # out of scope 2026-08-03 — re-enable by uncommenting
    # ── Xero — invoices, contacts, payments (every 60 min) ───────────────────
    # scheduler.add_job(
    #     func=xero.run,
    #     trigger="interval",
    #     minutes=60,
    #     id="xero-sync",
    #     name="Xero invoices + contacts + payments sync",
    #     replace_existing=True,
    #     misfire_grace_time=7200,
    #     coalesce=True,
    # )

    # out of scope 2026-08-03 — re-enable by uncommenting
    # ── Opinew — product reviews (every 60 min) ───────────────────────────────
    # scheduler.add_job(
    #     func=opinew.run,
    #     trigger="interval",
    #     minutes=60,
    #     id="opinew-sync",
    #     name="Opinew product reviews sync",
    #     replace_existing=True,
    #     misfire_grace_time=7200,
    #     coalesce=True,
    # )

    # out of scope 2026-08-03 — re-enable by uncommenting
    # ── Microsoft Clarity — session metrics (every 6 hours) ──────────────────
    # scheduler.add_job(
    #     func=microsoft_clarity.run,
    #     trigger="interval",
    #     hours=6,
    #     id="microsoft-clarity-sync",
    #     name="Microsoft Clarity session metrics sync",
    #     replace_existing=True,
    #     misfire_grace_time=7200,
    #     coalesce=True,
    # )

    # out of scope 2026-08-03 — re-enable by uncommenting
    # ── Mintsoft — orders, stock, despatches (every 30 min) ──────────────────
    # scheduler.add_job(
    #     func=mintsoft.run,
    #     trigger="interval",
    #     minutes=30,
    #     id="mintsoft-sync",
    #     name="Mintsoft orders + stock + despatches sync",
    #     replace_existing=True,
    #     misfire_grace_time=7200,
    #     coalesce=True,
    # )


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%SZ",
    )

    logger.info("doddl AI OS connector scheduler starting")

    scheduler = build_scheduler()
    _install_shutdown_handler(scheduler)
    register_jobs(scheduler)

    logger.info(
        "Scheduler running — %d jobs registered. Missed run recovery: "
        "coalesce=True, grace=3600s per job (unless overridden)",
        len(scheduler.get_jobs()),
    )

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stopped cleanly")


if __name__ == "__main__":
    main()
