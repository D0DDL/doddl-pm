// scripts/prod-preflight.js — before seeding production, figure out what's
// already there and whether the seed UUIDs will collide.

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
  if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`)
  return resp.json()
}

function extractUuids(sql, prefix) {
  // Match opening tuple rows that start with a UUID having the given 4-char prefix
  const re = new RegExp(`\\('(${prefix}[0-9a-f-]{32})'`, 'g')
  const set = new Set()
  let m; while ((m = re.exec(sql)) !== null) set.add(m[1])
  return [...set]
}

async function main() {
  const aiSql  = fs.readFileSync('lib/migrations/doddl_ai_os_seed.sql', 'utf8')
  const bizSql = fs.readFileSync('lib/migrations/doddl_business_projects_seed.sql', 'utf8')

  // UUID prefixes used in the seeds: projects=1000…, task_groups=2000…, tasks=3000…
  const seedProjects = new Set([...extractUuids(aiSql, '1000'), ...extractUuids(bizSql, '1000')])
  const seedGroups   = new Set([...extractUuids(aiSql, '2000'), ...extractUuids(bizSql, '2000')])
  const seedTasks    = new Set([...extractUuids(aiSql, '3000'), ...extractUuids(bizSql, '3000')])

  console.log(`Seed contents (union of both files):`)
  console.log(`  projects    : ${seedProjects.size}`)
  console.log(`  task_groups : ${seedGroups.size}`)
  console.log(`  tasks       : ${seedTasks.size}`)

  // What's already in production?
  const projRows = await sbQuery(`select id, name from projects;`)
  const grpRows  = await sbQuery(`select id, name from task_groups;`)
  const taskRows = await sbQuery(`select id, title from tasks;`)

  console.log(`\nProduction contents today:`)
  console.log(`  projects    : ${projRows.length}`)
  console.log(`  task_groups : ${grpRows.length}`)
  console.log(`  tasks       : ${taskRows.length}`)
  for (const p of projRows) console.log(`    • ${p.id}  ${p.name}`)

  // Collisions
  const prodProjSet  = new Set(projRows.map(r => r.id))
  const prodGroupSet = new Set(grpRows.map(r => r.id))
  const prodTaskSet  = new Set(taskRows.map(r => r.id))

  const projCollisions = [...seedProjects].filter(id => prodProjSet.has(id))
  const grpCollisions  = [...seedGroups].filter(id   => prodGroupSet.has(id))
  const taskCollisions = [...seedTasks].filter(id    => prodTaskSet.has(id))

  console.log(`\nUUID collisions (seed ID already present in prod):`)
  console.log(`  projects    : ${projCollisions.length}`)
  console.log(`  task_groups : ${grpCollisions.length}`)
  console.log(`  tasks       : ${taskCollisions.length}`)

  console.log(`\nMath check — expected final totals after both seeds apply cleanly:`)
  console.log(`  projects    : ${prodProjSet.size + seedProjects.size - projCollisions.length}  (user expects 11)`)
  console.log(`  task_groups : ${prodGroupSet.size + seedGroups.size - grpCollisions.length}  (user expects 32)`)
  console.log(`  tasks       : ${prodTaskSet.size + seedTasks.size - taskCollisions.length}  (user expects 112)`)

  // Does either seed file use ON CONFLICT?
  const aiHasOnConflict  = /on\s+conflict/i.test(aiSql)
  const bizHasOnConflict = /on\s+conflict/i.test(bizSql)
  console.log(`\nSeed conflict handling:`)
  console.log(`  ai_os_seed.sql              uses ON CONFLICT: ${aiHasOnConflict}`)
  console.log(`  business_projects_seed.sql  uses ON CONFLICT: ${bizHasOnConflict}`)
}

main().catch(e => { console.error('FAIL:', e.message || e); process.exit(1) })
