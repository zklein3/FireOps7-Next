'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

// ─── Create Station (admin only) ─────────────────────────────────────────────
export async function createStation(formData: FormData) {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return { error: 'Session expired.' }
  if (!ctx.departmentId || !(await hasPermission(ctx, 'manage_dept_setup'))) {
    return { error: 'Only admins can add stations.' }
  }

  const station_number = formData.get('station_number') as string
  const station_name = formData.get('station_name') as string
  const address_line_1 = formData.get('address_line_1') as string
  const address_line_2 = formData.get('address_line_2') as string
  const city = formData.get('city') as string
  const state = formData.get('state') as string
  const postal_code = formData.get('postal_code') as string
  const notes = formData.get('notes') as string

  if (!station_name) return { error: 'Station name is required.' }

  const { error } = await adminClient.from('stations').insert({
    department_id: ctx.departmentId,
    station_number: station_number || null,
    station_name,
    address_line_1: address_line_1 || null,
    address_line_2: address_line_2 || null,
    city: city || null,
    state: state || null,
    postal_code: postal_code || null,
    notes: notes || null,
    active: true,
  })

  if (error) {
    await logError(error, '/stations')
    return { error: error.message }
  }

  revalidatePath('/stations')
  revalidatePath('/dept-admin/setup')
  return { success: true }
}

// ─── Update Station (admin only) ─────────────────────────────────────────────
export async function updateStation(formData: FormData) {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return { error: 'Session expired.' }
  if (!(await hasPermission(ctx, 'manage_dept_setup'))) {
    return { error: 'Only admins can edit stations.' }
  }

  const station_id = formData.get('station_id') as string
  const station_number = formData.get('station_number') as string
  const station_name = formData.get('station_name') as string
  const address_line_1 = formData.get('address_line_1') as string
  const address_line_2 = formData.get('address_line_2') as string
  const city = formData.get('city') as string
  const state = formData.get('state') as string
  const postal_code = formData.get('postal_code') as string
  const notes = formData.get('notes') as string
  const active = formData.get('active') === 'true'

  if (!station_name) return { error: 'Station name is required.' }

  const { error } = await adminClient.from('stations').update({
    station_number: station_number || null,
    station_name,
    address_line_1: address_line_1 || null,
    address_line_2: address_line_2 || null,
    city: city || null,
    state: state || null,
    postal_code: postal_code || null,
    notes: notes || null,
    active,
  }).eq('id', station_id)

  if (error) {
    await logError(error, `/stations/${station_id}`)
    return { error: error.message }
  }

  revalidatePath('/stations')
  revalidatePath(`/stations/${station_id}`)
  revalidatePath('/dept-admin/setup')
  return { success: true }
}
