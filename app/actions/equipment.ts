'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

// Asset status values must match DB default: 'IN SERVICE'
const ASSET_STATUS = {
  active: 'IN SERVICE',
  out_of_service: 'OUT OF SERVICE',
  retired: 'RETIRED',
}

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

// ─── Create Item Category ─────────────────────────────────────────────────────
export async function createItemCategory(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage item categories.' }
  const adminClient = createAdminClient()
  const category_name = formData.get('category_name') as string
  const sort_order = formData.get('sort_order') as string
  const department_id = formData.get('department_id') as string || ctx.department_id
  if (!category_name) return { error: 'Category name is required.' }
  if (!department_id) return { error: 'Department not found.' }
  const { error } = await adminClient.from('item_categories').insert({
    department_id, category_name,
    sort_order: sort_order ? parseInt(sort_order) : null,
    active: true,
  })
  if (error) { await logError(error.message, '/dept-admin/items'); return { error: error.message } }
  revalidatePath('/dept-admin/items')
  return { success: true }
}

// ─── Update Item Category ─────────────────────────────────────────────────────
export async function updateItemCategory(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage item categories.' }
  const adminClient = createAdminClient()
  const id = formData.get('id') as string
  const category_name = formData.get('category_name') as string
  const sort_order = formData.get('sort_order') as string
  const active = formData.get('active') === 'true'
  if (!category_name) return { error: 'Category name is required.' }
  const { error } = await adminClient.from('item_categories').update({
    category_name,
    sort_order: sort_order ? parseInt(sort_order) : null,
    active,
  }).eq('id', id)
  if (error) { await logError(error.message, '/dept-admin/items'); return { error: error.message } }
  revalidatePath('/dept-admin/items')
  return { success: true }
}

// ─── Create Item Type ─────────────────────────────────────────────────────────
export async function createItem(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage items.' }
  const adminClient = createAdminClient()
  const item_name = formData.get('item_name') as string
  const category_id = formData.get('category_id') as string
  const item_description = formData.get('item_description') as string
  const requires_presence_check = formData.get('requires_presence_check') === 'true'
  const requires_inspection = formData.get('requires_inspection') === 'true'
  const tracks_expiration = formData.get('tracks_expiration') === 'true'
  const department_id = formData.get('department_id') as string || ctx.department_id
  if (!item_name) return { error: 'Item name is required.' }
  if (!category_id) return { error: 'Category is required.' }
  if (!department_id) return { error: 'Department not found.' }
  const { data: newItem, error } = await adminClient.from('items').insert({
    department_id, category_id, item_name,
    item_description: item_description || null,
    tracks_quantity: !requires_inspection,
    tracks_assets: requires_inspection,
    requires_presence_check, tracks_expiration,
    requires_inspection, requires_maintenance: false, active: true,
  }).select('id').single()
  if (error) { await logError(error.message, '/dept-admin/items'); return { error: error.message } }
  revalidatePath('/dept-admin/items')
  revalidatePath('/equipment')
  return { success: true, item_id: newItem?.id, requires_inspection }
}

// ─── Update Item Type ─────────────────────────────────────────────────────────
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
  const tracks_expiration = formData.get('tracks_expiration') === 'true'
  const active = formData.get('active') === 'true'
  if (!item_name) return { error: 'Item name is required.' }
  const { error } = await adminClient.from('items').update({
    item_name, category_id,
    item_description: item_description || null,
    tracks_quantity: !requires_inspection,
    tracks_assets: requires_inspection,
    requires_presence_check, tracks_expiration, requires_inspection, active,
  }).eq('id', id)
  if (error) { await logError(error.message, '/dept-admin/items'); return { error: error.message } }
  revalidatePath('/dept-admin/items')
  revalidatePath('/equipment')
  return { success: true }
}

