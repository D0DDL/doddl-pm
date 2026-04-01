import { useState, useEffect, useCallback, useRef } from 'react'
import Head from 'next/head'
import { supabase } from '../lib/supabase'

// ── MSAL Auth ──────────────────────────────────────────────────────────────
const MSAL_CONFIG = {
  clientId: 'bddcde1a-b104-4c96-8f67-9b40a1dfea3c',
  tenantId: '927d1e2c-7c8d-406f-8640-678dfce86b7d',
}
let _msal = null
async function getMsal() {
  if (_msal) return _msal
  const { PublicClientApplication } = await import('@azure/msal-browser')
  _msal = new PublicClientApplication({
    auth: { clientId: MSAL_CONFIG.clientId, authority: `https://login.microsoftonline.com/${MSAL_CONFIG.tenantId}`, redirectUri: typeof window !== 'undefined' ? window.location.origin : '' },
    cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
  })
  await _msal.initialize()
  return _msal
}

// ── Team members ───────────────────────────────────────────────────────────
const TEAM = [
  { name: 'Jon',    email: 'jon@doddl.com' },
  { name: 'Laura',  email: 'laura@doddl.com' },
  { name: 'Cat',    email: 'catherine@doddl.com' },
  { name: 'Chris',  email: 'finance@doddl.com' },
  { name: 'Cathy',  email: 'hello@doddl.com' },
]
function getDisplayName(email) {
  if (!email) return ''
  const match = TEAM.find(t => t.email.toLowerCase() === email.toLowerCase())
  return match ? match.name : email.split('@')[0]
}
function getEmailFromName(name) {
  if (!name) return ''
  const match = TEAM.find(t => t.name.toLowerCase() === name.toLowerCase())
  return match ? match.email : ''
}

// ── Project colours — doddl brand palette, varied ─────────────────────────
const PROJECT_COLORS = [
  '#3D157D', // doddl Indigo
  '#30BEAA', // doddl Aqua
  '#0052cc', // Blue
  '#00875a', // Green
  '#de350b', // Red
  '#ff8b00', // Orange
  '#6554c0', // Purple
  '#00a3bf', // Teal
  '#e65100', // Deep Orange
  '#1565c0', // Dark Blue
]

// Group header colours — lighter tints of the project colour
const GROUP_TINTS = [
  { bg: '#f3eeff', border: '#3D157D', text: '#3D157D' },
  { bg: '#e6faf8', border: '#30BEAA', text: '#1a8a7a' },
  { bg: '#e9f2ff', border: '#0052cc', text: '#0052cc' },
  { bg: '#e3fcef', border: '#00875a', text: '#00875a' },
  { bg: '#ffebe6', border: '#de350b', text: '#de350b' },
  { bg: '#fff3e0', border: '#ff8b00', text: '#b85c00' },
  { bg: '#ede9fe', border: '#6554c0', text: '#6554c0' },
  { bg: '#e6f7fb', border: '#00a3bf', text: '#006680' },
]
function getProjectColor(project, index) {
  if (project.color && project.color !== '#3D157D') return project.color
  return PROJECT_COLORS[index % PROJECT_COLORS.length]
}

// ── Constants ──────────────────────────────────────────────────────────────
const STATUSES = [
  { key: 'not_started', label: 'Not Started', color: '#c1c7d0' },
  { key: 'in_progress', label: 'In Progress', color: '#0052cc' },
  { key: 'on_track',    label: 'On Track',    color: '#00875a' },
  { key: 'at_risk',     label: 'At Risk',     color: '#ff8b00' },
  { key: 'blocked',     label: 'Blocked',     color: '#de350b' },
  { key: 'done',        label: 'Done',        color: '#36b37e' },
]
const PRIORITIES = [
  { key: 'critical', label: 'Critical', color: '#de350b' },
  { key: 'high',     label: 'High',     color: '#ff8b00' },
  { key: 'medium',   label: 'Medium',   color: '#0052cc' },
  { key: 'low',      label: 'Low',      color: '#6b778c' },
]
const statusMap   = Object.fromEntries(STATUSES.map(s => [s.key, s]))
const priorityMap = Object.fromEntries(PRIORITIES.map(p => [p.key, p]))
const COL_WIDTHS  = { task: 320, status: 130, assignee: 120, start: 110, due: 110, priority: 110, progress: 110, depends: 130 }
const SOURCE_COLORS = {
  email:        { bg: '#dbeafe', color: '#1d4ed8', label: 'Email' },
  teams:        { bg: '#ede9fe', color: '#7c3aed', label: 'Teams' },
  teamsmaestro: { bg: '#fce7f3', color: '#be185d', label: 'TeamsMAestro' },
  manual:       { bg: '#f3f4f6', color: '#374151', label: 'Manual' },
}
const TAG_COLORS = ['#e9f2ff', '#e3fcef', '#fff0e6', '#fce8e8', '#f3f0ff', '#e6f7ff']

