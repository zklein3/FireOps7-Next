'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'
import { ALL_ICS_ROLE_VALUES } from '@/lib/ics-roles'

async function getContext() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx || !ctx.departmentId) return null
  const adminClient = createAdminClient()
  return {
    me: { id: ctx.personnelId },
    dept: { department_id: ctx.departmentId, system_role: ctx.systemRole },
    adminClient,
  }
}

// ─── Lane template actions ────────────────────────────────────────────────────

export async function addLaneTemplate(departmentId: string, name: string) {
  const ctx = await getContext()
  if (!ctx || ctx.dept.system_role !== 'admin') return { error: 'Admin only.' }
  if (!name.trim()) return { error: 'Name is required.' }

  const { data: existing } = await ctx.adminClient
    .from('accountability_lane_templates')
    .select('sort_order')
    .eq('department_id', departmentId)
    .order('sort_order', { ascending: false })
    .limit(1)
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

  const { error: dbErr } = await ctx.adminClient
    .from('accountability_lane_templates')
    .insert({ department_id: departmentId, name: name.trim(), sort_order: nextOrder, active: true })
  if (dbErr) { await logError(dbErr.message, '/dept-admin/accountability'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/accountability')
  return { success: true }
}

export async function updateLaneTemplate(id: string, name: string) {
  const ctx = await getContext()
  if (!ctx || ctx.dept.system_role !== 'admin') return { error: 'Admin only.' }
  if (!name.trim()) return { error: 'Name is required.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_lane_templates').update({ name: name.trim() }).eq('id', id)
  if (dbErr) { await logError(dbErr.message, '/dept-admin/accountability'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/accountability')
  return { success: true }
}

export async function toggleLaneTemplate(id: string, active: boolean) {
  const ctx = await getContext()
  if (!ctx || ctx.dept.system_role !== 'admin') return { error: 'Admin only.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_lane_templates').update({ active }).eq('id', id)
  if (dbErr) { await logError(dbErr.message, '/dept-admin/accountability'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/accountability')
  return { success: true }
}

export async function reorderLaneTemplates(departmentId: string, orderedIds: string[]) {
  const ctx = await getContext()
  if (!ctx || ctx.dept.system_role !== 'admin') return { error: 'Admin only.' }
  const updates = orderedIds.map((id, i) =>
    ctx.adminClient.from('accountability_lane_templates').update({ sort_order: i }).eq('id', id).eq('department_id', departmentId)
  )
  await Promise.all(updates)
  revalidatePath('/dept-admin/accountability')
  return { success: true }
}

// ─── Board actions ────────────────────────────────────────────────────────────

export async function createBoard(
  title: string,
  boardDate: string,
  linkedIncidentId?: string | null,
  linkedTrainingEventId?: string | null,
  linkedEventInstanceId?: string | null,
) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!title.trim()) return { error: 'Title is required.' }

  const { data: row, error: dbErr } = await ctx.adminClient
    .from('accountability_boards')
    .insert({
      department_id: ctx.dept.department_id,
      title: title.trim(),
      board_date: boardDate,
      created_by: ctx.me.id,
      linked_incident_id: linkedIncidentId ?? null,
      linked_training_event_id: linkedTrainingEventId ?? null,
      linked_event_instance_id: linkedEventInstanceId ?? null,
    })
    .select('id')
    .single()
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  revalidatePath('/accountability')
  return { success: true, boardId: row.id }
}

export async function updateBoardLink(
  boardId: string,
  linkedIncidentId: string | null,
  linkedTrainingEventId: string | null,
  linkedEventInstanceId: string | null,
) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_boards')
    .update({ linked_incident_id: linkedIncidentId, linked_training_event_id: linkedTrainingEventId, linked_event_instance_id: linkedEventInstanceId })
    .eq('id', boardId)
    .eq('department_id', ctx.dept.department_id)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  revalidatePath(`/accountability/${boardId}`)
  return { success: true }
}

export async function closeBoard(boardId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_boards')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', boardId)
    .eq('department_id', ctx.dept.department_id)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  revalidatePath('/accountability')
  revalidatePath(`/accountability/${boardId}`)
  return { success: true }
}

export async function reopenBoard(boardId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_boards')
    .update({ status: 'active', closed_at: null })
    .eq('id', boardId)
    .eq('department_id', ctx.dept.department_id)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  revalidatePath('/accountability')
  revalidatePath(`/accountability/${boardId}`)
  return { success: true }
}

// ─── Lane actions ─────────────────────────────────────────────────────────────

export async function initBoardLanes(boardId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }

  const { data: boardList } = await ctx.adminClient
    .from('accountability_boards').select('department_id').eq('id', boardId)
  const board = boardList?.[0]
  if (!board) return { error: 'Board not found.' }

  const { data: templates } = await ctx.adminClient
    .from('accountability_lane_templates')
    .select('name, sort_order')
    .eq('department_id', board.department_id)
    .eq('active', true)
    .order('sort_order')

  if (!templates?.length) return { error: 'No lane templates configured. Set them up in Dept Admin → Accountability.' }

  const rows = templates.map(t => ({ board_id: boardId, name: t.name, sort_order: t.sort_order }))
  const { data: inserted, error: dbErr } = await ctx.adminClient
    .from('accountability_lanes').insert(rows).select('id, name, sort_order, leader_entry_id, work_assignment')
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true, lanes: inserted ?? [] }
}

export async function addBoardLane(boardId: string, name: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!name.trim()) return { error: 'Name required.' }

  const { data: existing } = await ctx.adminClient
    .from('accountability_lanes').select('sort_order')
    .eq('board_id', boardId).order('sort_order', { ascending: false }).limit(1)
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

  const { data: row, error: dbErr } = await ctx.adminClient
    .from('accountability_lanes')
    .insert({ board_id: boardId, name: name.trim(), sort_order: nextOrder })
    .select('id, name, sort_order, leader_entry_id, work_assignment').single()
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true, lane: row }
}

