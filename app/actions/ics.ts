'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

async function getContext() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx || !ctx.departmentId) return null
  const adminClient = createAdminClient()
  return {
    personnelId: ctx.personnelId,
    departmentId: ctx.departmentId,
    systemRole: ctx.systemRole,
    adminClient,
    fullCtx: ctx,
  }
}

// A department has standing access to an incident if it's an active participant
// or holds jurisdiction over the incident's current owning department.
async function hasStandingAccess(adminClient: ReturnType<typeof createAdminClient>, icsIncidentId: string, departmentId: string) {
  const { data: incident } = await adminClient
    .from('ics_incidents').select('department_id').eq('id', icsIncidentId).single()
  if (!incident) return false
  if (incident.department_id === departmentId) return true

  const { data: participant } = await adminClient
    .from('ics_incident_participants')
    .select('id').eq('ics_incident_id', icsIncidentId).eq('department_id', departmentId).maybeSingle()
  if (participant) return true

  const { data: jurisdiction } = await adminClient
    .from('department_jurisdictions')
    .select('id').eq('parent_department_id', departmentId).eq('child_department_id', incident.department_id).maybeSingle()
  return !!jurisdiction
}

// ─── Incident lifecycle ───────────────────────────────────────────────────────

export async function createIcsIncident(
  title: string,
  linkedIncidentId?: string | null,
  linkedAccountabilityBoardId?: string | null,
) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!(await hasPermission(ctx.fullCtx, 'manage_ics_incidents'))) return { error: 'Officer or admin only.' }
  if (!title.trim()) return { error: 'Title is required.' }

  const { data: incident, error: dbErr } = await ctx.adminClient
    .from('ics_incidents')
    .insert({
      department_id: ctx.departmentId,
      linked_incident_id: linkedIncidentId || null,
      linked_accountability_board_id: linkedAccountabilityBoardId || null,
      title: title.trim(),
      created_by: ctx.personnelId,
    })
    .select('id').single()
  if (dbErr) { await logError(dbErr.message, '/ics'); return { error: dbErr.message } }

  const { error: partErr } = await ctx.adminClient
    .from('ics_incident_participants')
    .insert({ ics_incident_id: incident.id, department_id: ctx.departmentId, added_by: ctx.personnelId })
  if (partErr) { await logError(partErr.message, '/ics'); return { error: partErr.message } }

  revalidatePath('/ics')
  return { success: true, id: incident.id as string }
}

export async function addParticipant(icsIncidentId: string, departmentId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const allowed = await hasStandingAccess(ctx.adminClient, icsIncidentId, ctx.departmentId)
  if (!allowed || !(await hasPermission(ctx.fullCtx, 'manage_ics_incidents'))) return { error: 'Not authorized on this incident.' }

  const { error: dbErr } = await ctx.adminClient
    .from('ics_incident_participants')
    .insert({ ics_incident_id: icsIncidentId, department_id: departmentId, added_by: ctx.personnelId })
  if (dbErr) { await logError(dbErr.message, '/ics'); return { error: dbErr.message } }
  revalidatePath(`/ics/${icsIncidentId}`)
  return { success: true }
}

// A participant closes only their own portion. If no other participant is still
// active, the incident's overall status is derived closed as a side effect.
export async function closeParticipantPortion(icsIncidentId: string, departmentId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (ctx.departmentId !== departmentId) return { error: 'You can only close your own department\'s portion.' }
  if (!(await hasPermission(ctx.fullCtx, 'manage_ics_incidents'))) return { error: 'Officer or admin only.' }

  const { error: dbErr } = await ctx.adminClient
    .from('ics_incident_participants')
    .update({ status: 'closed', closed_by: ctx.personnelId, closed_at: new Date().toISOString() })
    .eq('ics_incident_id', icsIncidentId).eq('department_id', departmentId)
  if (dbErr) { await logError(dbErr.message, '/ics'); return { error: dbErr.message } }

  const { data: stillActive } = await ctx.adminClient
    .from('ics_incident_participants')
    .select('id').eq('ics_incident_id', icsIncidentId).eq('status', 'active')
  if (!stillActive || stillActive.length === 0) {
    await ctx.adminClient.from('ics_incidents').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', icsIncidentId)
  }
  revalidatePath(`/ics/${icsIncidentId}`)
  return { success: true }
}

