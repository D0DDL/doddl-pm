import { useState, useEffect, useCallback, useMemo } from 'react'
import { addDays, daysBetween, previousPeriod, bucketLabel } from '../lib/amazonMetrics'
import { authFetch, SessionExpiredError } from '../lib/authFetch'

// Amazon performance summary — grouped by marketplace, no ASIN-level detail.
//
// Everything numeric on this screen arrives pre-aggregated from
// /api/amazon/summary. This component does no metric maths of its own beyond
// formatting: conversion and buy box are recalculated server-side from the
// underlying sums, and re-deriving them here would risk reintroducing exactly
// the averaging bug the API exists to prevent.

const CARD = { background: '#fff', borderRadius: 10, border: '1px solid #dfe1e6' }
const LABEL = { fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', letterSpacing: '0.06em' }

const GRAINS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
]

// Presets are anchored to the latest date that actually has data, not to today.
// With a backfill running newest-first, "last 28 days" from today would include
// a tail of dates Amazon has not delivered yet.
const PRESETS = [
  { key: '7', label: 'Last 7 days', days: 7 },
  { key: '28', label: 'Last 28 days', days: 28 },
  { key: '90', label: 'Last 90 days', days: 90 },
  { key: 'mtd', label: 'Month to date' },
  { key: 'custom', label: 'Custom' },
]

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const nf = new Intl.NumberFormat('en-GB')

function fmtInt(n) {
  if (n == null) return '—'
  return nf.format(Math.round(n))
}

function fmtMoney(n, currency) {
  if (n == null) return '—'
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency || 'GBP',
      maximumFractionDigits: 0,
    }).format(n)
  } catch {
    return `${currency || ''} ${nf.format(Math.round(n))}`.trim()
  }
}

function fmtPct(fraction, dp = 2) {
  if (fraction == null) return '—'
  return `${(fraction * 100).toFixed(dp)}%`
}

// Percentage-point deltas render as pp; count/money deltas render as %.
function fmtDeltaPct(v) {
  if (v == null) return null
  const sign = v > 0 ? '+' : ''
  return `${sign}${(v * 100).toFixed(1)}%`
}

function fmtDeltaPP(v) {
  if (v == null) return null
  const sign = v > 0 ? '+' : ''
  return `${sign}${(v * 100).toFixed(2)}pp`
}

// Up is good for every metric on this report except refund rate.
function deltaColor(v, inverse = false) {
  if (v == null || v === 0) return '#6b778c'
  const good = inverse ? v < 0 : v > 0
  return good ? '#00875a' : '#de350b'
}

const todayLocal = () => {
  // The user's own calendar date, used only to bound the date pickers. Never
  // used to interpret report_date, which is marketplace-local.
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function Delta({ value, kind = 'pct', inverse = false, suppressed }) {
  if (suppressed) {
    return <span style={{ fontSize: 11, fontWeight: 600, color: '#a5adba' }} title="Comparison period has little or no data — the backfill has not reached it yet.">vs prev. n/a</span>
  }
  const text = kind === 'pp' ? fmtDeltaPP(value) : fmtDeltaPct(value)
  if (text == null) return <span style={{ fontSize: 11, fontWeight: 600, color: '#a5adba' }}>vs prev. —</span>
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: deltaColor(value, inverse) }}>
      {text} <span style={{ color: '#a5adba', fontWeight: 600 }}>vs prev.</span>
    </span>
  )
}

function Stat({ label, value, delta, deltaKind, inverse, suppressed, note }) {
  return (
    <div style={{ ...CARD, padding: '14px 16px', flex: '1 1 140px', minWidth: 140 }}>
      <p style={{ ...LABEL, marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 800, color: '#172b4d', marginBottom: 4, lineHeight: 1.1 }}>{value}</p>
      <Delta value={delta} kind={deltaKind} inverse={inverse} suppressed={suppressed} />
      {note && <p style={{ fontSize: 10, color: '#a5adba', fontWeight: 600, marginTop: 4 }}>{note}</p>}
    </div>
  )
}

