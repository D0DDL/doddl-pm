import { useState } from 'react'
import { TAG_COLORS } from '../lib/constants'

export default function TagsCell({ value = [], onChange }) {
  const [adding, setAdding] = useState(false)
  const [newTag, setNewTag] = useState('')
  const tags = Array.isArray(value) ? value : []
  const addTag = () => {
    if (!newTag.trim()) return
    onChange([...tags, newTag.trim()])
    setNewTag(''); setAdding(false)
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {tags.map((tag, i) => (
        <span key={i} style={{ background: TAG_COLORS[i % TAG_COLORS.length], borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 700, color: '#172b4d', display: 'flex', alignItems: 'center', gap: 4 }}>
          {tag}
          <span onClick={() => onChange(tags.filter((_, j) => j !== i))} style={{ cursor: 'pointer', fontSize: 12, opacity: 0.5 }}>×</span>
        </span>
      ))}
      {adding ? (
        <input autoFocus value={newTag} onChange={e => setNewTag(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') setAdding(false) }}
          onBlur={() => { if (newTag) addTag(); else setAdding(false) }}
          style={{ border: '1px solid var(--aqua)', borderRadius: 10, padding: '1px 8px', fontSize: 11, width: 80, fontFamily: 'Nunito, sans-serif' }} />
      ) : (
        <span onClick={() => setAdding(true)} style={{ cursor: 'pointer', fontSize: 11, color: '#a0aec0', padding: '1px 6px', border: '1px dashed #dfe1e6', borderRadius: 10 }}>+ tag</span>
      )}
    </div>
  )
}
