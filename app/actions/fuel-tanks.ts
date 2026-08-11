'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import { logError } from '@/lib/logger'

async function getAdminCtx() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return { error: 'Not authenticated.' as string, ctx: null }
  if (!(await hasPermission(ctx, 'manage_fuel_storage'))) return { error: 'Admins only.' as string, ctx: null }
  if (!ctx.departmentId) return { error: 'No department found.' as string, ctx: null }
  return { error: null, ctx }
}

function revalidateFuelPaths() {
  revalidatePath('/dept-admin/fuel-tanks')
  revalidatePath('/fuel')
}

export async function receiveFuelDelivery(formData: FormData) {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx || !ctx.departmentId) return { error: 'Not authenticated.' }

  const tank_id = formData.get('tank_id') as string
  const delivery_date = formData.get('delivery_date') as string
  const gallons = parseFloat(formData.get('gallons') as string)
  const rawCPG = formData.get('cost_per_gallon') as string
  const rawTotal = formData.get('total_cost') as string
  const vendor = (formData.get('vendor') as string)?.trim() || null
  const notes = (formData.get('notes') as string)?.trim() || null

  if (!tank_id) return { error: 'Tank is required.' }
  if (!delivery_date) return { error: 'Date is required.' }
  if (isNaN(gallons) || gallons <= 0) return { error: 'Gallons must be greater than 0.' }

  const admin = createAdminClient()

  // Verify tank belongs to this department
  const { data: tank } = await admin
    .from('fuel_tanks')
    .select('id, department_id')
    .eq('id', tank_id)
    .single()
  if (!tank || tank.department_id !== ctx.departmentId) return { error: 'Tank not found.' }

  const cost_per_gallon = rawCPG ? parseFloat(rawCPG) : null
  const total_cost = rawTotal ? parseFloat(rawTotal) : null

  const { error: dbErr } = await admin.from('fuel_tank_deliveries').insert({
    department_id: ctx.departmentId,
    tank_id,
    delivery_date,
    gallons,
    cost_per_gallon: cost_per_gallon != null && !isNaN(cost_per_gallon) ? cost_per_gallon : null,
    total_cost: total_cost != null && !isNaN(total_cost) ? total_cost : null,
    vendor,
    received_by_personnel_id: ctx.personnelId ?? null,
    notes,
  })

  if (dbErr) {
    await logError(dbErr.message, '/fuel')
    return { error: 'Failed to log delivery.' }
  }
  revalidateFuelPaths()
  return { success: true }
}

function parseTankForm(formData: FormData) {
  const name = (formData.get('name') as string)?.trim()
  const fuel_type = formData.get('fuel_type') as string
  const capacity_gallons = parseFloat(formData.get('capacity_gallons') as string)
  const low_level_threshold_gallons = parseFloat(formData.get('low_level_threshold_gallons') as string)
  const notes = (formData.get('notes') as string)?.trim() || null

  if (!name) return { error: 'Tank name is required.' }
  if (!['diesel', 'gasoline', 'other'].includes(fuel_type)) return { error: 'Invalid fuel type.' }
  if (isNaN(capacity_gallons) || capacity_gallons <= 0) return { error: 'Capacity must be greater than 0.' }
  if (isNaN(low_level_threshold_gallons) || low_level_threshold_gallons < 0) return { error: 'Threshold must be 0 or greater.' }

  return { error: null, fields: { name, fuel_type, capacity_gallons, low_level_threshold_gallons, notes } }
}

export async function createFuelTank(formData: FormData) {
  const { error: authErr, ctx } = await getAdminCtx()
  if (authErr || !ctx) return { error: authErr }

  const parsed = parseTankForm(formData)
  if (parsed.error) return { error: parsed.error }
  const { fields } = parsed as { error: null; fields: NonNullable<typeof parsed['fields']> }

  const admin = createAdminClient()
  const { error: dbErr } = await admin.from('fuel_tanks').insert({
    department_id: ctx.departmentId,
    ...fields,
    active: true,
  })

  if (dbErr) {
    await logError(dbErr.message, '/dept-admin/fuel-tanks')
    return { error: 'Failed to create tank.' }
  }
  revalidateFuelPaths()
  return { success: true }
}

export async function updateFuelTank(id: string, formData: FormData) {
  const { error: authErr, ctx } = await getAdminCtx()
  if (authErr || !ctx) return { error: authErr }

  const parsed = parseTankForm(formData)
  if (parsed.error) return { error: parsed.error }
  const { fields } = parsed as { error: null; fields: NonNullable<typeof parsed['fields']> }

  const admin = createAdminClient()
  const { error: dbErr } = await admin.from('fuel_tanks')
    .update(fields)
    .eq('id', id)

  if (dbErr) {
    await logError(dbErr.message, '/dept-admin/fuel-tanks')
    return { error: 'Failed to update tank.' }
  }
  revalidateFuelPaths()
  return { success: true }
}

export async function deactivateFuelTank(id: string) {
  const { error: authErr, ctx } = await getAdminCtx()
  if (authErr || !ctx) return { error: authErr }

  const admin = createAdminClient()
  const { error: dbErr } = await admin.from('fuel_tanks')
    .update({ active: false })
    .eq('id', id)

  if (dbErr) {
    await logError(dbErr.message, '/dept-admin/fuel-tanks')
    return { error: 'Failed to deactivate tank.' }
  }
  revalidateFuelPaths()
  return { success: true }
}

export async function reactivateFuelTank(id: string) {
  const { error: authErr, ctx } = await getAdminCtx()
  if (authErr || !ctx) return { error: authErr }

  const admin = createAdminClient()
  const { error: dbErr } = await admin.from('fuel_tanks')
    .update({ active: true })
    .eq('id', id)

  if (dbErr) {
    await logError(dbErr.message, '/dept-admin/fuel-tanks')
    return { error: 'Failed to reactivate tank.' }
  }
  revalidateFuelPaths()
  return { success: true }
}
