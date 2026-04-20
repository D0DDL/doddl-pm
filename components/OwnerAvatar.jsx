export default function OwnerAvatar({ name }) {
  if (!name) return <div style={{ width: 28, height: 28 }} />
  const colors = ['#0052cc','#00875a','#de350b','#ff8b00','#6554c0','#00a3bf']
  const idx = name.charCodeAt(0) % colors.length
  return (
    <div title={name} style={{ width: 28, height: 28, borderRadius: '50%', background: colors[idx], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0, cursor: 'default' }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
