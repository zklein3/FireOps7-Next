'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

// ─── Create Apparatus (admin only) ───────────────────────────────────────────
export async function createApparatus(formData: FormData) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) return { error: 'Could not verify your account.' }

  const { data: myDeptList } = await adminClient.from('department_personnel').select('department_id, system_role').eq('personnel_id', me.id).eq('active', true)
  const myDept = myDeptList?.[0]
  if (!myDept || (myDept.system_role !== 'admin' && !me.is_sys_admin)) {
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
    department_id: myDept.department_id,
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
  return { success: true }
}

// ─── Update Apparatus (officer + admin) ──────────────────────────────────────
export async function updateApparatus(formData: FormData) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) return { error: 'Could not verify your account.' }

  const { data: myDeptList } = await adminClient.from('department_personnel').select('system_role').eq('personnel_id', me.id).eq('active', true)
  const myDept = myDeptList?.[0]
  if (!myDept || (myDept.system_role === 'member' && !me.is_sys_admin)) {
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

  // Active status — admin only
  const isAdmin = myDept.system_role === 'admin' || me.is_sys_admin
  const active = isAdmin ? formData.get('active') === 'true' : undefined

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
  }

  if (active !== undefined) updateData.active = active

  const { error } = await adminClient.from('apparatus').update(updateData).eq('id', apparatus_id)

  if (error) {
    await logError(error, `/apparatus/${apparatus_id}`)
    return { error: error.message }
  }

  revalidatePath('/apparatus')
  revalidatePath(`/apparatus/${apparatus_id}`)
  return { success: true }
}
