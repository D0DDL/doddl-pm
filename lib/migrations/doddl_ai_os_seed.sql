-- ================================================================
-- doddl AI OS — Complete Project Seed Migration
-- ================================================================
-- Version:     1.0
-- Date:        April 2026
-- Prepared by: Alex (PM) via Claude Project
-- ----------------------------------------------------------------
-- PURPOSE
-- Populate the staging database with the full doddl AI OS project
-- structure: 6 projects, 22 task groups, 82 tasks.
-- All owners, dependencies, priorities, and due dates are set.
-- ----------------------------------------------------------------
-- RUN IN:  Supabase Staging SQL Editor ONLY
--          Project: doddl-pm-staging (iknwprxycshrickpswjz)
-- DO NOT:  Run in production until PM Tool is live and validated.
-- ----------------------------------------------------------------
-- HOW TO RUN
-- 1. Open Supabase dashboard → staging project → SQL Editor
-- 2. Paste this entire file
-- 3. Click Run
-- 4. Verify row counts:
--      SELECT COUNT(*) FROM projects;       -- expect 6
--      SELECT COUNT(*) FROM task_groups;    -- expect 22
--      SELECT COUNT(*) FROM tasks;          -- expect 82
-- ================================================================

BEGIN;

-- ================================================================
-- 1. PROJECTS
-- ================================================================

INSERT INTO projects (id, name, description, status, priority, owner, start_date, due_date) VALUES

('10000000-0000-0000-0000-000000000001',
 'PM Tool Build',
 'Build the doddl project management tool. Foundation layer — AI agents need somewhere to submit work for human approval before any agent is deployed. Four sequential tasks: Decomposition → Agent API → Approval Artefacts → RLS Policies → Production Deploy.',
 'active', 'critical', 'Jon',
 '2026-04-14', '2026-05-02'),

('10000000-0000-0000-0000-000000000002',
 'AI OS — Phase 0: Infrastructure & Compliance',
 'All foundational infrastructure, API credentials, and compliance STOP gates. 22 tasks. Must be 100% complete before Phase 1 begins. No exceptions — skipping creates compounding technical debt.',
 'active', 'high', 'Jon',
 '2026-05-02', '2026-05-16'),

('10000000-0000-0000-0000-000000000003',
 'AI OS — Phase 1: Data Pipeline',
 'Build connectors that pull data from Amazon SP-API, Amazon Ads, Shopify, Google Ads, Meta Ads, and Klaviyo into Supabase. One connector per source. Independent — failure of one does not affect others. Gate: Phase 0 complete.',
 'active', 'high', 'Jon',
 '2026-05-16', '2026-06-27'),

('10000000-0000-0000-0000-000000000004',
 'AI OS — Phase 2: Intelligence Layer',
 'Master intelligence agent reads from Supabase, compares to baselines, detects anomalies, and produces the daily briefing. Gate: Phase 1 stable for 2 weeks.',
 'active', 'high', 'Jon',
 '2026-06-27', '2026-09-05'),

('10000000-0000-0000-0000-000000000005',
 'AI OS — Phase 3: Specialist Agents',
 'Domain-specific agents: copy, PPC (Amazon/Google/Meta), image briefs, SEO, B2B outreach. Each has a QA/critic agent. All outputs go to PM layer for human approval before execution. Gate: Phase 2 validated.',
 'active', 'medium', 'Jon',
 '2026-09-05', '2026-12-05'),

('10000000-0000-0000-0000-000000000006',
 'AI OS — Phase 4: Creative AI Stack',
 'Video, image, and audio generation for ad creative and social content. Budget: ~£2,500/month separate line. Gate: Phase 3 agents stable.',
 'active', 'medium', 'Jon',
 '2026-12-05', '2027-02-28');


-- ================================================================
-- 2. TASK GROUPS
-- ================================================================

-- PM Tool Build
INSERT INTO task_groups (id, project_id, name, position) VALUES
('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Task 1 — Codebase Decomposition', 1),
('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Task 2 — Agent API Access Layer', 2),
('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Task 3 — Approval Artefact Model', 3),
('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Task 4 — RLS Policies', 4),
('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Production Deployment', 5);

-- Phase 0
INSERT INTO task_groups (id, project_id, name, position) VALUES
('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', 'Infrastructure', 1),
('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000002', 'Compliance — DPAs', 2),
('20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000002', 'Compliance — Breach Logging', 3),
('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002', 'B2B Scraper Compliance', 4),
('20000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000002', 'API Credentials & Baselines', 5),
('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000002', 'Knowledge Base', 6);

-- Phase 1
INSERT INTO task_groups (id, project_id, name, position) VALUES
('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000003', 'Amazon Connectors', 1),
('20000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000003', 'Other Platform Connectors', 2),
('20000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000003', 'Pipeline Monitoring', 3);

-- Phase 2
INSERT INTO task_groups (id, project_id, name, position) VALUES
('20000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000004', 'Design & Rules', 1),
('20000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000004', 'Build', 2),
('20000000-0000-0000-0000-000000000017', '10000000-0000-0000-0000-000000000004', 'Validation', 3);

-- Phase 3
INSERT INTO task_groups (id, project_id, name, position) VALUES
('20000000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000005', 'Copy Agents', 1),
('20000000-0000-0000-0000-000000000019', '10000000-0000-0000-0000-000000000005', 'PPC Agents', 2),
('20000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000005', 'Other Agents', 3);

