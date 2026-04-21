import { STATUSES, statusMap } from '../lib/constants'
import OwnerAvatar from './OwnerAvatar'

export default function GanttView({ tasks, projects }) {
  const today = new Date()
  const allDates = tasks.flatMap(t => [t.start_date, t.due_date]).filter(Boolean).map(d => new Date(d))
  const minDate = allDates.length ? new Date(Math.min(...allDates)) : new Date(today.getFullYear(), today.getMonth(), 1)
  const maxDate = allDates.length ? new Date(Math.max(...allDates)) : new Date(today.getFullYear(), today.getMonth() + 3, 0)
  minDate.setDate(minDate.getDate() - 7); maxDate.setDate(maxDate.getDate() + 14)
  const totalDays = Math.ceil((maxDate - minDate) / 86400000)
  const dayWidth = 28, labelW = 240
  const dayPos = date => Math.ceil((new Date(date) - minDate) / 86400000) * dayWidth
  const todayPos = Math.ceil((today - minDate) / 86400000) * dayWidth
  const weeks = []; let cur = new Date(minDate)
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
                  {width && <div style={{ position: 'absolute', left: start, top: 6, height: 22, width, background: s.color, borderRadius: 4, opacity: 0.85, display: 'flex', alignItems: 'center', paddingLeft: 6, overflow: 'hidden' }}>
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
