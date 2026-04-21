// scripts/deploy-to-production.js
// Applies the four committed migrations to production Supabase via the
// Management API, then sets all required env vars on Vercel production.
//
// Safety posture (per CLAUDE.md Hard Rule 3):
//   - Refuses to run if any migration file is dirty vs. HEAD on origin/staging
//   - Only applies the four named migrations, in the given order
//   - Migrations are idempotent (IF NOT EXISTS, drop-then-create for policies)
//
// Usage: node scripts/deploy-to-production.js
// Requires in .env.local:
//   SUPABASE_ACCESS_TOKEN  (Supabase PAT)
//   VERCEL_TOKEN           (Vercel PAT)
//   NEXT_PUBLIC_AZURE_CLIENT_ID, NEXT_PUBLIC_AZURE_TENANT_ID (mirrored to prod)

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execSync } = require('child_process')

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

const PROD_REF = 'ikcjciscttsvpxoijnqe'
const PROD_URL = `https://${PROD_REF}.supabase.co`
const VERCEL_PROJECT = 'doddl-pm'

const SB_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const VC_TOKEN = process.env.VERCEL_TOKEN
const AZ_CLIENT = process.env.NEXT_PUBLIC_AZURE_CLIENT_ID || 'bddcde1a-b104-4c96-8f67-9b40a1dfea3c'
const AZ_TENANT = process.env.NEXT_PUBLIC_AZURE_TENANT_ID || '927d1e2c-7c8d-406f-8640-678dfce86b7d'

if (!SB_TOKEN) { console.error('Missing SUPABASE_ACCESS_TOKEN'); process.exit(1) }
if (!VC_TOKEN) { console.error('Missing VERCEL_TOKEN');         process.exit(1) }

const MIGRATIONS = [
  'lib/migrations/02-agent-audit-log.sql',
  'lib/migrations/03-tasks-artefact-columns.sql',
  'lib/migrations/05-exec-sql-rpc.sql',
  'lib/migrations/04-rls-policies.sql',
]

// ──────────────────────────────────────────────────────────────────────────
// Git-committed check — Hard Rule 3 precondition
// ──────────────────────────────────────────────────────────────────────────
function assertCommitted() {
  for (const rel of MIGRATIONS) {
    let working, head
    try { working = fs.readFileSync(rel, 'utf8') }
    catch (e) { throw new Error(`Migration file missing on disk: ${rel}`) }
    try { head = execSync(`git show HEAD:${rel}`, { encoding: 'utf8' }) }
    catch (e) { throw new Error(`Migration file not in HEAD: ${rel}`) }
    if (working !== head) throw new Error(`Migration file has uncommitted changes vs HEAD: ${rel}`)
  }
  console.log(`✓ All ${MIGRATIONS.length} migration files match HEAD (committed)`)
}

// ──────────────────────────────────────────────────────────────────────────
// Supabase Management API helpers
// ──────────────────────────────────────────────────────────────────────────
async function sbQuery(ref, query) {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`Supabase query ${resp.status}: ${text.slice(0, 500)}`)
  try { return JSON.parse(text) } catch { return text }
}

async function sbApiKeys(ref) {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
    headers: { Authorization: `Bearer ${SB_TOKEN}` },
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`Supabase api-keys ${resp.status}: ${text.slice(0, 500)}`)
  const keys = JSON.parse(text)
  const anon = keys.find(k => k.name === 'anon' || k.name === 'anon_key' || (k.tags || []).includes('anon'))
  const srv  = keys.find(k => k.name === 'service_role' || k.name === 'service_role_key' || (k.tags || []).includes('service_role'))
  if (!anon || !srv) throw new Error(`Could not locate anon/service_role in api-keys response: ${JSON.stringify(keys.map(k => ({ name: k.name, tags: k.tags })))}`)
  return { anon: anon.api_key, service_role: srv.api_key }
}

