// scripts/smoke-test-production.js
// End-to-end smoke test of the live production URL (doddl-pm.vercel.app).
// Uses the production AGENT_SERVICE_KEY pulled back from Vercel env vars,
// fires a create+delete round trip against production Supabase via the agent
// API, and verifies the audit log captured the request.

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

const VC_TOKEN = process.env.VERCEL_TOKEN
const SB_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const PROD_URL = 'https://doddl-pm.vercel.app'
const PROD_REF = 'ikcjciscttsvpxoijnqe'
const VERCEL_PROJECT = 'doddl-pm'

async function getVercelProdSecret(key) {
  // The list endpoint (/v10/projects/{id}/env?decrypt=true) returns ciphertext
  // for encrypted vars even with decrypt=true. The per-id GET (/v1/projects/{id}/env/{envId})
  // returns plaintext. So: list, locate by key+target, then fetch by id.
  const list = await fetch(`https://api.vercel.com/v10/projects/${VERCEL_PROJECT}/env`, {
    headers: { Authorization: `Bearer ${VC_TOKEN}` },
  })
  if (!list.ok) throw new Error(`Vercel list ${list.status}: ${await list.text()}`)
  const envs = (await list.json()).envs || []
  const match = envs.find(e => e.key === key && (e.target || []).includes('production'))
  if (!match) throw new Error(`Prod env var '${key}' not found on Vercel`)

  const one = await fetch(`https://api.vercel.com/v1/projects/${VERCEL_PROJECT}/env/${match.id}`, {
    headers: { Authorization: `Bearer ${VC_TOKEN}` },
  })
  if (!one.ok) throw new Error(`Vercel get ${one.status}: ${await one.text()}`)
  return (await one.json()).value
}

async function sbQuery(ref, query) {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!resp.ok) throw new Error(`Supabase query ${resp.status}: ${await resp.text()}`)
  return resp.json()
}

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

async function main() {
  console.log(`→ Production smoke test against ${PROD_URL}\n`)

  // 1. Homepage reachable
  {
    const resp = await fetch(PROD_URL)
    record('1. GET / returns 200', resp.status === 200, `status=${resp.status}`)
  }

  // 2. Agent API rejects unauthenticated
  {
    const resp = await fetch(`${PROD_URL}/api/agent/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x' }),
    })
    record('2. POST /api/agent/tasks with no auth returns 401', resp.status === 401, `status=${resp.status}`)
  }

  // 3. Production Supabase schema reachable (2 projects + 82 pre-existing tasks — Power Automate
  //    data that predates this deploy; our migrations added schema, not rows).
  {
    const rows = await sbQuery(PROD_REF, 'select count(*)::int as n from tasks;')
    record('3. Production tasks table reachable', typeof rows[0]?.n === 'number', `count=${rows[0]?.n}`)
  }

  // 4. Fetch the production AGENT_SERVICE_KEY from Vercel (proves Vercel API still works)
  const prodKey = await getVercelProdSecret('AGENT_SERVICE_KEY')
  record('4. Production AGENT_SERVICE_KEY retrievable from Vercel',
    prodKey.startsWith('adk_prod_'), `prefix=${prodKey.slice(0, 9)} length=${prodKey.length}`)

  // 5. Agent API end-to-end create against production
  const agent = 'smoke-prod-' + Date.now()
  let createdId = null
  {
    const resp = await fetch(`${PROD_URL}/api/agent/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${prodKey}`, 'X-Agent-Id': agent },
      body: JSON.stringify({ title: 'SMOKE TEST — safe to delete', priority: 'low' }),
    })
    const json = await resp.json()
    createdId = json?.id || null
    record('5. Agent POST /api/agent/tasks creates task in prod DB',
      resp.status === 201 && !!createdId, `status=${resp.status} id=${createdId}`)
  }

  // 6. Audit log captured the request in production DB
  {
    const rows = await sbQuery(PROD_REF, `select count(*)::int as n from agent_audit_log where agent_id = '${agent}';`)
    record('6. Production audit log captured agent request', rows[0]?.n >= 1, `count=${rows[0]?.n}`)
  }

  // 7. Cleanup — delete test row + audit entries (keep production clean)
  if (createdId) {
    await sbQuery(PROD_REF, `delete from tasks where id = '${createdId}';`)
    await sbQuery(PROD_REF, `delete from agent_audit_log where agent_id = '${agent}';`)
    console.log(`    cleanup: removed test task ${createdId} and audit rows for ${agent}`)
  }

  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} PASS`)
  if (failed.length) process.exit(1)
}

main().catch(e => { console.error('\nFAILED:', e.message || e); process.exit(1) })
