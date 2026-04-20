import { createClient } from '@supabase/supabase-js'
import { withAgentAuth } from '../../../lib/agentAuth'

// service_role client — bypasses RLS. Server-side only.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// POST /api/agent/tasks
// Creates a task authored by an agent. source is hardcoded to 'agent' (allowed by Task 3 migration).
// The X-Agent-Id header is persisted on the task row in addition to being audit-logged.
async function handler(req, res, { agent_id }) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    title,
    description,
    notes,
    project_id,
    group_id,
    parent_id,
    assigned_to,
    start_date,
    due_date,
    depends_on,
    status,
    priority,
    progress,
    position,
    tags,
    is_group,
    task_type,
  } = req.body || {}

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' })
  }

  const row = {
    title:       title.trim(),
    description: description ?? null,
    notes:       notes       ?? null,
    project_id:  project_id  || null,
    group_id:    group_id    || null,
    parent_id:   parent_id   || null,
    assigned_to: assigned_to || null,
    start_date:  start_date  || null,
    due_date:    due_date    || null,
    depends_on:  depends_on  || null,
    status:      status      || 'not_started',   // CHECK: not_started | in_progress | on_track | at_risk | blocked | done
    priority:    priority    || 'medium',        // CHECK: low | medium | high | critical
    source:      'agent',                        // CHECK now includes 'agent' (Task 3 migration)
    progress:    typeof progress === 'number' ? progress : 0,
    position:    typeof position === 'number' ? position : 0,
    tags:        Array.isArray(tags) ? tags : null,
    is_group:    is_group === true,
    task_type:   task_type || 'standard',        // CHECK: standard | approval | go_live | incident
    agent_id,
  }

  const { data, error } = await supabase.from('tasks').insert([row]).select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
}

export default withAgentAuth(handler)