-- Phase 4
INSERT INTO task_groups (id, project_id, name, position) VALUES
('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000006', 'Creative Pipeline', 1),
('20000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000006', 'QA', 2);


-- ================================================================
-- 3. TASKS
-- ================================================================
-- UUID scheme: 3000...00XX where XX = task number (01–82)
-- depends_on references the UUID of the blocking task
-- ================================================================

-- ----------------------------------------------------------------
-- PM TOOL — Task Group 1: Codebase Decomposition
-- 11-step extraction sequence. Sequential. No skipping.
-- ----------------------------------------------------------------

INSERT INTO tasks (id, title, description, status, priority, project_id, group_id, assigned_to, due_date, depends_on, notes, position) VALUES

('30000000-0000-0000-0000-000000000001',
 '[Step 1] Create lib/constants.js, lib/team.js, lib/msal.js',
 'Extract all status/priority/source/tag/colour constants to lib/constants.js. Team roster, getDisplayName, colour palettes to lib/team.js. MSAL config and getMsal to lib/msal.js. Rewire all imports. Run npm run build.',
 'in_progress', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
 'Claude Code', '2026-04-22', NULL,
 'First step of approved 11-step decomposition plan. Move code only — no new features.',
 1),

('30000000-0000-0000-0000-000000000002',
 '[Step 2] Extract leaf components — StatusBadge, PriorityBadge, AssigneeSelect, TagsCell, ProgressBar, InlineEdit, DateCell, OwnerAvatar',
 'Extract all listed leaf components to components/ (repo root). Run npm run build after each extraction.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
 'Claude Code', '2026-04-22', '30000000-0000-0000-0000-000000000001',
 'CRITICAL: components/ at repo root only. Never pages/components/ — that breaks Next.js routing.',
 2),

('30000000-0000-0000-0000-000000000003',
 '[Step 3] Extract CalendarPicker, TimelineCell, LoginScreen',
 'Extract CalendarPicker, TimelineCell, LoginScreen to components/. Run npm run build.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
 'Claude Code', '2026-04-22', '30000000-0000-0000-0000-000000000002',
 NULL, 3),

('30000000-0000-0000-0000-000000000004',
 '[Step 4] Extract CommentBody, MentionInput, TaskDetailPanel',
 'Extract CommentBody, MentionInput, TaskDetailPanel to components/. Run npm run build.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
 'Claude Code', '2026-04-22', '30000000-0000-0000-0000-000000000003',
 NULL, 4),

('30000000-0000-0000-0000-000000000005',
 '[Step 5] Extract ProjectTableRow, ProjectGroup, ProjectDashboard, TaskRow',
 'Extract ProjectTableRow, ProjectGroup, ProjectDashboard, TaskRow to components/. Run npm run build.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
 'Claude Code', '2026-04-22', '30000000-0000-0000-0000-000000000004',
 NULL, 5),

('30000000-0000-0000-0000-000000000006',
 '[Step 6] Extract KanbanBoard, GanttView',
 'Extract KanbanBoard and GanttView to components/. Run npm run build.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
 'Claude Code', '2026-04-22', '30000000-0000-0000-0000-000000000005',
 NULL, 6),

('30000000-0000-0000-0000-000000000007',
 '[Step 7] Extract ProjectSection',
 'Extract ProjectSection to components/. Run npm run build.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
 'Claude Code', '2026-04-22', '30000000-0000-0000-0000-000000000006',
 NULL, 7),

('30000000-0000-0000-0000-000000000008',
 '[Step 8] Extract AddTaskModal, AddProjectModal',
 'Extract AddTaskModal and AddProjectModal to components/. Run npm run build.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
 'Claude Code', '2026-04-22', '30000000-0000-0000-0000-000000000007',
 NULL, 8),

('30000000-0000-0000-0000-000000000009',
 '[Step 9] Extract MyWorkView (with MwTaskTable + MwSection)',
 'Extract MyWorkView including MwTaskTable and MwSection sub-components to components/. Run npm run build.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
 'Claude Code', '2026-04-22', '30000000-0000-0000-0000-000000000008',
 NULL, 9),

('30000000-0000-0000-0000-000000000010',
 '[Step 10] Reduce pages/index.js to <150-line shell + smoke test',
 'Reduce pages/index.js to a clean shell under 150 lines. Run npm run build AND npm run dev. Smoke test all views in browser.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
 'Claude Code', '2026-04-22', '30000000-0000-0000-0000-000000000009',
 'Acceptance: pages/index.js < 150 lines. npm run build clean. npm run dev runs. All existing functionality works identically — zero regressions.',
 10),

('30000000-0000-0000-0000-000000000011',
 '[Step 11] Add REST API scaffolding — pages/api/projects.js + pages/api/task-groups.js',
 'Add pages/api/projects.js (GET/POST/PATCH/DELETE) and pages/api/task-groups.js (GET/POST/PATCH/DELETE). Run npm run build.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
 'Claude Code', '2026-04-22', '30000000-0000-0000-0000-000000000010',
 NULL, 11),

