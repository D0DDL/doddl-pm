import { createClient } from '@supabase/supabase-js'

// Read-only proxy for agent_audit_log.
// After Task 4 (migration 04), anon has no SELECT policy on agent_audit_log,
// so the browser's anon-key Supabase client cannot read it directly. This
// endpoint uses the service_role key server-side so the Approvals > Agents
// tab can still surface per-agent API-call activity.
//
// Auth note: like the rest of /api/*, this endpoint is not currently
// gated at the route layer — operational admin-only access per CLAUDE.md §Task 4
// ("Level 3 — System administrator: currently OPERATIONAL, not DB-enforced").

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const MAX_LIMIT = 1000

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const rawLimit = parseInt(req.query.limit, 10)
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(MAX_LIMIT, rawLimit)) : MAX_LIMIT

  const { data, error } = await supabase
    .from('agent_audit_log')
    .select('agent_id, created_at, status_code, path, method')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data)
}
