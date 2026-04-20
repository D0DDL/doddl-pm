// OwnerAvatar — formerly a single-initial circle. Per UI #10, now renders
// the full first name from the team roster as a coloured pill so every
// assignee is visually distinct without having to read tooltips.
//
// Size variants:
//   default: normal pill used in task detail panel, gantt label, notifications
//   sm:      compact pill for table rows with tight width
//   empty (no name): neutral placeholder (kept for parity with old API)
const colors = ['#0052cc','#00875a','#de350b','#ff8b00','#6554c0','#00a3bf']

export default function OwnerAvatar({ name, size = 'default' }) {
  if (!name) {
    const w = size === 'sm' ? 20 : 28
    return <div style={{ width: w, height: w }} />
  }
  const idx = name.charCodeAt(0) % colors.length
  const bg = colors[idx]
  const style = size === 'sm'
    ? { height: 20, padding: '0 8px', fontSize: 10, borderRadius: 10 }
    : { height: 22, padding: '0 10px', fontSize: 11, borderRadius: 11 }
  return (
    <span title={name}
      style={{
        display: 'inline-flex', alignItems: 'center', background: bg, color: '#fff',
        fontWeight: 800, cursor: 'default', whiteSpace: 'nowrap', flexShrink: 0,
        ...style,
      }}>
      {name}
    </span>
  )
}
