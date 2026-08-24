// scripts/verify-amazon-summary.js
// Verifies the Amazon summary report against REAL production data.
//
//   node scripts/verify-amazon-summary.js [--start=YYYY-MM-DD] [--end=YYYY-MM-DD] [--grain=daily|weekly|monthly]
//
// Requires SUPABASE_URL_PROD + SUPABASE_SERVICE_ROLE_KEY_PROD in .env.local
// (a service role key is mandatory — RLS on amazon_asin_daily grants SELECT only
// to auth.role() = 'authenticated', so an anon key returns zero rows silently).
//
// This script is read-only. It performs no writes of any kind.
//
// WHAT IT ACTUALLY CHECKS
// -----------------------
// 1. An INDEPENDENT recomputation. The totals are recalculated here with plain
//    loops written separately from lib/amazonMetrics.js, and every figure must
//    match to within floating-point tolerance. A test that reuses the code under
//    test proves nothing; this does not reuse it.
//
// 2. That averaging really is wrong ON THIS DATA. It computes the naive figures
//    (arithmetic mean of unit_session_pct and buy_box_pct) alongside the correct
//    ones and prints the gap per marketplace. On real, lopsided ASIN traffic
//    these differ substantially — which is the whole reason the rule exists.
//
// 3. Data-shape assumptions that would silently corrupt the report if wrong:
//    one currency per marketplace, percentages on a 0-100 scale, no duplicate
//    (marketplace, asin, date) keys in what we fetched, and coverage that
//    matches the status table.

const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

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

const { createClient } = require('@supabase/supabase-js')

const URL = process.env.SUPABASE_URL_PROD || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_PROD || process.env.SUPABASE_SERVICE_ROLE_KEY
const PROD_REF = 'ikcjciscttsvpxoijnqe'

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split('=')[1] : dflt
}

