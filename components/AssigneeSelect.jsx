import { useState } from 'react'
import { TEAM } from '../lib/team'

export default function AssigneeSelect({ value, onChange, avatarOnly }) {
  const [open, setOpen] = useState(false)
  const colors = ['#0052cc','#00875a','#de350b','#ff8b00','#6554c0','#00a3bf']
  const avatarColor = value ? colors[value.charCodeAt(0) % colors.length] : 'var(--aqua)'
  return (
    <div style={{ position: 'relative' }}>
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setOpen(false)} />}
      <div onClick={() => setOpen(o => !o)} title={value || 'Assign...'} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
        {value ? (
          <>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{value.charAt(0)}</div>
            {!avatarOnly && <span style={{ fontSize: 12, color: '#172b4d', fontWeight: 600 }}>{value}</span>}
          </>
        ) : <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#f0f1f3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#a0aec0', flexShrink: 0 }}>+</div>}
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 999, background: '#fff', border: '1px solid #dfe1e6', borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: 140, marginTop: 2 }}>
          <div onClick={() => { onChange(''); setOpen(false) }} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: '#6b778c' }}
            onMouseEnter={e => e.currentTarget.style.background = '#f4f5f7'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>Unassigned</div>
          {TEAM.map(m => (
            <div key={m.email} onClick={() => { onChange(m.name); setOpen(false) }} style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              onMouseEnter={e => e.currentTarget.style.background = '#f4f5f7'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff' }}>{m.name.charAt(0)}</div>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{m.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