('30000000-0000-0000-0000-000000000012',
 'Upgrade Next.js 14.1.0 → 14.2.x (security fix)',
 'Security vulnerability. Upgrade Next.js to latest 14.2.x. Verify npm run build passes clean after upgrade.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
 'Claude Code', '2026-04-22', '30000000-0000-0000-0000-000000000011',
 'Acceptance criteria item for Task 1. Must complete before Task 1 is signed off by Jon.',
 12),

-- ----------------------------------------------------------------
-- PM TOOL — Task Group 2: Agent API Access Layer
-- Blocked behind Task 1 full completion.
-- ----------------------------------------------------------------

('30000000-0000-0000-0000-000000000013',
 'Build lib/agentAuth.js — agent authentication middleware',
 'Validates agent service key from API headers. Invalid or missing key returns 401. Used by all agent API routes as middleware.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
 'Claude Code', '2026-04-25', '30000000-0000-0000-0000-000000000012',
 'New env var required: AGENT_SERVICE_KEY. Jon adds to .env.local and Vercel staging environment before this task is tested.',
 1),

('30000000-0000-0000-0000-000000000014',
 'SQL migration: Create agent_audit_log table',
 'Claude Code proposes SQL to lib/migrations/. Jon reads, approves, applies in Supabase staging dashboard, then confirms. Table schema: id (uuid), agent_id (text), action (text), table_name (text), record_id (uuid), payload (jsonb), ip_address (text), created_at (timestamptz).',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
 'Jon', '2026-04-25', '30000000-0000-0000-0000-000000000013',
 'Jon applies migration in Supabase dashboard. Jon confirms back to Claude Code before Claude Code continues.',
 2),

('30000000-0000-0000-0000-000000000015',
 'Build pages/api/agent/tasks.js',
 'Agent route for creating and updating tasks. Requires valid AGENT_SERVICE_KEY header. Every write creates a record in agent_audit_log.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
 'Claude Code', '2026-04-25', '30000000-0000-0000-0000-000000000014',
 NULL, 3),

('30000000-0000-0000-0000-000000000016',
 'Build pages/api/agent/artefacts.js',
 'Agent route for attaching approval artefacts to tasks. Requires valid AGENT_SERVICE_KEY header. Every write creates a record in agent_audit_log.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
 'Claude Code', '2026-04-25', '30000000-0000-0000-0000-000000000015',
 NULL, 4),

('30000000-0000-0000-0000-000000000017',
 'Implement rate limiting on agent routes',
 'Rate limiter: 60 requests per minute per agent ID. Returns 429 on exceeded. Human-facing routes completely unaffected.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
 'Claude Code', '2026-04-25', '30000000-0000-0000-0000-000000000016',
 NULL, 5),

('30000000-0000-0000-0000-000000000018',
 'Task 2 acceptance validation — Jon sign-off',
 'Full acceptance check: agent routes require valid key (401 on missing), every agent write audited, rate limiter returns 429 on exceeded, human routes unaffected, npm run build clean.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
 'Jon', '2026-04-25', '30000000-0000-0000-0000-000000000017',
 'Jon reviews all output and signs off before Task 3 begins.',
 6),

-- ----------------------------------------------------------------
-- PM TOOL — Task Group 3: Approval Artefact Model
-- Blocked behind Task 2 sign-off.
-- ----------------------------------------------------------------

('30000000-0000-0000-0000-000000000019',
 'SQL migration: Add approval columns to tasks table',
 'ALTER TABLE tasks to add: task_type (standard/approval/go_live/incident), artefact_type (text), artefact (jsonb), decision (approved/rejected/revision_requested), decision_notes (text), decision_by (text), decision_at (timestamptz), agent_id (text), staging_url (text).',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003',
 'Jon', '2026-04-29', '30000000-0000-0000-0000-000000000018',
 'Claude Code writes migration. Jon applies in Supabase staging. Existing standard tasks must be completely unaffected.',
 1),

('30000000-0000-0000-0000-000000000020',
 'Build lib/artefactTypes.js',
 'Registry of all artefact types with their schemas. Used by ApprovalTaskPanel and agent API routes to validate artefact structure before submission.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003',
 'Claude Code', '2026-04-29', '30000000-0000-0000-0000-000000000019',
 NULL, 2),

('30000000-0000-0000-0000-000000000021',
 'Build components/ApprovalTaskPanel.jsx',
 'UI component rendering approval tasks. Shows artefact content, Approve / Reject / Revision Requested buttons. Decision recording must be immutable once submitted.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003',
 'Claude Code', '2026-04-29', '30000000-0000-0000-0000-000000000020',
 'Laura to review approval UI before Task 3 sign-off.',
 3),

('30000000-0000-0000-0000-000000000022',
 'Implement immutable decision recording logic',
 'Once a decision (approved/rejected/revision_requested) is submitted it cannot be overwritten. Enforce at API level, not just UI. Standard tasks visually unchanged.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003',
 'Claude Code', '2026-04-29', '30000000-0000-0000-0000-000000000021',
 'Acceptance: approval task created via agent API renders correctly. Decision immutable after submission. Standard tasks unchanged. npm run build clean.',
 4),

-- ----------------------------------------------------------------
-- PM TOOL — Task Group 4: RLS Policies
-- Blocked behind Task 3 sign-off.
-- ----------------------------------------------------------------

