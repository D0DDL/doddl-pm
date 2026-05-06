// scripts/configure-breach-alerts.js
// Sets the Postgres database settings that breach alert migration 10 reads at runtime.
// Run once after applying migration 10, or whenever the API URL or key changes.
//
// Usage:
//   node scripts/configure-breach-alerts.js --target=staging
//   node scripts/configure-breach-alerts.js --target=production
//
// The AGENT_SERVICE_KEY is read from .env.local — it is never printed or logged.

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

const SERVICE_KEY = process.env.AGENT_SERVICE_KEY
if (!SERVICE_KEY) { console.error('AGENT_SERVICE_KEY missing'); process.exit(1) }

const REFS = {
  staging:    { ref: 'iknwprxycshrickpswjz', url: 'https://doddl-pm-git-staging-d0ddl.vercel.app' },
  production: { ref: 'ikcjciscttsvpxoijnqe', url: 'https://doddl-pm.vercel.app' },
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
const { target } = args
if (!target || !REFS[target]) {
  console.error(`--target must be one of: ${Object.keys(REFS).join(', ')}`)
  process.exit(1)
}

const { ref, url } = REFS[target]

async function sbQuery(query) {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SB}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`${resp.status}: ${text.slice(0, 400)}`)
  return JSON.parse(text)
}

function sqlEscape(s) { return String(s).replace(/'/g, "''") }

async function main() {
  console.log(`configure-breach-alerts → ${target} (${ref})`)

  // Set app.pm_api_url (not sensitive)
  await sbQuery(`ALTER DATABASE postgres SET "app.pm_api_url" = '${sqlEscape(url)}';`)
  console.log(`  app.pm_api_url = ${url}`)

  // Set app.agent_service_key (sensitive — value not printed)
  await sbQuery(`ALTER DATABASE postgres SET "app.agent_service_key" = '${sqlEscape(SERVICE_KEY)}';`)
  console.log(`  app.agent_service_key = [set — not printed]`)

  // Reload config so running sessions pick up the new settings
  await sbQuery(`SELECT pg_reload_conf();`)
  console.log(`  pg_reload_conf() called`)

  console.log(`\n✓ Breach alert configuration applied to ${target}.`)
  console.log(`  The cron job will fire within 5 minutes of the next breach_log INSERT.`)
}

main().catch(e => { console.error('\nFAILED:', e.message || e); process.exit(1) })
