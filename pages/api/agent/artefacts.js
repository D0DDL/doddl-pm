import { createClient } from '@supabase/supabase-js'
import { withAgentAuth } from '../../../lib/agentAuth'
import { validateArtefact, listArtefactTypes } from '../../../lib/artefactTypes'

// service_role client — bypasses RLS. Server-side only.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// POST /api/agent/artefacts
// Body: { task_id, artefact_type, artefact, staging_url? }
// Attaches an artefact payload to an existing task, marking it as task_type='approval'.
async function handler(req, res, { agent_id }) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { task_id, artefact_type, artefact, staging_url } = req.body || {}

  if (!task_id || typeof task_id !== 'string') {
    return res.status(400).json({ error: 'task_id is required' })
  }
  if (!artefact_type || typeof artefact_type !== 'string') {
    return res.status(400).json({ error: `artefact_type is required. Valid types: ${listArtefactTypes().join(', ')}` })
  }
  if (staging_url != null && typeof staging_url !== 'string') {
    return res.status(400).json({ error: 'staging_url must be a string when provided' })
  }

  const v = validateArtefact(artefact_type, artefact)
  if (!v.valid) return res.status(400).json({ error: v.error })

  const { data, error } = await supabase.from('tasks').update({
    task_type:     'approval',
    artefact_type,
    artefact,
    agent_id,
    staging_url:   staging_url || null,
    // Decision fields stay null; populated when a human approves/rejects via ApprovalTaskPanel.
  }).eq('id', task_id).select().single()

  if (error) {
    // PGRST116 = 0 rows matched (task_id not found)
    if (error.code === 'PGRST116') return res.status(404).json({ error: `task_id '${task_id}' not found` })
    return res.status(500).json({ error: error.message })
  }
  return res.status(200).json(data)
}

export default withAgentAuth(handler)
