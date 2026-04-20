export default function CommentBody({ body }) {
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
