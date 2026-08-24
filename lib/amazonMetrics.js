// lib/amazonMetrics.js
// Pure aggregation logic for the Amazon performance summary report.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE
// ----------------------------------------
// `unit_session_pct` and `buy_box_pct` in amazon_asin_daily are per-ASIN-per-day
// figures. Averaging them across ASINs or across dates produces numbers that are
// wrong but look plausible. Every derived metric here is recalculated from the
// underlying sums at the grain being displayed:
//
//   conversion rate = SUM(units_ordered) / SUM(sessions)
//   buy box %       = SUM(buy_box_pct * sessions) / SUM(sessions)   [session-weighted]
//   refund rate     = SUM(units_refunded) / SUM(units_ordered)
//
// There is no code path in this file that takes the mean of a percentage column.
//
// DATES
// -----
// `report_date` is marketplace-local as Amazon reports it. Amazon gives daily
// totals with no timestamps, so there is nothing to convert and no conversion is
// attempted. Every date here is handled as a plain 'YYYY-MM-DD' string and
// bucketed by its literal calendar components. We never call `new Date(str)` on a
// bare date string — that parses as UTC midnight and silently shifts the day for
// anyone west of Greenwich.
//
// CURRENCY
// --------
// `ordered_revenue` is denominated in the marketplace's own currency and there is
// no FX table. Revenue is therefore only ever summed *within* a marketplace.
// There is deliberately no cross-marketplace revenue total.

// ---------------------------------------------------------------------------
// Marketplace identity
// ---------------------------------------------------------------------------

// Amazon's published marketplace IDs. Used for display names and as a sanity
// check on the currency the data reports. Unknown IDs fall back to the raw ID —
// the report never hides a marketplace just because it isn't in this map.
// The 19 marketplaces doddl actually sells in, lifted from the _ACCOUNTS table in
// connectors/scheduler/jobs/amazon_sp_api.py so the report and the connector
// cannot drift apart. Currency is the marketplace's own — see the currency note
// at the top of this file.
export const MARKETPLACES = {
  // EU account (seller A95LVHANDHOSF)
  A1F83G8C2ARO7P: { name: 'United Kingdom', short: 'UK', currency: 'GBP', account: 'EU' },
  A1PA6795UKMFR9: { name: 'Germany', short: 'DE', currency: 'EUR', account: 'EU' },
  A13V1IB3VIYZZH: { name: 'France', short: 'FR', currency: 'EUR', account: 'EU' },
  APJ6JRA9NG5V4: { name: 'Italy', short: 'IT', currency: 'EUR', account: 'EU' },
  A1RKKUPIHCS9HS: { name: 'Spain', short: 'ES', currency: 'EUR', account: 'EU' },
  A1805IZSGTT6HS: { name: 'Netherlands', short: 'NL', currency: 'EUR', account: 'EU' },
  AMEN7PMS3EDWL: { name: 'Belgium', short: 'BE', currency: 'EUR', account: 'EU' },
  A1C3SOZRARQ6R3: { name: 'Poland', short: 'PL', currency: 'PLN', account: 'EU' },
  A2NODRKZP88ZB9: { name: 'Sweden', short: 'SE', currency: 'SEK', account: 'EU' },
  A33AVAJ2PDY3EV: { name: 'Turkey', short: 'TR', currency: 'TRY', account: 'EU' },
  A28R8C7NBKEWEA: { name: 'Ireland', short: 'IE', currency: 'EUR', account: 'EU' },
  A2VIGQ35RCS4UG: { name: 'United Arab Emirates', short: 'AE', currency: 'AED', account: 'EU' },
  A17E79C6D8DWNP: { name: 'Saudi Arabia', short: 'SA', currency: 'SAR', account: 'EU' },
  // NA account (seller A2J3OJ1QMMOAR5)
  ATVPDKIKX0DER: { name: 'United States', short: 'US', currency: 'USD', account: 'NA' },
  A2EUQ1WTGCTBG2: { name: 'Canada', short: 'CA', currency: 'CAD', account: 'NA' },
  A1AM78C64UM0Y8: { name: 'Mexico', short: 'MX', currency: 'MXN', account: 'NA' },
  // Far East — one seller account per marketplace
  A1VC38T7YXB528: { name: 'Japan', short: 'JP', currency: 'JPY', account: 'FE-JP' },
  A39IBJ37TRP1C6: { name: 'Australia', short: 'AU', currency: 'AUD', account: 'FE-AU' },
  A19VAU5U5O7RUS: { name: 'Singapore', short: 'SG', currency: 'SGD', account: 'FE-SG' },
}

