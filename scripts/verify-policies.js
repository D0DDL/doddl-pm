// scripts/verify-policies.js
// Queries pg_policies via the Supabase Management API (returns rows directly,
// unlike exec_sql which is void-returning). Dumps per-table counts + names.

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

async function runQuery(query) {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  const url   = process.env.NEXT_PUBLIC_SUPABASE_URL
  const ref   = url.match(/https:\/\/([^.]+)\.supabase\.co/)[1]
  const resp  = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query }),
  })
  if (!resp.ok) { console.error(`HTTP ${resp.status}:`, await resp.text()); process.exit(1) }
  return resp.json()
}

async function main() {
  loadDotEnv(path.join(process.cwd(), '.env.local'))
  if (!process.env.SUPABASE_ACCESS_TOKEN) { console.error('SUPABASE_ACCESS_TOKEN missing'); process.exit(1) }

  const rows = await runQuery(`
    select schemaname, tablename, policyname, cmd, roles::text as roles
    from pg_policies
    where schemaname = 'public'
      and tablename in ('projects','task_groups','tasks','comments','notifications','agent_audit_log')
    order by tablename, policyname;
  `)

  const byTable = {}
  for (const r of rows) { (byTable[r.tablename] ||= []).push(r) }

  const expected = {
    projects:        4,
    task_groups:     4,
    tasks:           4,
    comments:        2,
    notifications:   3,
    agent_audit_log: 0,
  }
  let allOk = true
  for (const t of Object.keys(expected)) {
    const list = byTable[t] || []
    const ok = list.length === expected[t]
    if (!ok) allOk = false
    console.log(`${ok ? 'OK ' : 'FAIL'}  ${t.padEnd(18)} policies=${list.length} (expected ${expected[t]})`)
    for (const r of list) console.log(`        • ${r.policyname} [${r.cmd}] roles=${r.roles}`)
  }
  process.exit(allOk ? 0 : 1)
}

main()
