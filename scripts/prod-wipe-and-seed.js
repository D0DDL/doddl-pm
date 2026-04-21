// scripts/prod-wipe-and-seed.js
// DESTRUCTIVE. Wipes all row data from production Supabase, then applies
// doddl_ai_os_seed.sql and doddl_business_projects_seed.sql in order.
//
// Authorised by Jon 2026-04-21 (option A in the wipe-vs-additive choice).
// Ordinary Hard Rule 2 (no row writes to prod) is suspended for this single run.
//
// Row counts snapshotted before wipe for the audit trail.

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
const REF = 'ikcjciscttsvpxoijnqe'

async function sbQuery(q) {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SB}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`${resp.status}: ${text.slice(0, 500)}`)
  try { return JSON.parse(text) } catch { return text }
}

async function counts(label) {
  const out = {}
  for (const t of ['projects', 'task_groups', 'tasks', 'comments', 'notifications', 'agent_audit_log']) {
    const r = await sbQuery(`select count(*)::int as n from ${t};`)
    out[t] = r[0]?.n ?? 0
  }
  console.log(`${label}  projects=${out.projects} task_groups=${out.task_groups} tasks=${out.tasks} comments=${out.comments} notifications=${out.notifications} agent_audit_log=${out.agent_audit_log}`)
  return out
}

async function main() {
  console.log('Before wipe:')
  const before = await counts('  ')

  // Snapshot sample of what we're destroying (first 5 projects + task titles), for the audit trail
  const sampleProjects = await sbQuery(`select id, name, owner from projects order by created_at limit 5;`)
  const sampleTasks    = await sbQuery(`select id, title, project_id from tasks order by created_at limit 10;`)
  console.log('\nSample of data about to be destroyed:')
  console.log('  projects:'); for (const p of sampleProjects) console.log(`    • ${p.name}  (owner=${p.owner || '—'})`)
  console.log('  first 10 tasks:'); for (const t of sampleTasks) console.log(`    • ${t.title?.slice(0, 80)}`)

  // ─────────────────────────────────────────────────────────────
  // WIPE — single statement, CASCADE handles FK order.
  // ─────────────────────────────────────────────────────────────
  console.log('\n→ TRUNCATE tasks, task_groups, projects, agent_audit_log, comments, notifications CASCADE')
  await sbQuery(`truncate table tasks, task_groups, projects, agent_audit_log, comments, notifications restart identity cascade;`)
  const afterWipe = await counts('After wipe:')
  for (const [k, v] of Object.entries(afterWipe)) {
    if (v !== 0) throw new Error(`Wipe left rows in ${k}: ${v}`)
  }

  // ─────────────────────────────────────────────────────────────
  // SEED 1 — doddl_ai_os_seed.sql
  // ─────────────────────────────────────────────────────────────
  console.log('\n→ Applying lib/migrations/doddl_ai_os_seed.sql')
  const aiSql = fs.readFileSync('lib/migrations/doddl_ai_os_seed.sql', 'utf8')
  await sbQuery(aiSql)
  const afterAi = await counts('After ai_os seed:')

  // ─────────────────────────────────────────────────────────────
  // SEED 2 — doddl_business_projects_seed.sql
  // ─────────────────────────────────────────────────────────────
  console.log('\n→ Applying lib/migrations/doddl_business_projects_seed.sql')
  const bizSql = fs.readFileSync('lib/migrations/doddl_business_projects_seed.sql', 'utf8')
  await sbQuery(bizSql)
  const afterBiz = await counts('After business seed:')

  // ─────────────────────────────────────────────────────────────
  // VERIFY
  // ─────────────────────────────────────────────────────────────
  const expected = { projects: 11, task_groups: 32, tasks: 112 }
  const mismatches = Object.entries(expected).filter(([k, v]) => afterBiz[k] !== v)

  console.log('\nFinal check vs expected (11 / 32 / 112):')
  for (const [k, v] of Object.entries(expected)) {
    const got = afterBiz[k]
    console.log(`  ${got === v ? 'OK  ' : 'FAIL'} ${k.padEnd(14)} got=${got} expected=${v}`)
  }
  if (mismatches.length) process.exit(1)

  // List all projects as a final sanity check
  const finalProjects = await sbQuery(`select id, name, owner from projects order by name;`)
  console.log('\nProjects now in production:')
  for (const p of finalProjects) console.log(`  • ${p.name}  (owner=${p.owner || '—'})`)

  console.log('\nDONE. Production seeded to 11 / 32 / 112.')
}

main().catch(e => { console.error('\nFAILED:', e.message || e); process.exit(1) })
