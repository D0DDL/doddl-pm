export default function AppHeader({ search, setSearch, userName, handleLogout, onAddTaskClick, onAddProjectClick }) {
  return (
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
        <button onClick={onAddTaskClick}
          style={{ background: 'var(--aqua)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Task</button>
        <button onClick={onAddProjectClick}
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '6px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Project</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: '#30BEAA', color: '#fff', fontWeight: 800, fontSize: 12, padding: '4px 12px', borderRadius: 11 }}>
            {userName || '?'}
          </span>
          <button onClick={handleLogout} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 11, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', opacity: 0.7 }}>Sign out</button>
        </div>
      </div>
    </header>
  )
}
