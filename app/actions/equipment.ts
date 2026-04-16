'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

async function getContext() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) return null

  const { data: myDeptList } = await adminClient.from('department_personnel').select('department_id, system_role').eq('personnel_id', me.id).eq('active', true)
  const myDept = myDeptList?.[0]

  return {
    me,
    department_id: myDept?.department_id ?? null,
    system_role: myDept?.system_role ?? null,
    isAdmin: myDept?.system_role === 'admin' || me.is_sys_admin,
    isOfficerOrAbove: myDept?.system_role === 'admin' || myDept?.system_role === 'officer' || me.is_sys_admin,
  }
}

// ─── Create Item Category (admin only) ───────────────────────────────────────
export async function createItemCategory(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage item categories.' }

  const adminClient = createAdminClient()
  const category_name = formData.get('category_name') as string
  const sort_order = formData.get('sort_order') as string
  const requires_inspection = formData.get('requires_inspection') === 'true'
  const department_id = formData.get('department_id') as string || ctx.department_id

  if (!category_name) return { error: 'Category name is required.' }
  if (!department_id) return { error: 'Department not found.' }

  const { error } = await adminClient.from('item_categories').insert({
    department_id,
    category_name,
    sort_order: sort_order ? parseInt(sort_order) : null,
    requires_inspection,
    active: true,
  })

  if (error) {
    await logError(error, '/dept-admin/items')
    return { error: error.message }
  }

  revalidatePath('/dept-admin/items')
  return { success: true }
}

// ─── Update Item Category (admin only) ───────────────────────────────────────
export async function updateItemCategory(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage item categories.' }

  const adminClient = createAdminClient()
  const id = formData.get('id') as string
  const category_name = formData.get('category_name') as string
  const sort_order = formData.get('sort_order') as string
  const requires_inspection = formData.get('requires_inspection') === 'true'
  const active = formData.get('active') === 'true'

  if (!category_name) return { error: 'Category name is required.' }

  const { error } = await adminClient.from('item_categories').update({
    category_name,
    sort_order: sort_order ? parseInt(sort_order) : null,
    requires_inspection,
    active,
  }).eq('id', id)

  if (error) {
    await logError(error, '/dept-admin/items')
    return { error: error.message }
  }

  revalidatePath('/dept-admin/items')
  return { success: true }
}

// ─── Create Item Type (admin only) ───────────────────────────────────────────
export async function createItem(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage items.' }

  const adminClient = createAdminClient()
  const item_name = formData.get('item_name') as string
  const category_id = formData.get('category_id') as string
  const item_description = formData.get('item_description') as string
  const tracks_quantity = formData.get('tracks_quantity') === 'true'
  const requires_presence_check = formData.get('requires_presence_check') === 'true'
  const requires_inspection = formData.get('requires_inspection') === 'true'
  const department_id = formData.get('department_id') as string || ctx.department_id

  if (!item_name) return { error: 'Item name is required.' }
  if (!category_id) return { error: 'Category is required.' }
  if (!department_id) return { error: 'Department not found.' }

  const { error } = await adminClient.from('items').insert({
    department_id,
    category_id,
    item_name,
    item_description: item_description || null,
    tracks_quantity,
    tracks_assets: false,
    requires_presence_check,
    tracks_expiration: false,
    requires_inspection,
    requires_maintenance: false,
    active: true,
  })

  if (error) {
    await logError(error, '/dept-admin/items')
    return { error: error.message }
  }

  revalidatePath('/dept-admin/items')
  revalidatePath('/equipment')
  return { success: true }
}

// ─── Update Item Type (admin only) ───────────────────────────────────────────
export async function updateItem(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage items.' }

  const adminClient = createAdminClient()
  const id = formData.get('id') as string
  const item_name = formData.get('item_name') as string
  const category_id = formData.get('category_id') as string
  const item_description = formData.get('item_description') as string
  const requires_presence_check = formData.get('requires_presence_check') === 'true'
  const requires_inspection = formData.get('requires_inspection') === 'true'
  const active = formData.get('active') === 'true'

  if (!item_name) return { error: 'Item name is required.' }

  const { error } = await adminClient.from('items').update({
    item_name,
    category_id,
    item_description: item_description || null,
    requires_presence_check,
    requires_inspection,
    active,
  }).eq('id', id)

  if (error) {
    await logError(error, '/dept-admin/items')
    return { error: error.message }
  }

  revalidatePath('/dept-admin/items')
  revalidatePath('/equipment')
  return { success: true }
}

// ─── Assign Item to Compartment (officer+) ────────────────────────────────────
export async function assignItemToCompartment(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can assign items.' }

  const adminClient = createAdminClient()
  const apparatus_compartment_id = formData.get('apparatus_compartment_id') as string
  const item_id = formData.get('item_id') as string
  const expected_quantity = formData.get('expected_quantity') as string
  const minimum_quantity = formData.get('minimum_quantity') as string
  const notes = formData.get('notes') as string

  if (!apparatus_compartment_id || !item_id) return { error: 'Compartment and item are required.' }
  if (!expected_quantity || parseInt(expected_quantity) < 1) return { error: 'Expected quantity must be at least 1.' }

  const { data: existing } = await adminClient
    .from('item_location_standards')
    .select('id')
    .eq('apparatus_compartment_id', apparatus_compartment_id)
    .eq('item_id', item_id)

  if (existing?.[0]) return { error: 'This item is already assigned to this compartment.' }

  const { error } = await adminClient.from('item_location_standards').insert({
    apparatus_compartment_id,
    item_id,
    expected_quantity: parseInt(expected_quantity),
    minimum_quantity: minimum_quantity ? parseInt(minimum_quantity) : null,
    notes: notes || null,
    active: true,
  })

  if (error) {
    await logError(error, '/equipment')
    return { error: error.message }
  }

  revalidatePath('/equipment')
  return { success: true }
}

// ─── Remove Item from Compartment (officer+) ──────────────────────────────────
export async function removeItemFromCompartment(location_standard_id: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can remove items.' }

  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('item_location_standards')
    .delete()
    .eq('id', location_standard_id)

  if (error) {
    await logError(error, '/equipment')
    return { error: error.message }
  }

  revalidatePath('/equipment')
  return { success: true }
}
