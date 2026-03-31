import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { title, notes, source, assigned_to, message_id, project_id } = req.body
  if (!title) return res.status(400).json({ error: 'title is required' })

  if (message_id) {
    const { data: existing } = await supabase
      .from('tasks').select('id').eq('message_id', message_id).single()
    if (existing) return res.status(200).json({ message: 'duplicate skipped', id: existing.id })
  }

  const due = new Date()
  due.setDate(due.getDate() + 2)
  const due_date = due.toISOString().split('T')[0]

  const { data, error } = await supabase.from('tasks').insert([{
    title, notes: notes || null, source: source || 'manual',
    assigned_to: assigned_to || null, message_id: message_id || null,
    project_id: project_id || null, due_date, status: 'not_started', priority: 'medium',
  }]).select().single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
}
// redeployed Tue Mar 31 09:04:17 UTC 2026
