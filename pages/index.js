import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import { supabase } from '../lib/supabase'
import { getMsal } from '../lib/msal'
import { getDisplayName } from '../lib/team'
import LoginScreen from '../components/LoginScreen'
import GlobalStyles from '../components/GlobalStyles'
import AppHeader from '../components/AppHeader'
import AppSidebar from '../components/AppSidebar'
import TaskDetailPanel from '../components/TaskDetailPanel'
import AddTaskModal from '../components/AddTaskModal'
import AddProjectModal from '../components/AddProjectModal'
import MyWorkView from '../components/MyWorkView'
import MyProjectsView from '../components/MyProjectsView'
import InboxView from '../components/InboxView'
import ProjectGallery from '../components/ProjectGallery'
import ProjectSection from '../components/ProjectSection'

export default function Home() {
  const [user, setUser]                         = useState(null)
  const [authLoading, setAuthLoading]           = useState(true)
  const [loginLoading, setLoginLoading]         = useState(false)
  const [view, setView]                         = useState('board')
  const [tasks, setTasks]                       = useState([])
  const [projects, setProjects]                 = useState([])
  const [notifications, setNotifications]       = useState([])
  const [loading, setLoading]                   = useState(true)
  const [activeProject, setActiveProject]       = useState(null)
  const [showAddTask, setShowAddTask]           = useState(false)
  const [showAddProject, setShowAddProject]     = useState(false)
  const [addTaskProjectId, setAddTaskProjectId] = useState(null)
  const [addTaskParentId, setAddTaskParentId]   = useState(null)
  const [search, setSearch]                     = useState('')
  const [selectedTask, setSelectedTask]         = useState(null)

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

  const handleLogin  = async () => { setLoginLoading(true); try { const m = await getMsal(); await m.loginRedirect({ scopes: ['User.Read'] }) } catch (e) { console.error('Login error', e); setLoginLoading(false) } }
  const handleLogout = async () => { const m = await getMsal(); m.logoutRedirect() }
  const userName = getDisplayName(user?.username) || user?.name?.split(' ')[0] || ''

  const load = useCallback(async () => {
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: true }),
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
    ])
    setTasks(t || []); setProjects(p || [])
  }, [])
  useEffect(() => {
    if (!user) return
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [user, load])

  const loadNotifications = useCallback(async () => {
    if (!userName) return
    const { data } = await supabase.from('notifications').select('*').eq('user_name', userName).order('created_at', { ascending: false }).limit(50)
    setNotifications(data || [])
  }, [userName])
  useEffect(() => { if (userName) loadNotifications() }, [userName, loadNotifications])

  const markRead    = async id => { await supabase.from('notifications').update({ read: true }).eq('id', id); loadNotifications() }
  const markAllRead = async () => { await supabase.from('notifications').update({ read: true }).eq('user_name', userName).eq('read', false); loadNotifications() }
  const deleteTask  = async id => { await supabase.from('tasks').delete().eq('id', id); load() }
  const handleAddTask    = projectId => { setAddTaskProjectId(projectId); setAddTaskParentId(null); setShowAddTask(true) }
  const handleAddSubtask = parentId  => {
    const parent = tasks.find(t => t.id === parentId)
    setAddTaskProjectId(parent?.project_id || null); setAddTaskParentId(parentId); setShowAddTask(true)
  }
  const onHeaderAddTask = () => { setView('board'); setAddTaskProjectId(null); setAddTaskParentId(null); setShowAddTask(true) }

  // Visibility: flow tasks only show to the assigned user unless linked to a project
  const visibleTasks = tasks.filter(t => (t.source === 'manual' || !t.source || t.project_id || !t.assigned_to) || t.assigned_to.toLowerCase() === userName.toLowerCase())
  const filteredTasks = search ? visibleTasks.filter(t => t.title?.toLowerCase().includes(search.toLowerCase())) : visibleTasks
  const myFlowTasks   = visibleTasks.filter(t => ['email','teams','teamsmaestro'].includes(t.source) && t.assigned_to?.toLowerCase() === userName.toLowerCase())
  const unreadCount   = notifications.filter(n => !n.read).length

  if (authLoading) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #3D157D 0%, #1a0a3a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Nunito, sans-serif', color: '#fff', fontSize: 16, fontWeight: 600 }}>
      <Head><link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" /></Head>
      Loading...
    </div>
  )
  if (!user) return <LoginScreen onLogin={handleLogin} loading={loginLoading} />

  const activeProjectData = activeProject ? projects.find(p => p.id === activeProject) : null
  const activeProjectIdx  = activeProject ? projects.findIndex(p => p.id === activeProject) : -1

  return (
    <>
      <GlobalStyles />
      <AppHeader search={search} setSearch={setSearch} userName={userName} handleLogout={handleLogout}
        onAddTaskClick={onHeaderAddTask} onAddProjectClick={() => setShowAddProject(true)} />

      <div style={{ display: 'flex', height: 'calc(100vh - 52px)' }}>
        <AppSidebar view={view} setView={setView} projects={projects}
          activeProject={activeProject} setActiveProject={setActiveProject}
          myFlowCount={myFlowTasks.length} unreadCount={unreadCount} />

        <main style={{ flex: 1, overflowY: 'auto', padding: 20, marginRight: selectedTask ? 380 : 0 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60%', color: '#6b778c', fontWeight: 600 }}>Loading...</div>
          ) : view === 'mywork' ? (
            <MyWorkView myFlowTasks={myFlowTasks} setSelectedTask={setSelectedTask} load={load} />
          ) : view === 'myprojects' ? (
            <MyProjectsView projects={projects} visibleTasks={visibleTasks} userName={userName} setActiveProject={setActiveProject} />
          ) : view === 'inbox' ? (
            <InboxView notifications={notifications} tasks={tasks} unreadCount={unreadCount}
              markRead={markRead} markAllRead={markAllRead} setSelectedTask={setSelectedTask} />
          ) : activeProjectData ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <button onClick={() => setActiveProject(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#6b778c', fontFamily: 'Nunito, sans-serif', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0' }}>
                  ← All Projects
                </button>
              </div>
              <ProjectSection key={activeProjectData.id} project={activeProjectData} colorIndex={activeProjectIdx}
                tasks={(search ? filteredTasks : visibleTasks).filter(t => t.project_id === activeProjectData.id)}
                allTasks={visibleTasks} onUpdate={load} onDelete={deleteTask}
                onAddTask={handleAddTask} onAddSubtask={handleAddSubtask} onSelect={setSelectedTask} />
            </>
          ) : (
            <ProjectGallery projects={projects} visibleTasks={visibleTasks}
              setActiveProject={setActiveProject} setShowAddProject={setShowAddProject} />
          )}
        </main>
      </div>

      {selectedTask && <TaskDetailPanel task={selectedTask} user={user} allTasks={tasks} onClose={() => setSelectedTask(null)} onUpdate={load} />}
      {showAddTask && <AddTaskModal projects={projects} parentId={addTaskParentId} projectId={addTaskProjectId} allTasks={tasks} onClose={() => setShowAddTask(false)} onSaved={load} currentUser={user} />}
      {showAddProject && <AddProjectModal onClose={() => setShowAddProject(false)} onSaved={load} colorIndex={projects.length} />}
      <div id="timeline-portal" />
    </>
  )
}
