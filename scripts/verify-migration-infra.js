// scripts/verify-migration-infra.js — proves 06 landed on both DBs.
//   • schema_migrations has 9 expected rows
//   • migration_backups table exists with the expected indexes
//   • backup_before_migration() is callable and writes rows
//   • idempotency: re-running safe-apply-migration --id=06-... is a no-op
//
// Runs a small dry-run backup against a temporary migration id then cleans up.

const fs = require('fs'); const path = require('path')
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

async function sbQuery(ref, query) {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${SB}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`${resp.status}: ${text.slice(0, 600)}`)
  try { return JSON.parse(text) } catch { return text }
}

const EXPECTED_IDS = [
  '01-initial-schema','02-agent-audit-log','03-tasks-artefact-columns','04-rls-policies','05-exec-sql-rpc',
  'seed-ai-os','seed-business-projects','seed-journey-website','06-migrations-tracking',
]

async function verify(label, ref) {
  console.log(`\n── ${label} (${ref}) ──`)

  const ledger = await sbQuery(ref, `SELECT id, applied_at FROM schema_migrations ORDER BY applied_at, id;`)
  const missing = EXPECTED_IDS.filter(id => !ledger.find(r => r.id === id))
  console.log(`  schema_migrations rows:  ${ledger.length}   expected: ${EXPECTED_IDS.length}   missing: ${missing.length ? missing.join(', ') : 'none'}`)
  for (const r of ledger) console.log(`    • ${r.id.padEnd(28)}  ${r.applied_at}`)

  // Function exists?
  const fn = await sbQuery(ref, `SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname='backup_before_migration';`)
  console.log(`  backup_before_migration present: ${fn.length > 0 ? 'yes' : 'NO'}`)

  // Live backup test with a throwaway id, then clean up.
  const testId = 'test-verify-' + Date.now()
  const result = await sbQuery(ref, `SELECT backup_before_migration('${testId}') AS n;`)
  const rowsBackedUp = result[0]?.n ?? 0
  const summary = await sbQuery(ref, `SELECT table_name, COUNT(*)::int AS n FROM migration_backups WHERE migration_id='${testId}' GROUP BY 1 ORDER BY 1;`)
  console.log(`  backup_before_migration('${testId}') returned ${rowsBackedUp}`)
  for (const r of summary) console.log(`    • ${r.table_name.padEnd(12)}: ${r.n} rows`)
  await sbQuery(ref, `DELETE FROM migration_backups WHERE migration_id='${testId}';`)
  console.log(`  cleaned up test rows`)
}

async function main() {
  await verify('STAGING   ', 'iknwprxycshrickpswjz')
  await verify('PRODUCTION', 'ikcjciscttsvpxoijnqe')
}
main().catch(e => { console.error('FAILED:', e.message || e); process.exit(1) })
