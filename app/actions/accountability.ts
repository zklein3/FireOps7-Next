'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'
import { ALL_ICS_ROLE_VALUES, icsRoleLabel, ICS_MODE_LANES, ACTIVE_VIOLENCE_LANES } from '@/lib/ics-roles'

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

export async function addLaneTemplate(departmentId: string, name: string, profile: 'default' | 'ics' | 'active_violence' = 'default') {
  const ctx = await getContext()
  if (!ctx || ctx.dept.system_role !== 'admin') return { error: 'Admin only.' }
  if (!name.trim()) return { error: 'Name is required.' }

  const { data: existing } = await ctx.adminClient
    .from('accountability_lane_templates')
    .select('sort_order')
    .eq('department_id', departmentId)
    .eq('profile', profile)
    .order('sort_order', { ascending: false })
    .limit(1)
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

  const { error: dbErr } = await ctx.adminClient
    .from('accountability_lane_templates')
    .insert({ department_id: departmentId, name: name.trim(), sort_order: nextOrder, active: true, profile })
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
    .eq('profile', 'default')
    .eq('active', true)
    .order('sort_order')

  if (!templates?.length) return { error: 'No lane templates configured. Set them up in Dept Admin → Accountability.' }

  const rows = templates.map(t => ({ board_id: boardId, name: t.name, sort_order: t.sort_order, profile: 'default' as const }))
  const { data: inserted, error: dbErr } = await ctx.adminClient
    .from('accountability_lanes').insert(rows).select('id, name, sort_order, leader_entry_id, work_assignment, profile')
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
    .select('id, name, sort_order, leader_entry_id, work_assignment, profile').single()
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true, lane: row }
}

// Refuses if anyone active is still in the lane — reassign them first rather than
// silently orphaning an assignment. Empty lanes only.
export async function deleteLane(laneId: string) {
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

  const { count } = await ctx.adminClient
    .from('accountability_entries').select('id', { count: 'exact', head: true })
    .eq('lane_id', laneId).is('released_at', null)
  if (count && count > 0) return { error: 'Move everyone out of this lane before deleting it.' }

  const { count: logCount } = await ctx.adminClient
    .from('accountability_activity_log').select('id', { count: 'exact', head: true }).eq('lane_id', laneId)
  if (logCount && logCount > 0) return { error: 'This lane has 214 log entries against it — its history stays intact, so it can\'t be deleted.' }

  const { error: dbErr } = await ctx.adminClient.from('accountability_lanes').delete().eq('id', laneId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

// ─── Entry actions ────────────────────────────────────────────────────────────

export async function checkInPerson(
  boardId: string,
  laneId: string | null,
  personnelId: string | null,
  rawName: string | null,
  rawDept: string | null,
  tagRef: string | null = null,
  resourceId: string | null = null,
) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!personnelId && !rawName) return { error: 'Must provide personnel or name.' }

  const { data: row, error: dbErr } = await ctx.adminClient
    .from('accountability_entries')
    .insert({ board_id: boardId, lane_id: laneId, personnel_id: personnelId, raw_name: rawName, raw_dept: rawDept, tag_ref: tagRef, added_by: ctx.me.id, resource_id: resourceId })
    .select('id, lane_id, personnel_id, raw_name, raw_dept, status, checked_in_at, ics_role, released_at, tag_ref, resource_id').single()
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true, entry: row }
}

// Moving a person individually is a deliberate split from their resource/crew —
// clears resource_id so they're no longer implicitly dragged along when that
// resource later moves lanes. Moving the resource itself (moveResourceToLane)
// is the "whole unit moves together" path.
export async function movePersonToLane(entryId: string, laneId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_entries').update({ lane_id: laneId, resource_id: null }).eq('id', entryId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

// ─── Resource actions ─────────────────────────────────────────────────────────

export async function checkInResource(
  boardId: string,
  laneId: string | null,
  apparatusId: string | null,
  description: string | null,
  agency: string | null,
  kind: string | null,
  typeTier: string | null = null,
) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!apparatusId && !description) return { error: 'Must provide apparatus or a description.' }

  const { data: row, error: dbErr } = await ctx.adminClient
    .from('accountability_resources')
    .insert({ board_id: boardId, lane_id: laneId, apparatus_id: apparatusId, raw_description: description, raw_agency: agency, kind, type_tier: typeTier, created_by: ctx.me.id })
    .select('id, lane_id, apparatus_id, raw_description, raw_agency, kind, type_tier, status, checked_in_at, released_at').single()
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true, resource: row }
}

