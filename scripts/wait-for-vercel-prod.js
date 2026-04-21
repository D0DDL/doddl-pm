// scripts/wait-for-vercel-prod.js
// Polls Vercel for the newest production deployment of doddl-pm and waits
// until it reaches READY (or ERROR). Prints stage transitions.

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

const TOKEN = process.env.VERCEL_TOKEN
const PROJECT = 'doddl-pm'
const MAX_WAIT_MS = 10 * 60_000

async function latestProdDeployment() {
  const resp = await fetch(`https://api.vercel.com/v6/deployments?app=${PROJECT}&target=production&limit=1`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  const json = await resp.json()
  if (!resp.ok) throw new Error(`Vercel list ${resp.status}: ${JSON.stringify(json).slice(0, 400)}`)
  return json.deployments?.[0]
}

async function deploymentStatus(id) {
  const resp = await fetch(`https://api.vercel.com/v13/deployments/${id}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  const json = await resp.json()
  if (!resp.ok) throw new Error(`Vercel get ${resp.status}: ${JSON.stringify(json).slice(0, 400)}`)
  return json
}

async function main() {
  const start = Date.now()
  const initial = await latestProdDeployment()
  if (!initial) { console.error('No production deployment found for doddl-pm'); process.exit(1) }
  console.log(`→ Latest prod deployment: ${initial.uid}`)
  console.log(`  URL: https://${initial.url}`)
  console.log(`  State: ${initial.state}  (source: ${initial.source})`)
  if (initial.meta?.githubCommitSha) console.log(`  Commit: ${initial.meta.githubCommitSha.slice(0, 8)}`)

  let lastState = initial.state
  while (Date.now() - start < MAX_WAIT_MS) {
    const dep = await deploymentStatus(initial.uid)
    if (dep.status !== lastState && dep.readyState !== lastState) {
      const s = dep.readyState || dep.status
      console.log(`  ${new Date().toISOString()} → ${s}`)
      lastState = s
    }
    if (dep.readyState === 'READY' || dep.status === 'READY') {
      console.log('\n✓ READY')
      console.log(`  Build time: ${Math.round((Date.now() - start) / 1000)}s since we started polling`)
      return
    }
    if (dep.readyState === 'ERROR' || dep.status === 'ERROR' || dep.status === 'CANCELED') {
      console.error(`\n✗ Deployment ${dep.readyState || dep.status}`)
      if (dep.errorMessage) console.error(`  ${dep.errorMessage}`)
      process.exit(1)
    }
    await new Promise(r => setTimeout(r, 4000))
  }
  console.error(`\n✗ Timed out after ${MAX_WAIT_MS / 1000}s; last state=${lastState}`)
  process.exit(1)
}

main().catch(e => { console.error('FAILED:', e.message || e); process.exit(1) })