// ── Login Screen ───────────────────────────────────────────────────────────
function LoginScreen({ onLogin, loading }) {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #3D157D 0%, #1a0a3a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Nunito, sans-serif' }}>
      <Head>
        <title>doddl PM</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </Head>
      <div style={{ textAlign: 'center', color: '#fff' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <span style={{ fontWeight: 800, fontSize: 40, letterSpacing: '-1px' }}>doddl</span>
            <span style={{ color: '#30BEAA', fontWeight: 800, fontSize: 40 }}>.</span>
          </div>
          <p style={{ fontWeight: 600, fontSize: 15, opacity: 0.65, marginTop: 4 }}>Project Management</p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: '40px 48px', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.12)', minWidth: 340 }}>
          <p style={{ fontSize: 14, opacity: 0.65, marginBottom: 28, fontWeight: 600 }}>Sign in with your doddl account</p>
          <button onClick={onLogin} disabled={loading} style={{ background: '#fff', color: '#3D157D', border: 'none', borderRadius: 8, padding: '13px 32px', fontWeight: 800, fontSize: 15, cursor: loading ? 'wait' : 'pointer', fontFamily: 'Nunito, sans-serif', display: 'flex', alignItems: 'center', gap: 10, margin: '0 auto', opacity: loading ? 0.7 : 1 }}>
            <svg width="20" height="20" viewBox="0 0 21 21" fill="none"><rect x="1" y="1" width="9" height="9" fill="#F25022"/><rect x="11" y="1" width="9" height="9" fill="#7FBA00"/><rect x="1" y="11" width="9" height="9" fill="#00A4EF"/><rect x="11" y="11" width="9" height="9" fill="#FFB900"/></svg>
            {loading ? 'Signing in...' : 'Sign in with Microsoft'}
          </button>
        </div>
        <p style={{ fontSize: 11, opacity: 0.35, marginTop: 24 }}>Restricted to @doddl.com accounts</p>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────
function StatusBadge({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const s = statusMap[value] || STATUSES[0]
  return (
    <div style={{ position: 'relative' }}>
      <div onClick={() => onChange && setOpen(o => !o)} style={{ background: s.color, color: '#fff', borderRadius: 3, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: onChange ? 'pointer' : 'default', whiteSpace: 'nowrap', textAlign: 'center' }}>{s.label}</div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 999, background: '#fff', border: '1px solid #dfe1e6', borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: 140, marginTop: 2 }}>
          {STATUSES.map(st => (
            <div key={st.key} onClick={() => { onChange(st.key); setOpen(false) }} style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              onMouseEnter={e => e.currentTarget.style.background = '#f4f5f7'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: st.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{st.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PriorityBadge({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const p = priorityMap[value] || PRIORITIES[2]
  return (
    <div style={{ position: 'relative' }}>
      <div onClick={() => onChange && setOpen(o => !o)} style={{ color: p.color, fontSize: 11, fontWeight: 700, cursor: onChange ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />{p.label}
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 999, background: '#fff', border: '1px solid #dfe1e6', borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: 120, marginTop: 2 }}>
          {PRIORITIES.map(pr => (
            <div key={pr.key} onClick={() => { onChange(pr.key); setOpen(false) }} style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              onMouseEnter={e => e.currentTarget.style.background = '#f4f5f7'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: pr.color }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: pr.color }}>{pr.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AssigneeSelect({ value, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <div onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
        {value ? (
          <>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--aqua)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{value.charAt(0)}</div>
            <span style={{ fontSize: 12, color: '#172b4d', fontWeight: 600 }}>{value}</span>
          </>
        ) : <span style={{ fontSize: 12, color: '#a0aec0' }}>Assign...</span>}
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

function TagsCell({ value = [], onChange }) {
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

function ProgressBar({ value, onChange }) {
  const pct = Math.min(100, Math.max(0, value || 0))
  const color = pct === 100 ? '#36b37e' : pct > 60 ? '#0052cc' : pct > 30 ? '#ff8b00' : '#c1c7d0'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: '#f0f1f3', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      {onChange ? (
        <select value={pct} onChange={e => onChange(parseInt(e.target.value))}
          style={{ fontSize: 11, fontWeight: 700, color: '#42526e', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, minWidth: 36, fontFamily: 'Nunito, sans-serif' }}>
          {Array.from({ length: 20 }, (_, i) => i * 5).map(v => (
            <option key={v} value={v}>{v}%</option>
          ))}
        </select>
      ) : <span style={{ fontSize: 11, fontWeight: 700, color: '#42526e', minWidth: 28, textAlign: 'right' }}>{pct}%</span>}
    </div>
  )
}

function InlineEdit({ value, onSave, style = {} }) {
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

function DateCell({ value, onChange }) {
  return <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
    style={{ border: 'none', background: 'transparent', fontSize: 12, color: value ? '#172b4d' : '#a0aec0', cursor: 'pointer', width: '100%', fontFamily: 'Nunito, sans-serif' }} />
}

// ── Task Detail Panel ──────────────────────────────────────────────────────
// ── Comment body renderer (highlights @mentions) ──────────────────────────
function CommentBody({ body }) {
  const parts = body.split(/(@\w+)/g)
  return (
    <p style={{ fontSize: 13, color: '#172b4d', lineHeight: 1.5 }}>
      {parts.map((part, i) =>
        part.startsWith('@') ? (
          <span key={i} style={{ background: '#e9f2ff', color: '#0052cc', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>{part}</span>
        ) : part
      )}
    </p>
  )
}

// ── @Mention Comment Input ─────────────────────────────────────────────────
function MentionInput({ value, onChange, onPost, posting, userName }) {
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

// ── Task Detail Panel ──────────────────────────────────────────────────────
function TaskDetailPanel({ task, user, onClose, onUpdate }) {
  const [comments, setComments]   = useState([])
  const [newComment, setNewComment] = useState('')
  const [posting, setPosting]     = useState(false)
  const [editTask, setEditTask]   = useState(task)
  const [saving, setSaving]       = useState(false)
  const userName = getDisplayName(user?.username) || user?.name || 'Unknown'

  // Keep editTask in sync when task prop changes
  useEffect(() => { setEditTask(task) }, [task.id])

  const loadComments = useCallback(async () => {
    const { data } = await supabase.from('comments').select('*').eq('task_id', task.id).order('created_at', { ascending: true })
    setComments(data || [])
  }, [task.id])
  useEffect(() => { loadComments() }, [loadComments])

  const save = async (field, value) => {
    setSaving(true)
    setEditTask(t => ({ ...t, [field]: value }))
    await supabase.from('tasks').update({ [field]: value }).eq('id', task.id)
    setSaving(false)
    onUpdate()
  }

  const postComment = async () => {
    if (!newComment.trim()) return
    setPosting(true)
    const mentionMatches = newComment.match(/@(\w+)/g) || []
    const mentions = mentionMatches.map(m => m.slice(1)).filter(n => TEAM.some(t => t.name.toLowerCase() === n.toLowerCase()))
    const { data: commentData } = await supabase.from('comments').insert([{ task_id: task.id, author: userName, body: newComment, mentions }]).select().single()
    const notifs = []
    for (const name of mentions) {
      if (name.toLowerCase() !== userName.toLowerCase())
        notifs.push({ user_name: name, type: 'mention', comment_id: commentData?.id, task_id: task.id, task_title: task.title, from_user: userName, body: newComment, read: false })
    }
    if (task.assigned_to && task.assigned_to.toLowerCase() !== userName.toLowerCase() && !mentions.map(m => m.toLowerCase()).includes(task.assigned_to.toLowerCase()))
      notifs.push({ user_name: task.assigned_to, type: 'comment_on_owned', comment_id: commentData?.id, task_id: task.id, task_title: task.title, from_user: userName, body: newComment, read: false })
    if (notifs.length > 0) await supabase.from('notifications').insert(notifs)
    setNewComment(''); setPosting(false); loadComments()
  }

  const effort = editTask.start_date && editTask.due_date
    ? Math.max(1, Math.ceil((new Date(editTask.due_date) - new Date(editTask.start_date)) / 86400000))
    : null

  const s = statusMap[editTask.status] || STATUSES[0]

  const FieldLabel = ({ label }) => (
    <p style={{ fontSize: 10, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</p>
  )

  return (
    <div style={{ position: 'fixed', right: 0, top: 52, bottom: 0, width: 400, background: '#fff', borderLeft: '1px solid #dfe1e6', zIndex: 500, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 20px rgba(0,0,0,0.08)' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #dfe1e6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: '#fafbfc' }}>
        <div style={{ flex: 1, marginRight: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', marginBottom: 6 }}>TASK {saving && <span style={{ color: 'var(--aqua)' }}>· Saving...</span>}</p>
          <textarea value={editTask.title} onChange={e => setEditTask(t => ({ ...t, title: e.target.value }))}
            onBlur={e => save('title', e.target.value)}
            rows={2} style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, fontWeight: 800, color: '#172b4d', lineHeight: 1.4, resize: 'none', background: 'transparent', fontFamily: 'Nunito, sans-serif' }} />
          <div style={{ marginTop: 6 }}>
            <StatusBadge value={editTask.status} onChange={v => save('status', v)} />
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b778c', flexShrink: 0 }}>×</button>
      </div>

      {/* Editable fields */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f1f3', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <FieldLabel label="Assignee" />
            <AssigneeSelect value={editTask.assigned_to} onChange={v => save('assigned_to', v)} />
          </div>
          <div>
            <FieldLabel label="Priority" />
            <PriorityBadge value={editTask.priority} onChange={v => save('priority', v)} />
          </div>
          <div>
            <FieldLabel label="Start Date" />
            <input type="date" value={editTask.start_date || ''} onChange={e => save('start_date', e.target.value)}
              style={{ border: '1px solid #dfe1e6', borderRadius: 4, padding: '4px 8px', fontSize: 12, fontFamily: 'Nunito, sans-serif', width: '100%', color: '#172b4d' }} />
          </div>
          <div>
            <FieldLabel label="Due Date" />
            <input type="date" value={editTask.due_date || ''} onChange={e => save('due_date', e.target.value)}
              style={{ border: '1px solid #dfe1e6', borderRadius: 4, padding: '4px 8px', fontSize: 12, fontFamily: 'Nunito, sans-serif', width: '100%', color: '#172b4d' }} />
          </div>
          <div>
            <FieldLabel label="Effort" />
            <p style={{ fontSize: 13, fontWeight: 700, color: '#172b4d' }}>{effort ? `${effort} day${effort !== 1 ? 's' : ''}` : <span style={{ color: '#a0aec0' }}>Set start + due</span>}</p>
          </div>
          <div>
            <FieldLabel label="Progress" />
            <ProgressBar value={editTask.progress} onChange={v => save('progress', v)} />
          </div>
        </div>

        {/* Notes */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #f0f1f3' }}>
          <FieldLabel label="Notes" />
          <textarea value={editTask.notes || ''} onChange={e => setEditTask(t => ({ ...t, notes: e.target.value }))}
            onBlur={e => save('notes', e.target.value)}
            placeholder="Add notes..." rows={4}
            style={{ width: '100%', border: '1px solid #dfe1e6', borderRadius: 6, padding: '8px 10px', fontSize: 13, fontFamily: 'Nunito, sans-serif', resize: 'vertical', outline: 'none', color: '#172b4d', lineHeight: 1.5 }} />
        </div>

        {/* Tags */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #f0f1f3' }}>
          <FieldLabel label="Tags" />
          <TagsCell value={editTask.tags} onChange={v => save('tags', v)} />
        </div>

        {/* Comments */}
        <div style={{ padding: '12px 20px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Comments ({comments.length})</p>
          {comments.length === 0 && <p style={{ fontSize: 13, color: '#a0aec0', fontWeight: 600, marginBottom: 12 }}>No comments yet. Type @ to mention someone.</p>}
          {comments.map(c => (
            <div key={c.id} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <OwnerAvatar name={c.author} />
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#172b4d' }}>{c.author}</span>
                  <span style={{ fontSize: 11, color: '#a0aec0', marginLeft: 8 }}>{new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {c.mentions?.length > 0 && <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
                  {c.mentions.map(m => <span key={m} style={{ fontSize: 9, background: '#e9f2ff', color: '#0052cc', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>@{m}</span>)}
                </div>}
              </div>
              <div style={{ marginLeft: 36, background: '#f8f9fc', borderRadius: 8, padding: '8px 12px' }}>
                <CommentBody body={c.body} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comment input */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid #dfe1e6', background: '#fafbfc' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <OwnerAvatar name={userName} />
          <MentionInput value={newComment} onChange={setNewComment} onPost={postComment} posting={posting} userName={userName} />
        </div>
      </div>
    </div>
  )
}

// ── Inbox Row ──────────────────────────────────────────────────────────────
function InboxRow({ task, onUpdate, onDelete, onSelect }) {
  const src = SOURCE_COLORS[task.source] || SOURCE_COLORS.manual
  return (
    <tr style={{ borderBottom: '1px solid #f0f1f3', cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = '#f8f9fc'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <td style={{ padding: '8px 8px', fontSize: 13, fontWeight: 600, color: '#172b4d' }} onClick={() => onSelect(task)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {task.title}
          <span onClick={e => { e.stopPropagation(); onDelete(task.id) }} style={{ cursor: 'pointer', color: '#c1c7d0', fontSize: 16, marginLeft: 4 }}>×</span>
        </div>
        {task.notes && <p style={{ fontSize: 11, color: '#6b778c', marginTop: 2, fontWeight: 400 }}>{String(task.notes).substring(0, 60)}…</p>}
      </td>
      <td style={{ padding: '8px 8px' }}>
        <span style={{ background: src.bg, color: src.color, borderRadius: 3, padding: '3px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{src.label}</span>
      </td>
      <td style={{ padding: '8px 8px' }}>
        <StatusBadge value={task.status} onChange={async v => { await supabase.from('tasks').update({ status: v }).eq('id', task.id); onUpdate() }} />
      </td>
      <td style={{ padding: '8px 8px' }}>
        <AssigneeSelect value={task.assigned_to} onChange={async v => { await supabase.from('tasks').update({ assigned_to: v }).eq('id', task.id); onUpdate() }} />
      </td>
      <td style={{ padding: '8px 8px', fontSize: 12, color: '#42526e' }}>{task.due_date || '—'}</td>
      <td style={{ padding: '8px 8px' }}>
        <PriorityBadge value={task.priority} onChange={async v => { await supabase.from('tasks').update({ priority: v }).eq('id', task.id); onUpdate() }} />
      </td>
    </tr>
  )
}

// ── Task Row ───────────────────────────────────────────────────────────────
function TaskRow({ task, allTasks, depth, onUpdate, onDelete, onAddSubtask, onSelect }) {
  const [expanded, setExpanded] = useState(true)
  const subtasks = allTasks.filter(t => t.parent_id === task.id)
  const hasChildren = subtasks.length > 0 || task.is_group
  const update = async (field, value) => { await supabase.from('tasks').update({ [field]: value }).eq('id', task.id); onUpdate() }
  const depTask = task.depends_on ? allTasks.find(t => t.id === task.depends_on) : null
  const bg = depth === 0 ? '#f8f9fc' : '#fff'
  const indent = depth * 20
  return (
    <>
      <tr style={{ background: bg, borderBottom: '1px solid #f0f1f3' }}
        onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
        onMouseLeave={e => e.currentTarget.style.background = bg}>
        <td style={{ padding: `6px 8px 6px ${8 + indent}px`, width: COL_WIDTHS.task, minWidth: COL_WIDTHS.task }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {hasChildren && <span onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer', color: '#6b778c', fontSize: 10, width: 14, flexShrink: 0 }}>{expanded ? '▼' : '▶'}</span>}
            {!hasChildren && <span style={{ width: 14 }} />}
            <span onClick={() => onSelect && onSelect(task)} style={{ cursor: 'pointer', flex: 1 }}>
              <InlineEdit value={task.title} onSave={v => update('title', v)} style={{ fontWeight: depth === 0 ? 700 : 400, fontSize: 13, color: '#172b4d' }} />
            </span>
            <span onClick={() => onAddSubtask(task.id)} style={{ marginLeft: 4, color: '#c1c7d0', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>+</span>
            <span onClick={() => onDelete(task.id)} style={{ color: '#c1c7d0', cursor: 'pointer', fontSize: 14, lineHeight: 1, flexShrink: 0 }}>×</span>
          </div>
        </td>
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.status }}><StatusBadge value={task.status} onChange={v => update('status', v)} /></td>
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.assignee }}><AssigneeSelect value={task.assigned_to} onChange={v => update('assigned_to', v)} /></td>
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.start }}><DateCell value={task.start_date} onChange={v => update('start_date', v)} /></td>
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.due }}><DateCell value={task.due_date} onChange={v => update('due_date', v)} /></td>
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.priority }}><PriorityBadge value={task.priority} onChange={v => update('priority', v)} /></td>
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.progress }}><ProgressBar value={task.progress} onChange={v => update('progress', v)} /></td>
        <td style={{ padding: '4px 8px', width: COL_WIDTHS.depends }}>
          {depTask ? <span style={{ fontSize: 11, color: '#0052cc', background: '#e9f2ff', borderRadius: 3, padding: '2px 6px' }}>{depTask.title.substring(0, 18)}{depTask.title.length > 18 ? '…' : ''}</span>
            : <span style={{ color: '#c1c7d0', fontSize: 11 }}>—</span>}
        </td>
      </tr>
      {expanded && subtasks.map(sub => (
        <TaskRow key={sub.id} task={sub} allTasks={allTasks} depth={depth + 1}
          onUpdate={onUpdate} onDelete={onDelete} onAddSubtask={onAddSubtask} onSelect={onSelect} />
      ))}
    </>
  )
}

// ── Project Section ────────────────────────────────────────────────────────
// ── Mini Timeline Bar ──────────────────────────────────────────────────────
// ── Timeline cell — inline date range picker + progress bar ───────────────
function TimelineCell({ startDate, dueDate, onChangeStart, onChangeEnd, color }) {
  const [editing, setEditing] = useState(false)
  const now = new Date()
  const isOverdue = dueDate && new Date(dueDate) < now
  const barColor = isOverdue ? '#de350b' : color || '#0052cc'

  // Calculate bar fill based on today vs start→end
  let pct = 0
  if (startDate && dueDate) {
    const s = new Date(startDate), e = new Date(dueDate)
    const total = Math.max(e - s, 86400000)
    pct = Math.round((Math.min(Math.max(now - s, 0), total) / total) * 100)
  }

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '?'

  if (editing) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', border: '1px solid var(--aqua)', borderRadius: 4, padding: '2px 6px' }}>
      <input type="date" value={startDate || ''} onChange={e => onChangeStart(e.target.value)} autoFocus
        style={{ border: 'none', outline: 'none', fontSize: 11, fontFamily: 'Nunito, sans-serif', color: '#172b4d', width: 110 }} />
      <span style={{ color: '#a0aec0', fontSize: 11 }}>→</span>
      <input type="date" value={dueDate || ''} onChange={e => onChangeEnd(e.target.value)}
        style={{ border: 'none', outline: 'none', fontSize: 11, fontFamily: 'Nunito, sans-serif', color: '#172b4d', width: 110 }} />
      <span onClick={() => setEditing(false)} style={{ cursor: 'pointer', color: '#a0aec0', fontSize: 14, marginLeft: 2 }}>✓</span>
    </div>
  )

  return (
    <div onClick={() => setEditing(true)} style={{ cursor: 'pointer', minWidth: 120 }}
      title="Click to set dates">
      {startDate || dueDate ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: '#6b778c', fontWeight: 600 }}>{fmt(startDate)}</span>
            <span style={{ fontSize: 10, color: isOverdue ? '#de350b' : '#6b778c', fontWeight: 600 }}>{fmt(dueDate)}</span>
          </div>
          <div style={{ height: 6, background: '#f0f1f3', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 3 }} />
          </div>
        </div>
      ) : (
        <span style={{ fontSize: 11, color: '#c1c7d0', fontStyle: 'italic' }}>Set dates…</span>
      )}
    </div>
  )
}

// ── Owner Avatar ───────────────────────────────────────────────────────────
function OwnerAvatar({ name }) {
  if (!name) return <div style={{ width: 28, height: 28 }} />
  const colors = ['#0052cc','#00875a','#de350b','#ff8b00','#6554c0','#00a3bf']
  const idx = name.charCodeAt(0) % colors.length
  return (
    <div title={name} style={{ width: 28, height: 28, borderRadius: '50%', background: colors[idx], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0, cursor: 'default' }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

// ── Project Group (sub-section within a project) ───────────────────────────
function ProjectGroup({ group, allTasks, projectColor, onUpdate, onDelete, onAddSubtask, onSelect, onAddTask, projectId, groupIndex }) {
  const [collapsed, setCollapsed] = useState(false)
  const [addingTask, setAddingTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const children = allTasks.filter(t => t.parent_id === group.id)
  const tint = GROUP_TINTS[groupIndex % GROUP_TINTS.length]

  const addTask = async () => {
    if (!newTaskTitle.trim()) return
    await supabase.from('tasks').insert([{ title: newTaskTitle, project_id: projectId, parent_id: group.id, status: 'not_started', priority: 'medium', progress: 0, source: 'manual' }])
    setNewTaskTitle(''); setAddingTask(false); onUpdate()
  }

  return (
    <div style={{ marginBottom: 0 }}>
      {/* Group header */}
      <div style={{ display: 'flex', alignItems: 'center', background: tint.bg, borderLeft: `4px solid ${tint.border}`, borderBottom: '1px solid #dfe1e6', borderTop: '2px solid #e5e7eb' }}>
        <div style={{ width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span onClick={() => setCollapsed(c => !c)} style={{ cursor: 'pointer', fontSize: 10, color: tint.text, fontWeight: 800 }}>{collapsed ? '▶' : '▼'}</span>
        </div>
        <div style={{ flex: 1, padding: '8px 8px 8px 4px', fontWeight: 800, fontSize: 13, color: tint.text }}>{group.title}</div>
        <div style={{ padding: '8px 12px', fontSize: 11, color: tint.text, fontWeight: 700, opacity: 0.7 }}>{children.length} task{children.length !== 1 ? 's' : ''}</div>
        {/* Spacer cols */}
        <div style={{ width: 56 }} /><div style={{ width: 120 }} /><div style={{ width: 220 }} /><div style={{ width: 64 }} /><div style={{ width: 90 }} /><div style={{ width: 90 }} />
        {/* Delete group */}
        <span onClick={() => onDelete(group.id)} title="Delete group"
          style={{ padding: '0 12px', color: '#c1c7d0', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.color='#de350b'} onMouseLeave={e => e.currentTarget.style.color='#c1c7d0'}>×</span>
      </div>
      {/* Child tasks */}
      {!collapsed && children.map(task => (
        <ProjectTableRow key={task.id} task={task} allTasks={allTasks} projectColor={tint.border}
          onUpdate={onUpdate} onDelete={onDelete} onAddSubtask={onAddSubtask} onSelect={onSelect} depth={1} />
      ))}
      {!collapsed && (
        addingTask ? (
          <div style={{ display: 'flex', alignItems: 'center', borderLeft: `4px solid ${tint.border}`, borderBottom: '1px solid #f0f1f3', padding: '4px 8px 4px 32px', gap: 8, background: '#fff' }}>
            <input autoFocus value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setAddingTask(false) }}
              placeholder="Task title..." style={{ flex: 1, border: `1px solid ${tint.border}`, borderRadius: 4, padding: '4px 8px', fontSize: 13, fontFamily: 'Nunito, sans-serif', outline: 'none' }} />
            <button onClick={addTask} style={{ background: tint.border, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontWeight: 700 }}>Add</button>
            <button onClick={() => setAddingTask(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6b778c' }}>Cancel</button>
          </div>
        ) : (
          <div style={{ borderLeft: `4px solid ${tint.border}`, borderBottom: '1px solid #f0f1f3', background: '#fff' }}>
            <button onClick={() => setAddingTask(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: tint.text, padding: '6px 8px 6px 32px', fontFamily: 'Nunito, sans-serif', fontWeight: 700, opacity: 0.7 }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.7}>+ Add task</button>
          </div>
        )
      )}
    </div>
  )
}

// ── Project Table Row (Monday.com style) ───────────────────────────────────
function ProjectTableRow({ task, allTasks, projectColor, onUpdate, onDelete, onSelect, depth = 0 }) {
  const update = async (field, value) => { await supabase.from('tasks').update({ [field]: value }).eq('id', task.id); onUpdate() }
  const indent = depth * 20
  const effort = task.start_date && task.due_date
    ? Math.max(1, Math.ceil((new Date(task.due_date) - new Date(task.start_date)) / 86400000))
    : null

  return (
    <div style={{ display: 'flex', alignItems: 'center', borderLeft: `4px solid ${projectColor}`, borderBottom: '1px solid #f0f1f3', minHeight: 40, background: 'transparent' }}
      onMouseEnter={e => e.currentTarget.style.background = '#f8f9ff'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      {/* Task name */}
      <div style={{ flex: 1, paddingLeft: 8 + indent, paddingRight: 8, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <InlineEdit value={task.title} onSave={v => update('title', v)}
          style={{ fontWeight: depth === 0 ? 600 : 400, fontSize: 13, color: '#172b4d', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} />
        <span onClick={() => onSelect && onSelect(task)} title="Open detail"
          style={{ color: '#c1c7d0', cursor: 'pointer', fontSize: 12, flexShrink: 0 }} onMouseEnter={e => e.currentTarget.style.color='#6b778c'} onMouseLeave={e => e.currentTarget.style.color='#c1c7d0'}>↗</span>
        <span onClick={() => onDelete(task.id)} title="Delete task"
          style={{ color: '#c1c7d0', cursor: 'pointer', fontSize: 14, flexShrink: 0 }} onMouseEnter={e => e.currentTarget.style.color='#de350b'} onMouseLeave={e => e.currentTarget.style.color='#c1c7d0'}>×</span>
      </div>
      {/* Owner */}
      <div style={{ width: 56, padding: '4px 6px', display: 'flex', alignItems: 'center' }}>
        <AssigneeSelect value={task.assigned_to} onChange={v => update('assigned_to', v)} />
      </div>
      {/* Status */}
      <div style={{ width: 120, padding: '4px 6px' }}>
        <StatusBadge value={task.status} onChange={v => update('status', v)} />
      </div>
      {/* Timeline — combined date range picker + bar */}
      <div style={{ width: 220, padding: '4px 8px' }}>
        <TimelineCell
          startDate={task.start_date} dueDate={task.due_date} color={projectColor}
          onChangeStart={v => update('start_date', v)}
          onChangeEnd={v => update('due_date', v)} />
      </div>
      {/* Effort — auto from dates */}
      <div style={{ width: 64, padding: '4px 6px', textAlign: 'center' }}>
        {effort
          ? <span style={{ fontSize: 11, fontWeight: 700, color: '#0052cc', background: '#e9f2ff', borderRadius: 10, padding: '2px 7px' }}>{effort}d</span>
          : <span style={{ fontSize: 11, color: '#c1c7d0' }}>—</span>}
      </div>
      {/* Priority */}
      <div style={{ width: 90, padding: '4px 6px' }}>
        <PriorityBadge value={task.priority} onChange={v => update('priority', v)} />
      </div>
      {/* Progress */}
      <div style={{ width: 90, padding: '4px 6px' }}>
        <ProgressBar value={task.progress} onChange={v => update('progress', v)} />
      </div>
    </div>
  )
}

// ── Project Dashboard (metrics view) ──────────────────────────────────────
function ProjectDashboard({ project, tasks, color }) {
  const total = tasks.length
  const done = tasks.filter(t => t.status === 'done').length
  const inProgress = tasks.filter(t => t.status === 'in_progress' || t.status === 'on_track').length
  const blocked = tasks.filter(t => t.status === 'blocked' || t.status === 'at_risk').length
  const notStarted = tasks.filter(t => t.status === 'not_started').length
  const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done').length
  const pct = total ? Math.round(done / total * 100) : 0
  const byAssignee = TEAM.map(m => ({ name: m.name, count: tasks.filter(t => t.assigned_to === m.name).length })).filter(m => m.count > 0)

  const Stat = ({ label, value, color: c, sub }) => (
    <div style={{ background: '#fff', borderRadius: 10, padding: '20px 24px', border: '1px solid #dfe1e6', flex: 1 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</p>
      <p style={{ fontSize: 32, fontWeight: 800, color: c || '#172b4d', marginBottom: 4 }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: '#6b778c' }}>{sub}</p>}
    </div>
  )

  return (
    <div style={{ padding: '0 0 24px 0' }}>
      {/* KPI row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <Stat label="Total Tasks" value={total} sub={`${pct}% complete`} />
        <Stat label="Done" value={done} color="#36b37e" sub="completed" />
        <Stat label="In Progress" value={inProgress} color="#0052cc" sub="active" />
        <Stat label="Blocked / At Risk" value={blocked} color="#de350b" sub="needs attention" />
        <Stat label="Overdue" value={overdue} color={overdue > 0 ? '#de350b' : '#6b778c'} sub="past due date" />
      </div>
      {/* Progress bar */}
      <div style={{ background: '#fff', borderRadius: 10, padding: '20px 24px', border: '1px solid #dfe1e6', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <p style={{ fontWeight: 800, fontSize: 14, color: '#172b4d' }}>Overall Progress</p>
          <p style={{ fontWeight: 800, fontSize: 14, color: color }}>{pct}%</p>
        </div>
        <div style={{ height: 12, background: '#f0f1f3', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 6, transition: 'width 0.5s' }} />
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
          {[['Not Started', notStarted, '#c1c7d0'], ['In Progress', inProgress, '#0052cc'], ['Done', done, '#36b37e'], ['Blocked', blocked, '#de350b']].map(([l, v, c]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
              <span style={{ fontSize: 12, color: '#6b778c', fontWeight: 600 }}>{l}: {v}</span>
            </div>
          ))}
        </div>
      </div>
      {/* By assignee */}
      {byAssignee.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 10, padding: '20px 24px', border: '1px solid #dfe1e6' }}>
          <p style={{ fontWeight: 800, fontSize: 14, color: '#172b4d', marginBottom: 16 }}>Workload by Person</p>
          {byAssignee.map(({ name, count }) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <OwnerAvatar name={name} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#172b4d', width: 80 }}>{name}</span>
              <div style={{ flex: 1, height: 8, background: '#f0f1f3', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${(count / total) * 100}%`, height: '100%', background: color, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 12, color: '#6b778c', fontWeight: 600, width: 40, textAlign: 'right' }}>{count} task{count !== 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Project Section — Monday.com style with internal tabs ──────────────────
function ProjectSection({ project, tasks, allTasks, onUpdate, onDelete, onAddTask, onAddSubtask, onSelect, colorIndex, projects, user }) {
  const [projectTab, setProjectTab] = useState('table')
  const [addingGroup, setAddingGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const color = getProjectColor(project, colorIndex)
  const totalTasks = tasks.length
  const doneTasks = tasks.filter(t => t.status === 'done').length
  const pct = totalTasks ? Math.round(doneTasks / totalTasks * 100) : 0

  // Separate groups from regular tasks
  const groups = tasks.filter(t => t.is_group && !t.parent_id)
  const ungroupedTasks = tasks.filter(t => !t.is_group && !t.parent_id)

  const saveGroup = async () => {
    if (!groupName.trim()) return
    await supabase.from('tasks').insert([{ title: groupName, project_id: project.id, is_group: true, status: 'not_started', priority: 'medium', progress: 0 }])
    setGroupName(''); setAddingGroup(false); onUpdate()
  }

  const TAB = ({ id, label, icon }) => (
    <button onClick={() => setProjectTab(id)} style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer',
      fontFamily: 'Nunito, sans-serif', fontWeight: 600, fontSize: 13, borderBottom: projectTab === id ? `3px solid ${color}` : '3px solid transparent',
      color: projectTab === id ? color : '#6b778c', marginBottom: -1
    }}>{icon} {label}</button>
  )

  // Project-level Kanban
  const KanbanView = () => {
    const cols = STATUSES.map(s => ({ ...s, tasks: tasks.filter(t => t.status === s.key && !t.is_group) }))
    return (
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 16, paddingTop: 12 }}>
        {cols.map(col => (
          <div key={col.key} style={{ minWidth: 240, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#f8f9fc', borderRadius: '6px 6px 0 0', borderTop: `3px solid ${col.color}`, borderLeft: '1px solid #dfe1e6', borderRight: '1px solid #dfe1e6', borderBottom: '1px solid #dfe1e6' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
              <span style={{ fontWeight: 700, fontSize: 11, color: '#172b4d', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{col.label}</span>
              <span style={{ marginLeft: 'auto', background: '#e5e7eb', borderRadius: 8, fontSize: 10, fontWeight: 700, padding: '1px 6px', color: '#42526e' }}>{col.tasks.length}</span>
            </div>
            <div style={{ background: '#f8f9fc', border: '1px solid #dfe1e6', borderTop: 'none', borderRadius: '0 0 6px 6px', minHeight: 80, padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {col.tasks.map(task => {
                const prio = priorityMap[task.priority] || PRIORITIES[2]
                const isOverdue = task.due_date && new Date(task.due_date) < new Date()
                return (
                  <div key={task.id} onClick={() => onSelect(task)} style={{ background: '#fff', borderRadius: 6, padding: '10px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: `1px solid #e5e7eb`, cursor: 'pointer', borderLeft: `3px solid ${col.color}` }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#172b4d', marginBottom: 8, lineHeight: 1.4 }}>{task.title}</p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: prio.color }}>● {prio.label}</span>
                      {task.due_date && <span style={{ fontSize: 10, fontWeight: 600, color: isOverdue ? '#de350b' : '#6b778c', background: isOverdue ? '#ffebe6' : '#f0f1f3', borderRadius: 4, padding: '2px 6px' }}>{isOverdue ? '⚠ ' : ''}{new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                    </div>
                    {task.assigned_to && <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><OwnerAvatar name={task.assigned_to} /><span style={{ fontSize: 11, color: '#42526e' }}>{task.assigned_to}</span></div>}
                    <div style={{ display: 'flex', gap: 3, marginTop: 8, flexWrap: 'wrap' }}>
                      {STATUSES.filter(s => s.key !== col.key).slice(0, 2).map(s => (
                        <button key={s.key} onClick={async e => { e.stopPropagation(); await supabase.from('tasks').update({ status: s.key }).eq('id', task.id); onUpdate() }}
                          style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, border: `1px solid ${s.color}`, background: 'transparent', color: s.color, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontWeight: 700 }}>→ {s.label}</button>
                      ))}
                    </div>
                  </div>
                )
              })}
              <button onClick={() => onAddTask(project.id)} style={{ background: 'none', border: '2px dashed #dfe1e6', borderRadius: 6, padding: '6px', fontSize: 11, color: '#6b778c', cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>+ Add task</button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Project-level Gantt
  const GanttView = () => {
    const ganttTasks = tasks.filter(t => !t.is_group)
    if (ganttTasks.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: '#6b778c' }}>No tasks with dates to display</div>
    const allDates = ganttTasks.flatMap(t => [t.start_date, t.due_date]).filter(Boolean).map(d => new Date(d))
    const minDate = allDates.length ? new Date(Math.min(...allDates)) : new Date()
    const maxDate = allDates.length ? new Date(Math.max(...allDates)) : new Date()
    minDate.setDate(minDate.getDate() - 3); maxDate.setDate(maxDate.getDate() + 7)
    const totalDays = Math.max(Math.ceil((maxDate - minDate) / 86400000), 14)
    const dayW = Math.max(24, Math.min(40, 800 / totalDays))
    const labelW = 220
    const today = new Date()
    const todayPos = Math.ceil((today - minDate) / 86400000) * dayW
    const weeks = []; let cur = new Date(minDate)
    while (cur <= maxDate) { weeks.push(new Date(cur)); cur.setDate(cur.getDate() + 7) }
    return (
      <div style={{ overflowX: 'auto', marginTop: 12, border: '1px solid #dfe1e6', borderRadius: 8 }}>
        <div style={{ minWidth: labelW + totalDays * dayW + 20 }}>
          <div style={{ display: 'flex', background: '#f8f9fc', borderBottom: '2px solid #dfe1e6', position: 'sticky', top: 0, zIndex: 5 }}>
            <div style={{ width: labelW, flexShrink: 0, padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', borderRight: '1px solid #dfe1e6' }}>Task</div>
            <div style={{ flex: 1, position: 'relative', height: 36 }}>
              {weeks.map((w, i) => <div key={i} style={{ position: 'absolute', left: Math.ceil((w - minDate) / 86400000) * dayW, top: 0, bottom: 0, borderLeft: '1px solid #e5e7eb', padding: '10px 4px', fontSize: 10, fontWeight: 700, color: '#6b778c', whiteSpace: 'nowrap' }}>{w.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>)}
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: labelW + todayPos, top: 0, bottom: 0, width: 2, background: '#de350b', zIndex: 4, pointerEvents: 'none' }} />
            {ganttTasks.map(task => {
              const s = statusMap[task.status] || STATUSES[0]
              const start = task.start_date ? Math.ceil((new Date(task.start_date) - minDate) / 86400000) * dayW : null
              const end = task.due_date ? Math.ceil((new Date(task.due_date) - minDate) / 86400000) * dayW + dayW : null
              const barW = start !== null && end !== null ? Math.max(end - start, dayW) : null
              return (
                <div key={task.id} style={{ display: 'flex', borderBottom: '1px solid #f0f1f3', minHeight: 34 }}>
                  <div style={{ width: labelW, flexShrink: 0, padding: '7px 12px', borderRight: '1px solid #f0f1f3', fontSize: 12, color: '#172b4d', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <OwnerAvatar name={task.assigned_to} />
                    <span title={task.title}>{task.title}</span>
                  </div>
                  <div style={{ flex: 1, position: 'relative', background: '#fff' }}>
                    {barW && <div style={{ position: 'absolute', left: start, top: 6, height: 20, width: barW, background: s.color, borderRadius: 4, opacity: 0.85, display: 'flex', alignItems: 'center', paddingLeft: 6, overflow: 'hidden' }}>
                      <span style={{ fontSize: 10, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>{task.title}</span>
                    </div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 40, background: '#fff', borderRadius: 12, border: '1px solid #dfe1e6', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      {/* Project header — solid doddl brand colour */}
      <div style={{ padding: '14px 20px', background: color, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>{project.name}</span>
            {project.owner && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff' }}>{project.owner.charAt(0)}</div>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{project.owner}</span>
              </div>
            )}
            {project.due_date && <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '2px 10px', color: '#fff', fontWeight: 600 }}>Due {new Date(project.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
          </div>
          {project.description && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>{project.description}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 100, height: 5, background: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#fff', borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{pct}%</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{doneTasks}/{totalTasks}</span>
          <button onClick={() => {
            if (window.confirm(`Delete project "${project.name}" and all its tasks? This cannot be undone.`)) {
              supabase.from('tasks').delete().eq('project_id', project.id)
                .then(() => supabase.from('projects').delete().eq('id', project.id))
                .then(() => onUpdate())
            }
          }} title="Delete project"
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 12, fontFamily: 'Nunito, sans-serif', fontWeight: 700 }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(222,53,11,0.6)'}
            onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.15)'}>🗑 Delete</button>
        </div>
      </div>

      {/* Tabs — Monday.com style */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #dfe1e6', padding: '0 20px', background: '#fff', gap: 4 }}>
        <TAB id="table" label="Main Table" icon="☰" />
        <TAB id="kanban" label="Kanban" icon="⊞" />
        <TAB id="gantt" label="Timeline" icon="▬" />
        <TAB id="dashboard" label="Dashboard" icon="◉" />
        <div style={{ flex: 1 }} />
        <button onClick={() => onAddTask(project.id)} style={{ background: color, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>+ Add task</button>
      </div>

      {/* Tab content */}
      <div style={{ padding: projectTab === 'table' ? 0 : '0 16px' }}>

        {/* TABLE VIEW */}
        {projectTab === 'table' && (
          <>
            {/* Column headers */}
            <div style={{ display: 'flex', alignItems: 'center', background: '#f8f9fc', borderBottom: '2px solid #dfe1e6', paddingLeft: 32 }}>
              <div style={{ flex: 1, padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Task</div>
              <div style={{ width: 56, padding: '7px 6px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Owner</div>
              <div style={{ width: 120, padding: '7px 6px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Status</div>
              <div style={{ width: 220, padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Timeline</div>
              <div style={{ width: 64, padding: '7px 6px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Effort</div>
              <div style={{ width: 90, padding: '7px 6px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Priority</div>
              <div style={{ width: 90, padding: '7px 6px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>Progress</div>
            </div>

            {/* Groups with their tasks */}
            {groups.map((group, gi) => (
              <ProjectGroup key={group.id} group={group} allTasks={allTasks} projectColor={color}
                groupIndex={gi} onUpdate={onUpdate} onDelete={onDelete} onAddSubtask={onAddSubtask}
                onSelect={onSelect} onAddTask={onAddTask} projectId={project.id} />
            ))}

            {/* Ungrouped tasks */}
            {ungroupedTasks.length > 0 && (
              <div>
                {ungroupedTasks.map(task => (
                  <ProjectTableRow key={task.id} task={task} allTasks={allTasks} projectColor={color}
                    onUpdate={onUpdate} onDelete={onDelete} onAddSubtask={onAddSubtask} onSelect={onSelect} />
                ))}
              </div>
            )}

            {/* Add group/task footer */}
            <div style={{ padding: '8px 16px 12px', display: 'flex', gap: 8, borderTop: '1px solid #f0f1f3' }}>
              {addingGroup ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input autoFocus value={groupName} onChange={e => setGroupName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveGroup(); if (e.key === 'Escape') setAddingGroup(false) }}
                    placeholder="Group name..." style={{ border: `1px solid ${color}`, borderRadius: 4, padding: '4px 10px', fontSize: 12, fontFamily: 'Nunito, sans-serif', outline: 'none' }} />
                  <button onClick={saveGroup} style={{ background: color, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontWeight: 700 }}>Add</button>
                  <button onClick={() => setAddingGroup(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6b778c' }}>Cancel</button>
                </div>
              ) : (
                <>
                  <button onClick={() => onAddTask(project.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6b778c', fontFamily: 'Nunito, sans-serif', fontWeight: 600, padding: '4px 8px', borderRadius: 4 }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f0f1f3'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>+ Add task</button>
                  <button onClick={() => setAddingGroup(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6b778c', fontFamily: 'Nunito, sans-serif', fontWeight: 600, padding: '4px 8px', borderRadius: 4 }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f0f1f3'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>+ Add group</button>
                </>
              )}
            </div>
          </>
        )}

        {projectTab === 'kanban' && <KanbanView />}
        {projectTab === 'gantt' && <GanttView />}
        {projectTab === 'dashboard' && <ProjectDashboard project={project} tasks={tasks} color={color} />}
      </div>
    </div>
  )
}

// ── Modals ─────────────────────────────────────────────────────────────────
function AddTaskModal({ projects, parentId, projectId, allTasks, onClose, onSaved, currentUser }) {
  const [form, setForm] = useState({ title: '', status: 'not_started', priority: 'medium', project_id: projectId || '', assigned_to: '', start_date: '', due_date: '', progress: 0, notes: '', source: 'manual', depends_on: '', parent_id: parentId || null, tags: [] })
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    const userEmail = getEmailFromName(form.assigned_to) || currentUser?.username || ''
    await supabase.from('tasks').insert([{ ...form, project_id: form.project_id || null, depends_on: form.depends_on || null, user_email: userEmail }])
    setSaving(false); onSaved(); onClose()
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 520, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--indigo)', margin: 0 }}>{parentId ? 'Add Subtask' : 'New Task'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b778c' }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input placeholder="Task title *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
            style={{ padding: '9px 12px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Project</label>
              <select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }}>
                <option value="">No project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Assignee</label>
              <select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }}>
                <option value="">Unassigned</option>
                {TEAM.map(m => <option key={m.email} value={m.name}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }}>
                {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Priority</label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }}>
                {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Start Date</label>
              <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Due Date</label>
              <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Notes..."
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif', resize: 'vertical' }} />
          </div>
          <button onClick={save} disabled={saving}
            style={{ background: 'var(--indigo)', color: '#fff', border: 'none', borderRadius: 6, padding: '11px 0', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'Nunito, sans-serif', marginTop: 4 }}>
            {saving ? 'Saving...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddProjectModal({ onClose, onSaved, colorIndex }) {
  const color = PROJECT_COLORS[colorIndex % PROJECT_COLORS.length]
  const [form, setForm] = useState({ name: '', description: '', priority: 'medium', owner: '', due_date: '', status: 'active', color })
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    await supabase.from('projects').insert([form])
    setSaving(false); onSaved(); onClose()
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 460, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--indigo)', margin: 0 }}>New Project</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b778c' }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input placeholder="Project name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            style={{ padding: '9px 12px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif' }} />
          <textarea placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            rows={2} style={{ padding: '8px 12px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif', resize: 'vertical' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
              style={{ padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }}>
              {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <input type="text" placeholder="Owner" value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })}
              style={{ padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }} />
            <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })}
              style={{ padding: '8px 10px', border: '1px solid #dfe1e6', borderRadius: 6, fontSize: 13, fontFamily: 'Nunito, sans-serif' }} />
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b778c', display: 'block', marginBottom: 4 }}>Colour</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PROJECT_COLORS.map(c => (
                  <div key={c} onClick={() => setForm({ ...form, color: c })}
                    style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', border: form.color === c ? '3px solid #fff' : '2px solid transparent', boxShadow: form.color === c ? `0 0 0 2px ${c}` : 'none' }} />
                ))}
              </div>
            </div>
          </div>
          <button onClick={save} disabled={saving}
            style={{ background: form.color, color: '#fff', border: 'none', borderRadius: 6, padding: '11px 0', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
            {saving ? 'Saving...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Gantt Chart ────────────────────────────────────────────────────────────
function GanttView({ tasks, projects }) {
  const today = new Date()
  const allDates = tasks.flatMap(t => [t.start_date, t.due_date]).filter(Boolean).map(d => new Date(d))
  const minDate = allDates.length ? new Date(Math.min(...allDates)) : new Date(today.getFullYear(), today.getMonth(), 1)
  const maxDate = allDates.length ? new Date(Math.max(...allDates)) : new Date(today.getFullYear(), today.getMonth() + 3, 0)
  minDate.setDate(minDate.getDate() - 7); maxDate.setDate(maxDate.getDate() + 14)
  const totalDays = Math.ceil((maxDate - minDate) / 86400000)
  const dayWidth = 28, labelW = 240
  const dayPos = date => Math.ceil((new Date(date) - minDate) / 86400000) * dayWidth
  const todayPos = Math.ceil((today - minDate) / 86400000) * dayWidth
  const weeks = []; let cur = new Date(minDate)
  while (cur <= maxDate) { weeks.push(new Date(cur)); cur.setDate(cur.getDate() + 7) }
  const projectMap = Object.fromEntries((projects || []).map(p => [p.id, p]))
  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 160px)' }}>
      <div style={{ minWidth: labelW + totalDays * dayWidth + 40 }}>
        <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '2px solid #dfe1e6' }}>
          <div style={{ width: labelW, flexShrink: 0, padding: '8px 16px', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase', borderRight: '1px solid #dfe1e6' }}>Task</div>
          <div style={{ position: 'relative', flex: 1 }}>
            {weeks.map((w, i) => (
              <div key={i} style={{ position: 'absolute', left: Math.ceil((w - minDate) / 86400000) * dayWidth, top: 0, bottom: 0, borderLeft: '1px solid #f0f1f3', padding: '8px 4px', fontSize: 10, fontWeight: 700, color: '#6b778c', whiteSpace: 'nowrap' }}>
                {w.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </div>
            ))}
            <div style={{ height: 36 }} />
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: labelW + todayPos, top: 0, bottom: 0, width: 2, background: '#de350b', zIndex: 5, pointerEvents: 'none' }} />
          {tasks.map(task => {
            const start = task.start_date ? dayPos(task.start_date) : null
            const end = task.due_date ? dayPos(task.due_date) + dayWidth : null
            const width = start !== null && end !== null ? Math.max(end - start, dayWidth) : null
            const s = statusMap[task.status] || STATUSES[0]
            const proj = projectMap[task.project_id]
            return (
              <div key={task.id} style={{ display: 'flex', borderBottom: '1px solid #f0f1f3', minHeight: 36 }}>
                <div style={{ width: labelW, flexShrink: 0, padding: '8px 16px', borderRight: '1px solid #f0f1f3', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {proj && <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />}
                  <span style={{ fontSize: 12, color: '#172b4d', fontWeight: task.is_group ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                </div>
                <div style={{ flex: 1, position: 'relative', background: task.is_group ? '#f8f9fc' : 'transparent' }}>
                  {width && <div style={{ position: 'absolute', left: start, top: 6, height: 22, width, background: s.color, borderRadius: 4, opacity: 0.85, display: 'flex', alignItems: 'center', paddingLeft: 6, overflow: 'hidden' }}>
                    <span style={{ fontSize: 10, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>{task.title}</span>
                  </div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function Home() {
  const [user, setUser]                     = useState(null)
  const [authLoading, setAuthLoading]       = useState(true)
  const [loginLoading, setLoginLoading]     = useState(false)
  const [view, setView]                     = useState('board')
  const [tasks, setTasks]                   = useState([])
  const [projects, setProjects]             = useState([])
  const [loading, setLoading]               = useState(true)
  const [activeProject, setActiveProject]   = useState(null)
  const [showAddTask, setShowAddTask]       = useState(false)
  const [showAddProject, setShowAddProject] = useState(false)
  const [addTaskProjectId, setAddTaskProjectId] = useState(null)
  const [addTaskParentId, setAddTaskParentId]   = useState(null)
  const [search, setSearch]                 = useState('')
  const [selectedTask, setSelectedTask]     = useState(null)
  const now = new Date()
  const [calYear, setCalYear]               = useState(now.getFullYear())
  const [calMonth, setCalMonth]             = useState(now.getMonth())

  useEffect(() => {
    (async () => {
      try {
        const msal = await getMsal()
        await msal.handleRedirectPromise()
        const accounts = msal.getAllAccounts()
        if (accounts.length > 0) setUser(accounts[0])
      } catch (e) { console.error('MSAL init', e) }
      finally { setAuthLoading(false) }
    })()
  }, [])

  const handleLogin = async () => {
    setLoginLoading(true)
    try { const msal = await getMsal(); await msal.loginRedirect({ scopes: ['User.Read'] }) }
    catch (e) { console.error('Login error', e); setLoginLoading(false) }
  }
  const handleLogout = async () => { const msal = await getMsal(); msal.logoutRedirect() }

  // Current user's email and display name
  const userEmail = user?.username || ''
  const userName = getDisplayName(userEmail) || user?.name?.split(' ')[0] || ''

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: true }),
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
    ])
    setTasks(t || [])
    setProjects(p || [])
    setLoading(false)
  }, [])

  useEffect(() => { if (user) load() }, [user, load])

  const deleteTask = async id => { await supabase.from('tasks').delete().eq('id', id); load() }

  const handleAddTask = projectId => { setAddTaskProjectId(projectId); setAddTaskParentId(null); setShowAddTask(true) }
  const handleAddSubtask = parentId => {
    const parent = tasks.find(t => t.id === parentId)
    setAddTaskProjectId(parent?.project_id || null); setAddTaskParentId(parentId); setShowAddTask(true)
  }

  // Visibility rules:
  // - Flow tasks (email/teams/teamsmaestro): only visible to assigned user
  // - Project tasks: visible to everyone
  const visibleTasks = tasks.filter(t => {
    if (t.source === 'manual' || !t.source) return true // project tasks visible to all
    if (t.project_id) return true // if linked to project, visible to all
    // Flow tasks: only show to the assigned user
    if (!t.assigned_to) return true // unassigned flow tasks visible to all
    return t.assigned_to.toLowerCase() === userName.toLowerCase()
  })

  const filteredProjects = activeProject ? projects.filter(p => p.id === activeProject) : projects
  const filteredTasks    = search ? visibleTasks.filter(t => t.title?.toLowerCase().includes(search.toLowerCase())) : visibleTasks
  const myFlowTasks      = visibleTasks.filter(t => ['email','teams','teamsmaestro'].includes(t.source) && t.assigned_to?.toLowerCase() === userName.toLowerCase())
  const [notifications, setNotifications] = useState([])
  const loadNotifications = useCallback(async () => {
    if (!userName) return
    const { data } = await supabase.from('notifications').select('*').eq('user_name', userName).order('created_at', { ascending: false }).limit(50)
    setNotifications(data || [])
  }, [userName])
  useEffect(() => { if (userName) loadNotifications() }, [userName, loadNotifications])
  const unreadCount = notifications.filter(n => !n.read).length
  const markRead = async (id) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    loadNotifications()
  }
  const markAllRead = async () => {
    await supabase.from('notifications').update({ read: true }).eq('user_name', userName).eq('read', false)
    loadNotifications()
  }

  const navBtn = (key, label, count) => (
    <button onClick={() => setView(key)} style={{
      display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
      padding: '7px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
      fontFamily: 'Nunito, sans-serif', fontWeight: 600, fontSize: 13, marginBottom: 2,
      background: view === key ? '#e9f2ff' : 'transparent', color: view === key ? '#0052cc' : '#42526e',
    }}>
      {label}
      {count > 0 && <span style={{ background: '#de350b', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>{count}</span>}
    </button>
  )

  if (authLoading) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #3D157D 0%, #1a0a3a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Nunito, sans-serif', color: '#fff', fontSize: 16, fontWeight: 600 }}>
      <Head><link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" /></Head>
      Loading...
    </div>
  )
  if (!user) return <LoginScreen onLogin={handleLogin} loading={loginLoading} />

  return (
    <>
      <Head>
        <title>doddl PM</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
        <style>{`
          :root { --indigo: #3D157D; --aqua: #30BEAA; --bg: #F5F6FA; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Nunito', sans-serif; background: var(--bg); color: #172b4d; }
          input, select, textarea, button { font-family: 'Nunito', sans-serif; }
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-thumb { background: #dfe1e6; border-radius: 3px; }
        `}</style>
      </Head>

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
          <button onClick={() => { setView('board'); setShowAddTask(true); setAddTaskProjectId(null); setAddTaskParentId(null) }}
            style={{ background: 'var(--aqua)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Task</button>
          <button onClick={() => setShowAddProject(true)}
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '6px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Project</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#30BEAA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>
              {userName.charAt(0) || '?'}
            </div>
            <span style={{ fontSize: 12, opacity: 0.8 }}>{userName}</span>
            <button onClick={handleLogout} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 11, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', opacity: 0.7 }}>Sign out</button>
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', height: 'calc(100vh - 52px)' }}>
        <aside style={{ width: 210, background: '#fff', borderRight: '1px solid #dfe1e6', padding: '16px 8px', overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ marginBottom: 20 }}>
            {navBtn('mywork', '👤 My Work', 0)}
            {navBtn('myprojects', '📌 My Projects', myFlowTasks.length)}
            {navBtn('board', '📋 All Projects', 0)}
            {navBtn('inbox', '🔔 Notifications', unreadCount)}
          </div>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 12px', marginBottom: 6 }}>Projects</p>
          <button onClick={() => setActiveProject(null)} style={{ width: '100%', textAlign: 'left', padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontWeight: 600, fontSize: 12, marginBottom: 2, background: !activeProject ? '#e9f2ff' : 'transparent', color: !activeProject ? '#0052cc' : '#42526e' }}>All projects</button>
          {projects.map((p, i) => (
            <button key={p.id} onClick={() => setActiveProject(p.id)} style={{ width: '100%', textAlign: 'left', padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'Nunito, sans-serif', fontWeight: 600, fontSize: 12, marginBottom: 2, background: activeProject === p.id ? '#e9f2ff' : 'transparent', color: activeProject === p.id ? '#0052cc' : '#42526e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: getProjectColor(p, i), flexShrink: 0 }} />{p.name}
            </button>
          ))}
        </aside>

        <main style={{ flex: 1, overflowY: 'auto', padding: 20, marginRight: selectedTask ? 380 : 0 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60%', color: '#6b778c', fontWeight: 600 }}>Loading...</div>

          ) : view === 'mywork' ? (() => {
            const myTasks = visibleTasks.filter(t => t.assigned_to?.toLowerCase() === userName.toLowerCase() && t.status !== 'done')
            const todayStr = new Date().toISOString().split('T')[0]
            const overdue  = myTasks.filter(t => t.due_date && t.due_date < todayStr)
            const dueToday = myTasks.filter(t => t.due_date === todayStr)
            const upcoming = myTasks.filter(t => t.due_date && t.due_date > todayStr)
            const noDate   = myTasks.filter(t => !t.due_date)
            const Section = ({ title, color, items }) => items.length === 0 ? null : (
              <div style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                  <h3 style={{ fontSize: 13, fontWeight: 800, color: '#172b4d', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</h3>
                  <span style={{ fontSize: 12, color: '#6b778c', fontWeight: 600 }}>{items.length}</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#f8f9fc', borderBottom: '2px solid #dfe1e6' }}>
                    {['Task', 'Project', 'Status', 'Due', 'Priority'].map(h => <th key={h} style={{ padding: '7px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b778c', textTransform: 'uppercase' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {items.map(task => {
                      const proj = projects.find(p => p.id === task.project_id)
                      return (
                        <tr key={task.id} style={{ borderBottom: '1px solid #f0f1f3', cursor: 'pointer' }}
                          onClick={() => setSelectedTask(task)}
                          onMouseEnter={e => e.currentTarget.style.background = '#f8f9fc'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '8px 8px', fontSize: 13, fontWeight: 600, color: '#172b4d' }}>{task.title}</td>
                          <td style={{ padding: '8px 8px' }}>{proj ? <span style={{ fontSize: 11, background: '#f0f1f3', borderRadius: 3, padding: '2px 8px', fontWeight: 600, color: '#42526e' }}>{proj.name}</span> : <span style={{ color: '#c1c7d0', fontSize: 11 }}>—</span>}</td>
                          <td style={{ padding: '8px 8px' }}><StatusBadge value={task.status} onChange={async v => { await supabase.from('tasks').update({ status: v }).eq('id', task.id); load() }} /></td>
                          <td style={{ padding: '8px 8px', fontSize: 12, color: overdue.includes(task) ? '#de350b' : '#42526e', fontWeight: overdue.includes(task) ? 700 : 400 }}>{task.due_date || '—'}</td>
                          <td style={{ padding: '8px 8px' }}><PriorityBadge value={task.priority} onChange={async v => { await supabase.from('tasks').update({ priority: v }).eq('id', task.id); load() }} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--aqua)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: '#fff' }}>{userName.charAt(0)}</div>
                  <div>
                    <h2 style={{ fontWeight: 800, fontSize: 18, color: 'var(--indigo)' }}>My Work</h2>
                    <p style={{ fontSize: 13, color: '#6b778c', fontWeight: 600 }}>{myTasks.length} active task{myTasks.length !== 1 ? 's' : ''} assigned to {userName}</p>
                  </div>
                </div>
                {myTasks.length === 0 ? <div style={{ textAlign: 'center', padding: 60, color: '#6b778c' }}><p style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>All clear! 🎉</p><p>No tasks assigned to you</p></div> : (
                  <><Section title="Overdue" color="#de350b" items={overdue} /><Section title="Due Today" color="#ff8b00" items={dueToday} /><Section title="Upcoming" color="#0052cc" items={upcoming} /><Section title="No Due Date" color="#c1c7d0" items={noDate} /></>
                )}
              </>
            )
          })()

          : view === 'myprojects' ? (() => {
            const SOURCE_ORDER = ['teamsmaestro', 'teams', 'email']
            const grouped = SOURCE_ORDER.reduce((acc, src) => { acc[src] = myFlowTasks.filter(t => t.source === src); return acc }, {})
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <div>
                    <h2 style={{ fontWeight: 800, fontSize: 18, color: 'var(--indigo)' }}>My Projects</h2>
                    <p style={{ fontSize: 13, color: '#6b778c', fontWeight: 600, marginTop: 2 }}>Your actions from Email, Teams and TeamsMAestro — visible only to you</p>
                  </div>
                  <div style={{ marginLeft: 'auto', background: '#f0f4ff', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: 'var(--indigo)' }}>{myFlowTasks.length} tasks</div>
                </div>
                {myFlowTasks.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 60, color: '#6b778c' }}>
                    <p style={{ fontSize: 32, marginBottom: 8 }}>📬</p>
                    <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>No tasks yet</p>
                    <p style={{ fontSize: 13 }}>Tasks from Email, Teams and TeamsMAestro assigned to you will appear here</p>
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
                                <td style={{ padding: '9px 12px' }}><StatusBadge value={task.status} onChange={async v => { await supabase.from('tasks').update({ status: v }).eq('id', task.id); load() }} /></td>
                                <td style={{ padding: '9px 12px', fontSize: 12, color: task.due_date && new Date(task.due_date) < new Date() ? '#de350b' : '#42526e', fontWeight: 600 }}>
                                  {task.due_date ? new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                                </td>
                                <td style={{ padding: '9px 12px' }}><PriorityBadge value={task.priority} onChange={async v => { await supabase.from('tasks').update({ priority: v }).eq('id', task.id); load() }} /></td>
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
          })()

          : view === 'inbox' ? (() => {
            const typeColors = { mention: { bg: '#e9f2ff', color: '#0052cc', label: '@Mention' }, comment_on_owned: { bg: '#e3fcef', color: '#00875a', label: 'Comment' } }
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <div>
                    <h2 style={{ fontWeight: 800, fontSize: 18, color: 'var(--indigo)' }}>Notifications</h2>
                    <p style={{ fontSize: 13, color: '#6b778c', fontWeight: 600, marginTop: 2 }}>Comments on your tasks and @mentions</p>
                  </div>
                  {unreadCount > 0 && <button onClick={markAllRead} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #dfe1e6', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#6b778c', fontFamily: 'Nunito, sans-serif' }}>Mark all read</button>}
                </div>
                {notifications.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 60, color: '#6b778c' }}>
                    <p style={{ fontSize: 32, marginBottom: 8 }}>🔔</p>
                    <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>All caught up</p>
                    <p style={{ fontSize: 13 }}>You will see @mentions and comments on your tasks here</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {notifications.map(n => {
                      const tc = typeColors[n.type] || typeColors.comment_on_owned
                      const notifTask = tasks.find(t => t.id === n.task_id)
                      return (
                        <div key={n.id} onClick={async () => { await markRead(n.id); if (notifTask) setSelectedTask(notifTask) }}
                          style={{ background: n.read ? '#fff' : '#f0f4ff', borderRadius: 10, border: '1px solid ' + (n.read ? '#dfe1e6' : '#c0d4ff'), padding: '14px 16px', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f8f9ff'}
                          onMouseLeave={e => e.currentTarget.style.background = n.read ? '#fff' : '#f0f4ff'}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.read ? 'transparent' : '#0052cc', flexShrink: 0, marginTop: 6 }} />
                          <OwnerAvatar name={n.from_user} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontWeight: 700, fontSize: 13, color: '#172b4d' }}>{n.from_user}</span>
                              <span style={{ background: tc.bg, color: tc.color, borderRadius: 3, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{tc.label}</span>
                              <span style={{ fontSize: 11, color: '#a0aec0', marginLeft: 'auto' }}>{new Date(n.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <p style={{ fontSize: 12, color: '#6b778c', marginBottom: 4 }}>on <span style={{ fontWeight: 700, color: '#42526e' }}>{n.task_title}</span></p>
                            <div style={{ background: '#f8f9fc', borderRadius: 6, padding: '6px 10px' }}>
                              <CommentBody body={n.body.substring(0, 120) + (n.body.length > 120 ? '...' : '')} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )
          })()

          : (
            <>
              {filteredProjects.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#6b778c' }}>
                  <p style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No projects yet</p>
                  <p style={{ marginBottom: 20 }}>Create your first project to get started</p>
                  <button onClick={() => setShowAddProject(true)} style={{ background: 'var(--indigo)', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>+ Create Project</button>
                </div>
              ) : (
                filteredProjects.map((project, i) => (
                  <ProjectSection key={project.id} project={project} colorIndex={i}
                    tasks={(search ? filteredTasks : visibleTasks).filter(t => t.project_id === project.id)}
                    allTasks={visibleTasks} onUpdate={load} onDelete={deleteTask}
                    onAddTask={handleAddTask} onAddSubtask={handleAddSubtask} onSelect={setSelectedTask} />
                ))
              )}
            </>
          )}
        </main>
      </div>

      {selectedTask && <TaskDetailPanel task={selectedTask} user={user} onClose={() => setSelectedTask(null)} onUpdate={load} />}
      {showAddTask && <AddTaskModal projects={projects} parentId={addTaskParentId} projectId={addTaskProjectId} allTasks={tasks} onClose={() => setShowAddTask(false)} onSaved={load} currentUser={user} />}
      {showAddProject && <AddProjectModal onClose={() => setShowAddProject(false)} onSaved={load} colorIndex={projects.length} />}
    </>
  )
}