('30000000-0000-0000-0000-000000000023',
 'Write RLS migration SQL — three role-based policy levels',
 'Claude Code writes full migration SQL replacing all allow-all policies. Three levels: (1) Human users — full read all tables, INSERT/UPDATE on tasks/task_groups/projects, no access to agent_audit_log. (2) Agent service account — INSERT/UPDATE own tasks via agent_id, INSERT on agent_audit_log, SELECT on tasks/projects/task_groups. (3) System admin — full SELECT all tables, same write as human. Migration must be idempotent.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004',
 'Claude Code', '2026-05-01', '30000000-0000-0000-0000-000000000022',
 'Jon reviews SQL in full before applying. All three policy levels must be clearly named.',
 1),

('30000000-0000-0000-0000-000000000024',
 'Apply RLS migration to staging — Jon',
 'Jon applies the RLS migration in Supabase staging SQL Editor. Confirms all three policy levels are visible in the dashboard.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004',
 'Jon', '2026-05-01', '30000000-0000-0000-0000-000000000023',
 NULL, 2),

('30000000-0000-0000-0000-000000000025',
 'Full regression test — all routes and all role levels',
 'Test: all human-facing routes work identically. Agent routes work with service account permissions. Unauthorised access returns 403 not data. Document test results.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004',
 'Jon', '2026-05-01', '30000000-0000-0000-0000-000000000024',
 'Acceptance: all allow-all policies removed. npm run build clean. No regressions on any human-facing route.',
 3),

-- ----------------------------------------------------------------
-- PM TOOL — Task Group 5: Production Deployment
-- ----------------------------------------------------------------

('30000000-0000-0000-0000-000000000026',
 'Catherine: Review staging — Go Live approval gate',
 'Catherine reviews the full staging deployment at doddl-pm-git-staging-d0ddls-projects.vercel.app. Validates all functionality. Gives explicit Go Live approval.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005',
 'Catherine', '2026-05-02', '30000000-0000-0000-0000-000000000025',
 'HARD GATE. Jon does not merge to main until Catherine gives explicit written or verbal Go Live approval.',
 1),

('30000000-0000-0000-0000-000000000027',
 'Jon: Merge staging → main — production deploy',
 'Jon merges staging branch to main. Vercel auto-deploys to doddl-pm.vercel.app. Verify production URL is live and functional.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005',
 'Jon', '2026-05-02', '30000000-0000-0000-0000-000000000026',
 'PM tool is live. Phase 0 can begin.',
 2);


-- ================================================================
-- PHASE 0 — INFRASTRUCTURE & COMPLIANCE
-- All tasks depend on PM Tool being live (task 27) unless noted.
-- ================================================================

-- Task Group 6: Infrastructure

INSERT INTO tasks (id, title, description, status, priority, project_id, group_id, assigned_to, due_date, depends_on, notes, position) VALUES

('30000000-0000-0000-0000-000000000028',
 'P0-1: Azure Key Vault setup',
 'Set up Azure Key Vault for all API credential storage. After this is live, no credential ever goes in code or env files.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000006',
 'Jon', '2026-05-09', '30000000-0000-0000-0000-000000000027',
 'Stores: Amazon SP-API, Shopify, Google Ads, Meta Ads, Klaviyo, Supabase service role credentials.',
 1),

('30000000-0000-0000-0000-000000000029',
 'P0-2: Infrastructure as code (Terraform or Pulumi)',
 'All infrastructure reproducible from codebase. Staging environment must be spinnable from scratch using IaC.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000006',
 'Jon', '2026-05-09', '30000000-0000-0000-0000-000000000028',
 NULL, 2),

('30000000-0000-0000-0000-000000000030',
 'P0-3: Technical architecture document',
 'Living document. Version controlled in GitHub. Documents all layers, agents, data flows, and infrastructure decisions.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000006',
 'Jon', '2026-05-12', '30000000-0000-0000-0000-000000000029',
 NULL, 3),

('30000000-0000-0000-0000-000000000031',
 'P0-4: Configuration Playbook v1.1 — final review and sign-off',
 'v1.1 exists. Needs final review before Phase 1 begins. Every variable in the system mapped with owners, values, and downstream impacts.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000006',
 'Jon', '2026-05-12', '30000000-0000-0000-0000-000000000030',
 NULL, 4),

('30000000-0000-0000-0000-000000000032',
 'P0-11: Fix Clarity cookie consent — HIGH PRIORITY COMPLIANCE FIX',
 'Microsoft Clarity must load ONLY after analytics consent is given. Currently loads on all page visits. This is a GDPR violation. Fix before Phase 0 is considered complete.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000006',
 'Claude Code', '2026-05-09', '30000000-0000-0000-0000-000000000027',
 'Do not wait for other Phase 0 tasks — action this early. Current implementation is non-compliant.',
 5),

-- Task Group 7: Compliance — DPAs (all STOP gates)

('30000000-0000-0000-0000-000000000033',
 'P0-5: Sign Klaviyo DPA — STOP GATE',
 'Account Settings > Privacy. Estimated 2 minutes. Klaviyo connector (P1-10) cannot start without this signed.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000007',
 'Jon', '2026-05-05', '30000000-0000-0000-0000-000000000027',
 'STOP GATE. DPO lead must sign. Who is DPO? Open question — Catherine to assign as a matter of urgency.',
 1),

