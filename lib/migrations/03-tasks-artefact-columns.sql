-- lib/migrations/03-tasks-artefact-columns.sql
-- Task 3 — Approval Artefact Model + schema drift fixes for frontend alignment
-- Apply against: staging Supabase (iknwprxycshrickpswjz) only
-- Date proposed: 2026-04-20 | Owner: Jon Fawcett
--
-- Combines FOUR concerns into one migration (Jon approved the bundling):
--   A) Task 3 deliverable: artefact columns on `tasks`
--   B) Schema drift fixes: columns used by the frontend but missing from the DB
--   C) Status CHECK update: align with the 6 frontend status keys
--   D) Source CHECK broadening: allow 'agent' (complements Task 2 agent endpoint)

-- ═══════════════════════════════════════════════════════════════════════════
-- A) Task 3 — Approval Artefact Model columns
-- ═══════════════════════════════════════════════════════════════════════════

alter table tasks
  add column if not exists task_type      text default 'standard',
  add column if not exists artefact_type  text,
  add column if not exists artefact       jsonb,
  add column if not exists decision       text,
  add column if not exists decision_notes text,
  add column if not exists decision_by    text,
  add column if not exists decision_at    timestamptz,
  add column if not exists agent_id       text,
  add column if not exists staging_url    text;

comment on column tasks.agent_id is
  'Identifier of the agent that created/owns this task. Free-text label, matches X-Agent-Id on the POST /api/agent/tasks request. Distinct from agent_audit_log.agent_id which records per-request origin.';

-- task_type: enumerated via CHECK
alter table tasks drop constraint if exists tasks_task_type_check;
alter table tasks add  constraint tasks_task_type_check
  check (task_type in ('standard','approval','go_live','incident'));

-- decision: enumerated via CHECK, nullable (decision only exists on approval-type tasks once reviewed)
alter table tasks drop constraint if exists tasks_decision_check;
alter table tasks add  constraint tasks_decision_check
  check (decision is null or decision in ('approved','rejected','revision_requested'));

-- artefact_type is deliberately free-text; lib/artefactTypes.js (Task 3 app code) will validate at application layer.

-- ═══════════════════════════════════════════════════════════════════════════
-- B) Schema drift fixes — frontend-required columns that never made it in
-- ═══════════════════════════════════════════════════════════════════════════

alter table tasks
  add column if not exists parent_id  uuid        references tasks(id) on delete cascade,
  add column if not exists start_date date,
  add column if not exists progress   int         default 0,
  add column if not exists tags       jsonb,
  add column if not exists is_group   boolean     default false;

-- progress range CHECK
alter table tasks drop constraint if exists tasks_progress_check;
alter table tasks add  constraint tasks_progress_check
  check (progress is null or (progress >= 0 and progress <= 100));

-- Subtask lookups (children of a parent) happen on every row render in the frontend;
-- index on parent_id makes that O(log n) instead of O(n).
create index if not exists tasks_parent_id on tasks (parent_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- C) Status CHECK — align with frontend's 6 status keys
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Old:  todo | in_progress | blocked | done
-- New:  not_started | in_progress | on_track | at_risk | blocked | done

-- 1. Drop old CHECK first so the data migration below doesn't violate it.
alter table tasks drop constraint if exists tasks_status_check;

-- 2. Migrate any existing rows that use the old vocabulary.
--    Safe on empty staging; harmless if rows exist.
update tasks set status = 'not_started' where status = 'todo';

-- 3. Change the default so new inserts without a status get the frontend's default.
alter table tasks alter column status set default 'not_started';

-- 4. Add the new CHECK.
alter table tasks add constraint tasks_status_check
  check (status in ('not_started','in_progress','on_track','at_risk','blocked','done'));

-- ═══════════════════════════════════════════════════════════════════════════
-- D) Source CHECK — allow 'agent' (complements Task 2 /api/agent/tasks)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Old: manual | email | teams | teamsmaestro
-- New: manual | email | teams | teamsmaestro | agent

alter table tasks drop constraint if exists tasks_source_check;
alter table tasks add  constraint tasks_source_check
  check (source in ('manual','email','teams','teamsmaestro','agent'));

-- ═══════════════════════════════════════════════════════════════════════════
-- Notes
-- ═══════════════════════════════════════════════════════════════════════════
-- RLS policies are unchanged by this migration. Task 4 will replace the
-- allow-all policies with role-aware ones per CLAUDE.md §Task 4.
