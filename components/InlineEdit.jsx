import { useState, useEffect, useRef } from 'react'

export default function InlineEdit({ value, onSave, style = {} }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const ref = useRef()
  useEffect(() => { if (editing && ref.current) ref.current.focus() }, [editing])
  if (editing) return (
    <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
      onBlur={() => { onSave(val); setEditing(false) }}
      onKeyDown={e => { if (e.key === 'Enter') { onSave(val); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
      style={{ width: '100%', border: 'none', borderBottom: '2px solid var(--aqua)', outline: 'none', background: 'transparent', fontSize: 13, padding: '2px 0', ...style }} />
  )
  return <span onDoubleClick={() => setEditing(true)} style={{ cursor: 'text', ...style }}>{value || <span style={{ color: '#a0aec0' }}>—</span>}</span>
}
