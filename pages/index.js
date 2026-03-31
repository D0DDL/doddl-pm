import { useState, useEffect, useCallback, useRef } from 'react'
import Head from 'next/head'
import { supabase } from '../lib/supabase'

// ── MSAL Auth ──────────────────────────────────────────────────────────────
const MSAL_CONFIG = {
  clientId: 'bddcde1a-b104-4c96-8f67-9b40a1dfea3c',
  tenantId: '927d1e2c-7c8d-406f-8640-678dfce86b7d',
}

let _msal = null
async function getMsal() {
  if (_msal) return _msal
  const { PublicClientApplication } = await import('@azure/msal-browser')
  _msal = new PublicClientApplication({
    auth: {
      clientId: MSAL_CONFIG.clientId,
      authority: `https://login.microsoftonline.com/${MSAL_CONFIG.tenantId}`,
      redirectUri: typeof window !== 'undefined' ? window.location.origin : '',
    },
    cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
  })
  await _msal.initialize()
  return _msal
}

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

const SOURCE_COLORS = {
  email:        { bg: '#dbeafe', color: '#1d4ed8', label: 'Email' },
  teams:        { bg: '#ede9fe', color: '#7c3aed', label: 'Teams' },
  teamsmaestro: { bg: '#fce7f3', color: '#be185d', label: 'TeamsMAestro' },
  manual:       { bg: '#f3f4f6', color: '#374151', label: 'Manual' },
}

