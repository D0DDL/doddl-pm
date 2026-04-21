// scripts/go-live-signoff.js
// Records Catherine's Go Live sign-off in the PM tool.
//   - Marks Task 26 (Catherine: Review staging) as status=done, progress=100
//   - Closes the demo approval task (decision=approved, decision_by=Cat)
//   - Does NOT touch Task 27 (Jon merges to main) — that's Jon's action
//   - Does NOT touch production Supabase

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

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

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!URL.includes('iknwprxycshrickpswjz')) { console.error(`Refusing — not staging (${URL})`); process.exit(1) }
const supabase = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function main() {
  const PM = '10000000-0000-0000-0000-000000000001'
  const nowIso = new Date().toISOString()

  // 1. Catherine's Go Live approval gate -> done
  const { data: catRow, error: catErr } = await supabase.from('tasks').update({
    status: 'done', progress: 100,
  }).eq('project_id', PM).eq('title', 'Catherine: Review staging — Go Live approval gate').select('id')
  if (catErr) throw catErr
  console.log(`1. Marked Catherine's Go Live approval task done (${catRow?.length ?? 0} row)`)

  // 2. Close the demo approval task so Approvals > History shows the loop closed
  const { data: demoRow, error: demoErr } = await supabase.from('tasks').update({
    decision:       'approved',
    decision_by:    'Cat',
    decision_at:    nowIso,
    decision_notes: 'Go Live sign-off confirmed in chat 2026-04-21. Demo artefact approved to close the flow.',
    status:         'done',
    progress:       100,
  }).eq('title', 'DEMO: Review RLS migration 04 before production deploy').select('id, decision')
  if (demoErr) throw demoErr
  console.log(`2. Recorded 'approved' on demo approval task (${demoRow?.length ?? 0} row, decision=${demoRow?.[0]?.decision})`)

  // 3. Print outstanding Go Live actions that remain on Jon
  const { data: remaining } = await supabase.from('tasks')
    .select('title, status, assigned_to')
    .eq('project_id', PM)
    .neq('status', 'done')
    .order('position')
  console.log(`\nOutstanding Go Live items (Jon-owned, cannot be auto-completed):`)
  for (const r of remaining) {
    console.log(`   [${r.status.padEnd(12)}] ${r.assigned_to?.padEnd(8) || '—       '}  ${r.title}`)
  }
}

main().catch(e => { console.error('FAILED:', e); process.exit(1) })