// EM jurisdiction override — can reopen regardless of derived closed status.
export async function reopenIcsIncident(icsIncidentId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { data: incident } = await ctx.adminClient.from('ics_incidents').select('department_id').eq('id', icsIncidentId).single()
  if (!incident) return { error: 'Incident not found.' }
  const { data: jurisdiction } = await ctx.adminClient
    .from('department_jurisdictions')
    .select('id').eq('parent_department_id', ctx.departmentId).eq('child_department_id', incident.department_id).maybeSingle()
  if (!jurisdiction && incident.department_id !== ctx.departmentId) return { error: 'Not authorized to reopen this incident.' }

  const { error: dbErr } = await ctx.adminClient.from('ics_incidents').update({ status: 'open', updated_at: new Date().toISOString() }).eq('id', icsIncidentId)
  if (dbErr) { await logError(dbErr.message, '/ics'); return { error: dbErr.message } }
  revalidatePath(`/ics/${icsIncidentId}`)
  return { success: true }
}

// Permanent, admin-only, and only by the current owning department (per Transfer of Command --
// whoever currently owns the incident has full authority). Every child table
// (ics_operational_periods -> ics_assignments/ics_resources/ics_radio_channels/
// ics_medical_plan_entries, plus ics_incident_participants/ics_command_transfers) cascades via
// FK, so nothing else to clean up here -- this is also the one thing that unblocks deleting a
// linked accountability_boards row, since that FK has no cascade in the other direction.
//
// Deliberately NOT gated on incident.status === 'closed' -- unlike a board's own status, this
// status is derived from every participant closing their portion (closeParticipantPortion), a
// separate action buried under Participants that has nothing to do with wanting to delete the
// whole incident. Requiring it first just to reach Delete was friction copied from
// deleteBoard's convention without actually applying here; admin + current-owner + the UI's own
// confirm step is already the real guard.
export async function deleteIcsIncident(icsIncidentId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!(await hasPermission(ctx.fullCtx, 'delete_ics_incidents'))) return { error: 'Admin only.' }
  const { data: incident } = await ctx.adminClient.from('ics_incidents').select('department_id').eq('id', icsIncidentId).single()
  if (!incident) return { error: 'Incident not found.' }
  if (incident.department_id !== ctx.departmentId) return { error: 'Only the department currently owning this incident can delete it.' }

  const { error: dbErr } = await ctx.adminClient.from('ics_incidents').delete().eq('id', icsIncidentId)
  if (dbErr) { await logError(dbErr.message, '/ics'); return { error: dbErr.message } }
  revalidatePath('/ics')
  return { success: true }
}

export async function transferCommand(icsIncidentId: string, toDepartmentId: string, notes?: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { data: incident } = await ctx.adminClient.from('ics_incidents').select('department_id').eq('id', icsIncidentId).single()
  if (!incident) return { error: 'Incident not found.' }
  if (incident.department_id !== ctx.departmentId) return { error: 'Only the current owning department can transfer command.' }
  if (!(await hasPermission(ctx.fullCtx, 'manage_ics_incidents'))) return { error: 'Officer or admin only.' }

  const { error: logErr } = await ctx.adminClient.from('ics_command_transfers').insert({
    ics_incident_id: icsIncidentId, from_department_id: incident.department_id, to_department_id: toDepartmentId,
    transferred_by: ctx.personnelId, notes: notes || null,
  })
  if (logErr) { await logError(logErr.message, '/ics'); return { error: logErr.message } }

  const { error: dbErr } = await ctx.adminClient.from('ics_incidents').update({ department_id: toDepartmentId, updated_at: new Date().toISOString() }).eq('id', icsIncidentId)
  if (dbErr) { await logError(dbErr.message, '/ics'); return { error: dbErr.message } }

  // Make sure the new owner has a participant row (in case it wasn't already added).
  await ctx.adminClient.from('ics_incident_participants').upsert(
    { ics_incident_id: icsIncidentId, department_id: toDepartmentId, added_by: ctx.personnelId },
    { onConflict: 'ics_incident_id,department_id', ignoreDuplicates: true },
  )

  revalidatePath(`/ics/${icsIncidentId}`)
  return { success: true }
}

