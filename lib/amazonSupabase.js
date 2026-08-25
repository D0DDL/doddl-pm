// lib/amazonSupabase.js
// Server-only read path to the Amazon reporting tables in the PRODUCTION
// Supabase project (ikcjciscttsvpxoijnqe).
//
// WHY THIS IS SEPARATE FROM lib/supabase.js
// -----------------------------------------
// lib/supabase.js is the PM tool's own connection. On Vercel preview builds it
// resolves to the STAGING project (iknwprxycshrickpswjz), which has no Amazon
// data. Repointing the app's public client at production would drag the whole PM
// tool onto live data on every preview build and ship a production key to the
// browser.
//
// WHY A SERVICE ROLE KEY, NOT THE ANON KEY
// ----------------------------------------
// Not a convenience choice. lib/migrations/14-amazon-asin-daily.sql enables RLS
// on both tables and grants SELECT only to:
//
//   using (auth.role() = 'authenticated')
//
// An anon key authenticates as role `anon`, not `authenticated`, so it returns
// zero rows — an empty report rather than an error, which is the worst available
// failure mode. The service role bypasses RLS and is the only key that works
// from a server route with no end-user JWT.
//
// The key never leaves the Node runtime: no NEXT_PUBLIC_ prefix, so Next.js will
// not inline it into the client bundle. This module exposes reads and nothing
// else — no insert/update/delete path exists through it, consistent with
// CLAUDE.md Hard Rule 2.

import { createClient } from '@supabase/supabase-js'
import { ALLOWED_MARKETPLACES } from './amazonMetrics.js'

export const PRODUCTION_PROJECT_REF = 'ikcjciscttsvpxoijnqe'

// Variable names follow the convention already established in
// scripts/export_api_raw.py, which faces the same problem — a tool that must read
// production while running against a non-production default:
//
//   SUPABASE_URL_PROD / SUPABASE_SERVICE_ROLE_KEY_PROD   explicit prod pointer
//   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  already prod when the
//                                                         app itself runs in the
//                                                         production environment
//
// Preview deployments need the _PROD pair set explicitly. The production
// deployment works off either.
const URL = process.env.SUPABASE_URL_PROD || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_PROD || process.env.SUPABASE_SERVICE_ROLE_KEY

let client = null

export function configuredProjectRef() {
  const m = /https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(URL || '')
  return m ? m[1] : null
}