('30000000-0000-0000-0000-000000000034',
 'P0-6: Sign Supabase DPA — STOP GATE',
 'Dashboard > Organisation Settings > Legal. Confirm data region is eu-west-2 or eu-central-1. Required before breach_log table can be built.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000007',
 'Jon', '2026-05-05', '30000000-0000-0000-0000-000000000027',
 'STOP GATE.',
 2),

('30000000-0000-0000-0000-000000000035',
 'P0-7: Accept Microsoft Clarity DPA — STOP GATE',
 'Clarity dashboard > Settings > Privacy.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000007',
 'Jon', '2026-05-05', '30000000-0000-0000-0000-000000000027',
 'STOP GATE.',
 3),

('30000000-0000-0000-0000-000000000036',
 'P0-8: Confirm Shopify DPA — STOP GATE',
 'Admin > Settings > Legal. Already in Shopify terms of service — confirm and document for compliance register.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000007',
 'Jon', '2026-05-05', '30000000-0000-0000-0000-000000000027',
 'STOP GATE.',
 4),

('30000000-0000-0000-0000-000000000037',
 'P0-9: Sign Vercel DPA — STOP GATE',
 'vercel.com/legal/dpa. Select EU SCCs if US processing applies.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000007',
 'Jon', '2026-05-05', '30000000-0000-0000-0000-000000000027',
 'STOP GATE.',
 5),

('30000000-0000-0000-0000-000000000038',
 'P0-10: Anthropic API DPA and training data opt-out — STOP GATE',
 'console.anthropic.com > Privacy Settings. Confirm training data usage is disabled.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000007',
 'Jon', '2026-05-05', '30000000-0000-0000-0000-000000000027',
 'STOP GATE. Required before P0-11 (Clarity fix) can be signed off.',
 6),

-- Task Group 8: Compliance — Breach Logging

('30000000-0000-0000-0000-000000000039',
 'P0-12: Build breach_log table in Supabase — STOP GATE',
 'Append-only breach log table. DPO lead write access only. Never deleted. Required for GDPR/UK GDPR compliance.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000008',
 'Claude Code', '2026-05-09', '30000000-0000-0000-0000-000000000034',
 'STOP GATE. Depends on Supabase DPA being signed (P0-6) first.',
 1),

('30000000-0000-0000-0000-000000000040',
 'P0-13: Add data_breach incident type to PM layer — STOP GATE',
 '72-hour regulatory notification trigger and 48-hour internal alert. Feeds incident task creation in PM tool.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000008',
 'Claude Code', '2026-05-12', '30000000-0000-0000-0000-000000000039',
 'STOP GATE.',
 2),

-- Task Group 9: B2B Scraper Compliance

('30000000-0000-0000-0000-000000000041',
 'P0-14: B2B scraper — robots.txt compliance',
 'Parse robots.txt before any domain visit. Respect all Disallow rules. Log compliance check result per domain.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000009',
 'Claude Code', '2026-05-14', '30000000-0000-0000-0000-000000000029',
 'Depends on infrastructure as code (P0-2) being in place.',
 1),

('30000000-0000-0000-0000-000000000042',
 'P0-15: B2B scraper — contact classification',
 'Classify scraped contacts as: corporate_entity / individual_named_contact / sole_trader. Classification drives routing decision.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000009',
 'Claude Code', '2026-05-14', '30000000-0000-0000-0000-000000000041',
 NULL, 2),

('30000000-0000-0000-0000-000000000043',
 'P0-16: B2B scraper — hold queue routing',
 'corporate_entity → Klaviyo pipeline. individual_named_contact / sole_trader → hold queue for manual review. Never auto-contact named individuals.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000009',
 'Claude Code', '2026-05-14', '30000000-0000-0000-0000-000000000042',
 NULL, 3),

-- Task Group 10: API Credentials & Baselines

('30000000-0000-0000-0000-000000000044',
 'P0-17: Amazon SP-API app client creation — CRITICAL PATH — Catherine action required',
 'Catherine logs into Solution Provider Portal. Clicks Add new app client. Selects 5 required roles. Sends Client ID and Client Secret to Jon via secure channel. Approval is already done. App client is not yet created.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000010',
 'Catherine', '2026-05-05', '30000000-0000-0000-0000-000000000027',
 'CRITICAL PATH. Every week of delay here delays Phase 1 by one week. Action immediately.',
 1),

('30000000-0000-0000-0000-000000000045',
 'P0-18: Store all API credentials in Azure Key Vault',
 'Store: Amazon SP-API (Client ID + Secret), Shopify, Google Ads, Meta Ads, Klaviyo, Supabase service role. All connectors read credentials from Key Vault only — never from code.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000010',
 'Jon', '2026-05-12', '30000000-0000-0000-0000-000000000044',
 'Depends on Key Vault (P0-1) being live AND Catherine sending Amazon credentials (P0-17).',
 2),

('30000000-0000-0000-0000-000000000046',
 'P0-22: Performance baselines export — 12 months of historical data',
 'Export 12 months of data from Amazon, Google Ads, and Meta Ads. Load into Supabase baselines tables. Required before Phase 2 anomaly detection can function.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000010',
 'Jon', '2026-05-16', '30000000-0000-0000-0000-000000000027',
 'Can run in parallel with other Phase 0 tasks once data platform access is confirmed. Blocks Phase 2 anomaly detection (P2-2).',
 3),

-- Task Group 11: Knowledge Base

