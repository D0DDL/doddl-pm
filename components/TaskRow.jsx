import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { COL_WIDTHS, SOURCE_COLORS } from '../lib/constants'
import StatusBadge from './StatusBadge'
import AssigneeSelect from './AssigneeSelect'
import PriorityBadge from './PriorityBadge'
import ProgressBar from './ProgressBar'
import InlineEdit from './InlineEdit'
import DateCell from './DateCell'

// ── Inbox Row ──────────────────────────────────────────────────────────────
export function InboxRow({ task, onUpdate, onDelete, onSelect }) {
  const src = SOURCE_COLORS[task.source] || SOURCE_COLORS.manual
  return (
    <tr style={{ borderBottom: '1px solid #f0f1f3', cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = '#f8f9fc'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <td style={{ padding: '8px 8px', fontSize: 13, fontWeight: 600, color: '#172b4d' }} onClick={() => onSelect(task)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {task.title}
          <span onClick={e => { e.stopPropagation(); onDelete(task.id) }} style={{ cursor: 'pointer', color: '#c1c7d0', fontSize: 16, marginLeft: 4 }}>×</span>
        </div>
        {task.notes && <p style={{ fontSize: 11, color: '#6b778c', marginTop: 2, fontWeight: 400 }}>{String(task.notes).substring(0, 60)}…</p>}
      </td>
      <td style={{ padding: '8px 8px' }}>
        <span style={{ background: src.bg, color: src.color, borderRadius: 3, padding: '3px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{src.label}</span>
      </td>
      <td style={{ padding: '8px 8px' }}>
        <StatusBadge value={task.status} onChange={async v => { await supabase.from('tasks').update({ status: v }).eq('id', task.id); onUpdate() }} />
      </td>
      <td style={{ padding: '8px 8px' }}>
        <AssigneeSelect value={task.assigned_to} onChange={async v => { await supabase.from('tasks').update({ assigned_to: v }).eq('id', task.id); onUpdate() }} />
      </td>
      <td style={{ padding: '8px 8px', fontSize: 12, color: '#42526e' }}>{task.due_date || '—'}</td>
      <td style={{ padding: '8px 8px' }}>
        <PriorityBadge value={task.priority} onChange={async v => { await supabase.from('tasks').update({ priority: v }).eq('id', task.id); onUpdate() }} />
      </td>
    </tr>
  )
}

// ── Task Row ───────────────────────────────────────────────────────────────
export default function TaskRow({ task, allTasks, depth, onUpdate, onDelete, onAddSubtask, onSelect }) {
  const [expanded, setExpanded] = useState(true)
  const subtasks = allTasks.filter(t => t.parent_id === task.id)
  const hasChildren = subtasks.length > 0 || task.is_group
  const update = async (field, value) => { await supabase.from('tasks').update({ [field]: value }).eq('id', task.id); onUpdate() }
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
            {hasChildren && <span onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer', color: '#6b778c', fontSize: 10, width: 14, flexShrink: 0 }}>{expanded ? '▼' : '▶'}</span>}
            {!hasChildren && <span style={{ width: 14 }} />}
            <span onClick={() => onSelect && onSelect(task)} style={{ cursor: 'pointer', flex: 1 }}>
              <InlineEdit value={task.title} onSave={v => update('title', v)} style={{ fontWeight: depth === 0 ? 700 : 400, fontSize: 13, color: '#172b4d' }} />
            </span>
            <span onClick={() => onAddSubtask(task.id)} style={{ marginLeft: 4, color: '#c1c7d0', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>+</span>
            <span onClick={() => onDelete(task.id)} style={{ color: '#c1c7d0', cursor: 'pointer', fontSize: 14, lineHeight: 1, flexShrink: 0 }}>×</span>
          </div>
        </td>
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.status }}><StatusBadge value={task.status} onChange={v => update('status', v)} /></td>
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.assignee }}><AssigneeSelect value={task.assigned_to} onChange={v => update('assigned_to', v)} /></td>
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.start }}><DateCell value={task.start_date} onChange={v => update('start_date', v)} /></td>
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.due }}><DateCell value={task.due_date} onChange={v => update('due_date', v)} /></td>
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.priority }}><PriorityBadge value={task.priority} onChange={v => update('priority', v)} /></td>
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.progress }}><ProgressBar value={task.progress} onChange={v => update('progress', v)} /></td>
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.depends }}>
          {depTask ? <span style={{ fontSize: 11, color: '#0052cc', background: '#e9f2ff', borderRadius: 3, padding: '2px 6px' }}>{depTask.title.substring(0, 18)}{depTask.title.length > 18 ? '…' : ''}</span>
            : <span style={{ color: '#c1c7d0', fontSize: 11 }}>—</span>}
        </td>
      </tr>
      {expanded && subtasks.map(sub => (
        <TaskRow key={sub.id} task={sub} allTasks={allTasks} depth={depth + 1}
          onUpdate={onUpdate} onDelete={onDelete} onAddSubtask={onAddSubtask} onSelect={onSelect} />
      ))}
    </>
  )
}
