-- lib/migrations/05-exec-sql-rpc.sql
-- public.exec_sql(text) RPC — arbitrary SQL execution via supabase.rpc,
-- restricted to service_role.
--
-- Apply against: staging Supabase (iknwprxycshrickpswjz) only
-- Date proposed: 2026-04-20 | Owner: Jon Fawcett
--
-- Note on workflow: with SUPABASE_ACCESS_TOKEN now in .env.local, the
-- Supabase Management API is the primary path for applying future DDL
-- migrations from Claude Code. This exec_sql function is retained as a
-- secondary option for in-database scripting / server-side SQL execution
-- patterns; it is NOT the primary migration runner.
--
-- ── Security model ─────────────────────────────────────────────────────
-- SECURITY DEFINER             — function runs with owner privileges
--                                 (postgres superuser)
-- SET search_path = public,    — prevents search_path hijacking by callers
--     pg_temp                    who might prepend a malicious schema
-- REVOKE from PUBLIC/anon/     — revoke default GRANT EXECUTE so no one
--        authenticated           except service_role can call
-- GRANT EXECUTE to service_role — only the Next.js server process
--                                  (holding SUPABASE_SERVICE_ROLE_KEY)
--                                  can reach this function
--
-- Browsers using NEXT_PUBLIC_SUPABASE_ANON_KEY CANNOT invoke this
-- function — RLS isn't the barrier; function-level GRANT is.
-- ───────────────────────────────────────────────────────────────────────

create or replace function public.exec_sql(sql text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  execute sql;
end;
$$;

comment on function public.exec_sql(text) is
  'Execute arbitrary SQL with superuser privileges. Access restricted to service_role. Do NOT include BEGIN/COMMIT — the function call is already its own transaction and explicit transaction control will error. Created 2026-04-20 as migration 05.';

-- Lock down access
revoke execute on function public.exec_sql(text) from public;
revoke execute on function public.exec_sql(text) from anon;
revoke execute on function public.exec_sql(text) from authenticated;
grant  execute on function public.exec_sql(text) to service_role;

-- Refresh PostgREST schema cache so the RPC is immediately callable
notify pgrst, 'reload schema';