// ─── Operational periods ──────────────────────────────────────────────────────

// The core snapshot mechanic: pulls current accountability board state (if linked)
// plus current incident_apparatus/incident_mutual_aid into fresh, independently
// editable rows for the new period. Never a live link back to the board.
export async function openOperationalPeriod(icsIncidentId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const allowed = await hasStandingAccess(ctx.adminClient, icsIncidentId, ctx.departmentId)
  if (!allowed || !(await hasPermission(ctx.fullCtx, 'manage_ics_incidents'))) return { error: 'Not authorized on this incident.' }

  const { data: incident } = await ctx.adminClient
    .from('ics_incidents').select('linked_accountability_board_id, linked_incident_id').eq('id', icsIncidentId).single()
  if (!incident) return { error: 'Incident not found.' }

  const { data: existingPeriods } = await ctx.adminClient
    .from('ics_operational_periods').select('period_number').eq('ics_incident_id', icsIncidentId).order('period_number', { ascending: false }).limit(1)
  const nextPeriodNumber = (existingPeriods?.[0]?.period_number ?? 0) + 1

  let objectives: string | null = null, safetyMessage: string | null = null, weather: string | null = null

  if (incident.linked_accountability_board_id) {
    const { data: board } = await ctx.adminClient
      .from('accountability_boards').select('objectives, safety_message, weather')
      .eq('id', incident.linked_accountability_board_id).single()
    objectives = board?.objectives ?? null
    safetyMessage = board?.safety_message ?? null
    weather = board?.weather ?? null
  }

  const { data: period, error: periodErr } = await ctx.adminClient
    .from('ics_operational_periods')
    .insert({
      ics_incident_id: icsIncidentId, period_number: nextPeriodNumber,
      objectives, safety_message: safetyMessage, weather, created_by: ctx.personnelId,
    })
    .select('id').single()
  if (periodErr) { await logError(periodErr.message, '/ics'); return { error: periodErr.message } }

  // Snapshot personnel from the linked board's current entries.
  if (incident.linked_accountability_board_id) {
    const { data: lanes } = await ctx.adminClient
      .from('accountability_lanes').select('id, name').eq('board_id', incident.linked_accountability_board_id)
    const laneNameById = Object.fromEntries((lanes ?? []).map(l => [l.id, l.name]))

    const { data: entries } = await ctx.adminClient
      .from('accountability_entries')
      .select('personnel_id, raw_name, raw_dept, ics_role, lane_id')
      .eq('board_id', incident.linked_accountability_board_id)
    if (entries && entries.length > 0) {
      await ctx.adminClient.from('ics_assignments').insert(entries.map(e => ({
        ics_operational_period_id: period.id,
        department_id: ctx.departmentId,
        personnel_id: e.personnel_id,
        raw_name: e.raw_name,
        raw_agency: e.raw_dept,
        ics_role: e.ics_role,
        lane_label: e.lane_id ? laneNameById[e.lane_id] ?? null : null,
      })))
    }
  }

  // Snapshot resources from the linked fire incident, if any.
  if (incident.linked_incident_id) {
    const { data: apparatusRows } = await ctx.adminClient
      .from('incident_apparatus').select('apparatus_id, role').eq('incident_id', incident.linked_incident_id)
    if (apparatusRows && apparatusRows.length > 0) {
      const apparatusIds = apparatusRows.map(a => a.apparatus_id)
      const { data: apparatusInfo } = await ctx.adminClient.from('apparatus').select('id, unit_number').in('id', apparatusIds)
      const unitNumberById = Object.fromEntries((apparatusInfo ?? []).map(a => [a.id, a.unit_number]))
      await ctx.adminClient.from('ics_resources').insert(apparatusRows.map(a => ({
        ics_operational_period_id: period.id,
        department_id: ctx.departmentId,
        apparatus_id: a.apparatus_id,
        kind: unitNumberById[a.apparatus_id] ?? null,
        lane_label: a.role ?? null,
      })))
    }
    const { data: mutualAidRows } = await ctx.adminClient
      .from('incident_mutual_aid').select('apparatus_description, external_department_name').eq('incident_id', incident.linked_incident_id)
    if (mutualAidRows && mutualAidRows.length > 0) {
      await ctx.adminClient.from('ics_resources').insert(mutualAidRows
        .filter(m => m.apparatus_description)
        .map(m => ({
          ics_operational_period_id: period.id,
          department_id: ctx.departmentId,
          raw_description: m.apparatus_description,
          raw_agency: m.external_department_name,
        })))
    }
  }

  // Snapshot the department's ICS 205/206 defaults — configured once in Dept
  // Admin, copied in per period, then independently editable from there.
  const { data: channelDefaults } = await ctx.adminClient
    .from('department_radio_channels').select('channel_name, assignment').eq('department_id', ctx.departmentId).eq('active', true).order('sort_order')
  if (channelDefaults && channelDefaults.length > 0) {
    await ctx.adminClient.from('ics_radio_channels').insert(channelDefaults.map(c => ({
      ics_operational_period_id: period.id, channel_name: c.channel_name, assignment: c.assignment,
    })))
  }

  const { data: medicalDefaults } = await ctx.adminClient
    .from('department_medical_plan_contacts').select('contact_type, name, phone, address').eq('department_id', ctx.departmentId).eq('active', true).order('sort_order')
  if (medicalDefaults && medicalDefaults.length > 0) {
    await ctx.adminClient.from('ics_medical_plan_entries').insert(medicalDefaults.map(m => ({
      ics_operational_period_id: period.id, contact_type: m.contact_type, name: m.name, phone: m.phone, address: m.address,
    })))
  }

  revalidatePath(`/ics/${icsIncidentId}`)
  return { success: true, id: period.id as string }
}

