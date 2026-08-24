// scripts/test-amazon-metrics.js
// Correctness tests for lib/amazonMetrics.js. No database, no network — these
// run on fixtures chosen so that the WRONG answer (averaging a percentage
// column) and the RIGHT answer (recalculating from sums) are far apart.
//
//   node scripts/test-amazon-metrics.js
//
// Run with `--esm-shim` not required: executed via a tiny loader below so the
// ESM lib can be required from a CommonJS script without adding a build step.

const path = require('path')
const { pathToFileURL } = require('url')

let pass = 0
let fail = 0

function ok(name, cond, detail) {
  if (cond) {
    pass += 1
    console.log(`  PASS  ${name}`)
  } else {
    fail += 1
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`)
  }
}

function close(a, b, eps = 1e-9) {
  if (a == null || b == null) return a === b
  return Math.abs(a - b) < eps
}

async function main() {
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'lib', 'amazonMetrics.js')).href)
  const { aggregate, previousPeriod, weekStart, monthStart, dateRange, daysBetween, bucketLabel, detectPctScale } = mod

  // -------------------------------------------------------------------------
  console.log('\nDate handling (marketplace-local, no timezone conversion)')
  // -------------------------------------------------------------------------
  ok('weekStart(Mon) is itself', weekStart('2026-08-24') === '2026-08-24')
  ok('weekStart(Sun) goes back 6', weekStart('2026-08-23') === '2026-08-17')
  ok('weekStart(Sat) goes back 5', weekStart('2026-08-22') === '2026-08-17')
  ok('monthStart', monthStart('2026-08-24') === '2026-08-01')
  ok('daysBetween inclusive', daysBetween('2026-08-01', '2026-08-31') === 31)
  ok('dateRange length', dateRange('2026-08-01', '2026-08-07').length === 7)
  ok('dateRange endpoints', dateRange('2026-08-01', '2026-08-07')[6] === '2026-08-07')
  ok('leap day survives', dateRange('2028-02-28', '2028-03-01').join(',') === '2028-02-28,2028-02-29,2028-03-01')
  ok('bucketLabel monthly', bucketLabel('2026-08-01', 'monthly') === 'Aug 2026')

  // A date string must bucket by its literal calendar components regardless of
  // the machine's timezone. Re-run the month boundary under a US timezone.
  const priorTZ = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  ok('monthStart is TZ-independent at boundary', monthStart('2026-08-01') === '2026-08-01')
  ok('weekStart is TZ-independent at boundary', weekStart('2026-08-01') === '2026-07-27')
  process.env.TZ = priorTZ

  // -------------------------------------------------------------------------
  console.log('\nPercentage scale detection')
  // -------------------------------------------------------------------------
  ok('0-100 column detected', detectPctScale([12, 88.5, 100]) === 100)
  ok('0-1 column detected', detectPctScale([0.12, 0.885, 1]) === 1)
  ok('nulls ignored', detectPctScale([null, null, 0.4]) === 1)

  // -------------------------------------------------------------------------
  console.log('\nDERIVED METRICS: recalculated from sums, never averaged')
  // -------------------------------------------------------------------------
  // Two ASINs on one day, deliberately lopsided. One is a high-traffic product
  // converting badly; the other is a tiny-traffic product converting brilliantly.
  // The naive mean of unit_session_pct says ~27.5%. The truth is 4.7%.
  const lopsided = [
    { marketplace_id: 'A1F83G8C2ARO7P', asin: 'A', report_date: '2026-08-10', currency: 'GBP',
      units_ordered: 45, ordered_revenue: 450, total_order_items: 40, sessions: 1000, page_views: 1500,
      buy_box_pct: 50, unit_session_pct: 4.5, units_refunded: 0 },
    { marketplace_id: 'A1F83G8C2ARO7P', asin: 'B', report_date: '2026-08-10', currency: 'GBP',
      units_ordered: 5, ordered_revenue: 50, total_order_items: 5, sessions: 10, page_views: 12,
      buy_box_pct: 100, unit_session_pct: 50, units_refunded: 0 },
  ]

  const r1 = aggregate(lopsided, { start: '2026-08-10', end: '2026-08-10', grain: 'daily' })
  const uk = r1.marketplaces[0]

  const naiveConversion = (4.5 + 50) / 2 / 100 // 0.2725 — the plausible-looking wrong answer
  const trueConversion = 50 / 1010 // 0.0495...

  ok('conversion = sum(units)/sum(sessions)', close(uk.current.conversion, trueConversion))
  ok('conversion is NOT the mean of unit_session_pct',
    Math.abs(uk.current.conversion - naiveConversion) > 0.2,
    `recalculated ${(uk.current.conversion * 100).toFixed(2)}% vs naive mean ${(naiveConversion * 100).toFixed(2)}%`)

  const naiveBuyBox = (50 + 100) / 2 / 100 // 0.75
  const trueBuyBox = (0.5 * 1000 + 1.0 * 10) / 1010 // 0.50495...

  ok('buy box is session-weighted', close(uk.current.buy_box, trueBuyBox))
  ok('buy box is NOT the arithmetic mean',
    Math.abs(uk.current.buy_box - naiveBuyBox) > 0.2,
    `weighted ${(uk.current.buy_box * 100).toFixed(2)}% vs naive mean ${(naiveBuyBox * 100).toFixed(2)}%`)

  ok('units summed', uk.current.units === 50)
  ok('orders use total_order_items', uk.current.orders === 45)
  ok('sessions summed', uk.current.sessions === 1010)
  ok('revenue summed within marketplace', uk.current.revenue === 500)

  // Same maths must hold when aggregating across DATES, not just across ASINs.
  const acrossDates = [
    { marketplace_id: 'X', report_date: '2026-08-10', currency: 'GBP', units_ordered: 90, sessions: 3000, buy_box_pct: 30, total_order_items: 90, ordered_revenue: 900, page_views: 4000, units_refunded: 0 },
    { marketplace_id: 'X', report_date: '2026-08-11', currency: 'GBP', units_ordered: 10, sessions: 20, buy_box_pct: 95, total_order_items: 10, ordered_revenue: 100, page_views: 25, units_refunded: 0 },
  ]
  const r2 = aggregate(acrossDates, { start: '2026-08-10', end: '2026-08-11', grain: 'weekly' })
  const m2 = r2.marketplaces[0]
  ok('cross-date conversion recalculated', close(m2.current.conversion, 100 / 3020))
  ok('cross-date buy box session-weighted', close(m2.current.buy_box, (0.30 * 3000 + 0.95 * 20) / 3020))
  ok('weekly rollup collapses both days into one bucket', m2.buckets.length === 1)
  ok('weekly bucket repeats the recalculation', close(m2.buckets[0].conversion, 100 / 3020))

  // -------------------------------------------------------------------------
  console.log('\nNull and zero handling')
  // -------------------------------------------------------------------------
  const withNulls = [
    { marketplace_id: 'X', report_date: '2026-08-10', currency: 'GBP', units_ordered: 5, sessions: 100, buy_box_pct: null, total_order_items: 5, ordered_revenue: 50, page_views: 120, units_refunded: 1 },
    { marketplace_id: 'X', report_date: '2026-08-10', currency: 'GBP', units_ordered: 5, sessions: 100, buy_box_pct: 80, total_order_items: 5, ordered_revenue: 50, page_views: 120, units_refunded: 0 },
  ]
  const r3 = aggregate(withNulls, { start: '2026-08-10', end: '2026-08-10', grain: 'daily' })
  const m3 = r3.marketplaces[0]
  ok('null buy_box_pct excluded from the weight denominator', close(m3.current.buy_box, 0.80),
    `got ${m3.current.buy_box}; a null treated as 0 would give 0.40`)
  ok('null buy box rows are counted', m3.current.buy_box_rows_missing === 1)
  ok('buy box basis reports only weighted sessions', m3.current.buy_box_basis_sessions === 100)
  ok('refund rate = refunded/units', close(m3.current.refund_rate, 1 / 10))

  const zeroSessions = [
    { marketplace_id: 'X', report_date: '2026-08-10', currency: 'GBP', units_ordered: 0, sessions: 0, buy_box_pct: null, total_order_items: 0, ordered_revenue: 0, page_views: 0, units_refunded: 0 },
  ]
  const r4 = aggregate(zeroSessions, { start: '2026-08-10', end: '2026-08-10', grain: 'daily' })
  ok('zero sessions gives null conversion, not 0%', r4.marketplaces[0].current.conversion === null)
  ok('no buy box data gives null, not 0%', r4.marketplaces[0].current.buy_box === null)

  // -------------------------------------------------------------------------
  console.log('\nCurrency isolation')
  // -------------------------------------------------------------------------
  const multi = [
    { marketplace_id: 'A1F83G8C2ARO7P', report_date: '2026-08-10', currency: 'GBP', units_ordered: 10, sessions: 100, ordered_revenue: 1000, total_order_items: 10, page_views: 120, buy_box_pct: 90, units_refunded: 0 },
    { marketplace_id: 'A1PA6795UKMFR9', report_date: '2026-08-10', currency: 'EUR', units_ordered: 20, sessions: 100, ordered_revenue: 2000, total_order_items: 20, page_views: 130, buy_box_pct: 70, units_refunded: 0 },
  ]
  const r5 = aggregate(multi, { start: '2026-08-10', end: '2026-08-10', grain: 'daily' })
  ok('marketplaces kept separate', r5.marketplaces.length === 2)
  ok('GBP revenue stays with UK', r5.marketplaces.find(m => m.short === 'UK').current.revenue === 1000)
  ok('EUR revenue stays with DE', r5.marketplaces.find(m => m.short === 'DE').current.revenue === 2000)
  ok('each marketplace carries its own currency',
    r5.marketplaces.find(m => m.short === 'UK').currency === 'GBP' &&
    r5.marketplaces.find(m => m.short === 'DE').currency === 'EUR')
  ok('no cross-marketplace revenue total is produced', r5.meta.cross_marketplace_revenue_total === null)
  ok('sorted by units, not revenue', r5.marketplaces[0].short === 'DE')

  // -------------------------------------------------------------------------
  console.log('\nSparse coverage (backfill still running)')
  // -------------------------------------------------------------------------
  const sparse = [
    { marketplace_id: 'X', report_date: '2026-08-10', currency: 'GBP', units_ordered: 5, sessions: 50, ordered_revenue: 50, total_order_items: 5, page_views: 60, buy_box_pct: 90, units_refunded: 0 },
    { marketplace_id: 'X', report_date: '2026-08-14', currency: 'GBP', units_ordered: 5, sessions: 50, ordered_revenue: 50, total_order_items: 5, page_views: 60, buy_box_pct: 90, units_refunded: 0 },
  ]
  const r6 = aggregate(sparse, { start: '2026-08-10', end: '2026-08-16', grain: 'daily' })
  const cov = r6.marketplaces[0].current.coverage
  ok('coverage counts real days present', cov.days_with_data === 2)
  ok('coverage counts days expected', cov.days_expected === 7)
  ok('coverage flags incompleteness', cov.complete === false)
  ok('missing dates enumerated', cov.missing_dates.length === 5 && cov.missing_dates[0] === '2026-08-11')
  ok('only days with data become buckets', r6.marketplaces[0].buckets.length === 2)

  // A partial week at the edge of the range must not be reported as 5/7 missing.
  const r7 = aggregate(sparse, { start: '2026-08-14', end: '2026-08-16', grain: 'weekly' })
  ok('bucket coverage clipped to requested range', r7.marketplaces[0].buckets[0].coverage.days_expected === 3)

  // -------------------------------------------------------------------------
  console.log('\nCoverage from amazon_asin_daily_status (three-state)')
  // -------------------------------------------------------------------------
  // The whole point: a day pulled successfully with no rows is a real zero and
  // must count as covered. A day never pulled, or one Amazon returned nothing
  // usable for, must NOT be counted as zero.
  const statusRows = [
    { marketplace_id: 'X', report_date: '2026-08-10', status: 'ok' },
    { marketplace_id: 'X', report_date: '2026-08-11', status: 'ok' },   // zero-sales day
    { marketplace_id: 'X', report_date: '2026-08-12', status: 'gap' },
    { marketplace_id: 'X', report_date: '2026-08-13', status: 'parse_failed' },
    // 2026-08-14 deliberately absent -> never attempted
  ]
  const oneDayOfRows = [
    { marketplace_id: 'X', report_date: '2026-08-10', currency: 'GBP', units_ordered: 10, sessions: 100, ordered_revenue: 100, total_order_items: 10, page_views: 120, buy_box_pct: 90, units_refunded: 0 },
  ]
  const r9 = aggregate(oneDayOfRows, { start: '2026-08-10', end: '2026-08-14', grain: 'daily', status: statusRows })
  const cv = r9.marketplaces[0].current.coverage
  ok('status table is used as the coverage basis', cv.status_known === true)
  ok('successful pulls count as covered', cv.days_with_data === 2, `got ${cv.days_with_data}, expected 10th (rows) + 11th (real zero)`)
  ok('a real zero-sales day is identified', cv.days_zero_sales === 1)
  ok('gap day counted separately', cv.days_gap === 1)
  ok('parse failure counted separately', cv.days_parse_failed === 1)
  ok('never-attempted day counted separately', cv.days_not_fetched === 1)
  ok('missing = gap + failed + unattempted, not the zero-sales day',
    cv.missing_dates.join(',') === '2026-08-12,2026-08-13,2026-08-14')
  ok('a zero-sales day is NOT reported as missing', !cv.missing_dates.includes('2026-08-11'))
  ok('totals ignore unknown days', r9.marketplaces[0].current.units === 10)

  // A marketplace pulled successfully that sold nothing must still appear.
  const r10 = aggregate([], {
    start: '2026-08-10', end: '2026-08-10', grain: 'daily',
    status: [{ marketplace_id: 'A1F83G8C2ARO7P', report_date: '2026-08-10', status: 'ok' }],
  })
  ok('zero-sales marketplace still appears', r10.marketplaces.length === 1 && r10.marketplaces[0].short === 'UK')
  ok('zero-sales marketplace shows real zeros', r10.marketplaces[0].current.units === 0)
  ok('zero-sales marketplace has full coverage', r10.marketplaces[0].current.coverage.complete === true)
  ok('zero-sales marketplace has null conversion, not 0%', r10.marketplaces[0].current.conversion === null)

  // Without status rows, behaviour degrades to presence-of-rows and says so.
  const r11 = aggregate(oneDayOfRows, { start: '2026-08-10', end: '2026-08-14', grain: 'daily' })
  ok('no status -> coverage falls back to row presence', r11.marketplaces[0].current.coverage.status_known === false)
  ok('no status -> fallback still counts correctly', r11.marketplaces[0].current.coverage.days_with_data === 1)

  // -------------------------------------------------------------------------
  console.log('\nPercentage scale is a documented constant, with a tripwire')
  // -------------------------------------------------------------------------
  const r12 = aggregate(oneDayOfRows, { start: '2026-08-10', end: '2026-08-10', grain: 'daily' })
  ok('buy box 90 is read as 90%, not 9000%', close(r12.marketplaces[0].current.buy_box, 0.90))
  ok('scale is pinned to 100', r12.meta.pct_scale === 100)
  const fractionish = [
    { marketplace_id: 'X', report_date: '2026-08-10', currency: 'GBP', units_ordered: 1, sessions: 10, ordered_revenue: 1, total_order_items: 1, page_views: 10, buy_box_pct: 0.9, units_refunded: 0 },
  ]
  const r13 = aggregate(fractionish, { start: '2026-08-10', end: '2026-08-10', grain: 'daily' })
  ok('a fraction-looking column trips the warning', r13.meta.pct_scale_suspect === true)
  ok('tripwire does not silently change the maths', r13.meta.pct_scale === 100)

  // Values above 100 are real and must survive — unit_session_pct_b2b hit exactly
  // 1000 in production on 2026-06-18, which is why the column was widened.
  const over100 = [
    { marketplace_id: 'X', report_date: '2026-08-10', currency: 'GBP', units_ordered: 5, sessions: 1, ordered_revenue: 5, total_order_items: 5, page_views: 1, buy_box_pct: 100, units_refunded: 0 },
  ]
  const r14 = aggregate(over100, { start: '2026-08-10', end: '2026-08-10', grain: 'daily' })
  ok('conversion above 100% is preserved, not clamped', close(r14.marketplaces[0].current.conversion, 5))

  // -------------------------------------------------------------------------
  console.log('\nMarketplace map matches the connector')
  // -------------------------------------------------------------------------
  const expectedIds = ['A1F83G8C2ARO7P','A1PA6795UKMFR9','A13V1IB3VIYZZH','APJ6JRA9NG5V4','A1RKKUPIHCS9HS',
    'A1805IZSGTT6HS','AMEN7PMS3EDWL','A1C3SOZRARQ6R3','A2NODRKZP88ZB9','A33AVAJ2PDY3EV','A28R8C7NBKEWEA',
    'A2VIGQ35RCS4UG','A17E79C6D8DWNP','ATVPDKIKX0DER','A2EUQ1WTGCTBG2','A1AM78C64UM0Y8','A1VC38T7YXB528',
    'A39IBJ37TRP1C6','A19VAU5U5O7RUS']
  ok('all 19 connector marketplaces are mapped', expectedIds.every(id => mod.MARKETPLACES[id]))
  ok('no extra marketplaces invented', Object.keys(mod.MARKETPLACES).length === 19)
  ok('Ireland present', mod.MARKETPLACES.A28R8C7NBKEWEA?.short === 'IE')
  ok('unknown id degrades to the raw id', mod.marketplaceName('AZZZZZZZZZZZZ') === 'AZZZZZZZZZZZZ')

  // -------------------------------------------------------------------------
  console.log('\nComparison period')
  // -------------------------------------------------------------------------
  const pp = previousPeriod('2026-08-10', '2026-08-16')
  ok('previous period is equal length', pp.days === 7)
  ok('previous period ends the day before', pp.end === '2026-08-09')
  ok('previous period start', pp.start === '2026-08-03')

  const compared = [
    { marketplace_id: 'X', report_date: '2026-08-10', currency: 'GBP', units_ordered: 100, sessions: 1000, ordered_revenue: 1000, total_order_items: 100, page_views: 1200, buy_box_pct: 90, units_refunded: 0 },
    { marketplace_id: 'X', report_date: '2026-08-03', currency: 'GBP', units_ordered: 50, sessions: 1000, ordered_revenue: 500, total_order_items: 50, page_views: 1100, buy_box_pct: 80, units_refunded: 0 },
  ]
  const r8 = aggregate(compared, { start: '2026-08-10', end: '2026-08-16', grain: 'daily', compare: pp })
  const d = r8.marketplaces[0].delta
  ok('units delta is a percentage change', close(d.units, 1.0))
  ok('revenue delta is a percentage change', close(d.revenue, 1.0))
  ok('sessions flat', close(d.sessions, 0))
  ok('conversion delta is percentage POINTS not percent', close(d.conversion_pp, 0.10 - 0.05),
    `5% -> 10% must read as +5pp, got ${d.conversion_pp}`)
  ok('buy box delta is percentage points', close(d.buy_box_pp, 0.90 - 0.80))
  ok('comparison rows excluded from current totals', r8.marketplaces[0].current.units === 100)
  ok('comparison rows counted in previous totals', r8.marketplaces[0].previous.units === 50)
  ok('growth from a zero base is null, not Infinity',
    buildDeltaZero(mod) === null)

  // -------------------------------------------------------------------------
  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

function buildDeltaZero(mod) {
  const d = mod.buildDelta({ orders: 5, units: 5, revenue: 5, sessions: 5, page_views: 5, conversion: null, buy_box: null, refund_rate: null },
                           { orders: 0, units: 0, revenue: 0, sessions: 0, page_views: 0, conversion: null, buy_box: null, refund_rate: null })
  return d.units
}

main().catch((e) => { console.error(e); process.exit(1) })
