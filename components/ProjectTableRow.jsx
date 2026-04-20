import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import StatusBadge from './StatusBadge'
import AssigneeSelect from './AssigneeSelect'
import PriorityBadge from './PriorityBadge'
import ProgressBar from './ProgressBar'
import InlineEdit from './InlineEdit'
import TimelineCell from './TimelineCell'

export default function ProjectTableRow({ task, allTasks, projectColor, onUpdate, onDelete, onSelect, depth = 0 }) {
  // ALL saves are silent — no reload, no re-render, no state wipe
  const save = async (field, value) => { await supabase.from('tasks').update({ [field]: value }).eq('id', task.id) }
  const indent = depth * 20

  // Full local state — row is self-contained, never wiped by parent reload
  const [localTitle,    setLocalTitle]    = useState(task.title      || '')
  const [localStatus,   setLocalStatus]   = useState(task.status     || 'not_started')
  const [localAssignee, setLocalAssignee] = useState(task.assigned_to|| '')
  const [localPriority, setLocalPriority] = useState(task.priority   || 'medium')
  const [localProgress, setLocalProgress] = useState(task.progress   || 0)
  const [localStart,    setLocalStart]    = useState(task.start_date || '')
  const [localEnd,      setLocalEnd]      = useState(task.due_date   || '')

  // Only sync ALL fields when navigating to a different task (task.id changes)
  // Never sync mid-interaction — prevents status/dates being wiped by reload race condition
  const taskIdRef = useRef(task.id)
  useEffect(() => {
    if (task.id !== taskIdRef.current) {
      taskIdRef.current = task.id
      setLocalTitle(task.title || '')
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
    if (!error) onUpdate()  // only reload if save succeeded
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', borderLeft: `4px solid ${projectColor}`, borderBottom: '1px solid #f0f1f3', minHeight: 40, background: 'transparent' }}
      onMouseEnter={e => e.currentTarget.style.background = '#f8f9ff'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      {/* Task name */}
      <div style={{ flex: 1, paddingLeft: 8 + indent, paddingRight: 8, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <InlineEdit value={localTitle} onSave={v => { setLocalTitle(v); save('title', v) }}
          style={{ fontWeight: depth === 0 ? 600 : 400, fontSize: 13, color: '#172b4d', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} />
        <span onClick={() => onSelect && onSelect(task)} title="Open detail"
          style={{ color: '#c1c7d0', cursor: 'pointer', fontSize: 12, flexShrink: 0 }} onMouseEnter={e => e.currentTarget.style.color='#6b778c'} onMouseLeave={e => e.currentTarget.style.color='#c1c7d0'}>↗</span>
        <span onClick={() => onDelete(task.id)} title="Delete task"
          style={{ color: '#c1c7d0', cursor: 'pointer', fontSize: 14, flexShrink: 0 }} onMouseEnter={e => e.currentTarget.style.color='#de350b'} onMouseLeave={e => e.currentTarget.style.color='#c1c7d0'}>×</span>
      </div>
      {/* Owner */}
      <div style={{ width: 68, padding: '4px 8px', display: 'flex', alignItems: 'center' }}>
        <AssigneeSelect value={localAssignee} onChange={v => { setLocalAssignee(v); save('assigned_to', v) }} avatarOnly />
      </div>
      {/* Status */}
      <div style={{ width: 120, padding: '4px 6px' }}>
        <StatusBadge value={localStatus} onChange={handleStatus} />
      </div>
      {/* Timeline — combined date range picker + bar */}
      <div style={{ width: 170, padding: '4px 8px' }}>
        <TimelineCell
          startDate={localStart} dueDate={localEnd} color={projectColor}
          onSave={async (start, end) => {
            setLocalStart(start); setLocalEnd(end)
            await supabase.from('tasks').update({ start_date: start, due_date: end }).eq('id', task.id)
          }} />
      </div>
      {/* Effort — auto from dates */}
      <div style={{ width: 60, padding: '4px 6px', textAlign: 'center' }}>
        {effort
          ? <span style={{ fontSize: 11, fontWeight: 700, color: '#0052cc', background: '#e9f2ff', borderRadius: 10, padding: '2px 7px' }}>{effort}d</span>
          : <span style={{ fontSize: 11, color: '#c1c7d0' }}>—</span>}
      </div>
      {/* Priority */}
      <div style={{ width: 90, padding: '4px 6px' }}>
        <PriorityBadge value={localPriority} onChange={v => { setLocalPriority(v); save('priority', v) }} />
      </div>
      {/* Progress */}
      <div style={{ width: 130, padding: '4px 6px' }}>
        <ProgressBar value={localProgress} onChange={v => { setLocalProgress(v); save('progress', v) }} />
      </div>
    </div>
  )
}
