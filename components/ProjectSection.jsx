import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { getProjectColor } from '../lib/team'
import { PROJ_COL_WIDTHS as W } from '../lib/constants'
import ProjectGroup from './ProjectGroup'
import ProjectTableRow from './ProjectTableRow'
import ProjectDashboard from './ProjectDashboard'
import KanbanBoard from './KanbanBoard'
import ProjectGanttChart from './ProjectGanttChart'

export default function ProjectSection({ project, tasks, allTasks, onUpdate, onDelete, onAddTask, onAddSubtask, onSelect, colorIndex, projects, user }) {
  const [projectTab, setProjectTab] = useState('table')
  const [addingGroup, setAddingGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())      // UI #8 — multi-select
  const [groupingSel, setGroupingSel] = useState(false)
  const [selGroupName, setSelGroupName] = useState('')
  const color = getProjectColor(project, colorIndex)

  const onToggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const clearSel = () => setSelectedIds(new Set())
  const groupSelected = async () => {
    const title = selGroupName.trim() || `Group of ${selectedIds.size}`
    // Create the group-row first so we can parent the selected tasks under it
    const { data: newGroup, error } = await supabase.from('tasks').insert([{
      title, project_id: project.id, is_group: true, status: 'not_started', priority: 'medium', progress: 0,
    }]).select().single()
    if (error || !newGroup) { console.error('group create failed', error); return }
    const ids = Array.from(selectedIds)
    await supabase.from('tasks').update({ parent_id: newGroup.id }).in('id', ids)
    setSelGroupName(''); setGroupingSel(false); clearSel(); onUpdate()
  }
  const realTasks = tasks.filter(t => !t.is_group)
  const totalTasks = realTasks.length
  const doneTasks = realTasks.filter(t => t.status === 'done').length
  const pct = totalTasks ? Math.round(doneTasks / totalTasks * 100) : 0

  // Separate groups from regular tasks
  const groups = tasks.filter(t => t.is_group && !t.parent_id)
  const ungroupedTasks = tasks.filter(t => !t.is_group && !t.parent_id)

  const saveGroup = async () => {
    if (!groupName.trim()) return
    await supabase.from('tasks').insert([{ title: groupName, project_id: project.id, is_group: true, status: 'not_started', priority: 'medium', progress: 0 }])
    setGroupName(''); setAddingGroup(false); onUpdate()
  }

  const TAB = ({ id, label, icon }) => (
    <button onClick={() => setProjectTab(id)} style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer',
      fontFamily: 'Nunito, sans-serif', fontWeight: 600, fontSize: 13, borderBottom: projectTab === id ? `3px solid ${color}` : '3px solid transparent',
      color: projectTab === id ? color : '#6b778c', marginBottom: -1
    }}>{icon} {label}</button>
  )

  return (
    <div style={{ marginBottom: 40, background: '#fff', borderRadius: 12, border: '1px solid #dfe1e6', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      {/* Project header — solid doddl brand colour */}
      <div style={{ padding: '14px 20px', background: color, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>{project.name}</span>
            {project.owner && (
              <span style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(255,255,255,0.25)', color: '#fff', fontWeight: 700, fontSize: 11, padding: '3px 10px', borderRadius: 11 }}>
                {project.owner}
              </span>
            )}
            {project.due_date && <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '2px 10px', color: '#fff', fontWeight: 600 }}>Due {new Date(project.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
          </div>
          {project.description && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>{project.description}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 100, height: 5, background: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#fff', borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{pct}%</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{doneTasks}/{totalTasks}</span>
          <button onClick={() => {
            if (window.confirm(`Delete project "${project.name}" and all its tasks? This cannot be undone.`)) {
              supabase.from('tasks').delete().eq('project_id', project.id)
                .then(() => supabase.from('projects').delete().eq('id', project.id))
                .then(() => onUpdate())
            }
          }} title="Delete project"
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 12, fontFamily: 'Nunito, sans-serif', fontWeight: 700 }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(222,53,11,0.6)'}
            onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.15)'}>🗑 Delete</button>
        </div>
      </div>

      {/* Tabs — Monday.com style */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #dfe1e6', padding: '0 20px', background: '#fff', gap: 4 }}>
        <TAB id="table" label="Main Table" icon="☰" />
        <TAB id="kanban" label="Kanban" icon="⊞" />
        <TAB id="gantt" label="Timeline" icon="▬" />
        <TAB id="dashboard" label="Dashboard" icon="◉" />
        <div style={{ flex: 1 }} />
        <button onClick={() => onAddTask(project.id)} style={{ background: color, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>+ Add task</button>
      </div>

      {/* Tab content */}
      <div style={{ padding: projectTab === 'table' ? 0 : '0 16px' }}>

        {/* TABLE VIEW */}
        {projectTab === 'table' && (
          <>
            {/* Selection action bar (UI #8) */}
            {selectedIds.size > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: '#f0f4ff', borderBottom: '1px solid #dfe1e6' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--indigo)' }}>{selectedIds.size} selected</span>
                {groupingSel ? (
                  <>
                    <input autoFocus value={selGroupName} onChange={e => setSelGroupName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') groupSelected(); if (e.key === 'Escape') { setGroupingSel(false); setSelGroupName('') } }}
                      placeholder="Group name (optional)..." style={{ border: `1px solid ${color}`, borderRadius: 4, padding: '4px 10px', fontSize: 12, fontFamily: 'Nunito, sans-serif', outline: 'none' }} />
                    <button onClick={groupSelected} style={{ background: color, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontWeight: 700 }}>Create group</button>
                    <button onClick={() => { setGroupingSel(false); setSelGroupName('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6b778c' }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setGroupingSel(true)} style={{ background: color, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontWeight: 700 }}>Group selected</button>
                    <button onClick={clearSel} style={{ background: 'none', border: '1px solid #dfe1e6', borderRadius: 4, padding: '3px 10px', fontSize: 12, cursor: 'pointer', color: '#6b778c', fontFamily: 'Nunito, sans-serif' }}>Clear</button>
                  </>
                )}
              </div>
            )}

            {/* Column headers */}
            <div style={{ display: 'flex', alignItems: 'center', background: '#f8f9fc', borderBottom: '2px solid #dfe1e6', paddingLeft: 32 }}>
              <div style={{ width: W.select }} />
              <div style={{ flex: 1, padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Task</div>
              <div style={{ width: W.owner, padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Owner</div>
              <div style={{ width: W.status, padding: '7px 6px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Status</div>
              <div style={{ width: W.timeline, padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Timeline</div>
              <div style={{ width: W.effort, padding: '7px 6px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Effort</div>
              <div style={{ width: W.priority, padding: '7px 6px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Priority</div>
              <div style={{ width: W.progress, padding: '7px 6px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Progress</div>
            </div>

            {/* Groups with their tasks */}
            {groups.map((group, gi) => (
              <ProjectGroup key={group.id} group={group} allTasks={allTasks} projectColor={color}
                groupIndex={gi} onUpdate={onUpdate} onDelete={onDelete} onAddSubtask={onAddSubtask}
                onSelect={onSelect} onAddTask={onAddTask} projectId={project.id}
                selectedIds={selectedIds} onToggleSelect={onToggleSelect} />
            ))}

            {/* Ungrouped tasks */}
            {ungroupedTasks.length > 0 && (
              <div>
                {ungroupedTasks.map(task => (
                  <ProjectTableRow key={task.id} task={task} projectColor={color}
                    onUpdate={onUpdate} onDelete={onDelete} onSelect={onSelect}
                    selected={selectedIds.has(task.id)} onToggleSelect={onToggleSelect} />
                ))}
              </div>
            )}

            {/* Add group/task footer */}
            <div style={{ padding: '8px 16px 12px', display: 'flex', gap: 8, borderTop: '1px solid #f0f1f3' }}>
              {addingGroup ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input autoFocus value={groupName} onChange={e => setGroupName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveGroup(); if (e.key === 'Escape') setAddingGroup(false) }}
                    placeholder="Group name..." style={{ border: `1px solid ${color}`, borderRadius: 4, padding: '4px 10px', fontSize: 12, fontFamily: 'Nunito, sans-serif', outline: 'none' }} />
                  <button onClick={saveGroup} style={{ background: color, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontWeight: 700 }}>Add</button>
                  <button onClick={() => setAddingGroup(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6b778c' }}>Cancel</button>
                </div>
              ) : (
                <>
                  <button onClick={() => onAddTask(project.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6b778c', fontFamily: 'Nunito, sans-serif', fontWeight: 600, padding: '4px 8px', borderRadius: 4 }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f0f1f3'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>+ Add task</button>
                  <button onClick={() => setAddingGroup(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6b778c', fontFamily: 'Nunito, sans-serif', fontWeight: 600, padding: '4px 8px', borderRadius: 4 }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f0f1f3'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>+ Add group</button>
                </>
              )}
            </div>
          </>
        )}

        {projectTab === 'kanban' && <KanbanBoard tasks={tasks} project={project} onSelect={onSelect} onUpdate={onUpdate} onAddTask={onAddTask} />}
        {projectTab === 'gantt' && <ProjectGanttChart tasks={tasks} onSelectTask={onSelect} />}
        {projectTab === 'dashboard' && <ProjectDashboard project={project} tasks={tasks} color={color} />}
      </div>
    </div>
  )
}