export function getAmazonClient() {
  if (!URL || !KEY) {
    const missing = [!URL && 'SUPABASE_URL_PROD', !KEY && 'SUPABASE_SERVICE_ROLE_KEY_PROD'].filter(Boolean)
    const err = new Error(`Amazon data source not configured: missing ${missing.join(', ')}`)
    err.code = 'NOT_CONFIGURED'
    throw err
  }
  // Fail loudly rather than serving staging numbers under a production heading.
  if (configuredProjectRef() !== PRODUCTION_PROJECT_REF) {
    const err = new Error(
      `Amazon data source points at Supabase project '${configuredProjectRef()}', not production (${PRODUCTION_PROJECT_REF}).`
    )
    err.code = 'WRONG_PROJECT'
    throw err
  }
  if (!client) {
    client = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return client
}

export const TABLE = 'amazon_asin_daily'
export const STATUS_TABLE = 'amazon_asin_daily_status'

// Only the columns the summary needs.
//
// Deliberately excluded: every *_b2b column. Amazon's top-level figures already
// include B2B orders — the B2B fields are a subset, not an addition — so pulling
// them here would invite someone to add them into the totals and double-count. A
// B2B split is a separate report if it is wanted.
//
// `asin` is not selected either: the table's grain is per-ASIN and we sum over
// it, but this is a summary report with no ASIN-level detail by requirement. It
// is still used for stable ordering below.
export const SUMMARY_COLUMNS = [
  'marketplace_id',
  'report_date',
  'currency',
  'units_ordered',
  'ordered_revenue',
  'total_order_items',
  'sessions',
  'page_views',
  'buy_box_pct',
  'unit_session_pct',
  'units_refunded',
].join(',')

/**
 * Turn a Supabase error into something a human can act on.
 *
 * supabase-js does not always populate `message`. Against a host blocked by an
 * egress allowlist it returned `{ count: null, error: '' }` — an error that is
 * truthy but describes nothing, so `error.message` logs as an empty string and
 * the failure reads like an empty table. Anything that reaches a log or a
 * response body goes through here first.
 */
function describeError(error, context) {
  const raw = (error && (error.message || error.hint || error.details)) || ''
  if (raw) return `${context} query failed: ${raw}`
  const code = error?.code ? ` (code ${error.code})` : ''
  return `${context} query failed with an empty error${code}. This usually means the request never reached Supabase — a blocked host or a network failure — rather than an empty table.`
}

const PAGE = 1000 // PostgREST's default max rows per response
const MAX_ROWS = 250_000 // Backstop so an over-wide range cannot exhaust memory

/**
 * Fetch every amazon_asin_daily row between two plain dates, paging through the
 * 1000-row response cap.
 *
 * Ordered by (report_date, marketplace_id, asin) — the table's primary key — so
 * offset paging is deterministic. Without a total order, PostgREST can return
 * the same row on two pages or skip one entirely, which corrupts the sums
 * silently and produces a report that is merely slightly wrong.
 */
export async function fetchRows({ start, end, marketplaceIds = null }) {
  const supabase = getAmazonClient()
  const rows = []
  let from = 0
  let truncated = false

  for (;;) {
    let q = supabase
      .from(TABLE)
      .select(SUMMARY_COLUMNS)
      .gte('report_date', start)
      .lte('report_date', end)
      .order('report_date', { ascending: true })
      .order('marketplace_id', { ascending: true })
      .order('asin', { ascending: true })
      .range(from, from + PAGE - 1)

    // Scope is enforced in the query, not only in the aggregator: out-of-scope
    // rows never cross the network, which is both cheaper and removes any path
    // by which a dropped marketplace could reach a total.
    const wanted = (marketplaceIds && marketplaceIds.length)
      ? marketplaceIds.filter((id) => ALLOWED_MARKETPLACES.includes(id))
      : ALLOWED_MARKETPLACES
    q = q.in('marketplace_id', wanted)

    const { data, error } = await q
    if (error) throw new Error(describeError(error, TABLE))
    if (!data || data.length === 0) break

    rows.push(...data)
    if (data.length < PAGE) break

    from += PAGE
    if (rows.length >= MAX_ROWS) {
      truncated = true
      break
    }
  }

  return { rows, truncated }
}

/**
 * Per-(marketplace, day) fetch status for a range.
 *
 * This is what makes a genuine zero-sales day distinguishable from a day the
 * backfill has not reached. Without it both look identical — no rows — and the
 * report would be free to present a hole as a zero.
 */
export async function fetchStatus({ start, end, marketplaceIds = null }) {
  const supabase = getAmazonClient()
  const rows = []
  let from = 0

  for (;;) {
    let q = supabase
      .from(STATUS_TABLE)
      .select('marketplace_id,report_date,status,reason,attempts')
      .gte('report_date', start)
      .lte('report_date', end)
      .order('report_date', { ascending: true })
      .order('marketplace_id', { ascending: true })
      .range(from, from + PAGE - 1)

    const wantedStatus = (marketplaceIds && marketplaceIds.length)
      ? marketplaceIds.filter((id) => ALLOWED_MARKETPLACES.includes(id))
      : ALLOWED_MARKETPLACES
    q = q.in('marketplace_id', wantedStatus)

    const { data, error } = await q
    if (error) {
      // Status is an enhancement, not a dependency. If it is unavailable the
      // aggregator falls back to presence-of-rows and the response says so,
      // rather than failing the whole report.
      return { rows: [], error: describeError(error, STATUS_TABLE) }
    }
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
    from += PAGE
    if (rows.length >= MAX_ROWS) break
  }

  return { rows, error: null }
}

/**
 * Earliest and latest report_date present in the table.
 *
 * The backfill runs newest-first (BACKFILL_REVERSE defaults true in
 * connectors/scheduler/backfill_sales_traffic.py), so this is what tells the UI
 * where real coverage begins, instead of letting someone pick a range that
 * predates the data and read the empty result as zero sales.
 */
export async function fetchCoverageBounds() {
  const supabase = getAmazonClient()

  // Scoped to the allowlist. Saudi Arabia alone carries ~725 days of legacy rows
  // from before it was dropped; unscoped, min_date would report the data as
  // starting years before the in-scope marketplaces actually begin, and the
  // report's default date range would anchor to a period with nothing in it.
  const [{ data: newest, error: e1 }, { data: oldest, error: e2 }] = await Promise.all([
    supabase.from(TABLE).select('report_date').in('marketplace_id', ALLOWED_MARKETPLACES)
      .order('report_date', { ascending: false }).limit(1),
    supabase.from(TABLE).select('report_date').in('marketplace_id', ALLOWED_MARKETPLACES)
      .order('report_date', { ascending: true }).limit(1),
  ])
  if (e1) throw new Error(describeError(e1, 'coverage bounds'))
  if (e2) throw new Error(describeError(e2, 'coverage bounds'))

  return {
    min_date: oldest?.[0]?.report_date || null,
    max_date: newest?.[0]?.report_date || null,
  }
}
