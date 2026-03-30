import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import { supabase } from '../lib/supabase'

const STATUS_COLS = [
  { key: 'todo',        label: 'To Do',       cls: 'status-todo' },
  { key: 'in_progress', label: 'In Progress',  cls: 'status-in_progress' },
  { key: 'blocked',     label: 'Blocked',      cls: 'status-blocked' },
  { key: 'done',        label: 'Done',         cls: 'status-done' },
]

const PRIORITY_OPTS = ['low','medium','high','critical']
const SOURCE_OPTS   = ['manual','email','teams','teamsmaestro']

function Badge({ cls, label }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-600 ${cls}`}>{label}</span>
}

function TaskCard({ task, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(task)

  const save = async () => {
    await supabase.from('tasks').update({
      title: form.title, status: form.status, priority: form.priority,
      assigned_to: form.assigned_to, due_date: form.due_date, notes: form.notes
    }).eq('id', task.id)
    onUpdate()
    setEditing(false)
  }

  const statusCls = STATUS_COLS.find(s => s.key === task.status)?.cls || ''

  if (editing) return (
    <div style={{background:'white',border:'2px solid var(--aqua)',borderRadius:8,padding:12,marginBottom:8}}>
      <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})}
        style={{width:'100%',fontWeight:700,fontSize:14,border:'none',outline:'none',marginBottom:8}} />
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:8}}>
        <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}
          style={{padding:'4px 8px',borderRadius:4,border:'1px solid #e5e7eb',fontSize:12}}>
          {STATUS_COLS.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}
          style={{padding:'4px 8px',borderRadius:4,border:'1px solid #e5e7eb',fontSize:12}}>
          {PRIORITY_OPTS.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
        <input type="text" placeholder="Assigned to" value={form.assigned_to||''} onChange={e=>setForm({...form,assigned_to:e.target.value})}
          style={{padding:'4px 8px',borderRadius:4,border:'1px solid #e5e7eb',fontSize:12}} />
        <input type="date" value={form.due_date||''} onChange={e=>setForm({...form,due_date:e.target.value})}
          style={{padding:'4px 8px',borderRadius:4,border:'1px solid #e5e7eb',fontSize:12}} />
      </div>
      <textarea value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})}
        placeholder="Notes..." rows={2}
        style={{width:'100%',padding:'4px 8px',borderRadius:4,border:'1px solid #e5e7eb',fontSize:12,resize:'vertical',marginBottom:8}} />
      <div style={{display:'flex',gap:6}}>
        <button onClick={save} style={{background:'var(--aqua)',color:'white',border:'none',borderRadius:4,padding:'4px 12px',fontSize:12,fontWeight:700,cursor:'pointer'}}>Save</button>
        <button onClick={()=>setEditing(false)} style={{background:'#f3f4f6',border:'none',borderRadius:4,padding:'4px 12px',fontSize:12,cursor:'pointer'}}>Cancel</button>
      </div>
    </div>
  )

  return (
    <div onClick={()=>setEditing(true)} style={{background:'white',borderRadius:8,padding:12,marginBottom:8,cursor:'pointer',border:'1px solid #e5e7eb',transition:'box-shadow 0.15s'}}
      onMouseEnter={e=>e.currentTarget.style.boxShadow='0 2px 8px rgba(61,21,125,0.12)'}
      onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
        <p style={{fontWeight:700,fontSize:13,color:'var(--text)',flex:1,marginRight:8}}>{task.title}</p>
        <button onClick={e=>{e.stopPropagation();onDelete(task.id)}} style={{background:'none',border:'none',cursor:'pointer',color:'#d1d5db',fontSize:16,lineHeight:1}}>×</button>
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:4,alignItems:'center'}}>
        <Badge cls={statusCls} label={task.status.replace('_',' ')} />
        {task.priority !== 'medium' && <span className={`priority-${task.priority}`} style={{fontSize:11,fontWeight:700}}>▲ {task.priority}</span>}
        {task.assigned_to && <span style={{fontSize:11,color:'var(--muted)'}}>👤 {task.assigned_to}</span>}
        {task.due_date && <span style={{fontSize:11,color:'var(--muted)'}}>📅 {task.due_date}</span>}
        {task.source !== 'manual' && <Badge cls={`source-${task.source}`} label={task.source} />}
      </div>
      {task.notes && <p style={{marginTop:6,fontSize:11,color:'var(--muted)',lineHeight:1.4}}>{task.notes}</p>}
    </div>
  )
}

function AddTaskModal({ projects, onClose, onSaved }) {
  const [form, setForm] = useState({
    title:'', status:'todo', priority:'medium', project_id:'',
    assigned_to:'', due_date:'', source:'manual', notes:''
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    const payload = {...form, project_id: form.project_id || null}
    await supabase.from('tasks').insert([payload])
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
      <div style={{background:'white',borderRadius:12,padding:24,width:480,maxWidth:'95vw',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h3 style={{fontSize:16,fontWeight:800,color:'var(--indigo)'}}>New Task</h3>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--muted)'}}>×</button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <input placeholder="Task title *" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}
            style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:14,fontWeight:600}} />
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}
              style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13}}>
              {STATUS_COLS.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}
              style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13}}>
              {PRIORITY_OPTS.map(p=><option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
            </select>
            <select value={form.project_id} onChange={e=>setForm({...form,project_id:e.target.value})}
              style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13}}>
              <option value="">No project</option>
              {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={form.source} onChange={e=>setForm({...form,source:e.target.value})}
              style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13}}>
              {SOURCE_OPTS.map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
            <input type="text" placeholder="Assigned to" value={form.assigned_to} onChange={e=>setForm({...form,assigned_to:e.target.value})}
              style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13}} />
            <input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}
              style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13}} />
          </div>
          <textarea placeholder="Notes..." value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}
            rows={3} style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13,resize:'vertical'}} />
          <button onClick={save} disabled={saving}
            style={{background:'var(--indigo)',color:'white',border:'none',borderRadius:6,padding:'10px 0',fontWeight:800,fontSize:14,cursor:'pointer',fontFamily:'Nunito,sans-serif'}}>
            {saving ? 'Saving...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddProjectModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name:'', description:'', status:'active', priority:'medium', owner:'', due_date:'' })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    await supabase.from('projects').insert([form])
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
      <div style={{background:'white',borderRadius:12,padding:24,width:440,maxWidth:'95vw'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h3 style={{fontSize:16,fontWeight:800,color:'var(--indigo)'}}>New Project</h3>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--muted)'}}>×</button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <input placeholder="Project name *" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}
            style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:14,fontWeight:600}} />
          <textarea placeholder="Description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}
            rows={2} style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13,resize:'vertical'}} />
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}
              style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13}}>
              {PRIORITY_OPTS.map(p=><option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
            </select>
            <input type="text" placeholder="Owner" value={form.owner} onChange={e=>setForm({...form,owner:e.target.value})}
              style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13}} />
            <input type="date" placeholder="Due date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}
              style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13}} />
          </div>
          <button onClick={save} disabled={saving}
            style={{background:'var(--indigo)',color:'white',border:'none',borderRadius:6,padding:'10px 0',fontWeight:800,fontSize:14,cursor:'pointer',fontFamily:'Nunito,sans-serif'}}>
            {saving ? 'Saving...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const [view, setView]         = useState('board')   // board | projects | inbox
  const [tasks, setTasks]       = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [activeProject, setActiveProject] = useState(null)
  const [showAddTask, setShowAddTask]     = useState(false)
  const [showAddProject, setShowAddProject] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
    ])
    setTasks(t || [])
    setProjects(p || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const deleteTask = async (id) => {
    await supabase.from('tasks').delete().eq('id', id)
    load()
  }

  const filteredTasks = activeProject
    ? tasks.filter(t => t.project_id === activeProject)
    : tasks

  const inboxTasks = tasks.filter(t => t.source !== 'manual' && t.status === 'todo')

  const navBtn = (key, label) => (
    <button onClick={()=>setView(key)}
      style={{
        padding:'8px 16px', borderRadius:6, border:'none', cursor:'pointer',
        fontFamily:'Nunito,sans-serif', fontWeight:700, fontSize:13,
        background: view===key ? 'var(--indigo)' : 'transparent',
        color: view===key ? 'white' : 'var(--muted)',
      }}>{label}</button>
  )

  return (
    <>
      <Head>
        <title>doddl PM</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      {/* Header */}
      <header style={{background:'var(--indigo)',color:'white',padding:'0 24px',height:56,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <div style={{display:'flex',alignItems:'center',gap:4}}>
          <span style={{fontWeight:800,fontSize:20,letterSpacing:'-0.5px'}}>doddl</span>
          <span style={{color:'var(--aqua)',fontWeight:800,fontSize:20}}>.</span>
          <span style={{fontWeight:600,fontSize:14,opacity:0.7,marginLeft:8}}>Project Management</span>
        </div>
        <div style={{display:'flex',gap:6}}>
          <button onClick={()=>setShowAddTask(true)}
            style={{background:'var(--aqua)',color:'white',border:'none',borderRadius:6,padding:'6px 14px',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'Nunito,sans-serif'}}>
            + Task
          </button>
          <button onClick={()=>setShowAddProject(true)}
            style={{background:'rgba(255,255,255,0.15)',color:'white',border:'1px solid rgba(255,255,255,0.3)',borderRadius:6,padding:'6px 14px',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'Nunito,sans-serif'}}>
            + Project
          </button>
        </div>
      </header>

      <div style={{display:'flex',height:'calc(100vh - 56px)'}}>

        {/* Sidebar */}
        <aside style={{width:220,background:'white',borderRight:'1px solid var(--border)',padding:16,overflowY:'auto',flexShrink:0}}>
          <div style={{marginBottom:20}}>
            {navBtn('board','📋 Board')}
            <div style={{marginTop:4}}>{navBtn('inbox', `📥 Inbox${inboxTasks.length ? ` (${inboxTasks.length})` : ''}`)}</div>
          </div>

          <p style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>Projects</p>
          <button onClick={()=>{setActiveProject(null);setView('board')}}
            style={{width:'100%',textAlign:'left',padding:'6px 10px',borderRadius:6,border:'none',cursor:'pointer',fontFamily:'Nunito,sans-serif',fontWeight:600,fontSize:13,
              background: !activeProject && view==='board' ? '#f0ebff' : 'transparent',
              color: !activeProject && view==='board' ? 'var(--indigo)' : 'var(--text)'}}>
            All tasks
          </button>
          {projects.map(p => (
            <button key={p.id} onClick={()=>{setActiveProject(p.id);setView('board')}}
              style={{width:'100%',textAlign:'left',padding:'6px 10px',borderRadius:6,border:'none',cursor:'pointer',fontFamily:'Nunito,sans-serif',fontWeight:600,fontSize:13,marginTop:2,
                background: activeProject===p.id ? '#f0ebff' : 'transparent',
                color: activeProject===p.id ? 'var(--indigo)' : 'var(--text)'}}>
              {p.name}
            </button>
          ))}
        </aside>

        {/* Main */}
        <main style={{flex:1,overflowY:'auto',padding:20}}>
          {loading ? (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'var(--muted)',fontWeight:600}}>Loading...</div>
          ) : view === 'inbox' ? (
            <>
              <h2 style={{fontWeight:800,fontSize:18,color:'var(--indigo)',marginBottom:16}}>Inbox <span style={{fontSize:13,fontWeight:600,color:'var(--muted)'}}>— from Email, Teams & TeamsMAestro</span></h2>
              {inboxTasks.length === 0
                ? <p style={{color:'var(--muted)',fontWeight:600}}>Inbox is clear ✓</p>
                : inboxTasks.map(t => <TaskCard key={t.id} task={t} onUpdate={load} onDelete={deleteTask} />)
              }
            </>
          ) : (
            <>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{fontWeight:800,fontSize:18,color:'var(--indigo)'}}>
                  {activeProject ? projects.find(p=>p.id===activeProject)?.name : 'All Tasks'}
                  <span style={{fontWeight:600,fontSize:13,color:'var(--muted)',marginLeft:8}}>{filteredTasks.length} tasks</span>
                </h2>
              </div>

              {/* Kanban board */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,alignItems:'start'}}>
                {STATUS_COLS.map(col => {
                  const colTasks = filteredTasks.filter(t => t.status === col.key)
                  return (
                    <div key={col.key}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                        <span className={col.cls} style={{padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:700}}>{col.label}</span>
                        <span style={{fontSize:12,color:'var(--muted)',fontWeight:600}}>{colTasks.length}</span>
                      </div>
                      <div>
                        {colTasks.map(t => <TaskCard key={t.id} task={t} onUpdate={load} onDelete={deleteTask} />)}
                        {colTasks.length === 0 && (
                          <div style={{border:'2px dashed #e5e7eb',borderRadius:8,padding:16,textAlign:'center',color:'#d1d5db',fontSize:12}}>Empty</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </main>
      </div>

      {showAddTask && <AddTaskModal projects={projects} onClose={()=>setShowAddTask(false)} onSaved={load} />}
      {showAddProject && <AddProjectModal onClose={()=>setShowAddProject(false)} onSaved={load} />}
    </>
  )
}
