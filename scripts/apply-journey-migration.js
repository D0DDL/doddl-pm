// scripts/apply-journey-migration.js
// Applies lib/migrations/doddl_journey_migration.sql to staging first and,
// only if staging verifies, to production. Verifies via Management API:
//   - 12 task_groups for project 10000000…009
//   - 145 tasks for project 10000000…009
//   - project.name === 'Developmental Journey — Website'

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

const STAGING_REF = 'iknwprxycshrickpswjz'
const PROD_REF    = 'ikcjciscttsvpxoijnqe'
const PROJECT_ID  = '10000000-0000-0000-0000-000000000009'
const MIGRATION_FILE = 'lib/migrations/doddl_journey_migration.sql'
const EXPECT_TASKS  = 145
const EXPECT_GROUPS = 12
const EXPECT_NAME   = 'Developmental Journey — Website'

async function sbQuery(ref, query) {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SB}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`${resp.status}: ${text.slice(0, 800)}`)
  try { return JSON.parse(text) } catch { return text }
}

async function verify(label, ref) {
  const proj   = await sbQuery(ref, `select id, name, start_date, due_date, priority from projects where id = '${PROJECT_ID}';`)
  const groups = await sbQuery(ref, `select count(*)::int as n from task_groups where project_id = '${PROJECT_ID}';`)
  const tasks  = await sbQuery(ref, `select count(*)::int as n from tasks where project_id = '${PROJECT_ID}';`)

  const p = proj[0] || {}
  const g = groups[0]?.n
  const t = tasks[0]?.n
  const okName   = p.name === EXPECT_NAME
  const okGroups = g === EXPECT_GROUPS
  const okTasks  = t === EXPECT_TASKS

  console.log(`\n${label} verification:`)
  console.log(`  project.name  = ${JSON.stringify(p.name)}  ${okName   ? 'OK' : 'FAIL'}`)
  console.log(`  task_groups   = ${g} / ${EXPECT_GROUPS}${okGroups ? '  OK' : '  FAIL'}`)
  console.log(`  tasks         = ${t} / ${EXPECT_TASKS}${okTasks ? '  OK' : '  FAIL'}`)
  console.log(`  dates         = ${p.start_date} → ${p.due_date}  priority=${p.priority}`)
  return okName && okGroups && okTasks
}

async function applyTo(label, ref) {
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8')
  process.stdout.write(`→ Applying to ${label} (${ref})  size=${sql.length} chars … `)
  await sbQuery(ref, sql)
  console.log('OK')
}

async function main() {
  console.log(`— Journey migration apply —\n`)

  await applyTo('STAGING   ', STAGING_REF)
  const stagingOk = await verify('STAGING   ', STAGING_REF)
  if (!stagingOk) throw new Error('Staging verification failed — refusing to touch production.')

  await applyTo('PRODUCTION', PROD_REF)
  const prodOk = await verify('PRODUCTION', PROD_REF)
  if (!prodOk) throw new Error('Production verification failed — inspect manually.')

  console.log('\nDONE.')
}

main().catch(e => { console.error('\nFAILED:', e.message || e); process.exit(1) })
