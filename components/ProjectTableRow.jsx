import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { PROJ_COL_WIDTHS as W } from '../lib/constants'
import StatusBadge from './StatusBadge'
import AssigneeSelect from './AssigneeSelect'
import PriorityBadge from './PriorityBadge'
import ProgressBar from './ProgressBar'
import TimelineCell from './TimelineCell'

export default function ProjectTableRow({ task, projectColor, onUpdate, onDelete, onSelect, depth = 0, selected, onToggleSelect }) {
  // Saves write to DB then trigger parent refresh. The taskIdRef guard (below)
  // prevents the refresh from wiping mid-interaction local state.
  const save = async (field, value) => {
    const { error } = await supabase.from('tasks').update({ [field]: value }).eq('id', task.id)
    if (!error) onUpdate()
  }
  const indent = depth * 20

  // Full local state — row is self-contained, never wiped by parent reload
  const [localStatus,   setLocalStatus]   = useState(task.status     || 'not_started')
  const [localAssignee, setLocalAssignee] = useState(task.assigned_to|| '')
  const [localPriority, setLocalPriority] = useState(task.priority   || 'medium')
  const [localProgress, setLocalProgress] = useState(task.progress   || 0)
  const [localStart,    setLocalStart]    = useState(task.start_date || '')
  const [localEnd,      setLocalEnd]      = useState(task.due_date   || '')

  const taskIdRef = useRef(task.id)
  useEffect(() => {
    if (task.id !== taskIdRef.current) {
      taskIdRef.current = task.id
      setLocalStatus(task.status || 'not_started')
      setLocalAssignee(task.assigned_to || '')
      setLocalPriority(task.priority || 'medium')
      setLocalProgress(task.progress || 0)
      setLocalStart(task.start_date || '')
      setLocalEnd(task.due_date || '')
    }
  }, [task.id])

  const effort = localStart && localEnd
    ? Math.max(1, Math.ceil((new Date(localEnd) - new Date(localStart)) / 86400000))
    : null

  const handleStatus = async (v) => {
    setLocalStatus(v)
    const updates = { status: v }
    if (v === 'done') { updates.progress = 100; setLocalProgress(100) }
    const { error } = await supabase.from('tasks').update(updates).eq('id', task.id)
    if (!error) onUpdate()
  }

  // UI #11 — progress % drives status:
  //   0%         → not_started
  //   1..99%     → in_progress
  //   100%       → done
  // Exception: if already at an explicit "state" value (on_track / at_risk /
  // blocked), we keep that — only flip from vanilla not_started / in_progress /
  // done to the auto-derived value, so a user's explicit state isn't clobbered.
  const handleProgress = async (v) => {
    const pct = Math.max(0, Math.min(100, Number(v) || 0))
    setLocalProgress(pct)
    const updates = { progress: pct }
    const auto = pct === 0 ? 'not_started' : pct === 100 ? 'done' : 'in_progress'
    const vanilla = new Set(['not_started', 'in_progress', 'done'])
    if (vanilla.has(localStatus) && auto !== localStatus) {
      updates.status = auto
      setLocalStatus(auto)
    }
    const { error } = await supabase.from('tasks').update(updates).eq('id', task.id)
    if (!error) onUpdate()
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', borderLeft: `4px solid ${projectColor}`, borderBottom: '1px solid #f0f1f3', minHeight: 40, background: selected ? '#f0f4ff' : 'transparent' }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#f8f9ff' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}>
      {/* Checkbox */}
      <div style={{ width: W.select, paddingLeft: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <input type="checkbox" checked={!!selected} onChange={() => onToggleSelect && onToggleSelect(task.id)}
          onClick={e => e.stopPropagation()}
          style={{ cursor: 'pointer', width: 14, height: 14 }} />
      </div>
      {/* Task name — single click opens detail panel */}
      <div style={{ flex: 1, paddingLeft: indent, paddingRight: 8, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span onClick={() => onSelect && onSelect(task)} title="Open task detail"
          style={{ fontWeight: depth === 0 ? 600 : 400, fontSize: 13, color: '#172b4d', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>
          {task.title}
        </span>
        <span onClick={() => onDelete(task.id)} title="Delete task"
          style={{ color: '#c1c7d0', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.color='#de350b'} onMouseLeave={e => e.currentTarget.style.color='#c1c7d0'}>×</span>
      </div>
      {/* Owner */}
      <div style={{ width: W.owner, padding: '4px 8px', display: 'flex', alignItems: 'center' }}>
        <AssigneeSelect value={localAssignee} onChange={v => { setLocalAssignee(v); save('assigned_to', v) }} avatarOnly />
      </div>
      {/* Status */}
      <div style={{ width: W.status, padding: '4px 6px' }}>
        <StatusBadge value={localStatus} onChange={handleStatus} />
      </div>
      {/* Timeline — combined date range picker + bar */}
      <div style={{ width: W.timeline, padding: '4px 8px' }}>
        <TimelineCell
          startDate={localStart} dueDate={localEnd} color={projectColor}
          onSave={async (start, end) => {
            setLocalStart(start); setLocalEnd(end)
            const { error } = await supabase.from('tasks').update({ start_date: start, due_date: end }).eq('id', task.id)
            if (!error) onUpdate()
          }} />
      </div>
      {/* Effort — auto from dates */}
      <div style={{ width: W.effort, padding: '4px 6px', textAlign: 'center' }}>
        {effort
          ? <span style={{ fontSize: 11, fontWeight: 700, color: '#0052cc', background: '#e9f2ff', borderRadius: 10, padding: '2px 7px' }}>{effort}d</span>
          : <span style={{ fontSize: 11, color: '#c1c7d0' }}>—</span>}
      </div>
      {/* Priority */}
      <div style={{ width: W.priority, padding: '4px 6px' }}>
        <PriorityBadge value={localPriority} onChange={v => { setLocalPriority(v); save('priority', v) }} />
      </div>
      {/* Progress */}
      <div style={{ width: W.progress, padding: '4px 6px' }}>
        <ProgressBar value={localProgress} onChange={handleProgress} />
      </div>
    </div>
  )
}