// ─── ICS 205 / 206 — period-scoped, editable after the snapshot ──────────────

export async function addRadioChannelToPeriod(periodId: string, icsIncidentId: string, channelName: string, assignment: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const allowed = await hasStandingAccess(ctx.adminClient, icsIncidentId, ctx.departmentId)
  if (!allowed) return { error: 'Not authorized on this incident.' }
  if (!channelName.trim()) return { error: 'Channel name is required.' }

  const { error: dbErr } = await ctx.adminClient
    .from('ics_radio_channels').insert({ ics_operational_period_id: periodId, channel_name: channelName.trim(), assignment: assignment.trim() || null })
  if (dbErr) { await logError(dbErr.message, '/ics'); return { error: dbErr.message } }
  revalidatePath(`/ics/${icsIncidentId}`)
  return { success: true }
}

export async function removeRadioChannelFromPeriod(id: string, icsIncidentId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const allowed = await hasStandingAccess(ctx.adminClient, icsIncidentId, ctx.departmentId)
  if (!allowed) return { error: 'Not authorized on this incident.' }
  const { error: dbErr } = await ctx.adminClient.from('ics_radio_channels').delete().eq('id', id)
  if (dbErr) { await logError(dbErr.message, '/ics'); return { error: dbErr.message } }
  revalidatePath(`/ics/${icsIncidentId}`)
  return { success: true }
}

export async function addMedicalPlanEntryToPeriod(
  periodId: string, icsIncidentId: string,
  contactType: 'hospital' | 'ambulance' | 'aid_station' | 'other', name: string, phone: string, address: string,
) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const allowed = await hasStandingAccess(ctx.adminClient, icsIncidentId, ctx.departmentId)
  if (!allowed) return { error: 'Not authorized on this incident.' }
  if (!name.trim()) return { error: 'Name is required.' }

  const { error: dbErr } = await ctx.adminClient
    .from('ics_medical_plan_entries')
    .insert({ ics_operational_period_id: periodId, contact_type: contactType, name: name.trim(), phone: phone.trim() || null, address: address.trim() || null })
  if (dbErr) { await logError(dbErr.message, '/ics'); return { error: dbErr.message } }
  revalidatePath(`/ics/${icsIncidentId}`)
  return { success: true }
}