('30000000-0000-0000-0000-000000000047',
 'P0-19: SharePoint knowledge base — folder structure',
 'Create /doddl-knowledge-base/ with subfolders: ai-os, agents, workflows, people-and-roles, products, brand.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000011',
 'Jon', '2026-05-05', NULL,
 'No dependencies. Can start immediately — does not need PM tool to be live.',
 1),

('30000000-0000-0000-0000-000000000048',
 'P0-20: Populate brand-blueprint.md — Laura',
 'Voice, tone, vocabulary, permitted claims, prohibitions, brand personality. First and most critical foundation document. Used by copy agent, creative QA agent, and all content-facing agents.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000011',
 'Laura', '2026-05-09', '30000000-0000-0000-0000-000000000047',
 'Laura owns this document entirely. No agent touching content can be built correctly without it.',
 2),

('30000000-0000-0000-0000-000000000049',
 'P0-21: Register Microsoft Graph API service account',
 'Read-only access to knowledge base SharePoint folder. Credentials stored in Azure Key Vault.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000011',
 'Jon', '2026-05-12', '30000000-0000-0000-0000-000000000028',
 'Depends on Key Vault (P0-1) being live.',
 3);


-- ================================================================
-- PHASE 1 — DATA PIPELINE
-- ================================================================

INSERT INTO tasks (id, title, description, status, priority, project_id, group_id, assigned_to, due_date, depends_on, notes, position) VALUES

-- Task Group 12: Amazon Connectors

('30000000-0000-0000-0000-000000000050',
 'P1-1: Amazon SP-API connector — UK marketplace',
 'Reports API preferred over individual calls. Pull: sales, inventory, listings, fees. Append-only writes to Supabase. Scheduled via cron. Credentials from Key Vault only.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000012',
 'Claude Code', '2026-05-30', '30000000-0000-0000-0000-000000000045',
 'UK connector is the template all other marketplace connectors are built from. Get this right first.',
 1),

('30000000-0000-0000-0000-000000000051',
 'P1-2: Amazon SP-API connector — US marketplace',
 'Same pattern as UK connector. Different marketplace ID.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000012',
 'Claude Code', '2026-06-06', '30000000-0000-0000-0000-000000000050',
 NULL, 2),

('30000000-0000-0000-0000-000000000052',
 'P1-3: Amazon SP-API connector — CA marketplace',
 'Same pattern as UK connector. Different marketplace ID.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000012',
 'Claude Code', '2026-06-06', '30000000-0000-0000-0000-000000000050',
 NULL, 3),

('30000000-0000-0000-0000-000000000053',
 'P1-4: Amazon SP-API connector — EU marketplace',
 'EU = DE/FR/IT/ES under one account. Single connector, multiple marketplace IDs.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000012',
 'Claude Code', '2026-06-13', '30000000-0000-0000-0000-000000000050',
 NULL, 4),

('30000000-0000-0000-0000-000000000054',
 'P1-5: Amazon SP-API connector — JP marketplace',
 'Same pattern as UK connector. Different marketplace ID.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000012',
 'Claude Code', '2026-06-13', '30000000-0000-0000-0000-000000000050',
 NULL, 5),

('30000000-0000-0000-0000-000000000055',
 'P1-6: Amazon Ads connector',
 'Separate API from SP-API. Pull: Sponsored Products, Sponsored Brands, Sponsored Display campaign performance data.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000012',
 'Claude Code', '2026-06-20', '30000000-0000-0000-0000-000000000045',
 'Different API endpoint from SP-API. Same credential set — different access scope.',
 6),

-- Task Group 13: Other Platform Connectors

('30000000-0000-0000-0000-000000000056',
 'P1-7: Shopify connector',
 'Pull: orders, products, inventory, revenue. Append-only writes. Credentials from Key Vault. Cron scheduled.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000013',
 'Claude Code', '2026-06-06', '30000000-0000-0000-0000-000000000045',
 NULL, 1),

('30000000-0000-0000-0000-000000000057',
 'P1-8: Google Ads connector',
 'Pull: campaign, ad group, keyword performance. Append-only writes. Credentials from Key Vault. Cron scheduled.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000013',
 'Claude Code', '2026-06-06', '30000000-0000-0000-0000-000000000045',
 NULL, 2),

('30000000-0000-0000-0000-000000000058',
 'P1-9: Meta Ads connector',
 'Pull: campaign, ad set, creative performance. Append-only writes. Credentials from Key Vault. Cron scheduled.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000013',
 'Claude Code', '2026-06-06', '30000000-0000-0000-0000-000000000045',
 NULL, 3),

('30000000-0000-0000-0000-000000000059',
 'P1-10: Klaviyo connector',
 'Pull: email campaign and flow performance. Append-only writes. Credentials from Key Vault. Cron scheduled.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000013',
 'Claude Code', '2026-06-13', '30000000-0000-0000-0000-000000000033',
 'Depends on Klaviyo DPA signed (P0-5) AND credentials in Key Vault (P0-18).',
 4),

-- Task Group 14: Pipeline Monitoring

('30000000-0000-0000-0000-000000000060',
 'P1-11: Pipeline monitoring dashboard',
 'Connector health view in PM layer. Per connector: last run timestamp, status, rows pulled, error count. All 10 connectors visible in one view.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000014',
 'Claude Code', '2026-06-27', '30000000-0000-0000-0000-000000000059',
 'Depends on all 10 connectors (P1-1 through P1-10) being built.',
 1),

