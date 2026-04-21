// scripts/verify-prod-state.js — investigates production Supabase content
// (why 82 tasks?) and Vercel env-var decrypt behaviour.

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

const VC = process.env.VERCEL_TOKEN
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

async function main() {
  console.log('Production Supabase inventory:\n')

  const projCount = await sbQuery(`select count(*)::int as n from projects;`)
  const taskCount = await sbQuery(`select count(*)::int as n from tasks;`)
  const groupCount = await sbQuery(`select count(*)::int as n from task_groups;`)
  console.log(`  projects: ${projCount[0].n}`)
  console.log(`  task_groups: ${groupCount[0].n}`)
  console.log(`  tasks: ${taskCount[0].n}`)

  const projects = await sbQuery(`select id, name, status, start_date, due_date from projects order by name;`)
  console.log('\nProjects in production:')
  for (const p of projects) {
    console.log(`  • ${p.name}  [${p.status}]  ${p.start_date || '—'} → ${p.due_date || '—'}`)
  }

  console.log('\nVercel env-var decrypt check:')
  // 1. Try decrypt=true on the list endpoint
  const r1 = await fetch(`https://api.vercel.com/v10/projects/doddl-pm/env?decrypt=true`, {
    headers: { Authorization: `Bearer ${VC}` },
  })
  const j1 = await r1.json()
  const ak = (j1.envs || []).find(e => e.key === 'AGENT_SERVICE_KEY' && (e.target || []).includes('production'))
  console.log(`  list?decrypt=true  → value prefix: ${ak?.value?.slice(0, 10)} (expected 'adk_prod_…')`)

  // 2. Try the per-id endpoint (some versions of the API only decrypt via GET {id})
  if (ak?.id) {
    const r2 = await fetch(`https://api.vercel.com/v1/projects/doddl-pm/env/${ak.id}`, {
      headers: { Authorization: `Bearer ${VC}` },
    })
    const j2 = await r2.json()
    console.log(`  v1/env/{id}        → value prefix: ${j2?.value?.slice(0, 10) || 'n/a'}`)
  }
}

main().catch(e => { console.error('FAIL:', e.message || e); process.exit(1) })
