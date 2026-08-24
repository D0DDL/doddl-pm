// pages/api/amazon/coverage.js
// Where does the data actually start and stop?
//
// The backfill is running newest-first, so the report must not open on a default
// date range that predates the data — an empty result would read as "no sales"
// rather than "not loaded yet". The UI calls this first and anchors its default
// range to real coverage.

import { fetchCoverageBounds, configuredProjectRef, PRODUCTION_PROJECT_REF } from '../../../lib/amazonSupabase'
import { withUserAuth } from '../../../lib/apiAuth'

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const bounds = await fetchCoverageBounds()
    res.setHeader('Cache-Control', 'private, max-age=300')
    return res.status(200).json({
      ...bounds,
      source: {
        project_ref: configuredProjectRef(),
        is_production: configuredProjectRef() === PRODUCTION_PROJECT_REF,
        table: 'amazon_asin_daily',
      },
    })
  } catch (e) {
    if (e.code === 'NOT_CONFIGURED' || e.code === 'WRONG_PROJECT') {
      return res.status(503).json({ error: e.message })
    }
    console.error('[amazon/coverage]', e.message)
    return res.status(500).json({ error: 'Failed to read coverage bounds', detail: e.message })
  }
}

export default withUserAuth(handler)
