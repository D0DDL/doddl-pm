import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  const { id, project_id } = req.query

  if (req.method === 'GET') {
    let query = supabase.from('task_groups').select('*').is('archived_at', null).order('position', { ascending: true })
    if (project_id) query = query.eq('project_id', project_id)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const { project_id: body_project_id, name, position } = req.body
    if (!body_project_id) return res.status(400).json({ error: 'project_id is required' })
    if (!name) return res.status(400).json({ error: 'name is required' })

    const { data, error } = await supabase
      .from('task_groups')
      .insert([{
        project_id: body_project_id,
        name,
        position: position ?? 0,
      }])
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  if (req.method === 'PATCH') {
    if (!id) return res.status(400).json({ error: 'id query param is required' })
    const { data, error } = await supabase
      .from('task_groups')
      .update(req.body)
      .eq('id', id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'id query param is required' })
    const { error } = await supabase.from('task_groups').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).end()
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