// ── Login Screen ───────────────────────────────────────────────────────────
function LoginScreen({ onLogin, loading }) {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #3D157D 0%, #1a0a3a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Nunito, sans-serif' }}>
      <Head>
        <title>doddl PM</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </Head>
      <div style={{ textAlign: 'center', color: '#fff' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <span style={{ fontWeight: 800, fontSize: 40, letterSpacing: '-1px' }}>doddl</span>
            <span style={{ color: '#30BEAA', fontWeight: 800, fontSize: 40 }}>.</span>
          </div>
          <p style={{ fontWeight: 600, fontSize: 15, opacity: 0.65, marginTop: 4 }}>Project Management</p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: '40px 48px', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.12)', minWidth: 340 }}>
          <p style={{ fontSize: 14, opacity: 0.65, marginBottom: 28, fontWeight: 600 }}>Sign in with your doddl account</p>
          <button onClick={onLogin} disabled={loading} style={{
            background: '#fff', color: '#3D157D', border: 'none', borderRadius: 8,
            padding: '13px 32px', fontWeight: 800, fontSize: 15, cursor: loading ? 'wait' : 'pointer',
            fontFamily: 'Nunito, sans-serif', display: 'flex', alignItems: 'center', gap: 10,
            margin: '0 auto', opacity: loading ? 0.7 : 1, transition: 'opacity 0.2s'
          }}>
            <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
              <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
              <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
            </svg>
            {loading ? 'Signing in...' : 'Sign in with Microsoft'}
          </button>
        </div>
        <p style={{ fontSize: 11, opacity: 0.35, marginTop: 24 }}>Restricted to @doddl.com accounts</p>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────
function StatusBadge({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const s = statusMap[value] || STATUSES[0]
  return (
    <div style={{ position: 'relative' }}>
      <div onClick={() => onChange && setOpen(o => !o)}
        style={{ background: s.color, color: '#fff', borderRadius: 3, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: onChange ? 'pointer' : 'default', whiteSpace: 'nowrap', textAlign: 'center' }}>
        {s.label}
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 999, background: '#fff', border: '1px solid #dfe1e6', borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: 140, marginTop: 2 }}>
          {STATUSES.map(st => (
            <div key={st.key} onClick={() => { onChange(st.key); setOpen(false) }}
              style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              onMouseEnter={e => e.currentTarget.style.background = '#f4f5f7'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: st.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{st.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PriorityBadge({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const p = priorityMap[value] || PRIORITIES[2]
  return (
    <div style={{ position: 'relative' }}>
      <div onClick={() => onChange && setOpen(o => !o)}
        style={{ color: p.color, fontSize: 11, fontWeight: 700, cursor: onChange ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
        {p.label}
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 999, background: '#fff', border: '1px solid #dfe1e6', borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: 120, marginTop: 2 }}>
          {PRIORITIES.map(pr => (
            <div key={pr.key} onClick={() => { onChange(pr.key); setOpen(false) }}
              style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              onMouseEnter={e => e.currentTarget.style.background = '#f4f5f7'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: pr.color }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: pr.color }}>{pr.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProgressBar({ value, onChange }) {
  const pct = Math.min(100, Math.max(0, value || 0))
  const color = pct === 100 ? '#36b37e' : pct > 60 ? '#0052cc' : pct > 30 ? '#ff8b00' : '#c1c7d0'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: '#f0f1f3', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      {onChange ? (
        <input type="number" min="0" max="100" value={pct}
          onChange={e => onChange(parseInt(e.target.value) || 0)}
          style={{ width: 36, fontSize: 11, fontWeight: 700, color: '#42526e', border: 'none', background: 'transparent', textAlign: 'right', padding: 0 }} />
      ) : (
        <span style={{ fontSize: 11, fontWeight: 700, color: '#42526e', minWidth: 28, textAlign: 'right' }}>{pct}%</span>
      )}
    </div>
  )
}

function InlineEdit({ value, onSave, style = {} }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const ref = useRef()
  useEffect(() => { if (editing && ref.current) ref.current.focus() }, [editing])
  if (editing) return (
    <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
      onBlur={() => { onSave(val); setEditing(false) }}
      onKeyDown={e => { if (e.key === 'Enter') { onSave(val); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
      style={{ width: '100%', border: 'none', borderBottom: '2px solid var(--aqua)', outline: 'none', background: 'transparent', fontSize: 13, padding: '2px 0', ...style }} />
  )
  return <span onDoubleClick={() => setEditing(true)} style={{ cursor: 'text', ...style }}>{value || <span style={{ color: '#a0aec0' }}>—</span>}</span>
}

function DateCell({ value, onChange }) {
  return (
    <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
      style={{ border: 'none', background: 'transparent', fontSize: 12, color: value ? '#172b4d' : '#a0aec0', cursor: 'pointer', width: '100%', fontFamily: 'Nunito, sans-serif' }} />
  )
}

// ── Gantt Chart ────────────────────────────────────────────────────────────
function GanttView({ tasks, projects }) {
  const today = new Date()
  const allDates = tasks.flatMap(t => [t.start_date, t.due_date]).filter(Boolean).map(d => new Date(d))
  const minDate = allDates.length ? new Date(Math.min(...allDates)) : new Date(today.getFullYear(), today.getMonth(), 1)
  const maxDate = allDates.length ? new Date(Math.max(...allDates)) : new Date(today.getFullYear(), today.getMonth() + 3, 0)
  minDate.setDate(minDate.getDate() - 7)
  maxDate.setDate(maxDate.getDate() + 14)
  const totalDays = Math.ceil((maxDate - minDate) / 86400000)
  const dayWidth = 28
  const labelW = 240
  const dayPos = date => Math.ceil((new Date(date) - minDate) / 86400000) * dayWidth
  const todayPos = Math.ceil((today - minDate) / 86400000) * dayWidth
  const weeks = []
  let cur = new Date(minDate)
  while (cur <= maxDate) { weeks.push(new Date(cur)); cur.setDate(cur.getDate() + 7) }
  const projectMap = Object.fromEntries((projects || []).map(p => [p.id, p]))
  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 160px)' }}>
      <div style={{ minWidth: labelW + totalDays * dayWidth + 40 }}>
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
                    <div style={{ position: 'absolute', left: start, top: 6, height: 22, width, background: s.color, borderRadius: 4, opacity: 0.85, display: 'flex', alignItems: 'center', paddingLeft: 6, overflow: 'hidden' }}>
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

// ── Inbox Row ──────────────────────────────────────────────────────────────
function InboxRow({ task, onUpdate, onDelete }) {
  const [assignee, setAssignee] = useState(task.assigned_to || '')
  const src = SOURCE_COLORS[task.source] || SOURCE_COLORS.manual
  const saveAssignee = async () => {
    await supabase.from('tasks').update({ assigned_to: assignee }).eq('id', task.id)
    onUpdate()
  }
  return (
    <tr style={{ borderBottom: '1px solid #f0f1f3' }}
      onMouseEnter={e => e.currentTarget.style.background = '#f8f9fc'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <td style={{ padding: '8px 8px', fontSize: 13, fontWeight: 600, color: '#172b4d' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {task.title}
          <span onClick={() => onDelete(task.id)} style={{ cursor: 'pointer', color: '#c1c7d0', fontSize: 16, marginLeft: 4 }}>×</span>
        </div>
        {task.notes && <p style={{ fontSize: 11, color: '#6b778c', marginTop: 2, fontWeight: 400 }}>{String(task.notes).substring(0, 80)}{String(task.notes).length > 80 ? '…' : ''}</p>}
      </td>
      <td style={{ padding: '8px 8px' }}>
        <span style={{ background: src.bg, color: src.color, borderRadius: 3, padding: '3px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{src.label}</span>
      </td>
      <td style={{ padding: '8px 8px' }}>
        <StatusBadge value={task.status} onChange={async v => { await supabase.from('tasks').update({ status: v }).eq('id', task.id); onUpdate() }} />
      </td>
      <td style={{ padding: '8px 8px' }}>
        <input value={assignee} onChange={e => setAssignee(e.target.value)} onBlur={saveAssignee}
          onKeyDown={e => e.key === 'Enter' && saveAssignee()} placeholder="Assign to..."
          style={{ border: 'none', borderBottom: '1px solid #e5e7eb', background: 'transparent', fontSize: 12, color: '#42526e', width: '100%', padding: '2px 0', fontFamily: 'Nunito, sans-serif', outline: 'none' }} />
      </td>
      <td style={{ padding: '8px 8px', fontSize: 12, color: '#42526e' }}>{task.due_date || '—'}</td>
      <td style={{ padding: '8px 8px' }}>
        <PriorityBadge value={task.priority} onChange={async v => { await supabase.from('tasks').update({ priority: v }).eq('id', task.id); onUpdate() }} />
      </td>
    </tr>
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
  return (
    <>
      <tr style={{ background: bg, borderBottom: '1px solid #f0f1f3' }}
        onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
        onMouseLeave={e => e.currentTarget.style.background = bg}>
        <td style={{ padding: `6px 8px 6px ${8 + indent}px`, width: COL_WIDTHS.task, minWidth: COL_WIDTHS.task }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.status }}>
          <StatusBadge value={task.status} onChange={v => update('status', v)} />
        </td>
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.assignee }}>
          <InlineEdit value={task.assigned_to} onSave={v => update('assigned_to', v)} style={{ fontSize: 12, color: '#42526e' }} />
        </td>
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.start }}>
          <DateCell value={task.start_date} onChange={v => update('start_date', v)} />
        </td>
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.due }}>
          <DateCell value={task.due_date} onChange={v => update('due_date', v)} />
        </td>
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.priority }}>
          <PriorityBadge value={task.priority} onChange={v => update('priority', v)} />
        </td>
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.progress }}>
          <ProgressBar value={task.progress} onChange={v => update('progress', v)} />
        </td>
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
function ProjectSection({ project, tasks, allTasks, onUpdate, onDelete, onAddTask, onAddSubtask }) {
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
    setGroupName(''); setAddingGroup(false); onUpdate()
  }
  return (
    <div style={{ marginBottom: 32 }}>
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
                {[['Task', COL_WIDTHS.task], ['Status', COL_WIDTHS.status], ['Assignee', COL_WIDTHS.assignee], ['Start', COL_WIDTHS.start], ['Due', COL_WIDTHS.due], ['Priority', COL_WIDTHS.priority], ['Progress', COL_WIDTHS.progress], ['Depends On', COL_WIDTHS.depends]].map(([h, w]) => (
                  <th key={h} style={{ padding: '7px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', letterSpacing: '0.04em', width: w }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projectTasks.map(task => (
                <TaskRow key={task.id} task={task} allTasks={allTasks} depth={0}
                  onUpdate={onUpdate} onDelete={onDelete} onAddSubtask={onAddSubtask} />
              ))}
            </tbody>
          </table>
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
                  placeholder="Group name..." style={{ border: '1px solid var(--aqua)', borderRadius: 4, padding: '3px 8px', fontSize: 12, fontFamily: 'Nunito, sans-serif' }} />
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
            {[['Project', 'project_id', 'select-project'], ['Status', 'status', 'select-status'], ['Priority', 'priority', 'select-priority'], ['Assignee', 'assigned_to', 'text'], ['Start Date', 'start_date', 'date'], ['Due Date', 'due_date', 'date'], ['Progress %', 'progress', 'number'], ['Depends On', 'depends_on', 'select-task']].map(([label, field, type]) => (
              <div key={field}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>{label}</label>
                {type === 'select-project' ? (
                  <select value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }}>
                    <option value="">No project</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                ) : type === 'select-status' ? (
                  <select value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }}>
                    {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                ) : type === 'select-priority' ? (
                  <select value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }}>
                    {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                ) : type === 'select-task' ? (
                  <select value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }}>
                    <option value="">None</option>
                    {allTasks.filter(t => t.id !== form.id).map(t => <option key={t.id} value={t.id}>{t.title.substring(0, 40)}</option>)}
                  </select>
                ) : (
                  <input type={type} value={form[field]} onChange={e => setForm({ ...form, [field]: type === 'number' ? parseInt(e.target.value) || 0 : e.target.value })}
                    placeholder={type === 'text' ? 'Name' : ''} min={type === 'number' ? 0 : undefined} max={type === 'number' ? 100 : undefined}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }} />
                )}
              </div>
            ))}
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
  const [user, setUser]                   = useState(null)
  const [authLoading, setAuthLoading]     = useState(true)
  const [loginLoading, setLoginLoading]   = useState(false)
  const [view, setView]                   = useState('board')
  const [tasks, setTasks]                 = useState([])
  const [projects, setProjects]           = useState([])
  const [loading, setLoading]             = useState(true)
  const [activeProject, setActiveProject] = useState(null)
  const [showAddTask, setShowAddTask]     = useState(false)
  const [showAddProject, setShowAddProject] = useState(false)
  const [addTaskProjectId, setAddTaskProjectId] = useState(null)
  const [addTaskParentId, setAddTaskParentId]   = useState(null)
  const [search, setSearch]               = useState('')

  // ── MSAL init ──
  useEffect(() => {
    (async () => {
      try {
        const msal = await getMsal()
        await msal.handleRedirectPromise()
        const accounts = msal.getAllAccounts()
        if (accounts.length > 0) {
          setUser(accounts[0])
        }
      } catch (e) {
        console.error('MSAL init error', e)
      } finally {
        setAuthLoading(false)
      }
    })()
  }, [])

  const handleLogin = async () => {
    setLoginLoading(true)
    try {
      const msal = await getMsal()
      await msal.loginRedirect({ scopes: ['User.Read'] })
    } catch (e) {
      console.error('Login error', e)
      setLoginLoading(false)
    }
  }

  const handleLogout = async () => {
    const msal = await getMsal()
    msal.logoutRedirect()
  }

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

  useEffect(() => { if (user) load() }, [user, load])

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
  const inboxCount = tasks.filter(t => t.source !== 'manual' && (t.status === 'not_started' || t.status === 'todo')).length

  const navBtn = (key, label, count) => (
    <button onClick={() => setView(key)} style={{
      display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
      padding: '7px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
      fontFamily: 'Nunito, sans-serif', fontWeight: 600, fontSize: 13, marginBottom: 2,
      background: view === key ? '#e9f2ff' : 'transparent',
      color: view === key ? '#0052cc' : '#42526e',
    }}>
      {label}
      {count > 0 && <span style={{ background: '#de350b', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>{count}</span>}
    </button>
  )

  // Show login if not authenticated
  if (authLoading) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #3D157D 0%, #1a0a3a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Nunito, sans-serif', color: '#fff', fontSize: 16, fontWeight: 600 }}>
      <Head><link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" /></Head>
      Loading...
    </div>
  )

  if (!user) return <LoginScreen onLogin={handleLogin} loading={loginLoading} />

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => { setView('board'); setShowAddTask(true); setAddTaskProjectId(null); setAddTaskParentId(null) }}
            style={{ background: 'var(--aqua)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            + Task
          </button>
          <button onClick={() => setShowAddProject(true)}
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '6px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            + Project
          </button>
          {/* User avatar + logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#30BEAA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>
              {user.name?.charAt(0) || user.username?.charAt(0) || '?'}
            </div>
            <span style={{ fontSize: 12, opacity: 0.8, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name || user.username}</span>
            <button onClick={handleLogout} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 11, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', opacity: 0.7 }}>Sign out</button>
          </div>
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
              {tasks.filter(t => t.source !== 'manual' && (t.status === 'not_started' || t.status === 'todo')).length === 0
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
                      {tasks.filter(t => t.source !== 'manual' && (t.status === 'not_started' || t.status === 'todo')).map(task => (
                        <InboxRow key={task.id} task={task} onUpdate={load} onDelete={deleteTask} />
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
                    onAddTask={handleAddTask} onAddSubtask={handleAddSubtask} />
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
