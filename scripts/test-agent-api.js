// scripts/test-agent-api.js
// End-to-end test of the agent API surface for Task 2 + Task 3.
// Run against a running dev server (default http://localhost:3000) or set
// TEST_BASE_URL=https://.../ to point at staging.
//
// Exits non-zero if any assertion fails. Prints a pass/fail summary per case.
//
// Usage:
//   node scripts/test-agent-api.js
//   TEST_BASE_URL=https://doddl-pm-git-staging-d0ddls-projects.vercel.app node scripts/test-agent-api.js

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadDotEnv(p) {
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const k = line.slice(0, eq).trim()
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
}

loadDotEnv(path.join(process.cwd(), '.env.local'))

const BASE = (process.env.TEST_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const KEY  = process.env.AGENT_SERVICE_KEY
const AGENT_ID = 'task2-verify-' + Date.now()

if (!KEY) { console.error('AGENT_SERVICE_KEY not set'); process.exit(1) }

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

async function req(method, pathSuffix, { headers = {}, body, raw = false } = {}) {
  const resp = await fetch(BASE + pathSuffix, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await resp.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* ignore */ }
  return { status: resp.status, body: json, raw: text }
}

async function authReq(method, pathSuffix, body) {
  return req(method, pathSuffix, {
    headers: { Authorization: `Bearer ${KEY}`, 'X-Agent-Id': AGENT_ID },
    body,
  })
}

async function main() {
  console.log(`\n→ Agent API integration tests against ${BASE}`)
  console.log(`→ Agent ID: ${AGENT_ID}\n`)

  // 1. Missing Authorization → 401
  {
    const r = await req('POST', '/api/agent/tasks', { body: { title: 'x' } })
    record('1. POST /api/agent/tasks with no Authorization returns 401',
      r.status === 401, `got ${r.status}`)
  }

  // 2. Bad key → 401
  {
    const r = await req('POST', '/api/agent/tasks', {
      headers: { Authorization: 'Bearer wrong-key', 'X-Agent-Id': AGENT_ID },
      body: { title: 'x' },
    })
    record('2. POST /api/agent/tasks with bad key returns 401',
      r.status === 401, `got ${r.status}`)
  }

  // 3. Missing X-Agent-Id → 400
  {
    const r = await req('POST', '/api/agent/tasks', {
      headers: { Authorization: `Bearer ${KEY}` },
      body: { title: 'x' },
    })
    record('3. POST /api/agent/tasks with no X-Agent-Id returns 400',
      r.status === 400, `got ${r.status}`)
  }

  // 4. Create standard task (happy path)
  let createdId = null
  {
    const r = await authReq('POST', '/api/agent/tasks', {
      title: `Agent test task ${AGENT_ID}`,
      priority: 'medium',
      status: 'not_started',
    })
    createdId = r.body?.id || null
    record('4. POST /api/agent/tasks creates task (201)',
      r.status === 201 && !!createdId, `status=${r.status} id=${createdId}`)
  }

  // 5. Missing title → 400
  {
    const r = await authReq('POST', '/api/agent/tasks', { priority: 'low' })
    record('5. POST /api/agent/tasks without title returns 400',
      r.status === 400, `got ${r.status}`)
  }

  // 6. PATCH updates task (ownership check pass — same agent_id)
  if (createdId) {
    const r = await authReq('PATCH', `/api/agent/tasks?id=${createdId}`, { progress: 50, status: 'in_progress' })
    record('6. PATCH /api/agent/tasks updates own task (200)',
      r.status === 200 && r.body?.progress === 50 && r.body?.status === 'in_progress',
      `status=${r.status} progress=${r.body?.progress}`)
  }

  // 7. Attach artefact (approval flow)
  if (createdId) {
    const r = await authReq('POST', '/api/agent/artefacts', {
      task_id: createdId,
      artefact_type: 'pr_link',
      artefact: { url: 'https://github.com/D0DDL/doddl-pm/pull/999', title: 'Test PR', author: AGENT_ID, branch: 'test/agent-api' },
      staging_url: 'https://example.test/staging',
    })
    const isApproval = r.body?.task_type === 'approval'
    record('7. POST /api/agent/artefacts attaches + flips task_type=approval',
      r.status === 200 && isApproval, `status=${r.status} task_type=${r.body?.task_type}`)
  }

  // 8. Artefact validation — missing required field → 400
  if (createdId) {
    const r = await authReq('POST', '/api/agent/artefacts', {
      task_id: createdId,
      artefact_type: 'pr_link',
      artefact: { author: AGENT_ID },
    })
    record('8. POST /api/agent/artefacts with missing required field returns 400',
      r.status === 400, `got ${r.status}`)
  }

  // 9. Unknown artefact_type → 400
  if (createdId) {
    const r = await authReq('POST', '/api/agent/artefacts', {
      task_id: createdId,
      artefact_type: 'does_not_exist',
      artefact: { foo: 'bar' },
    })
    record('9. POST /api/agent/artefacts with unknown type returns 400',
      r.status === 400, `got ${r.status}`)
  }

  // 10. Second agent cannot PATCH first agent's task → 403
  if (createdId) {
    const r = await req('PATCH', `/api/agent/tasks?id=${createdId}`, {
      headers: { Authorization: `Bearer ${KEY}`, 'X-Agent-Id': 'other-agent-' + Date.now() },
      body: { progress: 99 },
    })
    record('10. PATCH /api/agent/tasks by wrong agent returns 403',
      r.status === 403, `got ${r.status}`)
  }

  // 11. Immutability — a decision on the task blocks further agent writes (409)
  //     We record a human decision directly via service role, then retry PATCH.
  let immutableOk = null
  if (createdId) {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    await supabase.from('tasks').update({
      decision: 'approved',
      decision_by: 'test-harness',
      decision_at: new Date().toISOString(),
    }).eq('id', createdId)
    const r = await authReq('PATCH', `/api/agent/tasks?id=${createdId}`, { progress: 1 })
    immutableOk = r.status === 409
    record('11. PATCH after decision recorded returns 409 (immutable)',
      immutableOk, `got ${r.status}`)
  }

  // 12. Method not allowed — GET on /api/agent/tasks → 405
  {
    const r = await authReq('GET', '/api/agent/tasks')
    record('12. GET /api/agent/tasks returns 405', r.status === 405, `got ${r.status}`)
  }

  // 13. Audit log received writes from our agent_id
  {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const { count } = await supabase.from('agent_audit_log')
      .select('id', { count: 'exact', head: true }).eq('agent_id', AGENT_ID)
    record('13. Audit log captured requests for this agent',
      (count ?? 0) >= 5, `count=${count}`)
  }

  // Cleanup: delete the test task to keep staging clean
  if (createdId) {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    await supabase.from('agent_audit_log').delete().eq('agent_id', AGENT_ID)
    await supabase.from('tasks').delete().eq('id', createdId)
    console.log(`\n→ Cleanup: deleted test task ${createdId} and ${AGENT_ID} audit rows`)
  }

  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} PASS`)
  if (failed.length) {
    console.log('\nFailures:')
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
    process.exit(1)
  }
}

main().catch(e => { console.error('CRASHED:', e); process.exit(2) })