// ─── Create Asset ─────────────────────────────────────────────────────────────
export async function createAsset(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage assets.' }
  const adminClient = createAdminClient()
  const item_id = formData.get('item_id') as string
  const asset_name = formData.get('asset_name') as string
  const serial_number = formData.get('serial_number') as string
  const in_service_date = formData.get('in_service_date') as string
  const notes = formData.get('notes') as string
  const has_linked_asset = formData.get('has_linked_asset') === 'true'
  const linked_item_type_id = formData.get('linked_item_type_id') as string
  const department_id = formData.get('department_id') as string || ctx.department_id
  if (!item_id) return { error: 'Item type is required.' }
  if (!asset_name) return { error: 'Asset name is required.' }
  if (!department_id) return { error: 'Department not found.' }
  const { error } = await adminClient.from('item_assets').insert({
    department_id, item_id,
    asset_tag: asset_name,
    serial_number: serial_number || null,
    in_service_date: in_service_date || null,
    notes: notes || null,
    active: true,
    status: ASSET_STATUS.active,
    has_linked_asset,
    linked_item_type_id: (has_linked_asset && linked_item_type_id) ? linked_item_type_id : null,
  })
  if (error) { await logError(error.message, '/dept-admin/items'); return { error: error.message } }
  revalidatePath('/dept-admin/items')
  revalidatePath('/equipment')
  return { success: true }
}

// ─── Update Asset ─────────────────────────────────────────────────────────────
export async function updateAsset(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage assets.' }
  const adminClient = createAdminClient()
  const id = formData.get('id') as string
  const asset_name = formData.get('asset_name') as string
  const serial_number = formData.get('serial_number') as string
  const in_service_date = formData.get('in_service_date') as string
  const out_of_service_date = formData.get('out_of_service_date') as string
  const status = formData.get('status') as string
  const notes = formData.get('notes') as string
  const has_linked_asset = formData.get('has_linked_asset') === 'true'
  const linked_item_type_id = formData.get('linked_item_type_id') as string

  // Status values come directly from DB-matched select options
  const dbStatus = Object.values(ASSET_STATUS).includes(status)
    ? status
    : ASSET_STATUS.active

  const { error } = await adminClient.from('item_assets').update({
    asset_tag: asset_name,
    serial_number: serial_number || null,
    in_service_date: in_service_date || null,
    out_of_service_date: out_of_service_date || null,
    status: dbStatus,
    active: status !== ASSET_STATUS.retired,
    notes: notes || null,
    has_linked_asset,
    linked_item_type_id: (has_linked_asset && linked_item_type_id) ? linked_item_type_id : null,
  }).eq('id', id)
  if (error) { await logError(error.message, '/dept-admin/items'); return { error: error.message } }
  revalidatePath('/dept-admin/items')
  return { success: true }
}

// ─── Assign Item to Compartment ───────────────────────────────────────────────
export async function assignItemToCompartment(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can assign items.' }
  const adminClient = createAdminClient()
  const apparatus_compartment_id = formData.get('apparatus_compartment_id') as string
  const item_id = formData.get('item_id') as string
  const expected_quantity = formData.get('expected_quantity') as string
  const notes = formData.get('notes') as string
  if (!apparatus_compartment_id || !item_id) return { error: 'Compartment and item are required.' }
  if (!expected_quantity || parseInt(expected_quantity) < 1) return { error: 'Expected quantity must be at least 1.' }
  const { data: existing } = await adminClient
    .from('item_location_standards').select('id')
    .eq('apparatus_compartment_id', apparatus_compartment_id).eq('item_id', item_id)
  if (existing?.[0]) return { error: 'This item is already assigned to this compartment.' }
  const { error } = await adminClient.from('item_location_standards').insert({
    apparatus_compartment_id, item_id,
    expected_quantity: parseInt(expected_quantity),
    notes: notes || null, active: true,
  })
  if (error) { await logError(error.message, '/equipment'); return { error: error.message } }
  revalidatePath('/equipment')
  return { success: true }
}

// ─── Remove Item from Compartment ─────────────────────────────────────────────
export async function removeItemFromCompartment(location_standard_id: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can remove items.' }
  const adminClient = createAdminClient()
  const { error } = await adminClient.from('item_location_standards').delete().eq('id', location_standard_id)
  if (error) { await logError(error.message, '/equipment'); return { error: error.message } }
  revalidatePath('/equipment')
  return { success: true }
}
