-- lib/migrations/06-migrations-tracking.sql
-- Migration tracking + pre-migration backups + idempotency ledger.
-- Apply against: staging AND production Supabase via the Management API.
-- Date proposed: 2026-04-21 | Owner: Jon Fawcett
--
-- Why this exists:
--   Prior migrations (seed-ai-os, seed-business-projects, seed-journey-website)
--   used DELETE + INSERT patterns. Re-running any of them would wipe live data.
--   Production actually lost real Power Automate rows during the option-A wipe
--   and reseed on 2026-04-21. This migration makes that class of incident
--   structurally impossible: every migration has an ID in schema_migrations;
--   re-running skips. Every migration also snapshots projects + tasks into
--   migration_backups before it starts, so data can be restored if something
--   destructive gets through review.
--
-- Four pieces:
--   A) schema_migrations — idempotency ledger
--   B) migration_backups — per-migration row snapshots
--   C) backup_before_migration() — callable helper the apply scripts invoke
--   D) Seed schema_migrations with all migrations already applied

-- ═══════════════════════════════════════════════════════════════════════════
-- A) schema_migrations
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS schema_migrations (
  id          text        PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  description text
);

COMMENT ON TABLE schema_migrations IS
  'Idempotency ledger. Apply scripts MUST check here first and skip if the id exists.';

-- ═══════════════════════════════════════════════════════════════════════════
-- B) migration_backups
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS migration_backups (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_id text        NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  table_name   text        NOT NULL CHECK (table_name IN ('projects', 'tasks')),
  record_id    uuid        NOT NULL,
  snapshot     jsonb       NOT NULL
);

CREATE INDEX IF NOT EXISTS migration_backups_migration ON migration_backups (migration_id);
CREATE INDEX IF NOT EXISTS migration_backups_record    ON migration_backups (table_name, record_id);
CREATE INDEX IF NOT EXISTS migration_backups_taken     ON migration_backups (backed_up_at DESC);

COMMENT ON TABLE migration_backups IS
  'Row-level snapshots of projects and tasks captured immediately before each migration applies. Keyed by migration_id for selective restore.';

-- ═══════════════════════════════════════════════════════════════════════════
-- C) backup_before_migration(text)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Call this with the migration's id BEFORE any DDL or row writes. Captures
-- every projects + tasks row as JSONB so the snapshot survives future schema
-- changes. Returns the count of rows snapshotted (projects + tasks combined).

CREATE OR REPLACE FUNCTION backup_before_migration(p_migration_id text)
RETURNS int AS $$
DECLARE
  n_projects int;
  n_tasks    int;
BEGIN
  IF p_migration_id IS NULL OR btrim(p_migration_id) = '' THEN
    RAISE EXCEPTION 'backup_before_migration: migration_id is required';
  END IF;

  INSERT INTO migration_backups (migration_id, table_name, record_id, snapshot)
  SELECT p_migration_id, 'projects', p.id, to_jsonb(p.*)
  FROM projects p;
  GET DIAGNOSTICS n_projects = ROW_COUNT;

  INSERT INTO migration_backups (migration_id, table_name, record_id, snapshot)
  SELECT p_migration_id, 'tasks', t.id, to_jsonb(t.*)
  FROM tasks t;
  GET DIAGNOSTICS n_tasks = ROW_COUNT;

  RAISE NOTICE 'backup_before_migration(%): % projects, % tasks', p_migration_id, n_projects, n_tasks;
  RETURN n_projects + n_tasks;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION backup_before_migration(text) IS
  'Snapshot all projects + tasks rows into migration_backups before a migration runs. Caller responsibility: invoke this before any INSERT / UPDATE / DELETE / DDL in a migration. Idempotent per migration_id only if caller skips when already present in schema_migrations.';

-- ═══════════════════════════════════════════════════════════════════════════
-- D) Register all migrations already applied to these databases
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Both staging and production have these 8 migrations already applied.
-- ON CONFLICT DO NOTHING keeps this idempotent if the file is re-run.

INSERT INTO schema_migrations (id, description) VALUES
  ('01-initial-schema',         'Initial projects/task_groups/tasks schema (lib/supabaseSchema.sql)'),
  ('02-agent-audit-log',        'agent_audit_log table + indices + allow-all RLS'),
  ('03-tasks-artefact-columns', 'Approval artefact columns on tasks + schema-drift columns (start_date, parent_id, progress, tags, is_group) + status/source CHECK updates'),
  ('04-rls-policies',           'Role-based RLS: anon human, service_role agent, admin operational. Drops the allow-all policies. Adds comments + notifications tables.'),
  ('05-exec-sql-rpc',           'public.exec_sql(text) RPC for scripts/apply-migration.js'),
  ('seed-ai-os',                'doddl_ai_os_seed.sql — 6 projects, 22 task_groups, 82 tasks'),
  ('seed-business-projects',    'doddl_business_projects_seed.sql — +5 projects, +10 task_groups, +30 tasks'),
  ('seed-journey-website',      'doddl_journey_migration.sql — project 009 renamed to Developmental Journey — Website, 12 task_groups, 145 tasks'),
  ('06-migrations-tracking',    'schema_migrations ledger + migration_backups snapshots + backup_before_migration() function (this migration)')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification queries (not executed by this migration)
-- ═══════════════════════════════════════════════════════════════════════════
--   SELECT COUNT(*) FROM schema_migrations;            -- expect 9
--   SELECT id, applied_at FROM schema_migrations ORDER BY applied_at, id;
--   SELECT backup_before_migration('test-run');        -- expect >0
--   SELECT migration_id, table_name, COUNT(*) FROM migration_backups GROUP BY 1,2;
