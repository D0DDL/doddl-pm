import { createClient } from '@supabase/supabase-js'
import { withAgentAuth } from '../../../lib/agentAuth'

// service_role client — bypasses RLS. Server-side only.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Fields the agent is allowed to write on POST/PATCH.
// Excluded deliberately: id, created_at, updated_at, source, agent_id (server-owned),
// and decision/decision_* (those are human-only via ApprovalTaskPanel).
const WRITABLE_FIELDS = [
  'title', 'description', 'notes',
  'project_id', 'group_id', 'parent_id',
  'assigned_to', 'start_date', 'due_date',
  'depends_on', 'status', 'priority',
  'progress', 'position', 'tags',
  'is_group', 'task_type',
]

function pickWritable(body) {
  const out = {}
  for (const k of WRITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, k)) out[k] = body[k]
  }
  return out
}

// POST   /api/agent/tasks              → create a task
// PATCH  /api/agent/tasks?id=<uuid>    → update an existing task the caller owns
// Both require valid AGENT_SERVICE_KEY + X-Agent-Id. Every write is audited by withAgentAuth.
async function handler(req, res, { agent_id }) {
  if (req.method === 'POST')  return createTask(req, res, agent_id)
  if (req.method === 'PATCH') return updateTask(req, res, agent_id)
  res.setHeader('Allow', 'POST, PATCH')
  return res.status(405).json({ error: 'Method not allowed' })
}

async function createTask(req, res, agent_id) {
  const body = req.body || {}
  if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
    return res.status(400).json({ error: 'title is required' })
  }
  const row = {
    ...pickWritable(body),
    title:    body.title.trim(),
    status:   body.status   || 'not_started',   // CHECK: not_started | in_progress | on_track | at_risk | blocked | done
    priority: body.priority || 'medium',        // CHECK: low | medium | high | critical
    source:   'agent',                          // server-owned; CHECK allows 'agent' (migration 03)
    progress: typeof body.progress === 'number' ? body.progress : 0,
    position: typeof body.position === 'number' ? body.position : 0,
    tags:     Array.isArray(body.tags) ? body.tags : null,
    is_group: body.is_group === true,
    task_type: body.task_type || 'standard',    // CHECK: standard | approval | go_live | incident
    agent_id,
  }
  const { data, error } = await supabase.from('tasks').insert([row]).select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
}

async function updateTask(req, res, agent_id) {
  const id = typeof req.query.id === 'string' ? req.query.id : Array.isArray(req.query.id) ? req.query.id[0] : null
  if (!id) return res.status(400).json({ error: 'id query parameter is required (e.g. PATCH /api/agent/tasks?id=<uuid>)' })

  // Ownership check — agents may only update tasks they created.
  const { data: existing, error: findErr } = await supabase
    .from('tasks').select('id, agent_id, decision').eq('id', id).maybeSingle()
  if (findErr)  return res.status(500).json({ error: findErr.message })
  if (!existing) return res.status(404).json({ error: `task '${id}' not found` })
  if (existing.agent_id && existing.agent_id !== agent_id) {
    return res.status(403).json({ error: `task '${id}' belongs to agent '${existing.agent_id}'` })
  }
  // Once a human has decided on an approval artefact, the task is frozen for agents —
  // prevents the agent from rewriting content after the decision is locked in.
  if (existing.decision) {
    return res.status(409).json({ error: 'task has a recorded decision and is immutable' })
  }

  const patch = pickWritable(req.body || {})
  if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
    if (typeof patch.title !== 'string' || !patch.title.trim()) return res.status(400).json({ error: 'title must be a non-empty string' })
    patch.title = patch.title.trim()
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'no writable fields in request body' })

  const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data)
}

export default withAgentAuth(handler)
