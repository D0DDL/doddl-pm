// Excel export / import helpers for feature #15.
//
// xlsx is loaded lazily via dynamic import so it doesn't bloat the initial
// client bundle (xlsx is ~143 KB; initial loads don't need it).

import { supabase } from './supabase'

const PROJECT_COLS = ['id','name','description','status','priority','owner','start_date','due_date','created_at','updated_at']
const TASK_COLS    = ['id','project_id','group_id','parent_id','title','description','status','priority','assigned_to','start_date','due_date','progress','notes','source','depends_on','is_group']

// Fields a reimport is allowed to update. Matches Jon's spec for feature #15:
//   "update tasks, assignees, and dates in bulk".
const IMPORT_UPDATABLE = ['title','assigned_to','start_date','due_date']

function rowsOf(items, cols) {
  return items.map(t => Object.fromEntries(cols.map(c => [c, t[c] ?? null])))
}

export async function exportToExcel({ projects, tasks }) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsOf(projects, PROJECT_COLS), { header: PROJECT_COLS }), 'Projects')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsOf(tasks,    TASK_COLS),    { header: TASK_COLS }),    'Tasks')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  XLSX.writeFile(wb, `doddl-pm-export-${stamp}.xlsx`)
}

export async function parseImport(file) {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames.find(n => n.toLowerCase() === 'tasks') || wb.SheetNames[0]
  if (!sheetName) throw new Error('No sheets found in file')
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null })
  const valid = rows.filter(r => r && typeof r.id === 'string' && r.id.length >= 8)
  return { sheetName, totalRows: rows.length, validRows: valid, skipped: rows.length - valid.length }
}

export async function applyTaskImport(rows) {
  let updated = 0, failed = 0, errors = []
  for (const r of rows) {
    const patch = {}
    for (const k of IMPORT_UPDATABLE) {
      if (r[k] !== undefined && r[k] !== null && r[k] !== '') patch[k] = r[k]
    }
    if (Object.keys(patch).length === 0) continue
    const { error } = await supabase.from('tasks').update(patch).eq('id', r.id)
    if (error) { failed++; errors.push({ id: r.id, message: error.message }) }
    else updated++
  }
  return { updated, failed, errors }
}
