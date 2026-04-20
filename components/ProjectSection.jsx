import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { getProjectColor } from '../lib/team'
import { STATUSES, statusMap } from '../lib/constants'
import ProjectGroup from './ProjectGroup'
import ProjectTableRow from './ProjectTableRow'
import ProjectDashboard from './ProjectDashboard'
import KanbanBoard from './KanbanBoard'
import OwnerAvatar from './OwnerAvatar'

export default function ProjectSection({ project, tasks, allTasks, onUpdate, onDelete, onAddTask, onAddSubtask, onSelect, colorIndex, projects, user }) {
  const [projectTab, setProjectTab] = useState('table')
  const [addingGroup, setAddingGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const color = getProjectColor(project, colorIndex)
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

  // Project-level Gantt
  const ProjectGantt = () => {
    const ganttTasks = tasks.filter(t => !t.is_group)
    if (ganttTasks.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: '#6b778c' }}>No tasks with dates to display</div>
    const allDates = ganttTasks.flatMap(t => [t.start_date, t.due_date]).filter(Boolean).map(d => new Date(d))
    const minDate = allDates.length ? new Date(Math.min(...allDates)) : new Date()
    const maxDate = allDates.length ? new Date(Math.max(...allDates)) : new Date()
    minDate.setDate(minDate.getDate() - 3); maxDate.setDate(maxDate.getDate() + 7)
    const totalDays = Math.max(Math.ceil((maxDate - minDate) / 86400000), 14)
    const dayW = Math.max(24, Math.min(40, 800 / totalDays))
    const labelW = 220
    const today = new Date()
    const todayPos = Math.ceil((today - minDate) / 86400000) * dayW
    const weeks = []; let cur = new Date(minDate)
    while (cur <= maxDate) { weeks.push(new Date(cur)); cur.setDate(cur.getDate() + 7) }
    return (
      <div style={{ overflowX: 'auto', marginTop: 12, border: '1px solid #dfe1e6', borderRadius: 8 }}>
        <div style={{ minWidth: labelW + totalDays * dayW + 20 }}>
          <div style={{ display: 'flex', background: '#f8f9fc', borderBottom: '2px solid #dfe1e6', position: 'sticky', top: 0, zIndex: 5 }}>
            <div style={{ width: labelW, flexShrink: 0, padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', borderRight: '1px solid #dfe1e6' }}>Task</div>
            <div style={{ flex: 1, position: 'relative', height: 36 }}>
              {weeks.map((w, i) => <div key={i} style={{ position: 'absolute', left: Math.ceil((w - minDate) / 86400000) * dayW, top: 0, bottom: 0, borderLeft: '1px solid #e5e7eb', padding: '10px 4px', fontSize: 10, fontWeight: 700, color: '#6b778c', whiteSpace: 'nowrap' }}>{w.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>)}
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: labelW + todayPos, top: 0, bottom: 0, width: 2, background: '#de350b', zIndex: 4, pointerEvents: 'none' }} />
            {ganttTasks.map(task => {
              const s = statusMap[task.status] || STATUSES[0]
              const start = task.start_date ? Math.ceil((new Date(task.start_date) - minDate) / 86400000) * dayW : null
              const end = task.due_date ? Math.ceil((new Date(task.due_date) - minDate) / 86400000) * dayW + dayW : null
              const barW = start !== null && end !== null ? Math.max(end - start, dayW) : null
              return (
                <div key={task.id} style={{ display: 'flex', borderBottom: '1px solid #f0f1f3', minHeight: 34 }}>
                  <div style={{ width: labelW, flexShrink: 0, padding: '7px 12px', borderRight: '1px solid #f0f1f3', fontSize: 12, color: '#172b4d', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <OwnerAvatar name={task.assigned_to} />
                    <span title={task.title}>{task.title}</span>
                  </div>
                  <div style={{ flex: 1, position: 'relative', background: '#fff' }}>
                    {barW && <div style={{ position: 'absolute', left: start, top: 6, height: 20, width: barW, background: s.color, borderRadius: 4, opacity: 0.85, display: 'flex', alignItems: 'center', paddingLeft: 6, overflow: 'hidden' }}>
                      <span style={{ fontSize: 10, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>{task.title}</span>
                    </div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 40, background: '#fff', borderRadius: 12, border: '1px solid #dfe1e6', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      {/* Project header — solid doddl brand colour */}
      <div style={{ padding: '14px 20px', background: color, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>{project.name}</span>
            {project.owner && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff' }}>{project.owner.charAt(0)}</div>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{project.owner}</span>
              </div>
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
            {/* Column headers */}
            <div style={{ display: 'flex', alignItems: 'center', background: '#f8f9fc', borderBottom: '2px solid #dfe1e6', paddingLeft: 32 }}>
              <div style={{ flex: 1, padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Task</div>
              <div style={{ width: 68, padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Owner</div>
              <div style={{ width: 120, padding: '7px 6px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Status</div>
              <div style={{ width: 170, padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Timeline</div>
              <div style={{ width: 60, padding: '7px 6px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Effort</div>
              <div style={{ width: 90, padding: '7px 6px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Priority</div>
              <div style={{ width: 130, padding: '7px 6px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Progress</div>
            </div>

            {/* Groups with their tasks */}
            {groups.map((group, gi) => (
              <ProjectGroup key={group.id} group={group} allTasks={allTasks} projectColor={color}
                groupIndex={gi} onUpdate={onUpdate} onDelete={onDelete} onAddSubtask={onAddSubtask}
                onSelect={onSelect} onAddTask={onAddTask} projectId={project.id} />
            ))}

            {/* Ungrouped tasks */}
            {ungroupedTasks.length > 0 && (
              <div>
                {ungroupedTasks.map(task => (
                  <ProjectTableRow key={task.id} task={task} allTasks={allTasks} projectColor={color}
                    onUpdate={onUpdate} onDelete={onDelete} onAddSubtask={onAddSubtask} onSelect={onSelect} />
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
        {projectTab === 'gantt' && <ProjectGantt />}
        {projectTab === 'dashboard' && <ProjectDashboard project={project} tasks={tasks} color={color} />}
      </div>
    </div>
  )
}
