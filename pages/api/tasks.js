import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// Team email → display name mapping
const TEAM = {
  'jon@doddl.com':         'Jon',
  'laura@doddl.com':       'Laura',
  'catherine@doddl.com':   'Cat',
  'finance@doddl.com':     'Chris',
  'hello@doddl.com':       'Cathy',
}

function getDisplayName(email) {
  if (!email) return null
  return TEAM[email.toLowerCase()] || email.split('@')[0]
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { title, notes, source, assigned_to, assigned_email, message_id, project_id } = req.body
  if (!title) return res.status(400).json({ error: 'title is required' })

  // Dedupe by message_id
  if (message_id) {
    const { data: existing } = await supabase.from('tasks').select('id').eq('message_id', message_id).single()
    if (existing) return res.status(200).json({ message: 'duplicate skipped', id: existing.id })
  }

  // Resolve assignee name from email if provided
  const assigneeName = assigned_to || (assigned_email ? getDisplayName(assigned_email) : null)
  const userEmail = assigned_email || null

  const due = new Date()
  due.setDate(due.getDate() + 2)
  const due_date = due.toISOString().split('T')[0]

  const { data, error } = await supabase.from('tasks').insert([{
    title,
    notes: notes || null,
    source: source || 'manual',
    assigned_to: assigneeName,
    user_email: userEmail,
    message_id: message_id || null,
    project_id: project_id || null,
    due_date,
    status: 'todo',
    priority: 'medium',
  }]).select().single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
}
// redeployed
