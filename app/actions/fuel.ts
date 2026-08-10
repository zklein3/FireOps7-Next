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
    isOfficerOrAbove: await hasPermission(ctx, 'manage_fuel_log'),
  }
}

// ─── Log Fuel Entry ───────────────────────────────────────────────────────────
export async function logFuel(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Not authorized.' }
  const adminClient = createAdminClient()

  const apparatus_id = formData.get('apparatus_id') as string
  const fuel_date = formData.get('fuel_date') as string
  const gallons = formData.get('gallons') as string
  const cost_per_gallon = formData.get('cost_per_gallon') as string
  const total_cost = formData.get('total_cost') as string
  const fuel_type = formData.get('fuel_type') as string || 'diesel'
  const fuel_system = formData.get('fuel_system') as string || 'main'
  const aux_description = formData.get('aux_description') as string
  const odometer = formData.get('odometer') as string
  const engine_hours = formData.get('engine_hours') as string
  const vendor = formData.get('vendor') as string
  const notes = formData.get('notes') as string
  const fuel_tank_id = (formData.get('fuel_tank_id') as string | null) || null

  if (!apparatus_id) return { error: 'Apparatus is required.' }
  if (!fuel_date) return { error: 'Date is required.' }
  if (!gallons || parseFloat(gallons) <= 0) return { error: 'Gallons must be greater than 0.' }

  const { error } = await adminClient.from('apparatus_fuel_logs').insert({
    department_id: ctx.department_id,
    apparatus_id,
    logged_by_personnel_id: ctx.me.id,
    fuel_date,
    gallons: parseFloat(gallons),
    cost_per_gallon: cost_per_gallon ? parseFloat(cost_per_gallon) : null,
    total_cost: total_cost ? parseFloat(total_cost) : null,
    fuel_type,
    fuel_system,
    aux_description: fuel_system === 'auxiliary' ? (aux_description || null) : null,
    odometer: fuel_system === 'main' ? (odometer ? parseInt(odometer) : null) : null,
    engine_hours: engine_hours ? parseFloat(engine_hours) : null,
    vendor: vendor || null,
    notes: notes || null,
    fuel_tank_id,
  })

  if (error) { await logError(error.message, '/fuel'); return { error: error.message } }
  revalidatePath('/fuel')
  revalidatePath(`/equipment`)
  revalidatePath('/reports/fuel')
  return { success: true }
}

// ─── Update Fuel Entry ───────────────────────────────────────────────────────
export async function updateFuelEntry(id: string, formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can edit fuel entries.' }
  const adminClient = createAdminClient()

  const fuel_date = formData.get('fuel_date') as string
  const gallons = formData.get('gallons') as string
  const cost_per_gallon = formData.get('cost_per_gallon') as string
  const total_cost = formData.get('total_cost') as string
  const fuel_type = formData.get('fuel_type') as string || 'diesel'
  const fuel_system = formData.get('fuel_system') as string || 'main'
  const aux_description = formData.get('aux_description') as string
  const odometer = formData.get('odometer') as string
  const engine_hours = formData.get('engine_hours') as string
  const vendor = formData.get('vendor') as string
  const notes = formData.get('notes') as string
  const fuel_tank_id = (formData.get('fuel_tank_id') as string | null) || null

  if (!fuel_date) return { error: 'Date is required.' }
  if (!gallons || parseFloat(gallons) <= 0) return { error: 'Gallons must be greater than 0.' }

  const { error } = await adminClient
    .from('apparatus_fuel_logs')
    .update({
      fuel_date,
      gallons: parseFloat(gallons),
      cost_per_gallon: cost_per_gallon ? parseFloat(cost_per_gallon) : null,
      total_cost: total_cost ? parseFloat(total_cost) : null,
      fuel_type,
      fuel_system,
      aux_description: fuel_system === 'auxiliary' ? (aux_description || null) : null,
      odometer: fuel_system === 'main' ? (odometer ? parseInt(odometer) : null) : null,
      engine_hours: engine_hours ? parseFloat(engine_hours) : null,
      vendor: vendor || null,
      notes: notes || null,
      fuel_tank_id,
    })
    .eq('id', id)
    .eq('department_id', ctx.department_id!)

  if (error) { await logError(error.message, '/fuel'); return { error: error.message } }
  revalidatePath('/fuel')
  revalidatePath('/reports/fuel')
  return { success: true }
}

// ─── Delete Fuel Entry ────────────────────────────────────────────────────────
export async function deleteFuelEntry(id: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can delete fuel entries.' }
  const adminClient = createAdminClient()
  const { error } = await adminClient.from('apparatus_fuel_logs').delete().eq('id', id).eq('department_id', ctx.department_id!)
  if (error) { await logError(error.message, '/fuel'); return { error: error.message } }
  revalidatePath('/fuel')
  revalidatePath('/reports/fuel')
  return { success: true }
}