let failures = 0
const check = (name, cond, detail) => {
  if (cond) console.log(`  PASS  ${name}`)
  else { failures++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`) }
}
const near = (a, b, eps = 1e-6) => {
  if (a == null || b == null) return a === b
  return Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b))
}
const pct = (f, dp = 2) => (f == null ? 'n/a' : `${(f * 100).toFixed(dp)}%`)

async function fetchAll(supabase, table, cols, start, end, orderCols = ['report_date', 'marketplace_id', 'asin']) {
  const out = []
  let from = 0
  for (;;) {
    let q = supabase
      .from(table).select(cols)
      .gte('report_date', start).lte('report_date', end)
    for (const col of orderCols) q = q.order(col, { ascending: true })
    const { data, error } = await q.range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    out.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return out
}

async function main() {
  if (!URL || !KEY) {
    console.error('Missing SUPABASE_URL_PROD / SUPABASE_SERVICE_ROLE_KEY_PROD (or the non-_PROD fallbacks) in .env.local')
    process.exit(2)
  }
  const ref = (/https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(URL) || [])[1]
  if (ref !== PROD_REF) {
    console.error(`Refusing to verify against project '${ref}'. This script must run against production (${PROD_REF}).`)
    process.exit(2)
  }

  const supabase = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'lib', 'amazonMetrics.js')).href)
  const { aggregate, previousPeriod, addDays } = mod

  // Default range: the 28 days ending at the newest data that exists.
  const { data: newest } = await supabase.from('amazon_asin_daily').select('report_date').order('report_date', { ascending: false }).limit(1)
  const { data: oldest } = await supabase.from('amazon_asin_daily').select('report_date').order('report_date', { ascending: true }).limit(1)
  const maxDate = newest?.[0]?.report_date
  const minDate = oldest?.[0]?.report_date

  if (!maxDate) {
    console.error('amazon_asin_daily returned no rows at all. If the key is an anon key this is exactly what RLS produces — check you used the service role key.')
    process.exit(2)
  }

  const end = arg('end', maxDate)
  const start = arg('start', addDays(end, -27))
  const grain = arg('grain', 'daily')
  const prev = previousPeriod(start, end)

  console.log(`\nProject      ${ref} (production)`)
  console.log(`Data spans   ${minDate} → ${maxDate}`)
  console.log(`Verifying    ${start} → ${end}  grain=${grain}`)
  console.log(`Comparing to ${prev.start} → ${prev.end}\n`)

  const rows = await fetchAll(supabase, 'amazon_asin_daily',
    'marketplace_id,asin,report_date,currency,units_ordered,ordered_revenue,total_order_items,sessions,page_views,buy_box_pct,unit_session_pct,units_refunded',
    prev.start, end)
  const status = await fetchAll(supabase, 'amazon_asin_daily_status',
    'marketplace_id,report_date,status,reason,attempts', prev.start, end,
    ['report_date', 'marketplace_id'])

  console.log(`Fetched ${rows.length} data rows, ${status.length} status rows\n`)
  if (rows.length === 0) {
    console.error('No rows in range. Nothing to verify.')
    process.exit(2)
  }

  const result = aggregate(rows, { start, end, grain, compare: prev, status })

  // ── 1. Independent recomputation ──────────────────────────────────────────
  console.log('Independent recomputation (plain loops, not lib/amazonMetrics.js)')
  const inRange = rows.filter((r) => r.report_date >= start && r.report_date <= end)
  const manual = {}
  for (const r of inRange) {
    const m = (manual[r.marketplace_id] ||= {
      units: 0, orders: 0, revenue: 0, sessions: 0, pv: 0, refunded: 0,
      bbNum: 0, bbDen: 0, currencies: new Set(), keys: new Set(), dupes: 0,
    })
    const k = `${r.asin}|${r.report_date}`
    if (m.keys.has(k)) m.dupes++
    m.keys.add(k)
    m.units += Number(r.units_ordered) || 0
    m.orders += Number(r.total_order_items) || 0
    m.revenue += Number(r.ordered_revenue) || 0
    m.sessions += Number(r.sessions) || 0
    m.pv += Number(r.page_views) || 0
    m.refunded += Number(r.units_refunded) || 0
    const s = Number(r.sessions) || 0
    if (r.buy_box_pct != null && s > 0) { m.bbNum += (Number(r.buy_box_pct) / 100) * s; m.bbDen += s }
    if (r.currency) m.currencies.add(r.currency)
  }

  for (const mp of result.marketplaces) {
    const m = manual[mp.marketplace_id]
    if (!m) {
      // No raw rows means either a confirmed zero-sales marketplace (every
      // requested day pulled successfully with nothing to report — the exact
      // case lib/amazonMetrics.js deliberately keeps visible rather than
      // letting it silently vanish) or a real gap. Only the former should pass.
      const cov = mp.current.coverage
      const confirmedZero = !!cov && cov.status_known
        && cov.days_zero_sales === cov.days_expected
        && cov.days_gap === 0 && cov.days_parse_failed === 0 && cov.days_not_fetched === 0
      check(`${mp.short}: absent from raw rows is a confirmed zero-sales marketplace`, confirmedZero,
        confirmedZero ? '' : `days_zero_sales=${cov?.days_zero_sales} days_expected=${cov?.days_expected} gap=${cov?.days_gap} parse_failed=${cov?.days_parse_failed} not_fetched=${cov?.days_not_fetched} — not a clean zero`)
      if (confirmedZero) {
        check(`${mp.short} units are zero`, mp.current.units === 0, `got ${mp.current.units}`)
        check(`${mp.short} conversion is null (no sessions)`, mp.current.conversion === null, `got ${mp.current.conversion}`)
      }
      continue
    }
    check(`${mp.short} units`, mp.current.units === m.units, `api ${mp.current.units} vs manual ${m.units}`)
    check(`${mp.short} orders`, mp.current.orders === m.orders, `api ${mp.current.orders} vs manual ${m.orders}`)
    check(`${mp.short} revenue`, near(mp.current.revenue, Math.round((m.revenue + Number.EPSILON) * 100) / 100), `api ${mp.current.revenue} vs manual ${m.revenue}`)
    check(`${mp.short} sessions`, mp.current.sessions === m.sessions, `api ${mp.current.sessions} vs manual ${m.sessions}`)
    check(`${mp.short} page views`, mp.current.page_views === m.pv, `api ${mp.current.page_views} vs manual ${m.pv}`)
    const manualConv = m.sessions > 0 ? m.units / m.sessions : null
    const manualBB = m.bbDen > 0 ? m.bbNum / m.bbDen : null
    check(`${mp.short} conversion = sum(units)/sum(sessions)`, near(mp.current.conversion, manualConv), `api ${pct(mp.current.conversion)} vs manual ${pct(manualConv)}`)
    check(`${mp.short} buy box session-weighted`, near(mp.current.buy_box, manualBB), `api ${pct(mp.current.buy_box)} vs manual ${pct(manualBB)}`)
  }

  // Bucket sums must reconcile to the period total — catches a bucketing bug
  // that would otherwise only show as numbers that "look about right".
  console.log('\nBuckets reconcile to period totals')
  for (const mp of result.marketplaces) {
    const bUnits = mp.buckets.reduce((s, b) => s + b.units, 0)
    const bSessions = mp.buckets.reduce((s, b) => s + b.sessions, 0)
    const bRevenue = mp.buckets.reduce((s, b) => s + b.revenue, 0)
    check(`${mp.short} bucket units sum to total`, bUnits === mp.current.units, `${bUnits} vs ${mp.current.units}`)
    check(`${mp.short} bucket sessions sum to total`, bSessions === mp.current.sessions, `${bSessions} vs ${mp.current.sessions}`)
    check(`${mp.short} bucket revenue sums to total`, Math.abs(bRevenue - mp.current.revenue) < 0.05, `${bRevenue} vs ${mp.current.revenue}`)
  }

  // ── 2. The averaging trap, measured on real data ──────────────────────────
  console.log('\nAveraging vs recalculating — the gap on real production data')
  console.log('  marketplace   correct conv   naive mean   correct BB    naive mean')
  for (const mp of result.marketplaces) {
    const mrows = inRange.filter((r) => r.marketplace_id === mp.marketplace_id)
    const us = mrows.map((r) => r.unit_session_pct).filter((v) => v != null).map(Number)
    const bb = mrows.map((r) => r.buy_box_pct).filter((v) => v != null).map(Number)
    const naiveConv = us.length ? us.reduce((a, b) => a + b, 0) / us.length / 100 : null
    const naiveBB = bb.length ? bb.reduce((a, b) => a + b, 0) / bb.length / 100 : null
    console.log(
      `  ${mp.short.padEnd(12)}  ${pct(mp.current.conversion).padStart(11)}  ${pct(naiveConv).padStart(11)}` +
      `  ${pct(mp.current.buy_box, 1).padStart(11)}  ${pct(naiveBB, 1).padStart(11)}`
    )
  }
  console.log('  (the two columns SHOULD differ — if they were identical the report would be averaging)')

  // ── 3. Data-shape assumptions ─────────────────────────────────────────────
  console.log('\nData-shape assumptions')
  for (const mp of result.marketplaces) {
    const m = manual[mp.marketplace_id]
    if (!m) continue
    check(`${mp.short} single currency`, m.currencies.size <= 1, `saw ${[...m.currencies].join(', ')}`)
    check(`${mp.short} no duplicate (asin, date) keys fetched`, m.dupes === 0, `${m.dupes} duplicates — paging may be non-deterministic`)
  }
  const allPct = inRange.flatMap((r) => [r.buy_box_pct, r.unit_session_pct]).filter((v) => v != null).map(Number)
  const maxPct = allPct.length ? Math.max(...allPct) : 0
  check('percentages are on a 0-100 scale', maxPct > 1, `max observed ${maxPct} — a max <= 1 would mean fractions and a 100x error`)
  check('pct scale tripwire not fired', result.meta.pct_scale_suspect === false, result.meta.pct_scale_note || '')
  check('status table readable', result.meta.status_rows > 0, 'no status rows — coverage falls back to row presence')
  check('no cross-marketplace revenue total', result.meta.cross_marketplace_revenue_total === null)

  // ── Coverage summary ──────────────────────────────────────────────────────
  console.log('\nCoverage over the selected range')
  for (const mp of result.marketplaces) {
    const c = mp.current.coverage
    console.log(
      `  ${mp.short.padEnd(4)} ${String(c.days_with_data).padStart(3)}/${String(c.days_expected).padEnd(3)} days` +
      `  ok=${c.days_ok} zero-sales=${c.days_zero_sales} gap=${c.days_gap} parse_failed=${c.days_parse_failed} not-pulled=${c.days_not_fetched}`
    )
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error('\nverify failed:', e.message); process.exit(1) })
