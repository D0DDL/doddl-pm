// scripts/apply-migration.js
// One-shot migration runner. Reads a SQL file, executes it against staging
// Supabase via the public.exec_sql(text) RPC (see migration 05).
//
// Usage: node scripts/apply-migration.js lib/migrations/04-rls-policies.sql
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadDotEnv(p) {
  if (!fs.existsSync(p)) return
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const k = line.slice(0, eq).trim()
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
}

async function main() {
  loadDotEnv(path.join(process.cwd(), '.env.local'))

  const file = process.argv[2]
  if (!file) { console.error('Usage: node scripts/apply-migration.js <path-to-sql>'); process.exit(1) }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
  if (!url.includes('iknwprxycshrickpswjz')) {
    console.error(`Refusing to run — URL is not staging (${url})`); process.exit(1)
  }

  const sql = fs.readFileSync(file, 'utf8')
  console.log(`→ Applying ${file} (${sql.length} chars) to ${url}`)

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { error } = await supabase.rpc('exec_sql', { sql })
  if (error) { console.error('FAILED:', error); process.exit(1) }
  console.log('OK — migration applied')
}

main()
