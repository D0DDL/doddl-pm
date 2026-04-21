import { useState } from 'react'

export default function CalendarPicker({ value, onChange, label }) {
  const d = value ? new Date(value) : null
  const [viewYear, setViewYear] = useState((d || new Date()).getFullYear())
  const [viewMonth, setViewMonth] = useState((d || new Date()).getMonth())

  const firstDay = new Date(viewYear, viewMonth, 1)
  const lastDay  = new Date(viewYear, viewMonth + 1, 0)
  const startPad = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1
  const totalCells = Math.ceil((startPad + lastDay.getDate()) / 7) * 7
  const monthName = firstDay.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })

  const toISO = (y, m, d) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`

  return (
    <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: '1px solid #dfe1e6', padding: 10, width: 200, userSelect: 'none' }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', textAlign: 'center', marginBottom: 6 }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span onClick={() => { const d = new Date(viewYear, viewMonth-1); setViewYear(d.getFullYear()); setViewMonth(d.getMonth()) }}
          style={{ cursor: 'pointer', padding: '2px 6px', borderRadius: 3, fontSize: 12, color: '#6b778c' }}>‹</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#172b4d' }}>{monthName}</span>
        <span onClick={() => { const d = new Date(viewYear, viewMonth+1); setViewYear(d.getFullYear()); setViewMonth(d.getMonth()) }}
          style={{ cursor: 'pointer', padding: '2px 6px', borderRadius: 3, fontSize: 12, color: '#6b778c' }}>›</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
        {['M','T','W','T','F','S','S'].map((d,i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: '#a0aec0', padding: '2px 0' }}>{d}</div>
        ))}
        {Array.from({ length: totalCells }).map((_, i) => {
          const dayNum = i - startPad + 1
          const valid = dayNum >= 1 && dayNum <= lastDay.getDate()
          const iso = valid ? toISO(viewYear, viewMonth, dayNum) : null
          const isSelected = iso && iso === value
          return (
            <div key={i} onClick={() => valid && onChange(iso)}
              style={{ textAlign: 'center', fontSize: 11, padding: '3px 2px', borderRadius: 3, cursor: valid ? 'pointer' : 'default',
                background: isSelected ? 'var(--indigo)' : 'transparent', color: isSelected ? '#fff' : valid ? '#172b4d' : 'transparent',
                fontWeight: isSelected ? 800 : 400 }}
              onMouseEnter={e => { if (valid && !isSelected) e.currentTarget.style.background = '#f0f1f3' }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}>
              {valid ? dayNum : ''}
            </div>
          )
        })}
      </div>
    </div>
  )
}
