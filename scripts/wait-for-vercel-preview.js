// scripts/wait-for-vercel-preview.js — waits for the latest preview (non-production) deploy to READY.
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
const TOKEN = process.env.VERCEL_TOKEN
const expectCommit = (process.argv[2] || '').slice(0, 7) // optional sha to match

async function main() {
  const start = Date.now()
  // Poll for up to 10 minutes
  while (Date.now() - start < 600_000) {
    const resp = await fetch('https://api.vercel.com/v6/deployments?app=doddl-pm&target=preview&limit=5', {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    const json = await resp.json()
    if (!resp.ok) throw new Error(`${resp.status}: ${JSON.stringify(json).slice(0, 400)}`)
    const dep = expectCommit
      ? (json.deployments || []).find(d => (d.meta?.githubCommitSha || '').startsWith(expectCommit))
      : json.deployments?.[0]
    if (dep) {
      console.log(`→ ${dep.uid} state=${dep.state} commit=${(dep.meta?.githubCommitSha || '').slice(0, 8)} url=https://${dep.url}`)
      if (dep.state === 'READY') { console.log('✓ READY'); return }
      if (dep.state === 'ERROR' || dep.state === 'CANCELED') { console.error('✗ ' + dep.state); process.exit(1) }
    } else if (expectCommit) {
      console.log(`(no deployment yet matching ${expectCommit}, polling…)`)
    }
    await new Promise(r => setTimeout(r, 5000))
  }
  console.error('timeout'); process.exit(1)
}
main().catch(e => { console.error('FAILED:', e.message || e); process.exit(1) })