('30000000-0000-0000-0000-000000000061',
 'P1-12: Connector error alerting',
 'Failed connector automatically creates an incident task in PM layer assigned to Jon.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000014',
 'Claude Code', '2026-06-27', '30000000-0000-0000-0000-000000000060',
 NULL, 2);


-- ================================================================
-- PHASE 2 — INTELLIGENCE LAYER
-- Gate: Phase 1 must be stable for 2 weeks (~11 July 2026)
-- ================================================================

INSERT INTO tasks (id, title, description, status, priority, project_id, group_id, assigned_to, due_date, depends_on, notes, position) VALUES

-- Task Group 15: Design & Rules

('30000000-0000-0000-0000-000000000062',
 'P2-1: Master intelligence agent design spec',
 'Jon and Claude Code define: briefing content structure, anomaly detection approach, priority ranking logic, delivery mechanism. Output is a written design spec before any build begins.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000015',
 'Jon', '2026-07-11', '30000000-0000-0000-0000-000000000061',
 'Gate: Phase 1 stable for 2 weeks before this starts. Estimated earliest start: ~27 June 2026.',
 1),

('30000000-0000-0000-0000-000000000063',
 'P2-2: Anomaly detection rules definition',
 'Jon defines thresholds per metric per marketplace. What is the definition of an anomaly for each data point? This drives the intelligence agent logic.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000015',
 'Jon', '2026-07-18', '30000000-0000-0000-0000-000000000046',
 'Depends on performance baselines being loaded (P0-22). Jon defines the rules — Claude Code builds to them.',
 2),

-- Task Group 16: Build

('30000000-0000-0000-0000-000000000064',
 'P2-3: Daily briefing agent build',
 'Reads from Supabase. Compares current metrics to baselines. Detects anomalies against defined rules. Produces structured daily briefing.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000016',
 'Claude Code', '2026-08-01', '30000000-0000-0000-0000-000000000063',
 NULL, 1),

('30000000-0000-0000-0000-000000000065',
 'P2-4: Briefing delivery mechanism — DECISION PENDING',
 'Build the delivery mechanism for the daily briefing. Options: email, Slack, or PM layer dashboard. Decision is open — Jon must decide before Claude Code can build.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000016',
 'Jon', '2026-08-08', '30000000-0000-0000-0000-000000000064',
 'Open question #2. Jon decides delivery mechanism. Assign to Claude Code once decided.',
 2),

('30000000-0000-0000-0000-000000000066',
 'P2-5: Business intelligence dashboard',
 'Visual dashboard in PM layer. Data by marketplace, channel, product. Agent health status view.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000016',
 'Claude Code', '2026-08-15', '30000000-0000-0000-0000-000000000064',
 NULL, 3),

('30000000-0000-0000-0000-000000000067',
 'P2-6: Briefing QA agent',
 'Validates briefing output before delivery. Checks for hallucinations, missing data segments, threshold breaches. Nothing leaves without QA agent approval.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000016',
 'Claude Code', '2026-08-22', '30000000-0000-0000-0000-000000000064',
 NULL, 4),

-- Task Group 17: Validation

('30000000-0000-0000-0000-000000000068',
 'P2-7: 2-week stable monitoring period — Phase 3 gate',
 'Run briefing agent live for 2 weeks. Jon reviews every briefing output. Calibrate anomaly thresholds. Jon signs off before Phase 3 begins.',
 'not_started', 'critical',
 '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000017',
 'Jon', '2026-09-05', '30000000-0000-0000-0000-000000000067',
 'HARD GATE. Phase 3 does not start until Jon formally signs off on this 2-week period.',
 1);


-- ================================================================
-- PHASE 3 — SPECIALIST AGENTS
-- Gate: Phase 2 validated (task 68 signed off)
-- ================================================================

INSERT INTO tasks (id, title, description, status, priority, project_id, group_id, assigned_to, due_date, depends_on, notes, position) VALUES

-- Task Group 18: Copy Agents

('30000000-0000-0000-0000-000000000069',
 'P3-1: Copy agent — Amazon product listings',
 'Generates Amazon listing copy: title, bullets, A+ description. Output goes to PM layer approval queue. Laura reviews and approves before any listing change is made.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000018',
 'Claude Code', '2026-09-26', '30000000-0000-0000-0000-000000000068',
 'Laura is the approver for all copy output. Brand blueprint (P0-20) must be complete before this agent is built.',
 1),

('30000000-0000-0000-0000-000000000070',
 'P3-2: Copy agent QA',
 'Validates copy against brand blueprint, permitted claims, and Amazon character limits. Nothing reaches Laura without passing QA agent first.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000018',
 'Claude Code', '2026-10-03', '30000000-0000-0000-0000-000000000069',
 NULL, 2),

-- Task Group 19: PPC Agents

('30000000-0000-0000-0000-000000000071',
 'P3-3: PPC recommendation agent — Amazon Ads',
 'Analyses Amazon Ads campaign data. Recommends bid changes and budget reallocation. Jon reviews and approves before any change is executed.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000019',
 'Claude Code', '2026-09-26', '30000000-0000-0000-0000-000000000068',
 NULL, 1),