export function marketplaceName(id) {
  return MARKETPLACES[id]?.name || id
}

export function marketplaceShort(id) {
  return MARKETPLACES[id]?.short || id
}

// ---------------------------------------------------------------------------
// Plain-date helpers — string in, string out, no timezone anywhere
// ---------------------------------------------------------------------------

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isPlainDate(s) {
  return typeof s === 'string' && DATE_RE.test(s)
}

/** 'YYYY-MM-DD' -> {y, m, d} as numbers. Returns null on anything else. */
export function parts(dateStr) {
  const m = DATE_RE.exec(String(dateStr || ''))
  if (!m) return null
  return { y: +m[1], m: +m[2], d: +m[3] }
}

/**
 * A Date pinned to UTC midnight of the given plain date. Used ONLY as an
 * arithmetic vehicle for day-stepping and weekday lookup. Because both
 * construction and read-back go through UTC accessors, the local timezone of
 * whoever runs this never enters the calculation.
 */
function utcDate(dateStr) {
  const p = parts(dateStr)
  if (!p) return null
  return new Date(Date.UTC(p.y, p.m - 1, p.d))
}

function toPlain(d) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function addDays(dateStr, n) {
  const d = utcDate(dateStr)
  if (!d) return null
  d.setUTCDate(d.getUTCDate() + n)
  return toPlain(d)
}

/** Inclusive day count between two plain dates. */
export function daysBetween(startStr, endStr) {
  const a = utcDate(startStr)
  const b = utcDate(endStr)
  if (!a || !b) return 0
  return Math.floor((b - a) / 86400000) + 1
}

