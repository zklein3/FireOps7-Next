'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

async function verifyAdmin() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) return null

  const { data: myDeptList } = await adminClient.from('department_personnel').select('department_id, system_role').eq('personnel_id', me.id).eq('active', true)
  const myDept = myDeptList?.[0]
  if (!myDept || (myDept.system_role !== 'admin' && !me.is_sys_admin)) return null

  return { me, department_id: myDept.department_id }
}

// ─── Create Compartment Name ──────────────────────────────────────────────────
export async function createCompartmentName(formData: FormData) {
  const ctx = await verifyAdmin()
  if (!ctx) return { error: 'Only admins can manage compartments.' }

  const compartment_code = (formData.get('compartment_code') as string)?.toUpperCase().trim()
  const compartment_name = formData.get('compartment_name') as string
  const sort_order = formData.get('sort_order') as string

  if (!compartment_code) return { error: 'Compartment code is required.' }

  const adminClient = createAdminClient()

  // Check for duplicate code in this department
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
    await logError(error, '/dept-admin/compartments')
    return { error: error.message }
  }

  revalidatePath('/dept-admin/compartments')
  return { success: true }
}

// ─── Update Compartment Name ──────────────────────────────────────────────────
export async function updateCompartmentName(formData: FormData) {
  const ctx = await verifyAdmin()
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
    await logError(error, '/dept-admin/compartments')
    return { error: error.message }
  }

  revalidatePath('/dept-admin/compartments')
  revalidatePath('/apparatus')
  return { success: true }
}

// ─── Assign Compartment to Apparatus ─────────────────────────────────────────
export async function assignCompartmentToApparatus(apparatus_id: string, compartment_name_id: string) {
  const ctx = await verifyAdmin()
  if (!ctx) return { error: 'Only admins can assign compartments.' }

  const adminClient = createAdminClient()

  // Check if already assigned
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
export async function removeCompartmentFromApparatus(compartment_id: string, apparatus_id: string) {
  const ctx = await verifyAdmin()
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
