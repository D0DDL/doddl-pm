export const APP_VERSION = '2.1.0'

export const STATUSES = [
  { key: 'not_started', label: 'Not Started', color: '#c1c7d0' },
  { key: 'in_progress', label: 'In Progress', color: '#0052cc' },
  { key: 'on_track',    label: 'On Track',    color: '#00875a' },
  { key: 'at_risk',     label: 'At Risk',     color: '#ff8b00' },
  { key: 'blocked',     label: 'Blocked',     color: '#de350b' },
  { key: 'done',        label: 'Done',        color: '#36b37e' },
]

export const PRIORITIES = [
  { key: 'critical', label: 'Critical', color: '#de350b' },
  { key: 'high',     label: 'High',     color: '#ff8b00' },
  { key: 'medium',   label: 'Medium',   color: '#0052cc' },
  { key: 'low',      label: 'Low',      color: '#6b778c' },
]

export const statusMap   = Object.fromEntries(STATUSES.map(s => [s.key, s]))
export const priorityMap = Object.fromEntries(PRIORITIES.map(p => [p.key, p]))

// Project table column widths. Kept compact so more data fits above the fold.
export const COL_WIDTHS = { task: 240, status: 100, assignee: 90, start: 90, due: 90, priority: 90, progress: 90, depends: 100 }

// Monday-style project table widths (used by ProjectTableRow / ProjectSection header / ProjectGroup spacer)
export const PROJ_COL_WIDTHS = { select: 28, owner: 96, status: 130, timeline: 180, effort: 60, priority: 104, progress: 140 }

// Cap for the flexible Task column so it doesn't sprawl across wide monitors.
// Other columns (owner/status/timeline/priority/progress) are user-draggable; Task name
// is flex:1 and would otherwise eat all remaining space on 1440+ screens, pushing the
// useful columns (Status, Timeline, Priority, Progress) toward the right edge.
export const TASK_COL_MAX = 440

export const SOURCE_COLORS = {
  email:        { bg: '#dbeafe', color: '#1d4ed8', label: 'Email' },
  teams:        { bg: '#ede9fe', color: '#7c3aed', label: 'Teams' },
  teamsmaestro: { bg: '#fce7f3', color: '#be185d', label: 'TeamsMAestro' },
  manual:       { bg: '#f3f4f6', color: '#374151', label: 'Manual' },
}

export const TAG_COLORS = ['#e9f2ff', '#e3fcef', '#fff0e6', '#fce8e8', '#f3f0ff', '#e6f7ff']
