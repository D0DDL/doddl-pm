import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { STATUSES, PRIORITIES } from '../lib/constants'
import StatusBadge from './StatusBadge'
import PriorityBadge from './PriorityBadge'
import ProgressBar from './ProgressBar'

function MwTaskTable({ items, sortFn, projects, todayStr, setSelectedTask, load }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: '#f8f9fc', borderBottom: '2px solid #dfe1e6' }}>
          <th style={{ padding: '8px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Task</th>
          <th style={{ padding: '8px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Project</th>
          <th style={{ padding: '8px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Status</th>
          <th style={{ padding: '8px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Due</th>
          <th style={{ padding: '8px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Priority</th>
          <th style={{ padding: '8px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Progress</th>
        </tr>
      </thead>
      <tbody>
        {[...items].sort(sortFn).map(task => {
          const proj = projects.find(p => p.id === task.project_id)
          const isOvd = task.due_date && task.due_date < todayStr
          return (
            <tr key={task.id} onClick={() => setSelectedTask(task)} style={{ borderBottom: '1px solid #f0f1f3', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8f9ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <td style={{ padding: '9px 8px', fontSize: 13, fontWeight: 600, color: '#172b4d', maxWidth: 400 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
                {task.notes && <div style={{ fontSize: 11, color: '#6b778c', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(task.notes).substring(0,80)}</div>}
              </td>
              <td style={{ padding: '9px 8px' }}>
                {proj ? <span style={{ fontSize: 11, background: '#f0f1f3', borderRadius: 3, padding: '2px 8px', fontWeight: 600, color: '#42526e', whiteSpace: 'nowrap' }}>{proj.name.substring(0,25)}{proj.name.length>25?'…':''}</span>
                  : <span style={{ color: '#c1c7d0', fontSize: 11 }}>—</span>}
              </td>
              <td style={{ padding: '9px 8px' }}>
                <StatusBadge value={task.status} onChange={async v => { await supabase.from('tasks').update({ status: v }).eq('id', task.id); load() }} />
              </td>
              <td style={{ padding: '9px 8px', fontSize: 12, fontWeight: isOvd ? 700 : 500, color: isOvd ? '#de350b' : '#42526e', whiteSpace: 'nowrap' }}>
                {task.due_date ? new Date(task.due_date).toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : '—'}
              </td>
              <td style={{ padding: '9px 8px' }}>
                <PriorityBadge value={task.priority} onChange={async v => { await supabase.from('tasks').update({ priority: v }).eq('id', task.id); load() }} />
              </td>
              <td style={{ padding: '9px 8px', minWidth: 90 }}>
                <ProgressBar value={task.progress} onChange={async v => { await supabase.from('tasks').update({ progress: v }).eq('id', task.id); load() }} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function MwSection({ title, color, accent, items, icon, sortFn, projects, todayStr, setSelectedTask, load }) {
  const [open, setOpen] = useState(true)
  if (items.length === 0) return null
  return (
    <div style={{ marginBottom: 4 }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: accent, borderLeft: `4px solid ${color}`, borderBottom: '1px solid #dfe1e6', cursor: 'pointer' }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontWeight: 800, fontSize: 13, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
        <span style={{ background: color, color: '#fff', borderRadius: 10, fontSize: 11, fontWeight: 800, padding: '1px 8px' }}>{items.length}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color, opacity: 0.7 }}>{open ? '▼' : '▶'}</span>
      </div>
      {open && <MwTaskTable items={items} sortFn={sortFn} projects={projects} todayStr={todayStr} setSelectedTask={setSelectedTask} load={load} />}
    </div>
  )
}

export default function MyWorkView({ visibleTasks, userName, mwFilter, setMwFilter, mwSort, setMwSort, projects, setSelectedTask, load }) {
  const todayStr = new Date().toISOString().split('T')[0]
  const weekEnd  = new Date(); weekEnd.setDate(weekEnd.getDate() + 7)
  const weekStr  = weekEnd.toISOString().split('T')[0]
  const monthEnd = new Date(); monthEnd.setDate(monthEnd.getDate() + 30)
  const monthStr = monthEnd.toISOString().split('T')[0]

  const allMy = visibleTasks.filter(t => t.assigned_to?.toLowerCase() === userName.toLowerCase())

  const myTasks = allMy.filter(t => t.status !== 'done')
    .filter(t => !mwFilter.status   || t.status   === mwFilter.status)
    .filter(t => !mwFilter.priority || t.priority === mwFilter.priority)
    .filter(t => !mwFilter.project  || t.project_id === mwFilter.project)

  const overdue   = myTasks.filter(t => t.due_date && t.due_date < todayStr)
  const dueToday  = myTasks.filter(t => t.due_date === todayStr)
  const thisWeek  = myTasks.filter(t => t.due_date && t.due_date > todayStr && t.due_date <= weekStr)
  const thisMonth = myTasks.filter(t => t.due_date && t.due_date > weekStr  && t.due_date <= monthStr)
  const later     = myTasks.filter(t => t.due_date && t.due_date > monthStr)
  const noDate    = myTasks.filter(t => !t.due_date)

  // Stats across ALL my tasks (including done)
  const totalAll   = allMy.length
  const doneAll    = allMy.filter(t => t.status === 'done').length
  const overdueAll = allMy.filter(t => t.due_date && t.due_date < todayStr && t.status !== 'done').length
  const criticalAll = allMy.filter(t => t.priority === 'critical' && t.status !== 'done').length
  const inProgAll  = allMy.filter(t => ['in_progress','on_track'].includes(t.status)).length

  const sortFn = (a, b) => {
    if (mwSort === 'due')      return (a.due_date||'9') < (b.due_date||'9') ? -1 : 1
    if (mwSort === 'priority') { const o = {critical:0,high:1,medium:2,low:3}; return (o[a.priority]??2) - (o[b.priority]??2) }
    if (mwSort === 'project')  return (a.project_id||'') < (b.project_id||'') ? -1 : 1
    return 0
  }

  const selStyle = { padding: '6px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 12, fontFamily: 'Nunito, sans-serif', background: '#fff', cursor: 'pointer', color: '#42526e' }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--aqua)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, color: '#fff', flexShrink: 0 }}>{userName.charAt(0)}</div>
        <div>
          <h2 style={{ fontWeight: 800, fontSize: 20, color: 'var(--indigo)' }}>My Work</h2>
          <p style={{ fontSize: 13, color: '#6b778c', fontWeight: 600 }}>{myTasks.length} active · {userName}</p>
        </div>
      </div>

      {/* Dashboard stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Tasks', value: totalAll, color: 'var(--indigo)', bg: '#f3eeff' },
          { label: 'Done', value: doneAll, color: '#36b37e', bg: '#e3fcef' },
          { label: 'In Progress', value: inProgAll, color: '#0052cc', bg: '#e9f2ff' },
          { label: 'Overdue', value: overdueAll, color: '#de350b', bg: '#ffebe6' },
          { label: 'Critical', value: criticalAll, color: '#ff5630', bg: '#fff0e6' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #dfe1e6', borderRadius: 10, padding: '16px 18px', borderTop: `3px solid ${color}` }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</p>
            <p style={{ fontSize: 28, fontWeight: 800, color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '12px 16px', background: '#fff', borderRadius: 8, border: '1px solid #dfe1e6' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#6b778c' }}>Filter:</span>
        <select value={mwFilter.status} onChange={e => setMwFilter(f => ({ ...f, status: e.target.value }))} style={selStyle}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={mwFilter.priority} onChange={e => setMwFilter(f => ({ ...f, priority: e.target.value }))} style={selStyle}>
          <option value="">All Priorities</option>
          {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <select value={mwFilter.project} onChange={e => setMwFilter(f => ({ ...f, project: e.target.value }))} style={selStyle}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name.substring(0,30)}</option>)}
        </select>
        {(mwFilter.status || mwFilter.priority || mwFilter.project) && (
          <button onClick={() => setMwFilter({ status:'', priority:'', project:'' })}
            style={{ fontSize: 12, fontWeight: 700, color: '#de350b', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>✕ Clear</button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#6b778c' }}>Sort:</span>
        {[['due','Due Date'],['priority','Priority'],['project','Project']].map(([k,l]) => (
          <button key={k} onClick={() => setMwSort(k)}
            style={{ fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 6, border: `1px solid ${mwSort===k?'var(--indigo)':'#dfe1e6'}`, background: mwSort===k?'var(--indigo)':'#fff', color: mwSort===k?'#fff':'#42526e', cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>{l}</button>
        ))}
      </div>

      {myTasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6b778c' }}>
          <p style={{ fontSize: 24, marginBottom: 8 }}>🎉</p>
          <p style={{ fontSize: 16, fontWeight: 700 }}>All clear!</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>No tasks match your filters</p>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #dfe1e6', overflow: 'hidden' }}>
          <MwSection title="Overdue"     color="#de350b" accent="#fff5f5" items={overdue}   icon="🔴" sortFn={sortFn} projects={projects} todayStr={todayStr} setSelectedTask={setSelectedTask} load={load} />
          <MwSection title="Due Today"   color="#ff8b00" accent="#fffbf0" items={dueToday}  icon="🟡" sortFn={sortFn} projects={projects} todayStr={todayStr} setSelectedTask={setSelectedTask} load={load} />
          <MwSection title="This Week"   color="#0052cc" accent="#f0f5ff" items={thisWeek}  icon="📅" sortFn={sortFn} projects={projects} todayStr={todayStr} setSelectedTask={setSelectedTask} load={load} />
          <MwSection title="This Month"  color="#00875a" accent="#f0faf5" items={thisMonth} icon="📆" sortFn={sortFn} projects={projects} todayStr={todayStr} setSelectedTask={setSelectedTask} load={load} />
          <MwSection title="Later"       color="#6554c0" accent="#f5f3ff" items={later}     icon="🔮" sortFn={sortFn} projects={projects} todayStr={todayStr} setSelectedTask={setSelectedTask} load={load} />
          <MwSection title="No Due Date" color="#6b778c" accent="#f8f9fc" items={noDate}    icon="📌" sortFn={sortFn} projects={projects} todayStr={todayStr} setSelectedTask={setSelectedTask} load={load} />
        </div>
      )}
    </div>
  )
}
