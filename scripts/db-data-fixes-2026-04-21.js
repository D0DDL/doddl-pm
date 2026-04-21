// scripts/db-data-fixes-2026-04-21.js
// Three data fixes against staging Supabase (iknwprxycshrickpswjz):
//   1. Rename assigned_to 'Catherine' -> 'Cat' on all tasks
//      (lib/team.js roster uses 'Cat'; seed data wrote 'Catherine' literal)
//   2. Backfill start_date on tasks where it's null
//      start_date = depends_on.due_date if present, else project.start_date
//      (seed only populated due_date; TimelineCell shows red "Start*" when start is null)
//   3. Update PM Tool Build tasks assigned to Claude to reflect code reality
//      (components/files actually present in the repo -> done/100, otherwise leave)
//
// Run: node scripts/db-data-fixes-2026-04-21.js

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadDotEnv(p) {
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const k = line.slice(0, eq).trim()
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
}

// Status updates: PM Tool Build tasks owned by Claude where code evidence is unambiguous.
// Key = title (user asked for title-based matching).
// Leaf-component extraction, API routes, and RLS migration file are objectively present.
// Step 10 (index.js < 150 lines) is PARTIAL — current line count is 170, so in_progress ~85.
// Step 12 (Next.js 14.2 upgrade) is NOT done — package.json pins 14.1.0 — left alone (not_started, 0).
// Step 22 (immutable decision recording) — enforced server-side for agents but anon UI path
//   relies on ApprovalTaskPanel client check only; mark in_progress 70 to reflect that gap.
const CLAUDE_TASK_UPDATES = [
  { title: '[Step 1] Create lib/constants.js, lib/team.js, lib/msal.js',                                                                                  status: 'done',        progress: 100 },
  { title: '[Step 2] Extract leaf components — StatusBadge, PriorityBadge, AssigneeSelect, TagsCell, ProgressBar, InlineEdit, DateCell, OwnerAvatar',     status: 'done',        progress: 100 },
  { title: '[Step 3] Extract CalendarPicker, TimelineCell, LoginScreen',                                                                                  status: 'done',        progress: 100 },
  { title: '[Step 4] Extract CommentBody, MentionInput, TaskDetailPanel',                                                                                 status: 'done',        progress: 100 },
  { title: '[Step 5] Extract ProjectTableRow, ProjectGroup, ProjectDashboard, TaskRow',                                                                   status: 'done',        progress: 100 },
  { title: '[Step 6] Extract KanbanBoard, GanttView',                                                                                                     status: 'done',        progress: 100 },
  { title: '[Step 7] Extract ProjectSection',                                                                                                             status: 'done',        progress: 100 },
  { title: '[Step 8] Extract AddTaskModal, AddProjectModal',                                                                                              status: 'done',        progress: 100 },
  { title: '[Step 9] Extract MyWorkView (with MwTaskTable + MwSection)',                                                                                  status: 'done',        progress: 100 },
  { title: '[Step 10] Reduce pages/index.js to <150-line shell + smoke test',                                                                             status: 'in_progress', progress: 85  },
  { title: '[Step 11] Add REST API scaffolding — pages/api/projects.js + pages/api/task-groups.js',                                                       status: 'done',        progress: 100 },
  // Step 12 Next.js upgrade — package.json still 14.1.0; not started.
  { title: 'Build lib/agentAuth.js — agent authentication middleware',                                                                                    status: 'done',        progress: 100 },
  { title: 'Build pages/api/agent/tasks.js',                                                                                                              status: 'done',        progress: 100 },
  { title: 'Build pages/api/agent/artefacts.js',                                                                                                          status: 'done',        progress: 100 },
  { title: 'Implement rate limiting on agent routes',                                                                                                     status: 'done',        progress: 100 },
  { title: 'Build lib/artefactTypes.js',                                                                                                                  status: 'done',        progress: 100 },
  { title: 'Build components/ApprovalTaskPanel.jsx',                                                                                                      status: 'done',        progress: 100 },
  { title: 'Implement immutable decision recording logic',                                                                                                status: 'in_progress', progress: 70  },
  { title: 'Write RLS migration SQL — three role-based policy levels',                                                                                    status: 'done',        progress: 100 },
]

