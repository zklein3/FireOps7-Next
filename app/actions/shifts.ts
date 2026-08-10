'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

async function getContext() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx || !ctx.departmentId) return null
  return { departmentId: ctx.departmentId, systemRole: ctx.systemRole, adminClient: createAdminClient(), fullCtx: ctx }
}

export async function addShift(departmentId: string, name: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Admin only.' }
  if (!(await hasPermission(ctx.fullCtx, 'manage_attendance_settings'))) return { error: 'Admin only.' }
  if (!name.trim()) return { error: 'Name is required.' }

  const { data: existing } = await ctx.adminClient
    .from('department_shifts').select('sort_order').eq('department_id', departmentId).order('sort_order', { ascending: false }).limit(1)
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

  const { error: dbErr } = await ctx.adminClient
    .from('department_shifts').insert({ department_id: departmentId, name: name.trim(), sort_order: nextOrder })
  if (dbErr) { await logError(dbErr.message, '/dept-admin/personnel'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/personnel')
  return { success: true }
}

export async function renameShift(id: string, name: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Admin only.' }
  if (!(await hasPermission(ctx.fullCtx, 'manage_attendance_settings'))) return { error: 'Admin only.' }
  if (!name.trim()) return { error: 'Name is required.' }
  const { error: dbErr } = await ctx.adminClient.from('department_shifts').update({ name: name.trim() }).eq('id', id)
  if (dbErr) { await logError(dbErr.message, '/dept-admin/personnel'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/personnel')
  return { success: true }
}

export async function toggleShift(id: string, active: boolean) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Admin only.' }
  if (!(await hasPermission(ctx.fullCtx, 'manage_attendance_settings'))) return { error: 'Admin only.' }
  const { error: dbErr } = await ctx.adminClient.from('department_shifts').update({ active }).eq('id', id)
  if (dbErr) { await logError(dbErr.message, '/dept-admin/personnel'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/personnel')
  return { success: true }
}

export async function assignPersonnelShift(departmentPersonnelId: string, shiftId: string | null) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Admin only.' }
  if (!(await hasPermission(ctx.fullCtx, 'manage_attendance_settings'))) return { error: 'Admin only.' }
  const { error: dbErr } = await ctx.adminClient
    .from('department_personnel').update({ shift_id: shiftId }).eq('id', departmentPersonnelId).eq('department_id', ctx.departmentId)
  if (dbErr) { await logError(dbErr.message, '/dept-admin/personnel'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/personnel')
  return { success: true }
}

// Pulls everyone standing-assigned to a shift into an ICS operational period's
// assignment list as a starting draft — the forward-planning piece an incident
// snapshot alone can't provide, since those people haven't shown up yet.
export async function prefillAssignmentsFromShift(periodId: string, icsIncidentId: string, shiftId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }

  const { data: members } = await ctx.adminClient
    .from('department_personnel')
    .select('personnel_id')
    .eq('shift_id', shiftId).eq('active', true)
  if (!members || members.length === 0) return { error: 'No one is assigned to this shift.' }

  const personnelIds = members.map(m => m.personnel_id)
  const { data: personnelRaw } = await ctx.adminClient.from('personnel').select('id, first_name, last_name').in('id', personnelIds)
  const nameById = Object.fromEntries((personnelRaw ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  const rows = members.map(m => ({
    ics_operational_period_id: periodId,
    department_id: ctx.departmentId,
    personnel_id: m.personnel_id,
    raw_name: nameById[m.personnel_id] ?? null,
  }))
  const { error: dbErr } = await ctx.adminClient.from('ics_assignments').insert(rows)
  if (dbErr) { await logError(dbErr.message, `/ics/${icsIncidentId}`); return { error: dbErr.message } }
  revalidatePath(`/ics/${icsIncidentId}`)
  return { success: true, count: rows.length }
}
