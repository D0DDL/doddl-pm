import { useState, useEffect, useCallback, useRef } from 'react'
import Head from 'next/head'
import { supabase } from '../lib/supabase'

// ── Constants ──────────────────────────────────────────────────────────────
const STATUSES = [
  { key: 'not_started', label: 'Not Started', color: '#c1c7d0' },
  { key: 'in_progress', label: 'In Progress', color: '#0052cc' },
  { key: 'on_track',    label: 'On Track',    color: '#00875a' },
  { key: 'at_risk',     label: 'At Risk',     color: '#ff8b00' },
  { key: 'blocked',     label: 'Blocked',     color: '#de350b' },
  { key: 'done',        label: 'Done',        color: '#36b37e' },
]
const PRIORITIES = [
  { key: 'critical', label: 'Critical', color: '#de350b' },
  { key: 'high',     label: 'High',     color: '#ff8b00' },
  { key: 'medium',   label: 'Medium',   color: '#0052cc' },
  { key: 'low',      label: 'Low',      color: '#6b778c' },
]
const statusMap   = Object.fromEntries(STATUSES.map(s => [s.key, s]))
const priorityMap = Object.fromEntries(PRIORITIES.map(p => [p.key, p]))

const COL_WIDTHS = { task: 320, status: 130, assignee: 120, start: 110, due: 110, priority: 110, progress: 110, depends: 130 }

// ── Helpers ────────────────────────────────────────────────────────────────
function StatusBadge({ value, onChange }) {
)
  while (cur <= maxDate) {
    weeks.push(new Date(cur))
    cur.setDate(cur.getDate() + 7)
  }

  const projectMap = Object.fromEntries((projects || []).map(p => [p.id, p]))

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 160px)' }}>
      <div style={{ minWidth: labelW + totalDays * dayWidth + 40 }}>
        {/* Header */}
        <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '2px solid #dfe1e6' }}>
          <div style={{ width: labelW, flexShrink: 0, padding: '8px 16px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', borderRight: '1px solid #dfe1e6' }}>Task</div>
          <div style={{ position: 'relative', flex: 1 }}>
            {weeks.map((w, i) => (
              <div key={i} style={{ position: 'absolute', left: Math.ceil((w - minDate) / 86400000) * dayWidth, top: 0, bottom: 0, borderLeft: '1px solid #f0f1f3', padding: '8px 4px', fontSize: 10, fontWeight: 700, color: '#6b778c', whiteSpace: 'nowrap' }}>
                {w.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </div>
            ))}
            <div style={{ height: 36 }} />
          </div>
        </div>

        {/* Today line */}
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: labelW + todayPos, top: 0, bottom: 0, width: 2, background: '#de350b', zIndex: 5, pointerEvents: 'none' }} />

          {tasks.map(task => {
            const start = task.start_date ? dayPos(task.start_date) : null
            const end = task.due_date ? dayPos(task.due_date) + dayWidth : null
            const width = start !== null && end !== null ? Math.max(end - start, dayWidth) : null
            const s = statusMap[task.status] || STATUSES[0]
            const proj = projectMap[task.project_id]

            return (
              <div key={task.id} style={{ display: 'flex', borderBottom: '1px solid #f0f1f3', minHeight: 36 }}>
                <div style={{ width: labelW, flexShrink: 0, padding: '8px 16px', borderRight: '1px solid #f0f1f3', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {proj && <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />}
                  <span style={{ fontSize: 12, color: '#172b4d', fontWeight: task.is_group ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                </div>
                <div style={{ flex: 1, position: 'relative', background: task.is_group ? '#f8f9fc' : 'transparent' }}>
                  {width && (
                    <div style={{
                      position: 'absolute', left: start, top: 6, height: 22, width,
                      background: s.color, borderRadius: 4, opacity: 0.85,
                      display: 'flex', alignItems: 'center', paddingLeft: 6, overflow: 'hidden'
                    }}>
                      <span style={{ fontSize: 10, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>{task.title}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Task Row ───────────────────────────────────────────────────────────────
function TaskRow({ task, allTasks, depth, onUpdate, onDelete, onAddSubtask }) {
  const [expanded, setExpanded] = useState(true)
  const subtasks = allTasks.filter(t => t.parent_id === task.id)
  const hasChildren = subtasks.length > 0 || task.is_group

  const update = async (field, value) => {
    await supabase.from('tasks').update({ [field]: value }).eq('id', task.id)
    onUpdate()
  }

  const depTask = task.depends_on ? allTasks.find(t => t.id === task.depends_on) : null
  const bg = depth === 0 ? '#f8f9fc' : '#fff'
  const indent = depth * 20

p: 6 }}>
            {hasChildren && (
              <span onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer', color: '#6b778c', fontSize: 10, width: 14, flexShrink: 0 }}>
                {expanded ? '▼' : '▶'}
              </span>
            )}
            {!hasChildren && <span style={{ width: 14 }} />}
            <InlineEdit value={task.title} onSave={v => update('title', v)}
              style={{ fontWeight: depth === 0 ? 700 : 400, fontSize: 13, color: '#172b4d' }} />
            <span onClick={() => onAddSubtask(task.id)} title="Add subtask"
              style={{ marginLeft: 4, color: '#c1c7d0', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>+</span>
            <span onClick={() => onDelete(task.id)} title="Delete"
              style={{ color: '#c1c7d0', cursor: 'pointer', fontSize: 14, lineHeight: 1, flexShrink: 0 }}>×</span>
          </div>
        </td>

        {/* Status */}
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.status }}>
          <StatusBadge value={task.status} onChange={v => update('status', v)} />
        </td>

        {/* Assignee */}
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.assignee }}>
          <InlineEdit value={task.assigned_to} onSave={v => update('assigned_to', v)}
            style={{ fontSize: 12, color: '#42526e' }} />
        </td>

        {/* Start date */}
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.start }}>
          <DateCell value={task.start_date} onChange={v => update('start_date', v)} />
        </td>

        {/* Due date */}
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.due }}>
          <DateCell value={task.due_date} onChange={v => update('due_date', v)} />
        </td>

        {/* Priority */}
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.priority }}>
          <PriorityBadge value={task.priority} onChange={v => update('priority', v)} />
        </td>

        {/* Progress */}
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.progress }}>
          <ProgressBar value={task.progress} onChange={v => update('progress', v)} />
        </td>

        {/* Dependencies */}
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.depends }}>
          {depTask
            ? <span style={{ fontSize: 11, color: '#0052cc', background: '#e9f2ff', borderRadius: 3, padding: '2px 6px' }}>{depTask.title.substring(0, 18)}{depTask.title.length > 18 ? '…' : ''}</span>
            : <span style={{ color: '#c1c7d0', fontSize: 11 }}>—</span>
          }
        </td>
      </tr>

      {expanded && subtasks.map(sub => (
        <TaskRow key={sub.id} task={sub} allTasks={allTasks} depth={depth + 1}
          onUpdate={onUpdate} onDelete={onDelete} onAddSubtask={onAddSubtask} />
      ))}
    </>
  )
}

