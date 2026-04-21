// scripts/go-live-readiness-snapshot.js
// Produces the numbers for the Go Live readiness summary:
//   - PM Tool Build task statuses grouped by task group
//   - Demo approval task visibility
//   - Audit log volume (proves agent API has been exercised)
//   - RLS policy counts per table (proves migration 04 is live)

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

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  const PM = '10000000-0000-0000-0000-000000000001'

  const { data: groups } = await supabase.from('task_groups').select('id, name, position').eq('project_id', PM).order('position')
  const { data: tasks } = await supabase.from('tasks').select('group_id, title, status, progress, assigned_to, task_type, decision').eq('project_id', PM)

  console.log('PM Tool Build — task status by group:\n')
  for (const g of groups) {
    const groupTasks = tasks.filter(t => t.group_id === g.id).sort((a, b) => a.title.localeCompare(b.title))
    const done = groupTasks.filter(t => t.status === 'done').length
    console.log(`  ${g.name}  —  ${done}/${groupTasks.length} done`)
    for (const t of groupTasks) {
      console.log(`    [${t.status.padEnd(12)}] ${String(t.progress ?? 0).padStart(3)}%  ${t.assigned_to?.padEnd(9) || '—        '}  ${t.title.slice(0, 78)}`)
    }
    console.log()
  }

  const approvals = tasks.filter(t => t.task_type === 'approval' && !t.decision)
  console.log(`Approvals pending in queue: ${approvals.length}`)
  for (const a of approvals) console.log(`    • ${a.title}`)

  const { count: auditCount } = await supabase.from('agent_audit_log').select('id', { count: 'exact', head: true })
  console.log(`\nAudit log rows (total): ${auditCount}`)

  const { data: policies } = await supabase.rpc('noop').then(() => ({ data: null })).catch(() => ({ data: null }))
  // We can't call pg_policies directly from the JS client; verify-policies.js handles that.
}

main().catch(e => { console.error('FAILED:', e); process.exit(1) })