/** Every plain date from start to end inclusive. */
export function dateRange(startStr, endStr) {
  const out = []
  if (!isPlainDate(startStr) || !isPlainDate(endStr) || startStr > endStr) return out
  let cur = startStr
  // Hard stop guards against a pathological range locking up the request.
  for (let i = 0; i < 4000 && cur <= endStr; i++) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

/** Monday of the ISO week containing this date. */
export function weekStart(dateStr) {
  const d = utcDate(dateStr)
  if (!d) return null
  const dow = d.getUTCDay() // 0 = Sunday
  const backToMonday = dow === 0 ? 6 : dow - 1
  d.setUTCDate(d.getUTCDate() - backToMonday)
  return toPlain(d)
}

export function monthStart(dateStr) {
  const p = parts(dateStr)
  if (!p) return null
  return `${p.y}-${String(p.m).padStart(2, '0')}-01`
}

function monthEnd(dateStr) {
  const p = parts(dateStr)
  if (!p) return null
  // Day 0 of the following month is the last day of this one.
  const d = new Date(Date.UTC(p.y, p.m, 0))
  return toPlain(d)
}

export const GRAINS = ['daily', 'weekly', 'monthly']

/** The bucket key a given report_date falls into, for the chosen grain. */
export function bucketKeyFor(dateStr, grain) {
  if (grain === 'weekly') return weekStart(dateStr)
  if (grain === 'monthly') return monthStart(dateStr)
  return dateStr
}

/** The full [start, end] span of a bucket, unclipped by the requested range. */
export function bucketSpan(key, grain) {
  if (grain === 'weekly') return { start: key, end: addDays(key, 6) }
  if (grain === 'monthly') return { start: key, end: monthEnd(key) }
  return { start: key, end: key }
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function bucketLabel(key, grain) {
  const p = parts(key)
  if (!p) return key
  if (grain === 'monthly') return `${MONTH_NAMES[p.m - 1]} ${p.y}`
  if (grain === 'weekly') {
    const end = addDays(key, 6)
    const pe = parts(end)
    const sameMonth = pe && pe.m === p.m
    return sameMonth
      ? `${p.d}–${pe.d} ${MONTH_NAMES[p.m - 1]} ${p.y}`
      : `${p.d} ${MONTH_NAMES[p.m - 1]} – ${pe.d} ${MONTH_NAMES[pe.m - 1]} ${pe.y}`
  }
  return `${p.d} ${MONTH_NAMES[p.m - 1]} ${p.y}`
}

// ---------------------------------------------------------------------------
// Percentage scale
// ---------------------------------------------------------------------------
//
// buy_box_pct and unit_session_pct are stored on a 0–100 scale, NOT as 0–1
// fractions. This is established by the schema and the connector, not inferred:
//
//   - lib/migrations/14-amazon-asin-daily.sql widened these columns from
//     numeric(6,3) to numeric(10,3) because a live backfill run on 2026-06-18
//     hit a real value of exactly 1000 for unit_session_pct_b2b. A 0–1 fraction
//     cannot be 1000.
//   - reports/amazon-reports-api.md records a rev-4 test asserting that
//     "unit_session_pct values over 100" are preserved rather than clamped.
//
// So the scale is a documented constant. `detectPctScale` remains only as a
// runtime tripwire: if a payload ever looks like fractions, the API surfaces a
// warning rather than silently rendering buy box as 0.9% instead of 90%.

export const PCT_SCALE = 100

/**
 * Tripwire, not a decision. Returns 1 only if every non-null value sits inside
 * [0,1], which for a real dataset of buy-box percentages would be extraordinary
 * and is far more likely to mean the ingest changed shape underneath us.
 */
export function detectPctScale(values) {
  let sawValue = false
  for (const v of values) {
    if (v == null) continue
    const n = Number(v)
    if (!Number.isFinite(n)) continue
    sawValue = true
    if (n > 1.0000001) return 100
  }
  return sawValue ? 1 : 100
}

/** Normalise a stored percentage to a 0–1 fraction given the detected scale. */
function asFraction(v, scale) {
  if (v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return scale === 100 ? n / 100 : n
}

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// ---------------------------------------------------------------------------
// Accumulator
// ---------------------------------------------------------------------------

function emptyAcc() {
  return {
    orders: 0,
    units: 0,
    revenue: 0,
    sessions: 0,
    page_views: 0,
    units_refunded: 0,
    // Session-weighted buy box. Numerator and denominator are tracked separately
    // and the denominator counts ONLY sessions from rows that actually reported a
    // buy_box_pct — mixing in sessions from rows with a null buy box would drag
    // the weighted figure toward zero.
    bb_weighted_num: 0,
    bb_weight_den: 0,
    bb_rows_missing: 0,
    // Distinct report_dates seen, for honest coverage reporting against a
    // backfill that is still filling in.
    dates: new Set(),
    currencies: new Set(),
    rows: 0,
  }
}

function accumulate(acc, row, pctScale) {
  acc.rows += 1
  acc.orders += num(row.total_order_items)
  acc.units += num(row.units_ordered)
  acc.revenue += num(row.ordered_revenue)
  acc.sessions += num(row.sessions)
  acc.page_views += num(row.page_views)
  acc.units_refunded += num(row.units_refunded)

  const bb = asFraction(row.buy_box_pct, pctScale)
  const rowSessions = num(row.sessions)
  if (bb != null && rowSessions > 0) {
    acc.bb_weighted_num += bb * rowSessions
    acc.bb_weight_den += rowSessions
  } else if (bb == null) {
    acc.bb_rows_missing += 1
  }

  if (row.report_date) acc.dates.add(row.report_date)
  if (row.currency) acc.currencies.add(row.currency)
}

/**
 * Turn an accumulator into the shape the UI consumes.
 *
 * COVERAGE IS THREE-STATE, NOT TWO-STATE
 * --------------------------------------
 * "No rows for this day" and "no data for this day" are different facts, and
 * conflating them is the specific way a report over a running backfill lies.
 * amazon_asin_daily_status records, per (marketplace, day), whether the pull
 * succeeded ('ok'), came back with nothing usable ('gap'), or failed to parse
 * ('parse_failed'). A day absent from that table was never attempted.
 *
 * So:
 *   status 'ok'  + rows      -> a real trading day
 *   status 'ok'  + no rows   -> a real day with genuinely zero sales. Counts as
 *                               covered; excluding it would flatter the averages.
 *   status 'gap' / 'parse_failed' / absent -> unknown. Excluded from totals and
 *                               reported as missing, never counted as zero.
 *
 * @param {string[]} expectedDates calendar dates this bucket could cover, clipped
 *                                 to the requested range
 * @param {(d: string) => string|null} statusFor  status for this marketplace/day
 */
function finalise(acc, expectedDates, statusFor = () => null) {
  const expected = expectedDates.length

  const ok = []
  const gap = []
  const failed = []
  const notFetched = []
  for (const d of expectedDates) {
    const st = statusFor(d)
    if (st === 'ok') ok.push(d)
    else if (st === 'gap') gap.push(d)
    else if (st === 'parse_failed') failed.push(d)
    else notFetched.push(d)
  }

  // When the status table is unavailable (older data, or the status read failed)
  // fall back to presence-of-rows, which is the best signal left.
  const haveStatus = ok.length + gap.length + failed.length > 0
  const present = haveStatus ? ok.length : expectedDates.filter((d) => acc.dates.has(d)).length
  const missing = haveStatus
    ? [...gap, ...failed, ...notFetched].sort()
    : expectedDates.filter((d) => !acc.dates.has(d))

  return {
    orders: acc.orders,
    units: acc.units,
    revenue: round2(acc.revenue),
    sessions: acc.sessions,
    page_views: acc.page_views,
    units_refunded: acc.units_refunded,

    // conversion = sum(units) / sum(sessions). Null, not zero, when there were no
    // sessions — a period with no traffic has an undefined conversion rate, and
    // rendering it as 0% would read as catastrophic performance rather than
    // absent data.
    conversion: acc.sessions > 0 ? acc.units / acc.sessions : null,

    // Session-weighted buy box, per the rule at the top of this file.
    buy_box: acc.bb_weight_den > 0 ? acc.bb_weighted_num / acc.bb_weight_den : null,
    buy_box_basis_sessions: acc.bb_weight_den,
    buy_box_rows_missing: acc.bb_rows_missing,

    refund_rate: acc.units > 0 ? acc.units_refunded / acc.units : null,

    coverage: {
      days_with_data: present,
      days_expected: expected,
      days_ok: ok.length,
      days_gap: gap.length,
      days_parse_failed: failed.length,
      days_not_fetched: notFetched.length,
      // Days that reported successfully but had no rows: genuine zero-sales days
      // for this marketplace, not holes.
      days_zero_sales: ok.filter((d) => !acc.dates.has(d)).length,
      status_known: haveStatus,
      missing_dates: missing.length <= 40 ? missing : missing.slice(0, 40),
      missing_truncated: missing.length > 40,
      complete: expected > 0 && present === expected,
    },
    row_count: acc.rows,
    currencies: [...acc.currencies],
  }
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// ---------------------------------------------------------------------------
// Deltas
// ---------------------------------------------------------------------------
//
// Count and money metrics compare as percentage change. Rate metrics (conversion,
// buy box, refund rate) compare as percentage-POINT change — a conversion rate
// moving 2% -> 3% is +1pp, not +50%, and conflating the two is how dashboards end
// up telling people a good story about a bad week.

function pctChange(cur, prev) {
  if (prev == null || cur == null) return null
  if (prev === 0) return cur === 0 ? 0 : null // undefined growth from a zero base
  return (cur - prev) / prev
}

function ppChange(cur, prev) {
  if (cur == null || prev == null) return null
  return cur - prev
}

export function buildDelta(cur, prev) {
  if (!cur || !prev) return null
  return {
    orders: pctChange(cur.orders, prev.orders),
    units: pctChange(cur.units, prev.units),
    revenue: pctChange(cur.revenue, prev.revenue),
    sessions: pctChange(cur.sessions, prev.sessions),
    page_views: pctChange(cur.page_views, prev.page_views),
    conversion_pp: ppChange(cur.conversion, prev.conversion),
    buy_box_pp: ppChange(cur.buy_box, prev.buy_box),
    refund_rate_pp: ppChange(cur.refund_rate, prev.refund_rate),
  }
}

/**
 * The previous equivalent period: the same number of calendar days, immediately
 * preceding the requested range. Deliberately length-based rather than
 * calendar-based so that "last 30 days" compares against the 30 days before it;
 * a month-length range therefore compares to an equal-length window, not to the
 * previous named month.
 */
export function previousPeriod(start, end) {
  const len = daysBetween(start, end)
  if (!len) return null
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(len - 1))
  return { start: prevStart, end: prevEnd, days: len }
}

// ---------------------------------------------------------------------------
// The aggregation itself
// ---------------------------------------------------------------------------

/**
 * @param {Array<object>} rows   raw amazon_asin_daily rows spanning BOTH the
 *                               current and comparison ranges
 * @param {object} opts
 * @param {string} opts.start    current range start, 'YYYY-MM-DD'
 * @param {string} opts.end      current range end, 'YYYY-MM-DD'
 * @param {string} opts.grain    'daily' | 'weekly' | 'monthly'
 * @param {object|null} opts.compare  {start, end} or null
 * @param {Array<object>} opts.status  amazon_asin_daily_status rows
 *                               ({marketplace_id, report_date, status, reason}),
 *                               used to tell "zero sales" apart from "not pulled
 *                               yet". Optional; coverage degrades to
 *                               presence-of-rows without it.
 */
export function aggregate(rows, { start, end, grain = 'daily', compare = null, status = [] }) {
  const g = GRAINS.includes(grain) ? grain : 'daily'

  // The scale is a documented constant (see PCT_SCALE). detectPctScale runs only
  // as a tripwire so a change in the ingest surfaces as a warning instead of a
  // silent 100x error on the buy box headline.
  const pctScale = PCT_SCALE
  const observedScale = detectPctScale(rows.map((r) => r.buy_box_pct))
  const pctScaleSuspect = observedScale !== PCT_SCALE

  // (marketplace_id, report_date) -> 'ok' | 'gap' | 'parse_failed'
  const statusIndex = new Map()
  for (const srow of status || []) {
    if (!srow || !isPlainDate(srow.report_date)) continue
    statusIndex.set(`${srow.marketplace_id}|${srow.report_date}`, srow.status)
  }
  const statusForFactory = (mpId) => (d) => statusIndex.get(`${mpId}|${d}`) || null

  const currentDates = new Set(dateRange(start, end))
  const compareDates = compare ? new Set(dateRange(compare.start, compare.end)) : new Set()

  // marketplace_id -> { current, previous, buckets: Map<key, acc> }
  const byMarketplace = new Map()

  const ensure = (id) => {
    if (!byMarketplace.has(id)) {
      byMarketplace.set(id, {
        marketplace_id: id,
        current: emptyAcc(),
        previous: emptyAcc(),
        buckets: new Map(),
      })
    }
    return byMarketplace.get(id)
  }

  let dataMin = null
  let dataMax = null
  let skipped = 0

  for (const row of rows) {
    const d = row.report_date
    if (!isPlainDate(d)) {
      skipped += 1
      continue
    }
    if (dataMin === null || d < dataMin) dataMin = d
    if (dataMax === null || d > dataMax) dataMax = d

    const mp = ensure(row.marketplace_id || 'unknown')

    if (currentDates.has(d)) {
      accumulate(mp.current, row, pctScale)
      const key = bucketKeyFor(d, g)
      if (!mp.buckets.has(key)) mp.buckets.set(key, emptyAcc())
      accumulate(mp.buckets.get(key), row, pctScale)
    } else if (compareDates.has(d)) {
      accumulate(mp.previous, row, pctScale)
    } else {
      skipped += 1
    }
  }

  // A marketplace that was pulled successfully across the range but sold nothing
  // produces no rows at all. Without this it would silently disappear from the
  // report, which reads as "we don't sell there" rather than "sold nothing" —
  // the same confusion the status table exists to remove.
  for (const srow of status || []) {
    if (srow?.status === 'ok' && currentDates.has(srow.report_date)) ensure(srow.marketplace_id)
  }

  const currentDateList = dateRange(start, end)
  const compareDateList = compare ? dateRange(compare.start, compare.end) : []

  const marketplaces = [...byMarketplace.values()]
    .map((mp) => {
      const statusFor = statusForFactory(mp.marketplace_id)
      const current = finalise(mp.current, currentDateList, statusFor)
      const previous = compare ? finalise(mp.previous, compareDateList, statusFor) : null

      const buckets = [...mp.buckets.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([key, acc]) => {
          const span = bucketSpan(key, g)
          // Clip the bucket's expected days to the requested range, so a partial
          // first or last week isn't reported as 5/7 days missing.
          const expStart = span.start < start ? start : span.start
          const expEnd = span.end > end ? end : span.end
          return {
            key,
            label: bucketLabel(key, g),
            start: span.start,
            end: span.end,
            ...finalise(acc, dateRange(expStart, expEnd), statusFor),
          }
        })

      // Currency is per marketplace and never summed across them. If a single
      // marketplace somehow reports more than one currency, surface it rather
      // than silently adding pounds to euros.
      const currencies = current.currencies.length
        ? current.currencies
        : MARKETPLACES[mp.marketplace_id]
        ? [MARKETPLACES[mp.marketplace_id].currency]
        : []

      return {
        marketplace_id: mp.marketplace_id,
        name: marketplaceName(mp.marketplace_id),
        short: marketplaceShort(mp.marketplace_id),
        currency: currencies[0] || null,
        currency_conflict: currencies.length > 1 ? currencies : null,
        current,
        previous,
        delta: previous ? buildDelta(current, previous) : null,
        buckets,
      }
    })
    // Rank by units rather than revenue: revenue isn't comparable across
    // currencies, units are.
    .sort((a, b) => b.current.units - a.current.units || a.name.localeCompare(b.name))

  return {
    range: { start, end, days: daysBetween(start, end) },
    compare: compare ? { ...compare } : null,
    grain: g,
    marketplaces,
    meta: {
      row_count: rows.length,
      rows_outside_range: skipped,
      pct_scale: pctScale,
      pct_scale_suspect: pctScaleSuspect,
      pct_scale_note: pctScaleSuspect
        ? 'buy_box_pct values all fall within [0,1], which does not match the documented 0-100 storage scale. Percentages below may be wrong by 100x — check the ingest.'
        : null,
      status_rows: (status || []).length,
      data_min_date: dataMin,
      data_max_date: dataMax,
      // Stated explicitly so the client never invents one.
      cross_marketplace_revenue_total: null,
      cross_marketplace_note:
        'ordered_revenue is denominated in each marketplace currency and no FX table exists. Revenue is not totalled across marketplaces.',
    },
  }
}
