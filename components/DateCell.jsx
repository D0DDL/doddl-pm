export default function DateCell({ value, onChange }) {
  return <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
    style={{ border: 'none', background: 'transparent', fontSize: 12, color: value ? '#172b4d' : '#a0aec0', cursor: 'pointer', width: '100%', fontFamily: 'Nunito, sans-serif' }} />
}