// Moves the resource and cascades to every crew member still attached to it —
// the "whole unit moves together" mechanic. Anyone previously detached (moved
// individually) doesn't move, since their resource_id is already null.
export async function moveResourceToLane(resourceId: string, laneId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_resources').update({ lane_id: laneId }).eq('id', resourceId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  const { error: crewErr } = await ctx.adminClient
    .from('accountability_entries').update({ lane_id: laneId }).eq('resource_id', resourceId)
  if (crewErr) { await logError(crewErr.message, '/accountability'); return { error: crewErr.message } }
  return { success: true }
}

export async function releaseResource(resourceId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_resources').update({ status: 'released', released_at: new Date().toISOString() }).eq('id', resourceId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

export async function attachPersonnelToResource(entryId: string, resourceId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { data: resourceRows } = await ctx.adminClient
    .from('accountability_resources').select('lane_id').eq('id', resourceId)
  const laneId = resourceRows?.[0]?.lane_id ?? null
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_entries').update({ resource_id: resourceId, lane_id: laneId }).eq('id', entryId)
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

// A quick-tag entry (typed name, no personnel_id) is later confirmed to be the same person as
// a real-card scan — link it in place instead of leaving two rows for one person on the board.
export async function linkAccountabilityEntryToPersonnel(entryId: string, personnelId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_entries')
    .update({ personnel_id: personnelId, raw_name: null, raw_dept: null, status: 'on_scene', released_at: null })
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

export async function releaseAccountabilityEntry(entryId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_entries')
    .update({ status: 'released', released_at: new Date().toISOString() })
    .eq('id', entryId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

export async function reactivateAccountabilityEntry(entryId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_entries')
    .update({ status: 'on_scene', released_at: null })
    .eq('id', entryId)
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
  fields: { objectives?: string | null; safety_message?: string | null; weather?: string | null; is_active_violence?: boolean; nims_mode?: boolean }
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

  // Switching a mode on shouldn't leave a board stuck with only whatever
  // fire-flavored preset lanes it started with — ensure that mode's lane profile
  // exists (additive only, never touches or removes existing lanes). Uses the
  // department's own customized profile if they've set one up, otherwise the
  // built-in preset.
  if (fields.nims_mode === true) await ensureModeLaneProfile(ctx.adminClient, boardId, ctx.dept.department_id, 'ics', ICS_MODE_LANES)
  if (fields.is_active_violence === true) await ensureModeLaneProfile(ctx.adminClient, boardId, ctx.dept.department_id, 'active_violence', ACTIVE_VIOLENCE_LANES)

  return { success: true }
}

async function ensureModeLaneProfile(
  adminClient: ReturnType<typeof createAdminClient>,
  boardId: string,
  departmentId: string,
  profile: 'ics' | 'active_violence',
  builtInPreset: string[],
) {
  const { data: customTemplates } = await adminClient
    .from('accountability_lane_templates')
    .select('name').eq('department_id', departmentId).eq('profile', profile).eq('active', true)
  const laneNames = customTemplates && customTemplates.length > 0
    ? customTemplates.map(t => t.name)
    : builtInPreset

  const { data: existingLanes } = await adminClient
    .from('accountability_lanes').select('name').eq('board_id', boardId)
  const existingNames = new Set((existingLanes ?? []).map(l => l.name.trim().toLowerCase()))
  const { data: maxSort } = await adminClient
    .from('accountability_lanes').select('sort_order').eq('board_id', boardId).order('sort_order', { ascending: false }).limit(1)
  let nextOrder = (maxSort?.[0]?.sort_order ?? -1) + 1
  const toAdd = laneNames.filter(n => !existingNames.has(n.toLowerCase()))
  if (toAdd.length > 0) {
    await adminClient.from('accountability_lanes').insert(
      toAdd.map(name => ({ board_id: boardId, name, sort_order: nextOrder++, profile }))
    )
  }
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

// Renames a live lane in place — entries reference lane_id, not the name, so
// whoever's already checked in stays put. This is the NIMS-mode mechanic: relabel
// "Interior Attack" to "Division A" without resetting anyone's assignment.
export async function renameLane(laneId: string, name: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!isOfficerOrAdmin(ctx.dept.system_role)) return { error: 'Officer or admin only.' }
  if (!name.trim()) return { error: 'Name is required.' }

  const { data: laneRows } = await ctx.adminClient
    .from('accountability_lanes').select('board_id').eq('id', laneId)
  const boardId = laneRows?.[0]?.board_id
  if (!boardId) return { error: 'Lane not found.' }

  const { data: boardRows } = await ctx.adminClient
    .from('accountability_boards').select('department_id').eq('id', boardId)
  if (boardRows?.[0]?.department_id !== ctx.dept.department_id) return { error: 'Not authorized.' }

  const { error: dbErr } = await ctx.adminClient
    .from('accountability_lanes').update({ name: name.trim() }).eq('id', laneId)
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

// Captures a formatted stamp of who is currently assigned where (lane-by-lane,
// released entries excluded — this is "what's happening right now", not a historical
// record) into the same activity log a manual note goes into. This is the ICS 214
// entry point: hit it whenever assignments change, and the log builds a chronological
// trail of the board's state across the incident without anyone typing it out by hand.
// laneId narrows the stamp to one lane — a supervisor logging their own unit's 214
// only stamps who's currently reporting to them, tagged so the activity log can be
// filtered back down to just that lane later. Omit it for the old incident-wide stamp.
export async function logBoardStamp(boardId: string, manualNote?: string, laneId?: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }

  const { data: lanes } = await ctx.adminClient
    .from('accountability_lanes').select('id, name, sort_order').eq('board_id', boardId).order('sort_order')
  let entriesQuery = ctx.adminClient
    .from('accountability_entries')
    .select('personnel_id, raw_name, lane_id, ics_role')
    .eq('board_id', boardId)
    .is('released_at', null)
  if (laneId) entriesQuery = entriesQuery.eq('lane_id', laneId)
  const { data: entries } = await entriesQuery

  const personnelIds = [...new Set((entries ?? []).map(e => e.personnel_id).filter(Boolean))] as string[]
  const { data: personnelRaw } = personnelIds.length > 0
    ? await ctx.adminClient.from('personnel').select('id, first_name, last_name').in('id', personnelIds)
    : { data: [] }
  const nameById = Object.fromEntries((personnelRaw ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))
  const laneNameById = Object.fromEntries((lanes ?? []).map(l => [l.id, l.name]))

  const byLane: Record<string, string[]> = {}
  for (const e of entries ?? []) {
    const laneLabel = e.lane_id ? (laneNameById[e.lane_id] ?? 'Unassigned') : 'Unassigned'
    const name = e.personnel_id ? (nameById[e.personnel_id] ?? '—') : (e.raw_name ?? '—')
    const label = e.ics_role ? `${name} (${icsRoleLabel(e.ics_role)})` : name
    byLane[laneLabel] = byLane[laneLabel] ?? []
    byLane[laneLabel].push(label)
  }

  const laneOrder = laneId ? [laneNameById[laneId] ?? 'Unassigned'] : [...(lanes ?? []).map(l => l.name), 'Unassigned']
  const seen = new Set<string>()
  const parts: string[] = []
  for (const laneName of laneOrder) {
    if (seen.has(laneName)) continue
    seen.add(laneName)
    const people = byLane[laneName]
    if (people && people.length > 0) parts.push(`${laneName}: ${people.join(', ')}`)
  }
  const stampText = laneId
    ? `ICS 214 stamp — ${parts.length > 0 ? parts[0] : `${laneNameById[laneId] ?? 'Lane'}: no one currently assigned`}`
    : `ICS 214 stamp — ${parts.length > 0 ? parts.join(' · ') : 'no one currently on scene'}`
  const note = manualNote?.trim() ? `${manualNote.trim()} — ${stampText}` : stampText

  const { data: row, error: dbErr } = await ctx.adminClient
    .from('accountability_activity_log')
    .insert({ board_id: boardId, author_personnel_id: ctx.me.id, note, lane_id: laneId ?? null })
    .select('id, entry_time, note, author_personnel_id, lane_id')
    .single()
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  revalidatePath(`/accountability/${boardId}`)
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
