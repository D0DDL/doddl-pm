import { getProjectColor } from '../lib/team'

function NavBtn({ view, setView, activeKey, label, count }) {
  return (
    <button onClick={() => setView(activeKey)} style={{
      display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
      padding: '7px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
      fontFamily: 'Nunito, sans-serif', fontWeight: 600, fontSize: 13, marginBottom: 2,
      background: view === activeKey ? '#e9f2ff' : 'transparent', color: view === activeKey ? '#0052cc' : '#42526e',
    }}>
      {label}
      {count > 0 && <span style={{ background: '#de350b', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>{count}</span>}
    </button>
  )
}

export default function AppSidebar({ view, setView, projects, activeProject, setActiveProject, myFlowCount, unreadCount }) {
  return (
    <aside style={{ width: 210, background: '#fff', borderRight: '1px solid #dfe1e6', padding: '16px 8px', overflowY: 'auto', flexShrink: 0 }}>
      <div style={{ marginBottom: 20 }}>
        <NavBtn view={view} setView={setView} activeKey="mywork"     label="👤 My Work"       count={0} />
        <NavBtn view={view} setView={setView} activeKey="myprojects" label="📌 My Projects"   count={myFlowCount} />
        <NavBtn view={view} setView={setView} activeKey="board"      label="📋 All Projects"  count={0} />
        <NavBtn view={view} setView={setView} activeKey="inbox"      label="🔔 Notifications" count={unreadCount} />
      </div>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 12px', marginBottom: 6 }}>Projects</p>
      <button onClick={() => setActiveProject(null)} style={{ width: '100%', textAlign: 'left', padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontWeight: 600, fontSize: 12, marginBottom: 2, background: !activeProject ? '#e9f2ff' : 'transparent', color: !activeProject ? '#0052cc' : '#42526e' }}>All projects</button>
      {projects.map((p, i) => (
        <button key={p.id} onClick={() => setActiveProject(p.id)} style={{ width: '100%', textAlign: 'left', padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontWeight: 600, fontSize: 12, marginBottom: 2, background: activeProject === p.id ? '#e9f2ff' : 'transparent', color: activeProject === p.id ? '#0052cc' : '#42526e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: getProjectColor(p, i), flexShrink: 0 }} />{p.name}
        </button>
      ))}
    </aside>
  )
}