// ─── Entry actions ────────────────────────────────────────────────────────────

export async function checkInPerson(
  boardId: string,
  laneId: string | null,
  personnelId: string | null,
  rawName: string | null,
  rawDept: string | null
) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!personnelId && !rawName) return { error: 'Must provide personnel or name.' }

  const { data: row, error: dbErr } = await ctx.adminClient
    .from('accountability_entries')
    .insert({ board_id: boardId, lane_id: laneId, personnel_id: personnelId, raw_name: rawName, raw_dept: rawDept, added_by: ctx.me.id })
    .select('id, lane_id, personnel_id, raw_name, raw_dept, status, checked_in_at, ics_role').single()
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true, entry: row }
}

export async function movePersonToLane(entryId: string, laneId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_entries').update({ lane_id: laneId }).eq('id', entryId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

export async function updateEntryName(entryId: string, rawName: string, rawDept: string | null) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!rawName.trim()) return { error: 'Name required.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_entries')
    .update({ raw_name: rawName.trim(), raw_dept: rawDept?.trim() ?? null })
    .eq('id', entryId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

export async function removeAccountabilityEntry(entryId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_entries').delete().eq('id', entryId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

export async function recordPAR(boardId: string, snapshot: { lane_name: string; count: number; names: string[] }[]) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_par_checks')
    .insert({ board_id: boardId, checked_by: ctx.me.id, snapshot })
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

// ─── ICS fields (command roles, lane leader/work assignment, board objectives) ─

function isOfficerOrAdmin(role: string | null) {
  return role === 'officer' || role === 'admin'
}

export async function setBoardIcsFields(
  boardId: string,
  fields: { objectives?: string | null; safety_message?: string | null; weather?: string | null; is_active_violence?: boolean }
) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!isOfficerOrAdmin(ctx.dept.system_role)) return { error: 'Officer or admin only.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_boards')
    .update(fields)
    .eq('id', boardId)
    .eq('department_id', ctx.dept.department_id)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

export async function setEntryIcsRole(entryId: string, role: string | null) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!isOfficerOrAdmin(ctx.dept.system_role)) return { error: 'Officer or admin only.' }
  if (role && !ALL_ICS_ROLE_VALUES.includes(role as typeof ALL_ICS_ROLE_VALUES[number])) return { error: 'Invalid role.' }

  const { data: entryRows } = await ctx.adminClient
    .from('accountability_entries').select('board_id').eq('id', entryId)
  const boardId = entryRows?.[0]?.board_id
  if (!boardId) return { error: 'Entry not found.' }

  const { data: boardRows } = await ctx.adminClient
    .from('accountability_boards').select('department_id').eq('id', boardId)
  if (boardRows?.[0]?.department_id !== ctx.dept.department_id) return { error: 'Not authorized.' }

  const { error: dbErr } = await ctx.adminClient
    .from('accountability_entries').update({ ics_role: role }).eq('id', entryId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

export async function setLaneLeader(laneId: string, entryId: string | null) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!isOfficerOrAdmin(ctx.dept.system_role)) return { error: 'Officer or admin only.' }

  const { data: laneRows } = await ctx.adminClient
    .from('accountability_lanes').select('board_id').eq('id', laneId)
  const boardId = laneRows?.[0]?.board_id
  if (!boardId) return { error: 'Lane not found.' }

  const { data: boardRows } = await ctx.adminClient
    .from('accountability_boards').select('department_id').eq('id', boardId)
  if (boardRows?.[0]?.department_id !== ctx.dept.department_id) return { error: 'Not authorized.' }

  const { error: dbErr } = await ctx.adminClient
    .from('accountability_lanes').update({ leader_entry_id: entryId }).eq('id', laneId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

export async function setLaneWorkAssignment(laneId: string, text: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!isOfficerOrAdmin(ctx.dept.system_role)) return { error: 'Officer or admin only.' }

  const { data: laneRows } = await ctx.adminClient
    .from('accountability_lanes').select('board_id').eq('id', laneId)
  const boardId = laneRows?.[0]?.board_id
  if (!boardId) return { error: 'Lane not found.' }

  const { data: boardRows } = await ctx.adminClient
    .from('accountability_boards').select('department_id').eq('id', boardId)
  if (boardRows?.[0]?.department_id !== ctx.dept.department_id) return { error: 'Not authorized.' }

  const { error: dbErr } = await ctx.adminClient
    .from('accountability_lanes').update({ work_assignment: text.trim() || null }).eq('id', laneId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

// ─── Activity log ──────────────────────────────────────────────────────────────

export async function addActivityLogEntry(boardId: string, note: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!note.trim()) return { error: 'Note required.' }

  const { data: row, error: dbErr } = await ctx.adminClient
    .from('accountability_activity_log')
    .insert({ board_id: boardId, author_personnel_id: ctx.me.id, note: note.trim() })
    .select('id, entry_time, note, author_personnel_id')
    .single()
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true, entry: row }
}

export async function saveDebugScan(rawValue: string, source: string = 'accountability') {
  const adminClient = createAdminClient()
  // Escape control chars so Postgres accepts the string
  const sanitized = Array.from(rawValue).map(c => {
    const code = c.charCodeAt(0)
    if ((code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D) || (code >= 0x7F && code <= 0x9F)) {
      return `\\x${code.toString(16).padStart(2, '0')}`
    }
    return c
  }).join('')
  await adminClient.from('qr_debug_scans').insert({ raw_value: sanitized, source })
  return { success: true }
}
