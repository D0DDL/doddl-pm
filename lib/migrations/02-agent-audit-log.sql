-- lib/migrations/02-agent-audit-log.sql
-- Task 2 — Agent API Access Layer: audit trail table
-- Apply against: staging Supabase (iknwprxycshrickpswjz) only
-- Date proposed: 2026-04-20 | Owner: Jon Fawcett

create table if not exists agent_audit_log (
  id              uuid         primary key default gen_random_uuid(),
  agent_id        text         not null,
  method          text         not null,                          -- GET / POST / PATCH / DELETE
  path            text         not null,                          -- e.g. '/api/agent/tasks'
  status_code     int          not null,
  request_body    jsonb,                                          -- nullable; excludes Authorization header
  response_body   jsonb,                                          -- nullable; useful for 4xx/5xx debugging
  ip_address      text,
  user_agent      text,
  created_at      timestamptz  not null default now()
);

-- Indices for the queries we expect to run:
--   1) rate limiting: "how many rows for agent X in the last 60s"
create index if not exists agent_audit_log_agent_recent
  on agent_audit_log (agent_id, created_at desc);

--   2) audit review: "what happened in the last 24h, newest first"
create index if not exists agent_audit_log_recent
  on agent_audit_log (created_at desc);

-- RLS: consistent with other staging tables for now — allow-all.
-- Task 4 (RLS Policies) replaces this with write-only-for-service-role
-- and read-only-for-admin, as specified in CLAUDE.md.
alter table agent_audit_log enable row level security;

create policy "allow all on agent_audit_log during staging"
  on agent_audit_log
  for all
  using (true)
  with check (true);