function CoverageChip({ coverage }) {
  if (!coverage || !coverage.days_expected) return null
  const { days_with_data, days_expected, complete, days_gap, days_parse_failed, days_not_fetched, days_zero_sales, status_known } = coverage
  const bg = complete ? '#e3fcef' : days_with_data === 0 ? '#fce8e8' : '#fff0e6'
  const fg = complete ? '#00875a' : days_with_data === 0 ? '#de350b' : '#b7601a'

  // The tooltip separates the three ways a day can be absent, because they mean
  // different things: not pulled yet is a backfill artefact, a gap is Amazon
  // returning nothing usable, and a parse failure is our bug. A successful pull
  // with no rows is a real zero and is counted as covered.
  const detail = []
  if (status_known) {
    if (days_not_fetched) detail.push(`${days_not_fetched} not pulled yet`)
    if (days_gap) detail.push(`${days_gap} returned nothing usable`)
    if (days_parse_failed) detail.push(`${days_parse_failed} failed to parse`)
    if (days_zero_sales) detail.push(`${days_zero_sales} pulled fine with zero sales (counted as covered)`)
  }
  const title = complete
    ? `All ${days_expected} days pulled successfully.${days_zero_sales ? ` ${days_zero_sales} of them had zero sales.` : ''}`
    : detail.length
    ? `${days_with_data} of ${days_expected} days have confirmed data — ${detail.join(', ')}. Totals cover confirmed days only; missing days are excluded, not counted as zero.`
    : `${days_expected - days_with_data} of ${days_expected} days have no rows. Coverage is inferred from row presence because the fetch-status table was unavailable, so a genuine zero-sales day cannot be told apart from a day not yet pulled.`

  return (
    <span title={title} style={{ background: bg, color: fg, borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '2px 8px', whiteSpace: 'nowrap' }}>
      {days_with_data}/{days_expected} days{status_known ? '' : '*'}
    </span>
  )
}

function Banner({ tone = 'warn', children }) {
  const tones = {
    warn: { bg: '#fff8e6', border: '#ffd66b', color: '#7a5300' },
    error: { bg: '#fce8e8', border: '#f5a3a3', color: '#a01414' },
    info: { bg: '#e9f2ff', border: '#a5c7ff', color: '#0747a6' },
  }
  const t = tones[tone] || tones.warn
  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.color, borderRadius: 8, padding: '10px 14px', fontSize: 12.5, fontWeight: 600, marginBottom: 12, lineHeight: 1.5 }}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-marketplace block
// ---------------------------------------------------------------------------

