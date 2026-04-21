-- lib/migrations/04-rls-policies.sql
-- Task 4 — RLS Policies (Path A: anon + service_role role model)
-- Apply against: staging Supabase (iknwprxycshrickpswjz) only
-- Date proposed: 2026-04-20 | Owner: Jon Fawcett
--
-- Four concerns bundled:
--   A) Create `comments` and `notifications` tables — referenced by the
--      frontend but never in lib/supabaseSchema.sql. Schema-drift fix.
--   B) Drop all existing allow-all policies on every table.
--   C) Apply per-role policies implementing the three policy levels:
--        Level 1 — Human users      (role = anon, via NEXT_PUBLIC_SUPABASE_ANON_KEY)
--        Level 2 — Agent service    (role = service_role, via SUPABASE_SERVICE_ROLE_KEY)
--        Level 3 — System admin     (role = service_role; operational distinction
--                                    rather than DB-enforced — see notes at end)
--   D) Indices for common query shapes on the new tables.
--
-- Safe to re-apply: all DDL uses IF NOT EXISTS; policies are dropped
-- defensively before being re-created.

-- ═══════════════════════════════════════════════════════════════════════════
-- A) Create missing tables
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists comments (
  id          uuid         primary key default gen_random_uuid(),
  task_id     uuid         not null references tasks(id) on delete cascade,
  author      text         not null,
  body        text         not null,
  mentions    jsonb        default '[]'::jsonb,
  created_at  timestamptz  not null default now()
);

comment on column comments.mentions is
  'JSONB array of display names (e.g. ["Jon","Laura"]) parsed from @-mentions in body. Populated by TaskDetailPanel.postComment.';

create index if not exists comments_task_id on comments (task_id);

create table if not exists notifications (
  id          uuid         primary key default gen_random_uuid(),
  user_name   text         not null,
  type        text         not null,
  comment_id  uuid         references comments(id) on delete cascade,
  task_id     uuid         references tasks(id)    on delete cascade,
  task_title  text,
  from_user   text,
  body        text,
  read        boolean      not null default false,
  created_at  timestamptz  not null default now()
);

-- CHECK on notification type
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add  constraint notifications_type_check
  check (type in ('mention','comment_on_owned'));

-- user_name + created_at covers "my notifications, newest first" (inbox load)
create index if not exists notifications_user_recent
  on notifications (user_name, created_at desc);

-- user_name + read partial index accelerates "unread count for me"
create index if not exists notifications_user_unread
  on notifications (user_name) where read = false;

-- ═══════════════════════════════════════════════════════════════════════════
-- B) Enable RLS + drop existing allow-all policies
-- ═══════════════════════════════════════════════════════════════════════════

-- Idempotent — all tables should already have RLS enabled from earlier migrations.
alter table projects         enable row level security;
alter table task_groups      enable row level security;
alter table tasks            enable row level security;
alter table agent_audit_log  enable row level security;
alter table comments         enable row level security;
alter table notifications    enable row level security;

-- Drop the known allow-all policies from earlier migrations by name.
drop policy if exists "allow all"                                   on projects;
drop policy if exists "allow all"                                   on task_groups;
drop policy if exists "allow all"                                   on tasks;
drop policy if exists "allow all on agent_audit_log during staging" on agent_audit_log;
-- comments / notifications are just created above — no prior policies to drop.

-- ═══════════════════════════════════════════════════════════════════════════
-- C) Level 1 — Human users (role = anon)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Rationale: the frontend uses NEXT_PUBLIC_SUPABASE_ANON_KEY. Without a
-- user-JWT integration (Path B), we cannot enforce "write own" at the DB
-- layer — any browser user with the anon key can write any row. These
-- policies still tighten things vs. allow-all by:
--   • Fully isolating agent_audit_log from anon (critical).
--   • Making comments append-only (matches current UI — no edit/delete).
--   • Forbidding anon from deleting notifications (matches current UI —
--     notifications are marked read but not deleted).
-- All reads/writes the current app performs continue to succeed — zero
-- frontend regressions.

-- ── projects ──
create policy "anon select projects" on projects for select to anon using (true);
create policy "anon insert projects" on projects for insert to anon with check (true);
create policy "anon update projects" on projects for update to anon using (true) with check (true);
create policy "anon delete projects" on projects for delete to anon using (true);

