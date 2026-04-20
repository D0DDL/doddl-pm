import { useState, useEffect, useRef } from 'react'
import CalendarPicker from './CalendarPicker'

export default function TimelineCell({ startDate, dueDate, color, onSave }) {
  const [stage, setStage] = useState(null)   // null | 'start' | 'end'
  const [s, setS]         = useState(startDate || '')
  const [e, setE]         = useState(dueDate   || '')
  const anchorRef         = useRef()
  const [pos, setPos]     = useState(null)
  const savedStart        = useRef(startDate || '')

  useEffect(() => { if (!stage) { setS(startDate || ''); setE(dueDate || '') } }, [startDate, dueDate])

  const open = (which) => {
    const r = anchorRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 4, left: r.left })
    setStage(which)
  }

  const pickStart = (v) => {
    setS(v)
    savedStart.current = v
    setStage('end')
  }

  const pickEnd = (v) => {
    setE(v)
    setStage(null)
    onSave(savedStart.current, v)
  }

  const now = new Date()
  const over = e && new Date(e) < now
  const bar  = over ? '#de350b' : color || '#0052cc'
  let pct = 0
  if (s && e) {
    const sd = new Date(s), ed = new Date(e)
    pct = Math.round(Math.min(Math.max((now-sd)/Math.max(ed-sd,86400000),0),1)*100)
  }
  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : null

  return (
    <>
      <div ref={anchorRef} onClick={() => stage ? setStage(null) : open('start')} style={{cursor:'pointer'}}>
        {s||e ? (
          <div style={{display:'flex',flexDirection:'column',gap:3}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:4}}>
              <span style={{fontSize:10,fontWeight:700,color:stage==='start'?'var(--indigo)':'#6b778c'}}>{fmt(s)||<span style={{color:'#c1c7d0'}}>Start</span>}</span>
              <span style={{fontSize:10,fontWeight:700,color:over?'#de350b':stage==='end'?'var(--indigo)':'#6b778c'}}>{fmt(e)||<span style={{color:'#c1c7d0'}}>End</span>}</span>
            </div>
            <div style={{height:6,background:'#f0f1f3',borderRadius:3,overflow:'hidden'}}>
              <div style={{width:`${pct}%`,height:'100%',background:bar,borderRadius:3}}/>
            </div>
          </div>
        ) : <span style={{fontSize:10,color:'#c1c7d0',letterSpacing:'0.02em'}}>📅 click to set</span>}
      </div>
      {stage && pos && (
        <div style={{position:'fixed',top:pos.top,left:pos.left,zIndex:9999}}>
          <CalendarPicker
            value={stage==='start'?s:e}
            onChange={stage==='start'?pickStart:pickEnd}
            label={stage==='start'?'① Pick start date':'② Pick end date'}/>
        </div>
      )}
    </>
  )
}
