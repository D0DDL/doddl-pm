import { supabase } from '../lib/supabase'
import { SOURCE_COLORS } from '../lib/constants'
import StatusBadge from './StatusBadge'
import PriorityBadge from './PriorityBadge'

const SOURCE_ORDER = ['teamsmaestro', 'teams', 'email']

// My Work — ad-hoc tasks assigned to the current user from external sources
// (Power Automate / Teams / Email). Not project-based. Grouped by source.
export default function MyWorkView({ myFlowTasks, setSelectedTask, load }) {
  const grouped = SOURCE_ORDER.reduce((acc, src) => { acc[src] = myFlowTasks.filter(t => t.source === src); return acc }, {})
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div>
          <h2 style={{ fontWeight: 800, fontSize: 18, color: 'var(--indigo)' }}>My Work</h2>
          <p style={{ fontSize: 13, color: '#6b778c', fontWeight: 600, marginTop: 2 }}>Ad-hoc tasks assigned to you from Email, Teams and TeamsMAestro — visible only to you</p>
        </div>
        <div style={{ marginLeft: 'auto', background: '#f0f4ff', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: 'var(--indigo)' }}>{myFlowTasks.length} task{myFlowTasks.length !== 1 ? 's' : ''}</div>
      </div>
      {myFlowTasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6b778c' }}>
          <p style={{ fontSize: 32, marginBottom: 8 }}>📬</p>
          <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Nothing assigned to you</p>
          <p style={{ fontSize: 13 }}>Ad-hoc tasks from Email, Teams and TeamsMAestro will appear here</p>
        </div>
      ) : SOURCE_ORDER.map(src => {
        const srcTasks = grouped[src]
        if (!srcTasks.length) return null
        const srcInfo = SOURCE_COLORS[src] || SOURCE_COLORS.manual
        return (
          <div key={src} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ background: srcInfo.bg, color: srcInfo.color, borderRadius: 4, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>{srcInfo.label}</span>
              <span style={{ fontSize: 12, color: '#6b778c', fontWeight: 600 }}>{srcTasks.length} task{srcTasks.length !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #dfe1e6', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#f8f9fc', borderBottom: '1px solid #dfe1e6' }}>
                  {['Task', 'Status', 'Due', 'Priority'].map(h => <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {srcTasks.map(task => (
                    <tr key={task.id} style={{ borderBottom: '1px solid #f0f1f3', cursor: 'pointer' }}
                      onClick={() => setSelectedTask(task)}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8f9ff'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '9px 12px' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#172b4d' }}>{task.title}</p>
                        {task.notes && <p style={{ fontSize: 11, color: '#6b778c', marginTop: 2 }}>{String(task.notes).substring(0, 60)}...</p>}
                      </td>
                      <td style={{ padding: '9px 12px' }} onClick={e => e.stopPropagation()}><StatusBadge value={task.status} onChange={async v => { await supabase.from('tasks').update({ status: v }).eq('id', task.id); load() }} /></td>
                      <td style={{ padding: '9px 12px', fontSize: 12, color: task.due_date && new Date(task.due_date) < new Date() ? '#de350b' : '#42526e', fontWeight: 600 }}>
                        {task.due_date ? new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                      </td>
                      <td style={{ padding: '9px 12px' }} onClick={e => e.stopPropagation()}><PriorityBadge value={task.priority} onChange={async v => { await supabase.from('tasks').update({ priority: v }).eq('id', task.id); load() }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </>
  )
}