function MarketplaceBlock({ mp, grain, compareSuppressed }) {
  const [open, setOpen] = useState(true)
  const c = mp.current
  const d = mp.delta || {}

  const th = { ...LABEL, fontSize: 10, textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #dfe1e6', whiteSpace: 'nowrap' }
  const thL = { ...th, textAlign: 'left' }
  const td = { fontSize: 12.5, fontWeight: 600, color: '#172b4d', textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #f0f1f3', whiteSpace: 'nowrap' }
  const tdL = { ...td, textAlign: 'left' }

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 16, fontWeight: 800, color: '#172b4d', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#6b778c' }}>{open ? '▼' : '▶'}</span>
          {mp.name}
        </button>
        <span style={{ background: '#f0f1f3', color: '#42526e', borderRadius: 4, fontSize: 10, fontWeight: 700, padding: '2px 6px' }}>{mp.short}</span>
        <span style={{ background: '#ede9fe', color: '#5b21b6', borderRadius: 4, fontSize: 10, fontWeight: 700, padding: '2px 6px' }}>{mp.currency || 'currency unknown'}</span>
        <CoverageChip coverage={c.coverage} />
        {mp.currency_conflict && (
          <span title={`Rows in this marketplace report more than one currency: ${mp.currency_conflict.join(', ')}. Revenue below mixes them.`}
            style={{ background: '#fce8e8', color: '#a01414', borderRadius: 4, fontSize: 10, fontWeight: 700, padding: '2px 6px' }}>
            mixed currency
          </span>
        )}
      </div>

      {/* Headline metrics. Revenue is shown in this marketplace's own currency
          and is never combined with any other marketplace's. */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <Stat label="Orders" value={fmtInt(c.orders)} delta={d.orders} suppressed={compareSuppressed} />
        <Stat label="Units" value={fmtInt(c.units)} delta={d.units} suppressed={compareSuppressed} />
        <Stat label={`Revenue (${mp.currency || '?'})`} value={fmtMoney(c.revenue, mp.currency)} delta={d.revenue} suppressed={compareSuppressed} />
        <Stat label="Sessions" value={fmtInt(c.sessions)} delta={d.sessions} suppressed={compareSuppressed} />
        <Stat label="Page views" value={fmtInt(c.page_views)} delta={d.page_views} suppressed={compareSuppressed} />
        <Stat label="Conversion" value={fmtPct(c.conversion)} delta={d.conversion_pp} deltaKind="pp" suppressed={compareSuppressed}
          note="units ÷ sessions" />
        <Stat label="Buy box" value={fmtPct(c.buy_box, 1)} delta={d.buy_box_pp} deltaKind="pp" suppressed={compareSuppressed}
          note={c.buy_box_rows_missing ? `session-weighted · ${fmtInt(c.buy_box_rows_missing)} rows w/o buy box` : 'session-weighted'} />
      </div>

      {open && (
        <div style={{ ...CARD, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr>
                <th style={thL}>{grain === 'daily' ? 'Day' : grain === 'weekly' ? 'Week' : 'Month'}</th>
                <th style={th}>Orders</th>
                <th style={th}>Units</th>
                <th style={th}>Revenue ({mp.currency || '?'})</th>
                <th style={th}>Sessions</th>
                <th style={th}>Page views</th>
                <th style={th}>Conv.</th>
                <th style={th}>Buy box</th>
                {grain !== 'daily' && <th style={th}>Coverage</th>}
              </tr>
            </thead>
            <tbody>
              {mp.buckets.map(b => (
                <tr key={b.key}>
                  <td style={tdL}>{b.label}</td>
                  <td style={td}>{fmtInt(b.orders)}</td>
                  <td style={td}>{fmtInt(b.units)}</td>
                  <td style={td}>{fmtMoney(b.revenue, mp.currency)}</td>
                  <td style={td}>{fmtInt(b.sessions)}</td>
                  <td style={td}>{fmtInt(b.page_views)}</td>
                  <td style={td}>{fmtPct(b.conversion)}</td>
                  <td style={td}>{fmtPct(b.buy_box, 1)}</td>
                  {grain !== 'daily' && (
                    <td style={{ ...td, textAlign: 'right' }}><CoverageChip coverage={b.coverage} /></td>
                  )}
                </tr>
              ))}
              {/* Period total. Recalculated from sums by the API — NOT a column
                  sum of the rates above, which is why Conv. and Buy box here can
                  differ from the eye's average of the rows. That difference is
                  correct. */}
              <tr style={{ background: '#fafbfc' }}>
                <td style={{ ...tdL, fontWeight: 800 }}>Period total</td>
                <td style={{ ...td, fontWeight: 800 }}>{fmtInt(c.orders)}</td>
                <td style={{ ...td, fontWeight: 800 }}>{fmtInt(c.units)}</td>
                <td style={{ ...td, fontWeight: 800 }}>{fmtMoney(c.revenue, mp.currency)}</td>
                <td style={{ ...td, fontWeight: 800 }}>{fmtInt(c.sessions)}</td>
                <td style={{ ...td, fontWeight: 800 }}>{fmtInt(c.page_views)}</td>
                <td style={{ ...td, fontWeight: 800 }} title="sum(units_ordered) ÷ sum(sessions) across the whole period — not the average of the rows above">{fmtPct(c.conversion)}</td>
                <td style={{ ...td, fontWeight: 800 }} title="session-weighted across the whole period — not the average of the rows above">{fmtPct(c.buy_box, 1)}</td>
                {grain !== 'daily' && <td style={td}><CoverageChip coverage={c.coverage} /></td>}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {c.coverage && !c.coverage.complete && c.coverage.missing_dates?.length > 0 && (
        <p style={{ fontSize: 11, color: '#6b778c', fontWeight: 600, marginTop: 8 }}>
          No rows yet for {c.coverage.missing_dates.slice(0, 8).join(', ')}
          {c.coverage.missing_dates.length > 8 ? ` and ${c.coverage.missing_dates.length - 8} more` : ''}
          {c.coverage.missing_truncated ? '+' : ''}. Totals cover the days present only.
        </p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function AmazonReportView() {
  const [bounds, setBounds] = useState(null)
  const [boundsError, setBoundsError] = useState(null)
  const [start, setStart] = useState(null)
  const [end, setEnd] = useState(null)
  const [grain, setGrain] = useState('daily')
  const [preset, setPreset] = useState('28')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Anchor the initial range to the newest date that actually has data.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await authFetch('/api/amazon/coverage')
        const j = await r.json()
        if (cancelled) return
        if (!r.ok) { setBoundsError(j.error || 'Could not read data coverage'); return }
        setBounds(j)
        const anchor = j.max_date || todayLocal()
        const s = addDays(anchor, -27)
        setEnd(anchor)
        setStart(j.min_date && s < j.min_date ? j.min_date : s)
      } catch (e) {
        if (!cancelled) setBoundsError(e instanceof SessionExpiredError ? e.message : `Could not reach the Amazon data source: ${e.message}`)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const applyPreset = useCallback((key) => {
    setPreset(key)
    if (key === 'custom') return
    const anchor = bounds?.max_date || todayLocal()
    if (key === 'mtd') {
      const s = `${anchor.slice(0, 7)}-01`
      setStart(bounds?.min_date && s < bounds.min_date ? bounds.min_date : s)
      setEnd(anchor)
      return
    }
    const days = Number(key)
    const s = addDays(anchor, -(days - 1))
    setStart(bounds?.min_date && s < bounds.min_date ? bounds.min_date : s)
    setEnd(anchor)
  }, [bounds])

  const load = useCallback(async () => {
    if (!start || !end) return
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ start, end, grain, compare: '1' })
      const r = await authFetch(`/api/amazon/summary?${qs}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.hint ? `${j.error} — ${j.hint}` : (j.error || `HTTP ${r.status}`))
      setData(j)
    } catch (e) {
      setError(e.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [start, end, grain])

  useEffect(() => { load() }, [load])

  const prev = useMemo(() => (start && end ? previousPeriod(start, end) : null), [start, end])

  // If the comparison window sits before the data begins, every delta against it
  // is an artefact of the backfill rather than a real movement. Suppress them.
  const compareSuppressed = !!data?.meta?.comparison_coverage_warning

  const inputStyle = { fontSize: 12.5, fontWeight: 600, color: '#172b4d', border: '1px solid #dfe1e6', borderRadius: 6, padding: '6px 8px', background: '#fff' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#172b4d' }}>Amazon Performance</h1>
        <span style={{ fontSize: 12, color: '#6b778c', fontWeight: 600 }}>Summary by marketplace</span>
      </div>
      <p style={{ fontSize: 11.5, color: '#6b778c', fontWeight: 600, marginBottom: 16 }}>
        Dates are marketplace-local, exactly as Amazon reports them — Amazon supplies daily totals with no timestamps, so they are not converted to UK time.
      </p>

      {/* Controls */}
      <div style={{ ...CARD, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <p style={{ ...LABEL, marginBottom: 5 }}>Period</p>
          <div style={{ display: 'flex', gap: 4 }}>
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => applyPreset(p.key)} style={{
                ...inputStyle, cursor: 'pointer',
                background: preset === p.key ? '#e9f2ff' : '#fff',
                color: preset === p.key ? '#0052cc' : '#42526e',
                borderColor: preset === p.key ? '#a5c7ff' : '#dfe1e6',
              }}>{p.label}</button>
            ))}
          </div>
        </div>

        <div>
          <p style={{ ...LABEL, marginBottom: 5 }}>From</p>
          <input type="date" value={start || ''} max={end || undefined}
            min={bounds?.min_date || undefined}
            onChange={e => { setStart(e.target.value); setPreset('custom') }} style={inputStyle} />
        </div>
        <div>
          <p style={{ ...LABEL, marginBottom: 5 }}>To</p>
          <input type="date" value={end || ''} min={start || undefined}
            max={bounds?.max_date || undefined}
            onChange={e => { setEnd(e.target.value); setPreset('custom') }} style={inputStyle} />
        </div>

        <div>
          <p style={{ ...LABEL, marginBottom: 5 }}>Grain</p>
          <div style={{ display: 'flex', gap: 4 }}>
            {GRAINS.map(g => (
              <button key={g.key} onClick={() => setGrain(g.key)} style={{
                ...inputStyle, cursor: 'pointer',
                background: grain === g.key ? '#e9f2ff' : '#fff',
                color: grain === g.key ? '#0052cc' : '#42526e',
                borderColor: grain === g.key ? '#a5c7ff' : '#dfe1e6',
              }}>{g.label}</button>
            ))}
          </div>
        </div>

        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <p style={{ ...LABEL, marginBottom: 5 }}>Compared with</p>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: compareSuppressed ? '#a5adba' : '#42526e' }}>
            {prev ? `${prev.start} → ${prev.end}` : '—'}
          </p>
        </div>
      </div>

      {boundsError && <Banner tone="error">{boundsError}</Banner>}

      {bounds?.min_date && (
        <Banner tone="info">
          Data currently covers <strong>{bounds.min_date}</strong> to <strong>{bounds.max_date}</strong>. The backfill runs newest-first,
          so earlier dates will appear over time and coverage within this window may still be patchy.
        </Banner>
      )}

      {data?.meta?.requested_before_data_starts && (
        <Banner>Part of the selected range is earlier than any data that exists yet. Days with no rows are excluded from totals rather than counted as zero.</Banner>
      )}
      {compareSuppressed && (
        <Banner>The comparison period sits partly before the data begins, so period-on-period changes would be measuring the backfill rather than performance. Deltas are hidden for this range.</Banner>
      )}
      {data && data.meta.status_available === false && (
        <Banner>
          The fetch-status table could not be read, so coverage is inferred from whether rows exist. A day with genuinely zero sales
          is indistinguishable from a day the backfill has not reached. Coverage figures are marked with an asterisk.
        </Banner>
      )}
      {data?.meta?.pct_scale_suspect && (
        <Banner tone="error">{data.meta.pct_scale_note}</Banner>
      )}
      {data?.meta?.truncated && (
        <Banner tone="error">This range exceeded the row limit and the totals below are incomplete. Narrow the date range.</Banner>
      )}
      {data?.meta?.source && data.meta.source.is_production === false && (
        <Banner tone="error">
          Connected to Supabase project <code>{data.meta.source.project_ref || 'unknown'}</code>, which is not the production project.
          These numbers are not live Amazon data.
        </Banner>
      )}

      {error && <Banner tone="error">{error}</Banner>}

      {loading && !data && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#6b778c', fontWeight: 600 }}>Loading…</div>
      )}

      {data && (
        <div style={{ opacity: loading ? 0.55 : 1, transition: 'opacity 0.15s' }}>
          {data.marketplaces.length === 0 ? (
            <div style={{ ...CARD, padding: 32, textAlign: 'center', color: '#6b778c', fontWeight: 600, fontSize: 13 }}>
              No rows for {start} → {end}. This range may be outside the current backfill coverage.
            </div>
          ) : (
            data.marketplaces.map(mp => (
              <MarketplaceBlock key={mp.marketplace_id} mp={mp} grain={data.grain} compareSuppressed={compareSuppressed} />
            ))
          )}

          <p style={{ fontSize: 11, color: '#a5adba', fontWeight: 600, marginTop: 8, lineHeight: 1.6 }}>
            Revenue is shown in each marketplace&apos;s own currency and is deliberately not totalled across marketplaces — there is no FX table yet.
            Conversion is <code>sum(units_ordered) ÷ sum(sessions)</code> and buy box is session-weighted, both recalculated at the grain displayed rather than averaged from the per-ASIN columns.
            <br />
            {fmtInt(data.meta.row_count)} source rows · generated {data.meta.generated_at?.slice(0, 19).replace('T', ' ')} UTC
          </p>
        </div>
      )}
    </div>
  )
}
