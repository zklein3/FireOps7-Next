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

// ─── Radio channel defaults (ICS 205) ─────────────────────────────────────────

export async function addRadioChannel(departmentId: string, channelName: string, assignment: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Admin only.' }
  if (!(await hasPermission(ctx.fullCtx, 'manage_ics_defaults'))) return { error: 'Admin only.' }
  if (!channelName.trim()) return { error: 'Channel name is required.' }

  const { data: existing } = await ctx.adminClient
    .from('department_radio_channels').select('sort_order').eq('department_id', departmentId).order('sort_order', { ascending: false }).limit(1)
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

  const { error: dbErr } = await ctx.adminClient
    .from('department_radio_channels').insert({ department_id: departmentId, channel_name: channelName.trim(), assignment: assignment.trim() || null, sort_order: nextOrder })
  if (dbErr) { await logError(dbErr.message, '/dept-admin'); return { error: dbErr.message } }
  revalidatePath('/dept-admin')
  return { success: true }
}

export async function toggleRadioChannel(id: string, active: boolean) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Admin only.' }
  if (!(await hasPermission(ctx.fullCtx, 'manage_ics_defaults'))) return { error: 'Admin only.' }
  const { error: dbErr } = await ctx.adminClient.from('department_radio_channels').update({ active }).eq('id', id)
  if (dbErr) { await logError(dbErr.message, '/dept-admin'); return { error: dbErr.message } }
  revalidatePath('/dept-admin')
  return { success: true }
}

// ─── Medical plan contact defaults (ICS 206) ──────────────────────────────────

export async function addMedicalPlanContact(
  departmentId: string,
  contactType: 'hospital' | 'ambulance' | 'aid_station' | 'other',
  name: string, phone: string, address: string,
) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Admin only.' }
  if (!(await hasPermission(ctx.fullCtx, 'manage_ics_defaults'))) return { error: 'Admin only.' }
  if (!name.trim()) return { error: 'Name is required.' }

  const { data: existing } = await ctx.adminClient
    .from('department_medical_plan_contacts').select('sort_order').eq('department_id', departmentId).order('sort_order', { ascending: false }).limit(1)
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

  const { error: dbErr } = await ctx.adminClient
    .from('department_medical_plan_contacts')
    .insert({ department_id: departmentId, contact_type: contactType, name: name.trim(), phone: phone.trim() || null, address: address.trim() || null, sort_order: nextOrder })
  if (dbErr) { await logError(dbErr.message, '/dept-admin'); return { error: dbErr.message } }
  revalidatePath('/dept-admin')
  return { success: true }
}

export async function toggleMedicalPlanContact(id: string, active: boolean) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Admin only.' }
  if (!(await hasPermission(ctx.fullCtx, 'manage_ics_defaults'))) return { error: 'Admin only.' }
  const { error: dbErr } = await ctx.adminClient.from('department_medical_plan_contacts').update({ active }).eq('id', id)
  if (dbErr) { await logError(dbErr.message, '/dept-admin'); return { error: dbErr.message } }
  revalidatePath('/dept-admin')
  return { success: true }
}
