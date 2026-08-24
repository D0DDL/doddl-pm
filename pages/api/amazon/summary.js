// pages/api/amazon/summary.js
// Amazon performance summary, aggregated server-side.
//
// GET /api/amazon/summary?start=YYYY-MM-DD&end=YYYY-MM-DD&grain=daily|weekly|monthly&compare=1
//
// Everything about this route is read-only. It selects from one production table
// and returns aggregates. The production Supabase key lives only in the Node
// runtime (see lib/amazonSupabase.js) and is never sent to the browser.
//
// Aggregation happens here rather than in the client because the client must
// never see ASIN-level rows (this is a summary report by requirement) and
// because the derived metrics have to be recalculated from the underlying sums —
// see lib/amazonMetrics.js for why that matters.

import { fetchRows, fetchStatus, fetchCoverageBounds, configuredProjectRef, PRODUCTION_PROJECT_REF } from '../../../lib/amazonSupabase'
import { aggregate, previousPeriod, isPlainDate, daysBetween, GRAINS } from '../../../lib/amazonMetrics'
import { withUserAuth } from '../../../lib/apiAuth'

const MAX_RANGE_DAYS = 400

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { start, end, grain = 'daily', compare = '1', marketplaces } = req.query

  if (!isPlainDate(start) || !isPlainDate(end)) {
    return res.status(400).json({ error: 'start and end are required as YYYY-MM-DD' })
  }
  if (start > end) {
    return res.status(400).json({ error: 'start must not be after end' })
  }
  if (!GRAINS.includes(grain)) {
    return res.status(400).json({ error: `grain must be one of ${GRAINS.join(', ')}` })
  }

  const rangeDays = daysBetween(start, end)
  if (rangeDays > MAX_RANGE_DAYS) {
    return res.status(400).json({ error: `range is ${rangeDays} days; maximum is ${MAX_RANGE_DAYS}` })
  }

  const wantCompare = compare !== '0' && compare !== 'false'
  const prev = wantCompare ? previousPeriod(start, end) : null

  // One fetch spanning both windows — the comparison period is contiguous with
  // the current one, so a single query covers both and the aggregator splits
  // them by date.
  const fetchStart = prev ? prev.start : start
  const marketplaceIds = marketplaces ? String(marketplaces).split(',').map(s => s.trim()).filter(Boolean) : null

  try {
    const [{ rows, truncated }, statusResult, bounds] = await Promise.all([
      fetchRows({ start: fetchStart, end, marketplaceIds }),
      fetchStatus({ start: fetchStart, end, marketplaceIds }),
      fetchCoverageBounds(),
    ])

    const result = aggregate(rows, { start, end, grain, compare: prev, status: statusResult.rows })

    // The backfill runs newest-first, so a requested range can sit partly or
    // wholly outside the data that exists. Say so explicitly rather than letting
    // an empty result read as "no sales".
    const requestedBeforeData = bounds.min_date && start < bounds.min_date
    const requestedAfterData = bounds.max_date && end > bounds.max_date
    const compareBeforeData = prev && bounds.min_date && prev.start < bounds.min_date

    result.meta = {
      ...result.meta,
      truncated,
      status_available: !statusResult.error,
      status_error: statusResult.error,
      coverage_basis: statusResult.error
        ? 'presence of rows (amazon_asin_daily_status unavailable) — a day with genuinely zero sales cannot be told apart from a day not yet pulled'
        : 'amazon_asin_daily_status — a successful pull with no rows counts as a real zero-sales day; gaps and unfetched days are excluded from totals',
      max_rows_note: truncated ? `Result capped at the row limit; totals are incomplete for this range.` : null,
      data_bounds: bounds,
      requested_before_data_starts: !!requestedBeforeData,
      requested_after_data_ends: !!requestedAfterData,
      // The comparison is the thing most likely to mislead during a backfill: a
      // previous period with thin coverage produces a huge, meaningless "growth"
      // figure. Flag it so the UI can suppress the delta rather than draw it.
      comparison_coverage_warning: !!compareBeforeData,
      generated_at: new Date().toISOString(),
      source: {
        project_ref: configuredProjectRef(),
        is_production: configuredProjectRef() === PRODUCTION_PROJECT_REF,
        table: 'amazon_asin_daily',
      },
      date_semantics:
        'report_date is marketplace-local as Amazon reports it. Amazon supplies daily totals with no timestamps, so no timezone conversion is applied or possible.',
    }

    // Aggregates over a still-filling backfill; a short cache keeps repeated
    // grain toggles cheap without serving stale data for long.
    res.setHeader('Cache-Control', 'private, max-age=60')
    return res.status(200).json(result)
  } catch (e) {
    if (e.code === 'NOT_CONFIGURED' || e.code === 'WRONG_PROJECT') {
      return res.status(503).json({
        error: e.message,
        hint: 'Set SUPABASE_URL_PROD and SUPABASE_SERVICE_ROLE_KEY_PROD on this Vercel environment, pointing at the production project (ikcjciscttsvpxoijnqe). A service role key is required: RLS on amazon_asin_daily grants SELECT only to auth.role() = \'authenticated\', so an anon key returns zero rows rather than an error.',
      })
    }
    // Never leak the connection string or key through an error body.
    console.error('[amazon/summary]', e.message)
    return res.status(500).json({ error: 'Failed to build Amazon summary', detail: e.message })
  }
}

// Gated on a verified Entra ID token. This route returns live commercial data
// from production, so it fails closed: no valid token, no data. See lib/apiAuth.js.
export default withUserAuth(handler)
