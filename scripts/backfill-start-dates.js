// scripts/backfill-start-dates.js
// Backfills tasks.start_date for every task where it's null, using:
//   start_date = depends_on.due_date (if that task has a due_date)
//              else project.start_date
//              else due_date - 7 days (final fallback)
//
// Runs against BOTH staging (iknwprxycshrickpswjz) and production
// (ikcjciscttsvpxoijnqe) via the Supabase Management API. Both need this:
// the two seed files only populate due_date, never start_date, so the TimelineCell
// renders a red "Start*" placeholder until this runs.
//
// Usage: node scripts/backfill-start-dates.js

const fs = require('fs')
const path = require('path')

function loadDotEnv(p) {
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('='); if (eq === -1) continue
    const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
}
loadDotEnv(path.join(process.cwd(), '.env.local'))

const SB = process.env.SUPABASE_ACCESS_TOKEN
if (!SB) { console.error('SUPABASE_ACCESS_TOKEN missing'); process.exit(1) }

async function sbQuery(ref, query) {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SB}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`${resp.status}: ${text.slice(0, 500)}`)
  try { return JSON.parse(text) } catch { return text }
}

// Single SQL that covers all three cases in one UPDATE using COALESCE.
// Idempotent — WHERE start_date IS NULL means it only touches rows that need it.
const BACKFILL_SQL = `
update tasks t set start_date = coalesce(
  -- Case 1: predecessor task's due_date
  (select d.due_date from tasks d where d.id = t.depends_on),
  -- Case 2: the task's own project start_date
  (select p.start_date from projects p where p.id = t.project_id),
  -- Case 3: due_date minus 7 days
  case when t.due_date is not null then t.due_date - interval '7 days' end,
  -- Fallback: today (very rare; task with no due_date, no project, no dep)
  current_date
)::date
where t.start_date is null;
`

async function runAgainst(label, ref) {
  const before = await sbQuery(ref, `
    select
      count(*)::int as total,
      sum(case when start_date is null then 1 else 0 end)::int as missing
    from tasks;
  `)
  console.log(`${label} (${ref}) — before: total=${before[0].total} missing_start=${before[0].missing}`)

  if (before[0].missing === 0) {
    console.log(`${label} — nothing to backfill, skipping.`)
    return
  }

  await sbQuery(ref, BACKFILL_SQL)

  const after = await sbQuery(ref, `
    select
      count(*)::int as total,
      sum(case when start_date is null then 1 else 0 end)::int as missing
    from tasks;
  `)
  console.log(`${label} — after:  total=${after[0].total} missing_start=${after[0].missing}`)

  // Sanity — guard against start > due
  const bad = await sbQuery(ref, `
    select count(*)::int as n from tasks
    where start_date is not null and due_date is not null and start_date > due_date;
  `)
  if (bad[0].n > 0) {
    console.warn(`${label} — WARNING: ${bad[0].n} tasks have start_date > due_date, fixing…`)
    await sbQuery(ref, `update tasks set start_date = due_date - interval '1 day'
      where start_date is not null and due_date is not null and start_date > due_date;`)
  }
}

async function main() {
  await runAgainst('STAGING   ', 'iknwprxycshrickpswjz')
  await runAgainst('PRODUCTION', 'ikcjciscttsvpxoijnqe')
}

main().catch(e => { console.error('FAILED:', e.message || e); process.exit(1) })