export async function removeMedicalPlanEntryFromPeriod(id: string, icsIncidentId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const allowed = await hasStandingAccess(ctx.adminClient, icsIncidentId, ctx.departmentId)
  if (!allowed) return { error: 'Not authorized on this incident.' }
  const { error: dbErr } = await ctx.adminClient.from('ics_medical_plan_entries').delete().eq('id', id)
  if (dbErr) { await logError(dbErr.message, '/ics'); return { error: dbErr.message } }
  revalidatePath(`/ics/${icsIncidentId}`)
  return { success: true }
}

export async function updateOperationalPeriod(periodId: string, icsIncidentId: string, fields: { objectives?: string; safety_message?: string; weather?: string; narrative?: string }) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const allowed = await hasStandingAccess(ctx.adminClient, icsIncidentId, ctx.departmentId)
  if (!allowed) return { error: 'Not authorized on this incident.' }

  const { error: dbErr } = await ctx.adminClient.from('ics_operational_periods').update(fields).eq('id', periodId)
  if (dbErr) { await logError(dbErr.message, '/ics'); return { error: dbErr.message } }
  revalidatePath(`/ics/${icsIncidentId}`)
  return { success: true }
}

export async function closeOperationalPeriod(periodId: string, icsIncidentId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const allowed = await hasStandingAccess(ctx.adminClient, icsIncidentId, ctx.departmentId)
  if (!allowed || !(await hasPermission(ctx.fullCtx, 'close_ics_packets'))) return { error: 'Not authorized on this incident.' }

  const { error: dbErr } = await ctx.adminClient.from('ics_operational_periods').update({ end_at: new Date().toISOString() }).eq('id', periodId)
  if (dbErr) { await logError(dbErr.message, '/ics'); return { error: dbErr.message } }
  revalidatePath(`/ics/${icsIncidentId}`)
  return { success: true }
}

// ─── Assignments (ICS 203) and resources (ICS 204) — manual add/edit on top of the snapshot ──

export async function addAssignment(periodId: string, icsIncidentId: string, fields: { personnel_id?: string | null; raw_name?: string; raw_agency?: string; ics_role?: string; lane_label?: string }) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const allowed = await hasStandingAccess(ctx.adminClient, icsIncidentId, ctx.departmentId)
  if (!allowed) return { error: 'Not authorized on this incident.' }

  const { error: dbErr } = await ctx.adminClient.from('ics_assignments').insert({ ics_operational_period_id: periodId, department_id: ctx.departmentId, ...fields })
  if (dbErr) { await logError(dbErr.message, '/ics'); return { error: dbErr.message } }
  revalidatePath(`/ics/${icsIncidentId}`)
  return { success: true }
}

export async function removeAssignment(assignmentId: string, icsIncidentId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const allowed = await hasStandingAccess(ctx.adminClient, icsIncidentId, ctx.departmentId)
  if (!allowed) return { error: 'Not authorized on this incident.' }

  const { error: dbErr } = await ctx.adminClient.from('ics_assignments').delete().eq('id', assignmentId)
  if (dbErr) { await logError(dbErr.message, '/ics'); return { error: dbErr.message } }
  revalidatePath(`/ics/${icsIncidentId}`)
  return { success: true }
}

export async function addResource(periodId: string, icsIncidentId: string, fields: { apparatus_id?: string | null; kind?: string; raw_description?: string; raw_agency?: string; lane_label?: string; status?: string }) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const allowed = await hasStandingAccess(ctx.adminClient, icsIncidentId, ctx.departmentId)
  if (!allowed) return { error: 'Not authorized on this incident.' }

  const { error: dbErr } = await ctx.adminClient.from('ics_resources').insert({ ics_operational_period_id: periodId, department_id: ctx.departmentId, ...fields })
  if (dbErr) { await logError(dbErr.message, '/ics'); return { error: dbErr.message } }
  revalidatePath(`/ics/${icsIncidentId}`)
  return { success: true }
}

export async function removeResource(resourceId: string, icsIncidentId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const allowed = await hasStandingAccess(ctx.adminClient, icsIncidentId, ctx.departmentId)
  if (!allowed) return { error: 'Not authorized on this incident.' }

  const { error: dbErr } = await ctx.adminClient.from('ics_resources').delete().eq('id', resourceId)
  if (dbErr) { await logError(dbErr.message, '/ics'); return { error: dbErr.message } }
  revalidatePath(`/ics/${icsIncidentId}`)
  return { success: true }
}
