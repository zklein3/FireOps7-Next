'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

// ─── Create Apparatus (admin only) ───────────────────────────────────────────
export async function createApparatus(formData: FormData) {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return { error: 'Session expired.' }
  if (!ctx.departmentId) return { error: 'No department selected.' }
  if (!(await hasPermission(ctx, 'manage_apparatus'))) {
    return { error: 'Only admins can add apparatus.' }
  }

  const unit_number = formData.get('unit_number') as string
  const apparatus_name = formData.get('apparatus_name') as string
  const apparatus_type_id = formData.get('apparatus_type_id') as string
  const station_id = formData.get('station_id') as string
  const make = formData.get('make') as string
  const model = formData.get('model') as string
  const model_year = formData.get('model_year') as string
  const vin = formData.get('vin') as string
  const license_plate = formData.get('license_plate') as string
  const in_service_date = formData.get('in_service_date') as string

  if (!unit_number) return { error: 'Unit number is required.' }

  const { error } = await adminClient.from('apparatus').insert({
    department_id: ctx.departmentId,
    unit_number,
    apparatus_name: apparatus_name || null,
    apparatus_type_id: apparatus_type_id || null,
    station_id: station_id || null,
    make: make || null,
    model: model || null,
    model_year: model_year ? parseInt(model_year) : null,
    vin: vin || null,
    license_plate: license_plate || null,
    in_service_date: in_service_date || null,
    active: true,
  })

  if (error) {
    await logError(error, '/apparatus')
    return { error: error.message }
  }

  revalidatePath('/apparatus')
  revalidatePath('/dept-admin/setup')
  return { success: true }
}

// ─── Update Apparatus (officer + admin) ──────────────────────────────────────
export async function updateApparatus(formData: FormData) {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return { error: 'Session expired.' }
  if (!(await hasPermission(ctx, 'change_apparatus_service_status'))) {
    return { error: 'Members cannot edit apparatus.' }
  }

  const apparatus_id = formData.get('apparatus_id') as string
  const apparatus_name = formData.get('apparatus_name') as string
  const apparatus_type_id = formData.get('apparatus_type_id') as string
  const make = formData.get('make') as string
  const model = formData.get('model') as string
  const model_year = formData.get('model_year') as string
  const vin = formData.get('vin') as string
  const license_plate = formData.get('license_plate') as string
  const in_service_date = formData.get('in_service_date') as string

  // Station assignment — officer + admin
  const station_id = formData.get('station_id') as string

  // Active status + ISO exclusion + air brakes — admin only
  const isAdmin = await hasPermission(ctx, 'manage_apparatus')
  const active = isAdmin ? formData.get('active') === 'true' : undefined
  const exclude_from_iso = isAdmin ? formData.get('exclude_from_iso') === 'on' : undefined
  const has_air_brakes = isAdmin ? formData.get('has_air_brakes') === 'on' : undefined
  const has_engine_hours = isAdmin ? formData.get('has_engine_hours') === 'on' : undefined

  const qr_code = (formData.get('qr_code') as string)?.toUpperCase().trim() || null

  const updateData: Record<string, any> = {
    apparatus_name: apparatus_name || null,
    apparatus_type_id: apparatus_type_id || null,
    station_id: station_id || null,
    make: make || null,
    model: model || null,
    model_year: model_year ? parseInt(model_year) : null,
    vin: vin || null,
    license_plate: license_plate || null,
    in_service_date: in_service_date || null,
    qr_code,
  }

  if (active !== undefined) updateData.active = active
  if (exclude_from_iso !== undefined) updateData.exclude_from_iso = exclude_from_iso
  if (has_air_brakes !== undefined) updateData.has_air_brakes = has_air_brakes
  if (has_engine_hours !== undefined) updateData.has_engine_hours = has_engine_hours

  const { error } = await adminClient.from('apparatus').update(updateData).eq('id', apparatus_id)

  if (error) {
    await logError(error, `/apparatus/${apparatus_id}`)
    return { error: error.message }
  }

  revalidatePath('/apparatus')
  revalidatePath(`/apparatus/${apparatus_id}`)
  revalidatePath('/dept-admin/setup')
  return { success: true }
}