// ── Project Section ────────────────────────────────────────────────────────
function ProjectSection({ project, tasks, allTasks, onUpdate, onDelete, onAddTask, onAddGroup, onAddSubtask }) {
  const [collapsed, setCollapsed] = useState(false)
  const [addingGroup, setAddingGroup] = useState(false)
  const [groupName, setGroupName] = useState('')

  const projectTasks = tasks.filter(t => t.project_id === project.id && !t.parent_id)
  const totalTasks = tasks.filter(t => t.project_id === project.id).length
  const doneTasks = tasks.filter(t => t.project_id === project.id && t.status === 'done').length
  const pct = totalTasks ? Math.round(doneTasks / totalTasks * 100) : 0

  const saveGroup = async () => {
    if (!groupName.trim()) return
    await supabase.from('tasks').insert([{ title: groupName, project_id: project.id, is_group: true, status: 'not_started', priority: 'medium', progress: 0 }])
    setGroupName('')
    setAddingGroup(false)
    onUpdate()
  }

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Project header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'linear-gradient(90deg, var(--indigo) 0%, #5a2ba0 100%)', borderRadius: '8px 8px 0 0', color: '#fff' }}>
        <span onClick={() => setCollapsed(c => !c)} style={{ cursor: 'pointer', fontSize: 12 }}>{collapsed ? '▶' : '▼'}</span>
        <span style={{ fontWeight: 800, fontSize: 15 }}>{project.name}</span>
        {project.owner && <span style={{ fontSize: 12, opacity: 0.7 }}>· {project.owner}</span>}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 80, height: 5, background: 'rgba(255,255,255,0.3)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#30BEAA', borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700 }}>{pct}%</span>
          <span style={{ fontSize: 11, opacity: 0.7 }}>{doneTasks}/{totalTasks} tasks</span>
        </div>
        {project.due_date && <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: 10 }}>Due {project.due_date}</span>}
      </div>

      {!collapsed && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: '#f8f9fc', borderBottom: '2px solid #dfe1e6' }}>
                <th style={{ padding: '7px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', letterSpacing: '0.04em', width: COL_WIDTHS.task }}>Task</th>
                <th style={{ padding: '7px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', letterSpacing: '0.04em', width: COL_WIDTHS.status }}>Status</th>
                <th style={{ padding: '7px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', letterSpacing: '0.04em', width: COL_WIDTHS.assignee }}>Assignee</th>
                <th style={{ padding: '7px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', letterSpacing: '0.04em', width: COL_WIDTHS.start }}>Start</th>
                <th style={{ padding: '7px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', letterSpacing: '0.04em', width: COL_WIDTHS.due }}>Due</th>
                <th style={{ padding: '7px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', letterSpacing: '0.04em', width: COL_WIDTHS.priority }}>Priority</th>
                <th style={{ padding: '7px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', letterSpacing: '0.04em', width: COL_WIDTHS.progress }}>Progress</th>
                <th style={{ padding: '7px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', letterSpacing: '0.04em', width: COL_WIDTHS.depends }}>Depends On</th>
              </tr>
            </thead>
            <tbody>
              {projectTasks.map(task => (
                <TaskRow key={task.id} task={task} allTasks={allTasks} depth={0}
                  onUpdate={onUpdate} onDelete={onDelete} onAddSubtask={onAddSubtask} />
              ))}
            </tbody>
          </table>

          {/* Add row */}
          <div style={{ padding: '6px 16px', borderTop: '1px solid #f0f1f3', display: 'flex', gap: 8 }}>
            <button onClick={() => onAddTask(project.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6b778c', fontFamily: 'Nunito, sans-serif', fontWeight: 600, padding: '4px 8px', borderRadius: 4 }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0f1f3'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              + Add task
            </button>
            {addingGroup ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input autoFocus value={groupName} onChange={e => setGroupName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveGroup(); if (e.key === 'Escape') setAddingGroup(false) }}
                  placeholder="Group name..."
                  style={{ border: '1px solid var(--aqua)', borderRadius: 4, padding: '3px 8px', fontSize: 12, fontFamily: 'Nunito, sans-serif' }} />
                <button onClick={saveGroup} style={{ background: 'var(--aqua)', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontWeight: 700 }}>Add</button>
                <button onClick={() => setAddingGroup(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6b778c' }}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setAddingGroup(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6b778c', fontFamily: 'Nunito, sans-serif', fontWeight: 600, padding: '4px 8px', borderRadius: 4 }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0f1f3'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                + Add group
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Modals ─────────────────────────────────────────────────────────────────
function AddTaskModal({ projects, parentId, projectId, allTasks, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: '', status: 'not_started', priority: 'medium',
    project_id: projectId || '', assigned_to: '', start_date: '',
    due_date: '', progress: 0, notes: '', source: 'manual', depends_on: '', parent_id: parentId || null
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    await supabase.from('tasks').insert([{ ...form, project_id: form.project_id || null, depends_on: form.depends_on || null }])
    setSaving(false); onSaved(); onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 520, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--indigo)', margin: 0 }}>{parentId ? 'Add Subtask' : 'New Task'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b778c' }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input placeholder="Task title *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
            style={{ padding: '9px 12px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Project</label>
              <select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }}>
                <option value="">No project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }}>
                {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Priority</label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }}>
                {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Assignee</label>
              <input value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })}
                placeholder="Name" style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Start Date</label>
              <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Due Date</label>
              <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Progress %</label>
              <input type="number" min="0" max="100" value={form.progress} onChange={e => setForm({ ...form, progress: parseInt(e.target.value) || 0 })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Depends On</label>
              <select value={form.depends_on} onChange={e => setForm({ ...form, depends_on: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }}>
                <option value="">None</option>
                {allTasks.filter(t => t.id !== form.id).map(t => <option key={t.id} value={t.id}>{t.title.substring(0, 40)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2} placeholder="Notes..."
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif', resize: 'vertical' }} />
          </div>
          <button onClick={save} disabled={saving}
            style={{ background: 'var(--indigo)', color: '#fff', border: 'none', borderRadius: 6, padding: '11px 0', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', marginTop: 4 }}>
            {saving ? 'Saving...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddProjectModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', description: '', priority: 'medium', owner: '', due_date: '', status: 'active' })
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    await supabase.from('projects').insert([form])
    setSaving(false); onSaved(); onClose()
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 460, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--indigo)', margin: 0 }}>New Project</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b778c' }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input placeholder="Project name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            style={{ padding: '9px 12px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif' }} />
          <textarea placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            rows={2} style={{ padding: '8px 12px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif', resize: 'vertical' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
              style={{ padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }}>
              {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <input type="text" placeholder="Owner" value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })}
              style={{ padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }} />
            <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })}
              style={{ padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }} />
          </div>
          <button onClick={save} disabled={saving}
            style={{ background: 'var(--indigo)', color: '#fff', border: 'none', borderRadius: 6, padding: '11px 0', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
            {saving ? 'Saving...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function Home() {
  const [view, setView]           = useState('board')
  const [tasks, setTasks]         = useState([])
  const [projects, setProjects]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [activeProject, setActiveProject] = useState(null)
  const [showAddTask, setShowAddTask]     = useState(false)
  const [showAddProject, setShowAddProject] = useState(false)
  const [addTaskProjectId, setAddTaskProjectId] = useState(null)
  const [addTaskParentId, setAddTaskParentId]   = useState(null)
  const [search, setSearch]       = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: true }),
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
    ])
    setTasks(t || [])
    setProjects(p || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const deleteTask = async id => {
    await supabase.from('tasks').delete().eq('id', id)
    load()
  }

  const handleAddTask = projectId => {
    setAddTaskProjectId(projectId)
    setAddTaskParentId(null)
    setShowAddTask(true)
  }

  const handleAddSubtask = parentId => {
    const parent = tasks.find(t => t.id === parentId)
    setAddTaskProjectId(parent?.project_id || null)
    setAddTaskParentId(parentId)
    setShowAddTask(true)
  }

  const filteredProjects = activeProject ? projects.filter(p => p.id === activeProject) : projects
  const filteredTasks    = search ? tasks.filter(t => t.title?.toLowerCase().includes(search.toLowerCase())) : tasks

  const inboxCount = tasks.filter(t => t.source !== 'manual' && t.status === 'not_started').length

  const navBtn = (key, label, count) => (
    <button onClick={() => setView(key)} style={{
      display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
      padding: '7px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
      fontFamily: 'Nunito, sans-serif', fontWeight: 600, fontSize: 13,
      background: view === key ? '#e9f2ff' : 'transparent',
      color: view === key ? '#0052cc' : '#42526e',
      marginBottom: 2,
    }}>
      {label}
      {count > 0 && <span style={{ background: '#de350b', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>{count}</span>}
    </button>
  )

  return (
    <>
      <Head>
        <title>doddl PM</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
        <style>{`
          :root { --indigo: #3D157D; --aqua: #30BEAA; --bg: #F5F6FA; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Nunito', sans-serif; background: var(--bg); color: #172b4d; }
          input, select, textarea, button { font-family: 'Nunito', sans-serif; }
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-thumb { background: #dfe1e6; border-radius: 3px; }
        `}</style>
      </Head>

      {/* Header */}
      <header style={{ background: 'var(--indigo)', color: '#fff', padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 8px rgba(61,21,125,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.5px' }}>doddl</span>
          <span style={{ color: 'var(--aqua)', fontWeight: 800, fontSize: 20 }}>.</span>
          <span style={{ fontWeight: 600, fontSize: 13, opacity: 0.65, marginLeft: 8 }}>Project Management</span>
        </div>
        <div style={{ flex: 1, maxWidth: 320, margin: '0 24px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks..."
            style={{ width: '100%', padding: '6px 12px', borderRadius: 20, border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 13 }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setView('board'); setShowAddTask(true); setAddTaskProjectId(null); setAddTaskParentId(null) }}
            style={{ background: 'var(--aqua)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            + Task
          </button>
          <button onClick={() => setShowAddProject(true)}
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '6px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            + Project
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', height: 'calc(100vh - 52px)' }}>
        {/* Sidebar */}
        <aside style={{ width: 210, background: '#fff', borderRight: '1px solid #dfe1e6', padding: '16px 8px', overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ marginBottom: 20 }}>
            {navBtn('board', '📋 Projects', 0)}
            {navBtn('gantt', '📅 Gantt', 0)}
            {navBtn('inbox', '📥 Inbox', inboxCount)}
          </div>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 12px', marginBottom: 6 }}>Projects</p>
          <button onClick={() => setActiveProject(null)} style={{
            width: '100%', textAlign: 'left', padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontFamily: 'Nunito, sans-serif', fontWeight: 600, fontSize: 12, marginBottom: 2,
            background: !activeProject ? '#e9f2ff' : 'transparent', color: !activeProject ? '#0052cc' : '#42526e'
          }}>All projects</button>
          {projects.map(p => (
            <button key={p.id} onClick={() => setActiveProject(p.id)} style={{
              width: '100%', textAlign: 'left', padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontFamily: 'Nunito, sans-serif', fontWeight: 600, fontSize: 12, marginBottom: 2,
              background: activeProject === p.id ? '#e9f2ff' : 'transparent', color: activeProject === p.id ? '#0052cc' : '#42526e',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>{p.name}</button>
          ))}
        </aside>

        {/* Main */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60%', color: '#6b778c', fontWeight: 600 }}>Loading...</div>
          ) : view === 'gantt' ? (
            <>
              <h2 style={{ fontWeight: 800, fontSize: 18, color: 'var(--indigo)', marginBottom: 16 }}>Gantt Chart</h2>
              <GanttView tasks={filteredTasks.filter(t => t.project_id)} projects={projects} />
            </>
          ) : view === 'inbox' ? (
            <>
              <h2 style={{ fontWeight: 800, fontSize: 18, color: 'var(--indigo)', marginBottom: 16 }}>
                Inbox <span style={{ fontSize: 13, fontWeight: 600, color: '#6b778c' }}>— from Email, Teams & TeamsMAestro</span>
              </h2>
              {tasks.filter(t => t.source !== 'manual' && t.status === 'not_started').length === 0
                ? <p style={{ color: '#6b778c', fontWeight: 600 }}>Inbox is clear ✓</p>
                : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8f9fc', borderBottom: '2px solid #dfe1e6' }}>
                        {['Task', 'Source', 'Status', 'Assignee', 'Due', 'Priority'].map(h => (
                          <th key={h} style={{ padding: '7px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.filter(t => t.source !== 'manual' && t.status === 'not_started').map(task => (
                        <TaskRow key={task.id} task={task} allTasks={tasks} depth={0}
                          onUpdate={load} onDelete={deleteTask} onAddSubtask={handleAddSubtask} />
                      ))}
                    </tbody>
                  </table>
                )
              }
            </>
          ) : (
            <>
              {filteredProjects.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#6b778c' }}>
                  <p style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No projects yet</p>
                  <p style={{ marginBottom: 20 }}>Create your first project to get started</p>
                  <button onClick={() => setShowAddProject(true)}
                    style={{ background: 'var(--indigo)', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
                    + Create Project
                  </button>
                </div>
              ) : (
                filteredProjects.map(project => (
                  <ProjectSection key={project.id} project={project}
                    tasks={(search ? filteredTasks : tasks).filter(t => t.project_id === project.id)}
                    allTasks={tasks}
                    onUpdate={load} onDelete={deleteTask}
                    onAddTask={handleAddTask} onAddGroup={() => {}} onAddSubtask={handleAddSubtask} />
                ))
              )}
            </>
          )}
        </main>
      </div>

      {showAddTask && (
        <AddTaskModal projects={projects} parentId={addTaskParentId} projectId={addTaskProjectId}
          allTasks={tasks} onClose={() => setShowAddTask(false)} onSaved={load} />
      )}
      {showAddProject && <AddProjectModal onClose={() => setShowAddProject(false)} onSaved={load} />}
    </>
  )
}
