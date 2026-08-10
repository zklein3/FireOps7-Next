'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

async function getContext() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return null
  return {
    me: { id: ctx.personnelId, is_sys_admin: ctx.isSysAdmin },
    department_id: ctx.departmentId,
    system_role: ctx.systemRole,
    isOfficerOrAbove: await hasPermission(ctx, 'manage_incidents'),
  }
}

// ─── Create incident ──────────────────────────────────────────────────────────
export async function createIncident(formData: FormData) {
  const ctx = await getContext()
  if (!ctx || !ctx.department_id) return { error: 'Unauthorized' }

  const incident_type = formData.get('incident_type') as string
  const fire_subtype = formData.get('fire_subtype') as string | null
  const isFireType = incident_type === 'fire'

  const incidentData: Record<string, unknown> = {
    department_id: ctx.department_id,
    incident_number: (formData.get('incident_number') as string)?.trim() || null,
    cad_number: (formData.get('cad_number') as string)?.trim() || null,
    incident_date: formData.get('incident_date') as string,
    incident_type,
    fire_subtype: isFireType ? fire_subtype || null : null,
    address: (formData.get('address') as string)?.trim() || null,
    city: (formData.get('city') as string)?.trim() || null,
    state: (formData.get('state') as string)?.trim().toUpperCase() || null,
    zip: (formData.get('zip') as string)?.trim() || null,
    mutual_aid_direction: (formData.get('mutual_aid_direction') as string) || null,
    mutual_aid_department: (formData.get('mutual_aid_department') as string)?.trim() || null,
    call_time: (formData.get('call_time') as string) || null,
    paged_at: (formData.get('paged_at') as string) || null,
    first_enroute_at: (formData.get('first_enroute_at') as string) || null,
    first_on_scene_at: (formData.get('first_on_scene_at') as string) || null,
    last_leaving_scene_at: (formData.get('last_leaving_scene_at') as string) || null,
    in_service_at: (formData.get('in_service_at') as string) || null,
    disposition: (formData.get('disposition') as string)?.trim() || null,
    narrative: (formData.get('narrative') as string)?.trim() || null,
    neris_reported: formData.get('neris_reported') === 'true',
    status: 'pending',
    created_by: ctx.me.id,
  }

  const adminClient = createAdminClient()
  const { data: incident, error: dbErr } = await adminClient
    .from('incidents')
    .insert(incidentData)
    .select('id')
    .single()

  if (dbErr) {
    await logError(dbErr.message, 'createIncident', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  // Fire details
  if (isFireType) {
    const fireData = {
      incident_id: incident.id,
      property_type: (formData.get('property_type') as string)?.trim() || null,
      dollar_loss: formData.get('dollar_loss') ? parseFloat(formData.get('dollar_loss') as string) : null,
      cause_of_fire: (formData.get('cause_of_fire') as string)?.trim() || null,
      injuries_civilian: parseInt(formData.get('injuries_civilian') as string) || 0,
      injuries_firefighter: parseInt(formData.get('injuries_firefighter') as string) || 0,
      fatalities: parseInt(formData.get('fatalities') as string) || 0,
      vehicle_info: (formData.get('vehicle_info') as string)?.trim() || null,
      insurance_info: (formData.get('insurance_info') as string)?.trim() || null,
    }
    const { error: fireErr } = await adminClient.from('incident_fire_details').insert(fireData)
    if (fireErr) await logError(fireErr.message, 'createIncident:fireDetails', { personnel_id: ctx.me.id })
  }

  revalidatePath('/incidents')
  return { success: true, id: incident.id }
}

// ─── Update incident ──────────────────────────────────────────────────────────
export async function updateIncident(incident_id: string, formData: FormData) {
  const ctx = await getContext()
  if (!ctx || !ctx.department_id) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()

  // Verify this incident belongs to the user's dept
  const { data: existing } = await adminClient
    .from('incidents')
    .select('id, department_id, status, incident_type')
    .eq('id', incident_id)
    .single()

  if (!existing || existing.department_id !== ctx.department_id) return { error: 'Not found' }
  if (existing.status === 'finalized' && !ctx.isOfficerOrAbove) return { error: 'Unauthorized' }

  const incident_type = formData.get('incident_type') as string
  const isFireType = incident_type === 'fire'

  const updates: Record<string, unknown> = {
    incident_number: (formData.get('incident_number') as string)?.trim() || null,
    cad_number: (formData.get('cad_number') as string)?.trim() || null,
    incident_date: formData.get('incident_date') as string,
    incident_type,
    fire_subtype: isFireType ? (formData.get('fire_subtype') as string) || null : null,
    address: (formData.get('address') as string)?.trim() || null,
    city: (formData.get('city') as string)?.trim() || null,
    state: (formData.get('state') as string)?.trim().toUpperCase() || null,
    zip: (formData.get('zip') as string)?.trim() || null,
    mutual_aid_direction: (formData.get('mutual_aid_direction') as string) || null,
    mutual_aid_department: (formData.get('mutual_aid_department') as string)?.trim() || null,
    call_time: (formData.get('call_time') as string) || null,
    paged_at: (formData.get('paged_at') as string) || null,
    first_on_scene_at: (formData.get('first_on_scene_at') as string) || null,
    last_leaving_scene_at: (formData.get('last_leaving_scene_at') as string) || null,
    in_service_at: (formData.get('in_service_at') as string) || null,
    disposition: (formData.get('disposition') as string)?.trim() || null,
    narrative: (formData.get('narrative') as string)?.trim() || null,
    neris_reported: formData.get('neris_reported') === 'true',
    updated_at: new Date().toISOString(),
  }

  const { error: dbErr } = await adminClient
    .from('incidents')
    .update(updates)
    .eq('id', incident_id)

  if (dbErr) {
    await logError(dbErr.message, 'updateIncident', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  // Upsert fire details
  if (isFireType) {
    const fireData = {
      incident_id,
      property_type: (formData.get('property_type') as string)?.trim() || null,
      dollar_loss: formData.get('dollar_loss') ? parseFloat(formData.get('dollar_loss') as string) : null,
      cause_of_fire: (formData.get('cause_of_fire') as string)?.trim() || null,
      injuries_civilian: parseInt(formData.get('injuries_civilian') as string) || 0,
      injuries_firefighter: parseInt(formData.get('injuries_firefighter') as string) || 0,
      fatalities: parseInt(formData.get('fatalities') as string) || 0,
      vehicle_info: (formData.get('vehicle_info') as string)?.trim() || null,
      insurance_info: (formData.get('insurance_info') as string)?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    await adminClient.from('incident_fire_details').upsert(fireData, { onConflict: 'incident_id' })
  } else {
    // Remove fire details if type changed away from fire
    await adminClient.from('incident_fire_details').delete().eq('incident_id', incident_id)
  }

  revalidatePath('/incidents')
  revalidatePath(`/incidents/${incident_id}`)
  return { success: true }
}

// ─── Finalize / un-finalize incident (officer+) ───────────────────────────────
export async function setIncidentStatus(incident_id: string, status: 'pending' | 'finalized') {
  const ctx = await getContext()
  if (!ctx || !ctx.isOfficerOrAbove) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient
    .from('incidents')
    .update({
      status,
      finalized_by: status === 'finalized' ? ctx.me.id : null,
      finalized_at: status === 'finalized' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', incident_id)
    .eq('department_id', ctx.department_id)

  if (dbErr) {
    await logError(dbErr.message, 'setIncidentStatus', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  revalidatePath('/incidents')
  revalidatePath(`/incidents/${incident_id}`)
  return { success: true }
}

// ─── Apparatus on incident ────────────────────────────────────────────────────
async function syncFirstEnroute(incident_id: string, adminClient: ReturnType<typeof createAdminClient>) {
  const { data: rows } = await adminClient
    .from('incident_apparatus')
    .select('enroute_at')
    .eq('incident_id', incident_id)
    .not('enroute_at', 'is', null)
    .order('enroute_at', { ascending: true })
    .limit(1)
  const first = rows?.[0]?.enroute_at ?? null
  await adminClient.from('incidents').update({ first_enroute_at: first }).eq('id', incident_id)
}

export async function addIncidentApparatus(incident_id: string, formData: FormData) {
  const ctx = await getContext()
  if (!ctx || !ctx.department_id) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('incident_apparatus').insert({
    incident_id,
    apparatus_id: formData.get('apparatus_id') as string,
    role: (formData.get('role') as string) || 'primary',
    paged_at: (formData.get('paged_at') as string) || null,
    enroute_at: (formData.get('enroute_at') as string) || null,
    on_scene_at: (formData.get('on_scene_at') as string) || null,
    leaving_scene_at: (formData.get('leaving_scene_at') as string) || null,
    available_at: (formData.get('available_at') as string) || null,
  })

  if (dbErr) {
    await logError(dbErr.message, 'addIncidentApparatus', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  await syncFirstEnroute(incident_id, adminClient)
  revalidatePath(`/incidents/${incident_id}`)
  return { success: true }
}

export async function updateIncidentApparatus(apparatus_log_id: string, incident_id: string, formData: FormData) {
  const ctx = await getContext()
  if (!ctx || !ctx.department_id) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('incident_apparatus').update({
    role: (formData.get('role') as string) || 'primary',
    paged_at: (formData.get('paged_at') as string) || null,
    enroute_at: (formData.get('enroute_at') as string) || null,
    on_scene_at: (formData.get('on_scene_at') as string) || null,
    leaving_scene_at: (formData.get('leaving_scene_at') as string) || null,
    available_at: (formData.get('available_at') as string) || null,
  }).eq('id', apparatus_log_id)

  if (dbErr) {
    await logError(dbErr.message, 'updateIncidentApparatus', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  await syncFirstEnroute(incident_id, adminClient)
  revalidatePath(`/incidents/${incident_id}`)
  return { success: true }
}

export async function removeIncidentApparatus(apparatus_log_id: string, incident_id: string) {
  const ctx = await getContext()
  if (!ctx || !ctx.isOfficerOrAbove) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('incident_apparatus').delete().eq('id', apparatus_log_id)

  if (dbErr) {
    await logError(dbErr.message, 'removeIncidentApparatus', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  await syncFirstEnroute(incident_id, adminClient)
  revalidatePath(`/incidents/${incident_id}`)
  return { success: true }
}

// ─── Personnel on incident ────────────────────────────────────────────────────
export async function addIncidentPersonnel(incident_id: string, formData: FormData) {
  const ctx = await getContext()
  if (!ctx || !ctx.department_id) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  const { error: dbErr } = await adminClient.from('incident_personnel').insert({
    incident_id,
    personnel_id: formData.get('personnel_id') as string,
    apparatus_id: (formData.get('apparatus_id') as string) || null,
    role: (formData.get('role') as string) || 'crew',
    status: 'present',
    submitted_by: ctx.me.id,
    verified_by: ctx.me.id,
    verified_at: now,
  })

  if (dbErr) {
    await logError(dbErr.message, 'addIncidentPersonnel', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  revalidatePath(`/incidents/${incident_id}`)
  return { success: true }
}

// ─── Update personnel assignment ─────────────────────────────────────────────
export async function updateIncidentPersonnel(personnel_log_id: string, incident_id: string, formData: FormData) {
  const ctx = await getContext()
  if (!ctx || !ctx.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()
  const apparatusId = (formData.get('apparatus_id') as string) || null
  const role = (formData.get('role') as string) || 'crew'

  const { data: incident } = await adminClient
    .from('incidents')
    .select('id, department_id')
    .eq('id', incident_id)
    .single()

  if (!incident || incident.department_id !== ctx.department_id) return { error: 'Incident not found.' }

  const { data: personnelLog } = await adminClient
    .from('incident_personnel')
    .select('id')
    .eq('id', personnel_log_id)
    .eq('incident_id', incident_id)
    .single()

  if (!personnelLog) return { error: 'Personnel record not found.' }

  if (apparatusId) {
    const { data: apparatusLog } = await adminClient
      .from('incident_apparatus')
      .select('id')
      .eq('incident_id', incident_id)
      .eq('apparatus_id', apparatusId)
      .single()

    if (!apparatusLog) return { error: 'That unit is not assigned to this incident yet.' }
  }

  const { error: dbErr } = await adminClient.from('incident_personnel').update({
    apparatus_id: apparatusId,
    role,
  }).eq('id', personnel_log_id)

  if (dbErr) {
    await logError(dbErr.message, 'updateIncidentPersonnel', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  revalidatePath(`/incidents/${incident_id}`)
  revalidatePath(`/incidents/${incident_id}/neris`)
  return { success: true }
}

// ─── Member self-log onto an incident ────────────────────────────────────────
export async function logIncidentAttendance(incident_id: string, role: string) {
  const ctx = await getContext()
  if (!ctx || !ctx.department_id) return { error: 'Not authenticated.' }

  const adminClient = createAdminClient()

  // Verify incident belongs to member's dept and is not finalized
  const { data: incidentList } = await adminClient
    .from('incidents')
    .select('id, incident_date, status, department_id')
    .eq('id', incident_id)
  const incident = incidentList?.[0]
  if (!incident || incident.department_id !== ctx.department_id) return { error: 'Incident not found.' }

  // 7-day self-log window from incident date
  const windowClose = new Date(new Date(incident.incident_date + 'T23:59:59').getTime() + 7 * 24 * 60 * 60 * 1000)
  if (new Date() > windowClose) return { error: 'Self-log window has closed (7 days after incident).' }

  // No duplicate records
  const { data: existing } = await adminClient
    .from('incident_personnel')
    .select('id')
    .eq('incident_id', incident_id)
    .eq('personnel_id', ctx.me.id)
  if (existing && existing.length > 0) return { error: 'You have already logged onto this incident.' }

  const now = new Date().toISOString()
  const autoVerify = ctx.isOfficerOrAbove
  const { error: dbErr } = await adminClient.from('incident_personnel').insert({
    incident_id,
    personnel_id: ctx.me.id,
    role: role || 'crew',
    status: autoVerify ? 'present' : 'pending',
    submitted_by: ctx.me.id,
    ...(autoVerify ? { verified_by: ctx.me.id, verified_at: now } : {}),
  })

  if (dbErr) {
    await logError(dbErr.message, 'logIncidentAttendance', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  revalidatePath(`/incidents/${incident_id}`)
  revalidatePath('/incidents')
  revalidatePath('/reports/my-activity')
  return { success: true }
}

export async function verifyIncidentPersonnel(
  personnel_log_id: string,
  incident_id: string,
  status: 'present' | 'absent',
  rejection_reason?: string
) {
  const ctx = await getContext()
  if (!ctx || !ctx.isOfficerOrAbove) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('incident_personnel').update({
    status,
    rejection_reason: status === 'absent' ? (rejection_reason ?? null) : null,
    verified_by: ctx.me.id,
    verified_at: new Date().toISOString(),
  }).eq('id', personnel_log_id)

  if (dbErr) {
    await logError(dbErr.message, 'verifyIncidentPersonnel', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  revalidatePath(`/incidents/${incident_id}`)
  revalidatePath('/reports/my-activity')
  return { success: true }
}

export async function removeIncidentPersonnel(personnel_log_id: string, incident_id: string) {
  const ctx = await getContext()
  if (!ctx || !ctx.isOfficerOrAbove) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('incident_personnel').delete().eq('id', personnel_log_id)

  if (dbErr) {
    await logError(dbErr.message, 'removeIncidentPersonnel', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  revalidatePath(`/incidents/${incident_id}`)
  return { success: true }
}
