import { getProjectColor } from '../lib/team'
import OwnerAvatar from './OwnerAvatar'

export default function ProjectGallery({ projects, visibleTasks, setActiveProject, setShowAddProject }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontWeight: 800, fontSize: 20, color: 'var(--indigo)' }}>All Projects</h2>
          <p style={{ fontSize: 13, color: '#6b778c', fontWeight: 600, marginTop: 2 }}>{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowAddProject(true)}
          style={{ background: 'var(--indigo)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>+ New Project</button>
      </div>
      {projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6b778c' }}>
          <p style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No projects yet</p>
          <p style={{ marginBottom: 20 }}>Create your first project to get started</p>
          <button onClick={() => setShowAddProject(true)} style={{ background: 'var(--indigo)', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>+ Create Project</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {projects.map((project, i) => {
            const pTasks   = visibleTasks.filter(t => t.project_id === project.id)
            const realP    = pTasks.filter(t => !t.is_group)
            const total    = realP.length
            const done     = realP.filter(t => t.status === 'done').length
            const inProg   = realP.filter(t => ['in_progress','on_track'].includes(t.status)).length
            const blocked  = realP.filter(t => ['blocked','at_risk'].includes(t.status)).length
            const overdue  = realP.filter(t => t.due_date && t.due_date < new Date().toISOString().split('T')[0] && t.status !== 'done').length
            const pct      = total ? Math.round(done / total * 100) : 0
            const color    = getProjectColor(project, i)
            const prioMap  = { critical: '#de350b', high: '#ff8b00', medium: '#0052cc', low: '#6b778c' }
            const prioColor = prioMap[project.priority] || '#6b778c'
            return (
              <div key={project.id} onClick={() => setActiveProject(project.id)}
                style={{ background: '#fff', borderRadius: 12, border: '1px solid #dfe1e6', overflow: 'hidden', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', transition: 'box-shadow 0.15s, transform 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'translateY(0)' }}>
                {/* Colour header bar */}
                <div style={{ height: 6, background: color }} />
                <div style={{ padding: '18px 20px' }}>
                  {/* Title row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <h3 style={{ fontWeight: 800, fontSize: 15, color: '#172b4d', lineHeight: 1.3, flex: 1, marginRight: 8 }}>{project.name}</h3>
                    <span style={{ fontSize: 10, fontWeight: 700, color: prioColor, background: prioColor + '18', borderRadius: 10, padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}>{(project.priority || 'medium').toUpperCase()}</span>
                  </div>
                  {/* Description */}
                  {project.description && (
                    <p style={{ fontSize: 12, color: '#6b778c', lineHeight: 1.5, marginBottom: 14, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{project.description}</p>
                  )}
                  {/* Owner + Due */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    {project.owner && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <OwnerAvatar name={project.owner} />
                        <span style={{ fontSize: 12, color: '#42526e', fontWeight: 600 }}>{project.owner}</span>
                      </div>
                    )}
                    {project.due_date && (
                      <span style={{ fontSize: 11, color: '#6b778c', background: '#f0f1f3', borderRadius: 6, padding: '2px 8px', marginLeft: 'auto' }}>
                        Due {new Date(project.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  {/* Progress bar */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: '#6b778c', fontWeight: 600 }}>Progress</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color }}>{pct}%</span>
                    </div>
                    <div style={{ height: 6, background: '#f0f1f3', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                  {/* Stats row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {[
                      { label: 'Total',    value: total,   col: '#172b4d', bg: '#f0f1f3' },
                      { label: 'Done',     value: done,    col: '#00875a', bg: '#e3fcef' },
                      { label: 'Active',   value: inProg,  col: '#0052cc', bg: '#e9f2ff' },
                      { label: 'Overdue',  value: overdue, col: overdue > 0 ? '#de350b' : '#6b778c', bg: overdue > 0 ? '#ffebe6' : '#f0f1f3' },
                    ].map(({ label, value, col, bg }) => (
                      <div key={label} style={{ background: bg, borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                        <p style={{ fontSize: 16, fontWeight: 800, color: col, lineHeight: 1 }}>{value}</p>
                        <p style={{ fontSize: 10, color: '#6b778c', fontWeight: 600, marginTop: 2 }}>{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