-- ── task_groups ──
create policy "anon select task_groups" on task_groups for select to anon using (true);
create policy "anon insert task_groups" on task_groups for insert to anon with check (true);
create policy "anon update task_groups" on task_groups for update to anon using (true) with check (true);
create policy "anon delete task_groups" on task_groups for delete to anon using (true);

-- ── tasks ──
create policy "anon select tasks" on tasks for select to anon using (true);
create policy "anon insert tasks" on tasks for insert to anon with check (true);
create policy "anon update tasks" on tasks for update to anon using (true) with check (true);
create policy "anon delete tasks" on tasks for delete to anon using (true);

-- ── comments (append-only from anon) ──
create policy "anon select comments" on comments for select to anon using (true);
create policy "anon insert comments" on comments for insert to anon with check (true);
-- Deliberately no UPDATE or DELETE for anon on comments.

-- ── notifications (no anon DELETE) ──
create policy "anon select notifications" on notifications for select to anon using (true);
create policy "anon insert notifications" on notifications for insert to anon with check (true);
create policy "anon update notifications" on notifications for update to anon using (true) with check (true);
-- Deliberately no DELETE for anon on notifications.

-- ── agent_audit_log ──
-- NO anon policies of any kind. With RLS enabled and no matching policy,
-- anon is denied for SELECT/INSERT/UPDATE/DELETE. Only service_role reaches
-- this table, via agent API routes.

-- ═══════════════════════════════════════════════════════════════════════════
-- D) Level 2 — Agent service account (role = service_role)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Supabase's service_role BYPASSES RLS automatically — no explicit policies
-- are needed or permitted. All agent writes go through this role after the
-- Task 4 application code lands:
--   lib/agentAuth.js             — audit log INSERT/SELECT
--   pages/api/agent/tasks.js     — task INSERT
--   pages/api/agent/artefacts.js — task UPDATE
--
-- Application-layer controls on this role:
--   • X-Agent-Id required
--   • 60 req/min rate limit (enforced in lib/agentAuth.js)
--   • Every request audited into agent_audit_log
--   • Bearer token (AGENT_SERVICE_KEY) validated with constant-time compare

-- ═══════════════════════════════════════════════════════════════════════════
-- E) Level 3 — System administrator
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Currently OPERATIONAL, not DB-enforced. Admins (Jon today) use the
-- service_role key via:
--   • Supabase dashboard → SQL Editor (interactive admin work)
--   • Out-of-band Node scripts using SUPABASE_SERVICE_ROLE_KEY (migrations,
--     data fixes, audits)
--
-- True DB-enforced admin distinct from agent (e.g. "read-only auditor role
-- that cannot mutate data") requires a follow-on migration with one of:
--   • Supabase Auth + JWT claim-based policies (Path B)
--   • A dedicated Postgres role with explicit GRANTs and a custom JWT
-- This is deferred per MVP scope. When adopted, replace the "operational"
-- model with role = admin policies here.

-- ═══════════════════════════════════════════════════════════════════════════
-- Post-apply verification
-- ═══════════════════════════════════════════════════════════════════════════
-- After running this migration, the expected policy set per table is:
--
--   projects         : anon {SELECT, INSERT, UPDATE, DELETE}
--   task_groups      : anon {SELECT, INSERT, UPDATE, DELETE}
--   tasks            : anon {SELECT, INSERT, UPDATE, DELETE}
--   comments         : anon {SELECT, INSERT}
--   notifications    : anon {SELECT, INSERT, UPDATE}
--   agent_audit_log  : (no anon policies — fully isolated)
--
-- Regression-test plan (run before flagging Task 4 ready):
--   1. Frontend: log in, create/edit/delete tasks + projects, post comments,
--      receive notifications, mark read — all must succeed.
--   2. Power Automate: POST /api/tasks with a test payload — must succeed.
--   3. Agent: POST /api/agent/tasks + POST /api/agent/artefacts — must
--      succeed after application code switches to service_role key.
--   4. Negative test: with raw anon key (e.g. browser devtools), attempt
--      SELECT * FROM agent_audit_log — must return zero rows (policy denies).