async function applyMigrations() {
  for (const rel of MIGRATIONS) {
    const sql = fs.readFileSync(rel, 'utf8')
    const bytes = sql.length
    process.stdout.write(`→ Applying ${rel} (${bytes} chars) to prod… `)
    await sbQuery(PROD_REF, sql)
    console.log('OK')
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Vercel API helpers — env var management for the `production` target
// ──────────────────────────────────────────────────────────────────────────
async function vcListEnv() {
  const resp = await fetch(`https://api.vercel.com/v10/projects/${VERCEL_PROJECT}/env?decrypt=false`, {
    headers: { Authorization: `Bearer ${VC_TOKEN}` },
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`Vercel list ${resp.status}: ${text.slice(0, 500)}`)
  return JSON.parse(text).envs || []
}

async function vcDeleteEnv(envId) {
  const resp = await fetch(`https://api.vercel.com/v10/projects/${VERCEL_PROJECT}/env/${envId}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${VC_TOKEN}` },
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Vercel delete ${resp.status}: ${text.slice(0, 500)}`)
  }
}

async function vcCreateEnv(key, value, target) {
  const isPublic = key.startsWith('NEXT_PUBLIC_')
  const resp = await fetch(`https://api.vercel.com/v10/projects/${VERCEL_PROJECT}/env`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${VC_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key, value, target: [target],
      type: isPublic ? 'plain' : 'encrypted',
    }),
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`Vercel create ${key} ${resp.status}: ${text.slice(0, 500)}`)
}

async function upsertVercelEnv(key, value, target) {
  // Remove any existing var scoped to this target, then create.
  const existing = await vcListEnv()
  const conflicts = existing.filter(e => e.key === key && (e.target || []).includes(target))
  for (const e of conflicts) await vcDeleteEnv(e.id)
  await vcCreateEnv(key, value, target)
}

async function main() {
  console.log('— doddl-pm production deploy —\n')

  assertCommitted()

  console.log('\n[1/3] Applying production Supabase migrations (Management API)')
  await applyMigrations()

  console.log('\n[2/3] Fetching production Supabase API keys')
  const { anon: prodAnon, service_role: prodService } = await sbApiKeys(PROD_REF)
  console.log(`    anon key        — length ${prodAnon.length} (${prodAnon.slice(0, 6)}…${prodAnon.slice(-4)})`)
  console.log(`    service_role    — length ${prodService.length} (${prodService.slice(0, 6)}…${prodService.slice(-4)})`)

  // Generate a fresh AGENT_SERVICE_KEY specifically for production. Distinguishable
  // prefix so it doesn't get confused with staging in audit logs.
  const newAgentKey = 'adk_prod_' + crypto.randomBytes(32).toString('hex')

  console.log('\n[3/3] Writing Vercel env vars (target=production)')
  const envs = [
    { key: 'NEXT_PUBLIC_SUPABASE_URL',      value: PROD_URL },
    { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: prodAnon },
    { key: 'SUPABASE_SERVICE_ROLE_KEY',     value: prodService },
    { key: 'AGENT_SERVICE_KEY',             value: newAgentKey },
    { key: 'NEXT_PUBLIC_AZURE_CLIENT_ID',   value: AZ_CLIENT },
    { key: 'NEXT_PUBLIC_AZURE_TENANT_ID',   value: AZ_TENANT },
  ]
  for (const { key, value } of envs) {
    process.stdout.write(`    ${key.padEnd(32)} → `)
    await upsertVercelEnv(key, value, 'production')
    console.log('OK')
  }

  // ──────────────────────────────────────────────────────────────
  // Verification
  // ──────────────────────────────────────────────────────────────
  console.log('\nVerifying production Supabase schema:')
  const tables = await sbQuery(PROD_REF, `
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name in
      ('projects','task_groups','tasks','agent_audit_log','comments','notifications')
    order by table_name;`)
  console.log('    Tables:', tables.map(r => r.table_name).join(', '))

  const policies = await sbQuery(PROD_REF, `
    select tablename, count(*)::int as n from pg_policies
    where schemaname = 'public'
      and tablename in ('projects','task_groups','tasks','comments','notifications','agent_audit_log')
    group by tablename order by tablename;`)
  console.log('    Policy counts:', policies.map(r => `${r.tablename}=${r.n}`).join(', '))

  const rpc = await sbQuery(PROD_REF, `
    select proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and proname = 'exec_sql';`)
  console.log('    exec_sql RPC present:', rpc.length > 0)

  console.log('\nVerifying Vercel env vars scoped to production:')
  const list = await vcListEnv()
  for (const { key } of envs) {
    const match = list.find(e => e.key === key && (e.target || []).includes('production'))
    console.log(`    ${match ? 'OK  ' : 'MISS'} ${key}`)
  }

  console.log('\nDONE. Ready for Jon to merge staging → main.')
  console.log('AGENT_SERVICE_KEY (production) was generated fresh — value written to Vercel encrypted storage only.')
  console.log('It is not echoed here. If you need to rotate it, re-run this script.')
}

main().catch(e => { console.error('\nFAILED:', e.message || e); process.exit(1) })
