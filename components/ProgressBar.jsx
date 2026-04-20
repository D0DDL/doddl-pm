export default function ProgressBar({ value, onChange }) {
  const pct = Math.min(100, Math.max(0, value || 0))
  const color = pct === 100 ? '#36b37e' : pct > 60 ? '#0052cc' : pct > 30 ? '#ff8b00' : '#c1c7d0'
  const options = [...Array.from({ length: 20 }, (_, i) => i * 5), 100]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: '#f0f1f3', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      {onChange ? (
        <select value={pct} onChange={e => onChange(parseInt(e.target.value))}
          style={{ fontSize: 11, fontWeight: 700, color: '#42526e', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, minWidth: 36, fontFamily: 'Nunito, sans-serif' }}>
          {options.map(v => (
            <option key={v} value={v}>{v}%</option>
          ))}
        </select>
      ) : <span style={{ fontSize: 11, fontWeight: 700, color: '#42526e', minWidth: 28, textAlign: 'right' }}>{pct}%</span>}
    </div>
  )
}
