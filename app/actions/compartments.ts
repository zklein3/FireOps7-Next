'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

// Sys admin passes department_id explicitly since they have no dept record
async function verifyAdmin(override_department_id?: string) {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return null

  // Sys admin — use the override department_id passed from the form
  if (ctx.isSysAdmin) {
    if (!override_department_id) return null
    return { me: { id: ctx.personnelId, is_sys_admin: true }, department_id: override_department_id }
  }

  // Regular dept admin — respect the currently selected department
  if (!ctx.departmentId || !(await hasPermission(ctx, 'manage_dept_setup'))) return null

  return { me: { id: ctx.personnelId, is_sys_admin: false }, department_id: ctx.departmentId }
}

// ─── Create Compartment Name ──────────────────────────────────────────────────
export async function createCompartmentName(formData: FormData) {
  const override_department_id = formData.get('department_id') as string | null
  const ctx = await verifyAdmin(override_department_id ?? undefined)
  if (!ctx) return { error: 'Only admins can manage compartments.' }

  const compartment_code = (formData.get('compartment_code') as string)?.toUpperCase().trim()
  const compartment_name = formData.get('compartment_name') as string
  const sort_order = formData.get('sort_order') as string

  if (!compartment_code) return { error: 'Compartment code is required.' }

  const adminClient = createAdminClient()

  const { data: existing } = await adminClient
    .from('compartment_names')
    .select('id')
    .eq('department_id', ctx.department_id)
    .eq('compartment_code', compartment_code)

  if (existing?.[0]) return { error: `Compartment code ${compartment_code} already exists.` }

  const { error } = await adminClient.from('compartment_names').insert({
    department_id: ctx.department_id,
    compartment_code,
    compartment_name: compartment_name || null,
    sort_order: sort_order ? parseInt(sort_order) : null,
    active: true,
  })

  if (error) {
    await logError(error, '/dept-admin/setup')
    return { error: error.message }
  }

  revalidatePath('/dept-admin/setup')
  return { success: true }
}

// ─── Update Compartment Name ──────────────────────────────────────────────────
export async function updateCompartmentName(formData: FormData) {
  const override_department_id = formData.get('department_id') as string | null
  const ctx = await verifyAdmin(override_department_id ?? undefined)
  if (!ctx) return { error: 'Only admins can manage compartments.' }

  const id = formData.get('id') as string
  const compartment_code = (formData.get('compartment_code') as string)?.toUpperCase().trim()
  const compartment_name = formData.get('compartment_name') as string
  const sort_order = formData.get('sort_order') as string
  const active = formData.get('active') === 'true'

  if (!compartment_code) return { error: 'Compartment code is required.' }

  const adminClient = createAdminClient()

  const { error } = await adminClient.from('compartment_names').update({
    compartment_code,
    compartment_name: compartment_name || null,
    sort_order: sort_order ? parseInt(sort_order) : null,
    active,
  }).eq('id', id)

  if (error) {
    await logError(error, '/dept-admin/setup')
    return { error: error.message }
  }

  revalidatePath('/apparatus')
  revalidatePath('/dept-admin/setup')
  return { success: true }
}

// ─── Assign Compartment to Apparatus ─────────────────────────────────────────
export async function assignCompartmentToApparatus(apparatus_id: string, compartment_name_id: string, department_id?: string) {
  const ctx = await verifyAdmin(department_id)
  if (!ctx) return { error: 'Only admins can assign compartments.' }

  const adminClient = createAdminClient()

  const { data: existing } = await adminClient
    .from('apparatus_compartments')
    .select('id')
    .eq('apparatus_id', apparatus_id)
    .eq('compartment_name_id', compartment_name_id)

  if (existing?.[0]) return { error: 'This compartment is already assigned to this apparatus.' }

  const { error } = await adminClient.from('apparatus_compartments').insert({
    apparatus_id,
    compartment_name_id,
    active: true,
  })

  if (error) {
    await logError(error, '/apparatus/[id]')
    return { error: error.message }
  }

  revalidatePath(`/apparatus/${apparatus_id}`)
  return { success: true }
}

// ─── Remove Compartment from Apparatus ───────────────────────────────────────
export async function removeCompartmentFromApparatus(compartment_id: string, apparatus_id: string, department_id?: string) {
  const ctx = await verifyAdmin(department_id)
  if (!ctx) return { error: 'Only admins can remove compartments.' }

  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('apparatus_compartments')
    .delete()
    .eq('id', compartment_id)

  if (error) {
    await logError(error, '/apparatus/[id]')
    return { error: error.message }
  }

  revalidatePath(`/apparatus/${apparatus_id}`)
  return { success: true }
}

// ─── Bulk Set Compartment Apparatus Assignments ───────────────────────────────
export async function bulkSetCompartmentApparatus(
  compartment_name_id: string,
  apparatus_ids: string[],
  department_id?: string
) {
  const ctx = await verifyAdmin(department_id)
  if (!ctx) return { error: 'Only admins can assign compartments.' }

  const adminClient = createAdminClient()

  const { data: existing } = await adminClient
    .from('apparatus_compartments')
    .select('id, apparatus_id')
    .eq('compartment_name_id', compartment_name_id)

  const existingMap = new Map((existing ?? []).map(e => [e.apparatus_id, e.id]))
  const newSet = new Set(apparatus_ids)

  const toAdd = apparatus_ids.filter(id => !existingMap.has(id))
  const toRemove = (existing ?? []).filter(e => !newSet.has(e.apparatus_id))

  if (toAdd.length > 0) {
    const { error } = await adminClient.from('apparatus_compartments').insert(
      toAdd.map(apparatus_id => ({ apparatus_id, compartment_name_id, active: true }))
    )
    if (error) { await logError(error, '/dept-admin/setup'); return { error: error.message } }
  }

  if (toRemove.length > 0) {
    const { error } = await adminClient
      .from('apparatus_compartments')
      .delete()
      .in('id', toRemove.map(r => r.id))
    if (error) { await logError(error, '/dept-admin/setup'); return { error: error.message } }
  }

  revalidatePath('/apparatus')
  revalidatePath('/dept-admin/setup')
  const allAffected = new Set([...toAdd, ...toRemove.map(r => r.apparatus_id)])
  for (const id of allAffected) revalidatePath(`/apparatus/${id}`)

  return { success: true }
}

// ─── Set Compartment QR Code ──────────────────────────────────────────────────
export async function setCompartmentQrCode(compartment_id: string, apparatus_id: string, formData: FormData) {
  const ctx = await verifyAdmin()
  if (!ctx) return { error: 'Only admins can set QR codes.' }
  const adminClient = createAdminClient()
  const qr_code = (formData.get('qr_code') as string)?.toUpperCase().trim() || null
  const { error } = await adminClient
    .from('apparatus_compartments')
    .update({ qr_code })
    .eq('id', compartment_id)
  if (error) { await logError(error, `/equipment/${apparatus_id}/${compartment_id}`); return { error: error.message } }
  revalidatePath(`/equipment/${apparatus_id}/${compartment_id}`)
  return { success: true }
}