('30000000-0000-0000-0000-000000000072',
 'P3-4: PPC recommendation agent QA',
 'Validates recommendations against business rules before submission to PM layer for Jon review.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000019',
 'Claude Code', '2026-10-03', '30000000-0000-0000-0000-000000000071',
 NULL, 2),

('30000000-0000-0000-0000-000000000073',
 'P3-5: PPC recommendation agent — Google Ads',
 'Same pattern as Amazon PPC agent. Google Ads campaign and keyword data.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000019',
 'Claude Code', '2026-10-17', '30000000-0000-0000-0000-000000000072',
 NULL, 3),

('30000000-0000-0000-0000-000000000074',
 'P3-6: PPC recommendation agent — Meta Ads',
 'Same pattern as Amazon PPC agent. Meta Ads campaign, ad set, and creative performance data.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000019',
 'Claude Code', '2026-10-17', '30000000-0000-0000-0000-000000000072',
 NULL, 4),

-- Task Group 20: Other Agents

('30000000-0000-0000-0000-000000000075',
 'P3-7: Image brief agent',
 'Generates creative briefs for ad imagery based on performance data and brand blueprint. Briefs go to PM layer for Laura review before any creative work begins.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000020',
 'Claude Code', '2026-10-17', '30000000-0000-0000-0000-000000000068',
 NULL, 1),

('30000000-0000-0000-0000-000000000076',
 'P3-8: SEO agent',
 'Monitors keyword rankings across marketplaces. Generates optimisation recommendations. Jon reviews.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000020',
 'Claude Code', '2026-10-17', '30000000-0000-0000-0000-000000000068',
 NULL, 2),

('30000000-0000-0000-0000-000000000077',
 'P3-9: B2B outreach agent',
 'Manages B2B prospect pipeline. Routes corporate entities to Klaviyo. Routes named individuals and sole traders to hold queue for manual review. Never auto-contacts individuals.',
 'not_started', 'low',
 '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000020',
 'Claude Code', '2026-11-14', '30000000-0000-0000-0000-000000000043',
 'Depends on full B2B scraper compliance chain (P0-14, P0-15, P0-16) being complete.',
 3),

('30000000-0000-0000-0000-000000000078',
 'P3-10: Agent graduation protocol',
 'Tier 1 (draft only) → Tier 2 (post with review) → Tier 3 (autonomous within limits). 10 consecutive passes required per tier before advancement to next tier.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000020',
 'Jon', '2026-11-14', '30000000-0000-0000-0000-000000000069',
 'Governance layer. Applies to all specialist agents. Jon defines the protocol — Claude Code implements the tracking.',
 4);


-- ================================================================
-- PHASE 4 — CREATIVE AI STACK
-- Gate: Phase 3 agents stable
-- ================================================================

INSERT INTO tasks (id, title, description, status, priority, project_id, group_id, assigned_to, due_date, depends_on, notes, position) VALUES

-- Task Group 21: Creative Pipeline

('30000000-0000-0000-0000-000000000079',
 'P4-1: Image generation pipeline — PROVIDER DECISION PENDING',
 'Build image generation pipeline. Provider options: DALL-E 3 API (£236/mo) vs Midjourney Pro (£47/mo flat). Midjourney saves £189/mo. Jon and Laura to decide before build begins.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000021',
 'Claude Code', '2026-12-19', '30000000-0000-0000-0000-000000000078',
 'Open question #1. Jon/Laura decide on provider. Assign to Claude Code once decided.',
 1),

('30000000-0000-0000-0000-000000000080',
 'P4-2: Video generation pipeline',
 'Kling API at $0.112 per second. 30-second video ≈ £17. Budget: 50 videos per month. Total ≈ £850/month for video generation.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000021',
 'Claude Code', '2026-12-19', '30000000-0000-0000-0000-000000000079',
 NULL, 2),

('30000000-0000-0000-0000-000000000081',
 'P4-3: Audio/voiceover pipeline',
 'ElevenLabs Creator plan at $22/month. 50 videos × 2,000 characters = within plan limits.',
 'not_started', 'medium',
 '10000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000021',
 'Claude Code', '2027-01-09', '30000000-0000-0000-0000-000000000080',
 NULL, 3),

-- Task Group 22: QA

('30000000-0000-0000-0000-000000000082',
 'P4-4: Creative QA agent',
 'Validates all generated creative against brand blueprint before submission to PM layer for human approval. No creative reaches the team without QA agent sign-off.',
 'not_started', 'high',
 '10000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000022',
 'Claude Code', '2027-01-09', '30000000-0000-0000-0000-000000000079',
 'Brand blueprint (P0-20) is a hard input requirement. Cannot be built correctly without it.',
 1);


COMMIT;

-- ================================================================
-- VERIFICATION QUERIES — run after COMMIT to confirm row counts
-- ================================================================
-- SELECT COUNT(*) FROM projects;       -- expect 6
-- SELECT COUNT(*) FROM task_groups;    -- expect 22
-- SELECT COUNT(*) FROM tasks;          -- expect 82
--
-- To view the full structure:
-- SELECT p.name AS project, tg.name AS task_group, t.title, t.assigned_to, t.status, t.priority, t.due_date
-- FROM tasks t
-- JOIN projects p ON t.project_id = p.id
-- JOIN task_groups tg ON t.group_id = tg.id
-- ORDER BY p.name, tg.position, t.position;
-- ================================================================
