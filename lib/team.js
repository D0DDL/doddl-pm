export const TEAM = [
  { name: 'Jon',    email: 'jon@doddl.com' },
  { name: 'Laura',  email: 'laura@doddl.com' },
  { name: 'Cat',    email: 'catherine@doddl.com' },
  { name: 'Chris',  email: 'finance@doddl.com' },
  { name: 'Cathy',  email: 'hello@doddl.com' },
  { name: 'Claude', email: 'claude@doddl.com' },
]

export function getDisplayName(email) {
  if (!email) return ''
  const match = TEAM.find(t => t.email.toLowerCase() === email.toLowerCase())
  return match ? match.name : email.split('@')[0]
}

export function getEmailFromName(name) {
  if (!name) return ''
  const match = TEAM.find(t => t.name.toLowerCase() === name.toLowerCase())
  return match ? match.email : ''
}

export const PROJECT_COLORS = [
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

export const GROUP_TINTS = [
  { bg: '#f3eeff', border: '#3D157D', text: '#3D157D' },
  { bg: '#e6faf8', border: '#30BEAA', text: '#1a8a7a' },
  { bg: '#e9f2ff', border: '#0052cc', text: '#0052cc' },
  { bg: '#e3fcef', border: '#00875a', text: '#00875a' },
  { bg: '#ffebe6', border: '#de350b', text: '#de350b' },
  { bg: '#fff3e0', border: '#ff8b00', text: '#b85c00' },
  { bg: '#ede9fe', border: '#6554c0', text: '#6554c0' },
  { bg: '#e6f7fb', border: '#00a3bf', text: '#006680' },
]

export function getProjectColor(project, index) {
  if (project.color && project.color !== '#3D157D') return project.color
  return PROJECT_COLORS[index % PROJECT_COLORS.length]
}