async function main() {
  loadDotEnv(path.join(process.cwd(), '.env.local'))

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  if (!url.includes('iknwprxycshrickpswjz')) throw new Error(`Refusing to run — URL is not staging (${url})`)

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  // ──────────────────────────────────────────────────────────────
  // 1. Rename Catherine -> Cat on tasks
  // ──────────────────────────────────────────────────────────────
  const { data: catRows, error: catErr } = await supabase
    .from('tasks').update({ assigned_to: 'Cat' }).eq('assigned_to', 'Catherine').select('id')
  if (catErr) throw catErr
  console.log(`1. Renamed Catherine -> Cat on ${catRows?.length ?? 0} task row(s)`)

  // ──────────────────────────────────────────────────────────────
  // 2. Backfill start_date for tasks where it's null
  //    Prefer blocking-task.due_date if available; else project.start_date.
  // ──────────────────────────────────────────────────────────────
  const { data: tasks, error: taskErr } = await supabase
    .from('tasks').select('id, project_id, start_date, due_date, depends_on').is('start_date', null)
  if (taskErr) throw taskErr

  const { data: projects, error: projErr } = await supabase
    .from('projects').select('id, start_date')
  if (projErr) throw projErr
  const projectStart = new Map(projects.map(p => [p.id, p.start_date]))

  // All tasks (including those already with start_date) so we can look up depends_on.due_date
  const { data: allTasks, error: allErr } = await supabase
    .from('tasks').select('id, due_date')
  if (allErr) throw allErr
  const taskDue = new Map(allTasks.map(t => [t.id, t.due_date]))

  let filled = 0, skipped = 0
  for (const t of tasks) {
    let start = null
    if (t.depends_on && taskDue.get(t.depends_on)) start = taskDue.get(t.depends_on)
    else if (projectStart.get(t.project_id))       start = projectStart.get(t.project_id)

    // Guard: start must not be after due_date.
    if (start && t.due_date && new Date(start) > new Date(t.due_date)) {
      const d = new Date(t.due_date); d.setDate(d.getDate() - 3)
      start = d.toISOString().slice(0, 10)
    }

    if (!start) { skipped++; continue }
    const { error } = await supabase.from('tasks').update({ start_date: start }).eq('id', t.id)
    if (error) throw error
    filled++
  }
  console.log(`2. Backfilled start_date on ${filled} task(s); ${skipped} skipped (no source date)`)

  // ──────────────────────────────────────────────────────────────
  // 3. Update Claude's PM Tool Build task statuses to match code reality
  // ──────────────────────────────────────────────────────────────
  const PM_TOOL_BUILD_ID = '10000000-0000-0000-0000-000000000001'
  let updated = 0, notFound = 0
  for (const u of CLAUDE_TASK_UPDATES) {
    const { data, error } = await supabase
      .from('tasks')
      .update({ status: u.status, progress: u.progress })
      .eq('project_id', PM_TOOL_BUILD_ID)
      .eq('title', u.title)
      .select('id')
    if (error) throw error
    if (!data || data.length === 0) { notFound++; console.warn(`   (not found) ${u.title.slice(0, 80)}`) }
    else                             { updated++ }
  }
  console.log(`3. Updated ${updated} PM Tool Build task(s); ${notFound} title(s) not matched`)

  // ──────────────────────────────────────────────────────────────
  // Verification read
  // ──────────────────────────────────────────────────────────────
  const { data: verify } = await supabase
    .from('tasks')
    .select('title, status, progress, assigned_to, start_date')
    .eq('project_id', PM_TOOL_BUILD_ID)
    .eq('assigned_to', 'Claude')
    .order('position', { ascending: true })
  console.log('\nVerification — PM Tool Build tasks assigned to Claude:')
  for (const r of verify || []) {
    console.log(`   [${r.status.padEnd(12)}] ${String(r.progress).padStart(3)}%  start=${r.start_date || '   —    '}  ${r.title.slice(0, 70)}`)
  }
}

main().catch(e => { console.error('FAILED:', e); process.exit(1) })
