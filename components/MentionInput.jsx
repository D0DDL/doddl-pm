import { useState, useRef } from 'react'
import { TEAM } from '../lib/team'
import OwnerAvatar from './OwnerAvatar'

export default function MentionInput({ value, onChange, onPost, posting, userName }) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [caretPos, setCaretPos] = useState(0)
  const [atIndex, setAtIndex] = useState(-1)
  const textareaRef = useRef()

  const handleKeyDown = (e) => {
    if (showDropdown) {
      if (e.key === 'Escape') { setShowDropdown(false); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); return }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onPost()
  }

  const handleChange = (e) => {
    const val = e.target.value
    const pos = e.target.selectionStart
    onChange(val)

    // Detect @ trigger
    const textBefore = val.substring(0, pos)
    const match = textBefore.match(/@(\w*)$/)
    if (match) {
      setAtIndex(textBefore.lastIndexOf('@'))
      setMentionSearch(match[1].toLowerCase())
      setShowDropdown(true)
    } else {
      setShowDropdown(false)
    }
  }

  const insertMention = (name) => {
    const before = value.substring(0, atIndex)
    const after = value.substring(textareaRef.current.selectionStart)
    const newVal = before + '@' + name + ' ' + after
    onChange(newVal)
    setShowDropdown(false)
    setTimeout(() => {
      textareaRef.current?.focus()
      const pos = before.length + name.length + 2
      textareaRef.current?.setSelectionRange(pos, pos)
    }, 10)
  }

  const filtered = TEAM.filter(m => m.name.toLowerCase().startsWith(mentionSearch) && m.name.toLowerCase() !== userName.toLowerCase())

  return (
    <div style={{ flex: 1, position: 'relative' }}>
      <textarea ref={textareaRef} value={value} onChange={handleChange} onKeyDown={handleKeyDown}
        placeholder="Add a comment... Type @ to mention someone (Ctrl+Enter to post)" rows={3}
        style={{ width: '100%', border: '1px solid #dfe1e6', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'Nunito, sans-serif', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
      {showDropdown && filtered.length > 0 && (
        <div style={{ position: 'absolute', bottom: '100%', left: 0, background: '#fff', border: '1px solid #dfe1e6', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 999, minWidth: 160, marginBottom: 4, overflow: 'hidden' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', padding: '6px 10px 4px', borderBottom: '1px solid #f0f1f3' }}>Mention</p>
          {filtered.map(m => (
            <div key={m.email} onMouseDown={e => { e.preventDefault(); insertMention(m.name) }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <OwnerAvatar name={m.name} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#172b4d' }}>{m.name}</span>
            </div>
          ))}
        </div>
      )}
      <button onClick={onPost} disabled={posting || !value.trim()}
        style={{ marginTop: 6, background: 'var(--indigo)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', opacity: posting || !value.trim() ? 0.5 : 1 }}>
        {posting ? 'Posting...' : 'Post'}
      </button>
    </div>
  )
}
