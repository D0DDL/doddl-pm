// scripts/safe-apply-migration.js
// The ONLY supported way to apply a migration after 06-migrations-tracking.
// Wraps four invariants around every migration apply, enforcing the rules
// in CLAUDE.md Hard Rules 8–10:
//
//   1. Require a committed SQL file under lib/migrations/ (Hard Rule 3).
//   2. Check schema_migrations — skip if the id already exists.
//   3. Call backup_before_migration(id) — snapshots projects + tasks
//      into migration_backups BEFORE any DDL / row writes hit.
//   4. Apply the SQL. If it succeeds, insert into schema_migrations.
//
// Usage:
//   node scripts/safe-apply-migration.js --target=staging    --id=<migration-id> --file=lib/migrations/<file>.sql [--description=...]
//   node scripts/safe-apply-migration.js --target=production --id=<migration-id> --file=lib/migrations/<file>.sql [--description=...]
//
// Targets:
//   staging    -> iknwprxycshrickpswjz
//   production -> ikcjciscttsvpxoijnqe
//
// Bootstrap exception: migration id '06-migrations-tracking' is allowed to
// skip the backup step, because the function doesn't exist yet until that
// migration has applied.

const fs = require('fs')
const path = require('path')
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

const SB = process.env.SUPABASE_ACCESS_TOKEN
if (!SB) { console.error('SUPABASE_ACCESS_TOKEN missing in .env.local'); process.exit(1) }

const REFS = {
  staging:    'iknwprxycshrickpswjz',
  production: 'ikcjciscttsvpxoijnqe',
}

function parseArgs(argv) {
  const out = {}
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

const args = parseArgs(process.argv)
const { target, id, file } = args
const description = args.description || null

if (!target || !REFS[target]) { console.error(`--target must be one of: ${Object.keys(REFS).join(', ')}`); process.exit(1) }
if (!id)   { console.error('--id is required (e.g. --id=07-new-column)'); process.exit(1) }
if (!file) { console.error('--file is required (e.g. --file=lib/migrations/07-new-column.sql)'); process.exit(1) }
if (!file.startsWith('lib/migrations/')) { console.error('--file must live under lib/migrations/'); process.exit(1) }
if (!fs.existsSync(file)) { console.error(`file not found: ${file}`); process.exit(1) }

// Hard Rule 3: production migrations must be committed in git.
if (target === 'production') {
  let working, head
  try { working = fs.readFileSync(file, 'utf8') }
  catch (e) { console.error(`cannot read ${file}`); process.exit(1) }
  try { head = execSync(`git show HEAD:${file}`, { encoding: 'utf8' }) }
  catch (e) { console.error(`migration file not in git HEAD: ${file}. Commit first.`); process.exit(1) }
  if (working !== head) { console.error(`migration file has uncommitted changes vs HEAD. Commit first.`); process.exit(1) }
}

const REF = REFS[target]

async function sbQuery(query) {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SB}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`${resp.status}: ${text.slice(0, 800)}`)
  try { return JSON.parse(text) } catch { return text }
}

function sqlEscape(s) { return String(s).replace(/'/g, "''") }

async function main() {
  console.log(`— safe-apply-migration —`)
  console.log(`  target : ${target} (${REF})`)
  console.log(`  id     : ${id}`)
  console.log(`  file   : ${file}`)

  // 1. schema_migrations check (skip if already applied)
  //    Exception: the bootstrap migration itself (06) is allowed through even
  //    before schema_migrations exists. sbQuery will raise if the table is
  //    missing; we catch and continue only for that id.
  const isBootstrap = id === '06-migrations-tracking'
  let alreadyApplied = false
  try {
    const rows = await sbQuery(`SELECT id FROM schema_migrations WHERE id = '${sqlEscape(id)}';`)
    alreadyApplied = Array.isArray(rows) && rows.length > 0
  } catch (e) {
    if (!isBootstrap) throw e
    console.log('  note   : schema_migrations does not exist yet (bootstrap run)')
  }
  if (alreadyApplied) {
    console.log(`\n✓ ${id} already applied on ${target}. Nothing to do.`)
    return
  }

  // 2. backup_before_migration — skip only for the bootstrap migration
  if (!isBootstrap) {
    console.log(`\n→ backup_before_migration('${id}')`)
    const backup = await sbQuery(`SELECT backup_before_migration('${sqlEscape(id)}') AS n;`)
    const n = backup[0]?.n ?? 0
    console.log(`  snapshotted ${n} rows into migration_backups`)
  }

  // 3. Apply the migration SQL
  const sql = fs.readFileSync(file, 'utf8')
  console.log(`\n→ Applying ${file} (${sql.length} chars)`)
  await sbQuery(sql)
  console.log(`  applied`)

  // 4. Register in schema_migrations (the SQL itself may already have inserted — ON CONFLICT DO NOTHING makes this safe)
  const desc = description ? `'${sqlEscape(description)}'` : 'NULL'
  await sbQuery(`INSERT INTO schema_migrations (id, description) VALUES ('${sqlEscape(id)}', ${desc}) ON CONFLICT (id) DO NOTHING;`)

  // Summary
  const all = await sbQuery(`SELECT COUNT(*)::int AS n FROM schema_migrations;`)
  console.log(`\n✓ ${id} applied to ${target}. schema_migrations now has ${all[0].n} rows.`)
}

main().catch(e => { console.error('\nFAILED:', e.message || e); process.exit(1) })
