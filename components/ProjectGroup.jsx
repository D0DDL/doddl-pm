import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { GROUP_TINTS } from '../lib/team'
import { PROJ_COL_WIDTHS as W_DEFAULT, TASK_COL_MAX } from '../lib/constants'
import ProjectTableRow from './ProjectTableRow'

export default function ProjectGroup({ group, allTasks, projectColor, onUpdate, onPatch, onDelete, onAddSubtask, onSelect, onAddTask, projectId, groupIndex, selectedIds, onToggleSelect, widths }) {
  const W = widths || W_DEFAULT
  const [collapsed, setCollapsed] = useState(false)
  const [addingTask, setAddingTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const children = allTasks.filter(t => t.parent_id === group.id)
  const tint = GROUP_TINTS[groupIndex % GROUP_TINTS.length]

  const addTask = async () => {
    if (!newTaskTitle.trim()) return
    await supabase.from('tasks').insert([{ title: newTaskTitle, project_id: projectId, parent_id: group.id, status: 'not_started', priority: 'medium', progress: 0, source: 'manual' }])
    setNewTaskTitle(''); setAddingTask(false); onUpdate()
  }

  return (
    <div style={{ marginBottom: 0 }}>
      {/* Group header */}
      <div style={{ display: 'flex', alignItems: 'center', background: tint.bg, borderLeft: `4px solid ${tint.border}`, borderBottom: '1px solid #dfe1e6', borderTop: '2px solid #e5e7eb' }}>
        <div style={{ width: W.select, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span onClick={() => setCollapsed(c => !c)} style={{ cursor: 'pointer', fontSize: 10, color: tint.text, fontWeight: 800 }}>{collapsed ? '▶' : '▼'}</span>
        </div>
        <div style={{ flex: 1, maxWidth: TASK_COL_MAX, padding: '8px 8px 8px 4px', fontWeight: 800, fontSize: 13, color: tint.text }}>{group.title}</div>
        <div style={{ padding: '8px 12px', fontSize: 11, color: tint.text, fontWeight: 700, opacity: 0.7 }}>{children.length} task{children.length !== 1 ? 's' : ''}</div>
        {/* Spacer cols — match ProjectTableRow column widths */}
        <div style={{ width: W.owner }} /><div style={{ width: W.status }} /><div style={{ width: W.timeline }} /><div style={{ width: W.effort }} /><div style={{ width: W.priority }} /><div style={{ width: W.progress }} />
        {/* Delete group */}
        <span onClick={() => onDelete(group.id)} title="Delete group"
          style={{ padding: '0 12px', color: '#c1c7d0', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.color='#de350b'} onMouseLeave={e => e.currentTarget.style.color='#c1c7d0'}>×</span>
      </div>
      {/* Child tasks */}
      {!collapsed && children.map(task => (
        <ProjectTableRow key={task.id} task={task} projectColor={tint.border}
          onUpdate={onUpdate} onPatch={onPatch} onDelete={onDelete} onSelect={onSelect} depth={1}
          selected={!!selectedIds?.has(task.id)} onToggleSelect={onToggleSelect} widths={W} />
      ))}
      {!collapsed && (
        addingTask ? (
          <div style={{ display: 'flex', alignItems: 'center', borderLeft: `4px solid ${tint.border}`, borderBottom: '1px solid #f0f1f3', padding: '4px 8px 4px 32px', gap: 8, background: '#fff' }}>
            <input autoFocus value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setAddingTask(false) }}
              placeholder="Task title..." style={{ flex: 1, border: `1px solid ${tint.border}`, borderRadius: 4, padding: '4px 8px', fontSize: 13, fontFamily: 'Nunito, sans-serif', outline: 'none' }} />
            <button onClick={addTask} style={{ background: tint.border, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontWeight: 700 }}>Add</button>
            <button onClick={() => setAddingTask(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6b778c' }}>Cancel</button>
          </div>
        ) : (
          <div style={{ borderLeft: `4px solid ${tint.border}`, borderBottom: '1px solid #f0f1f3', background: '#fff' }}>
            <button onClick={() => setAddingTask(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: tint.text, padding: '6px 8px 6px 32px', fontFamily: 'Nunito, sans-serif', fontWeight: 700, opacity: 0.7 }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.7}>+ Add task</button>
          </div>
        )
      )}
    </div>
  )
}
