'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

// Asset status values must match DB default: 'IN SERVICE'
const ASSET_STATUS = {
  active: 'IN SERVICE',
  out_of_service: 'OUT OF SERVICE',
  retired: 'RETIRED',
}

async function getContext() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return null
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return {
    me: { id: ctx.personnelId, is_sys_admin: ctx.isSysAdmin },
    user_id: user?.id ?? null,
    department_id: ctx.departmentId,
    system_role: ctx.systemRole,
    isAdmin: await hasPermission(ctx, 'manage_dept_setup'),
    isOfficerOrAbove: await hasPermission(ctx, 'manage_inventory'),
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
  revalidatePath('/dept-admin/setup')
  return { success: true }
}

// ─── Delete Item Category ─────────────────────────────────────────────────────
export async function deleteItemCategory(category_id: string) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage item categories.' }
  const adminClient = createAdminClient()
  const { count } = await adminClient.from('items').select('id', { count: 'exact', head: true }).eq('category_id', category_id)
  if (count && count > 0) return { error: 'Cannot delete a category that has items. Remove or reassign the items first.' }
  const { error } = await adminClient.from('item_categories').delete().eq('id', category_id)
  if (error) { await logError(error.message, '/dept-admin/items'); return { error: error.message } }
  revalidatePath('/dept-admin/items')
  revalidatePath('/dept-admin/setup')
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
  revalidatePath('/dept-admin/setup')
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
  revalidatePath('/dept-admin/setup')
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
  revalidatePath('/dept-admin/setup')
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
  // Collect custom field values (inputs named cf_<fieldDefId>)
  const customFields: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('cf_') && typeof value === 'string' && value.trim()) {
      customFields[key.slice(3)] = value.trim()
    }
  }

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
    ...(Object.keys(customFields).length > 0 ? { custom_field_values: customFields } : {}),
  })
  if (error) { await logError(error.message, '/dept-admin/items'); return { error: error.message } }
  revalidatePath('/dept-admin/items')
  revalidatePath('/equipment')
  revalidatePath('/dept-admin/setup')
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

  // Collect custom field values (inputs named cf_<fieldDefId>)
  const customFields: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('cf_') && typeof value === 'string') {
      customFields[key.slice(3)] = value
    }
  }

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
    ...(Object.keys(customFields).length > 0 ? { custom_field_values: customFields } : {}),
  }).eq('id', id)
  if (error) { await logError(error.message, '/dept-admin/items'); return { error: error.message } }
  revalidatePath('/dept-admin/setup')
  return { success: true }
}

// ─── Assign Asset to Apparatus ────────────────────────────────────────────────
export async function assignAssetApparatus(asset_id: string, apparatus_id: string | null) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can assign assets.' }
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('item_assets')
    .update({ apparatus_id: apparatus_id || null })
    .eq('id', asset_id)
  if (error) { await logError(error.message, '/equipment/assets'); return { error: error.message } }
  revalidatePath('/equipment/assets')
  return { success: true }
}

// ─── Move Asset to Apparatus (inspection reconciliation, all members) ─────────
export async function moveAssetToApparatus(asset_id: string, to_apparatus_id: string) {
  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Not authenticated.' }
  const adminClient = createAdminClient()

  const { data: assetList } = await adminClient
    .from('item_assets')
    .select('id, item_id, apparatus_id')
    .eq('id', asset_id)
  const asset = assetList?.[0]
  if (!asset) return { error: 'Asset not found.' }

  const { error: updateErr } = await adminClient
    .from('item_assets')
    .update({ apparatus_id: to_apparatus_id })
    .eq('id', asset_id)
  if (updateErr) { await logError(updateErr.message, '/inspections'); return { error: updateErr.message } }

  await adminClient.from('item_movement_log').insert({
    department_id: ctx.department_id,
    item_id: asset.item_id,
    asset_id,
    quantity: 1,
    from_type: asset.apparatus_id ? 'apparatus' : 'storage',
    from_id: asset.apparatus_id ?? null,
    to_type: 'apparatus',
    to_id: to_apparatus_id,
    moved_by: ctx.user_id,
    source: 'inspection_reconciliation',
  })

  revalidatePath('/equipment/assets')
  revalidatePath('/equipment/storage')
  return { success: true }
}

// ─── Assign Storage Asset to Apparatus (officers+, from storage page) ────────
export async function assignStorageAssetToApparatus(asset_id: string, apparatus_id: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can assign assets.' }
  const adminClient = createAdminClient()

  const { data: assetList } = await adminClient
    .from('item_assets')
    .select('id, item_id, apparatus_id')
    .eq('id', asset_id)
  const asset = assetList?.[0]
  if (!asset) return { error: 'Asset not found.' }

  const { error: updateErr } = await adminClient
    .from('item_assets')
    .update({ apparatus_id })
    .eq('id', asset_id)
  if (updateErr) { await logError(updateErr.message, '/equipment/storage'); return { error: updateErr.message } }

  await adminClient.from('item_movement_log').insert({
    department_id: ctx.department_id,
    item_id: asset.item_id,
    asset_id,
    quantity: 1,
    from_type: 'storage',
    from_id: null,
    to_type: 'apparatus',
    to_id: apparatus_id,
    moved_by: ctx.user_id,
    source: 'manual',
  })

  revalidatePath('/equipment/assets')
  revalidatePath('/equipment/storage')
  return { success: true }
}

// ─── Move Assets to Storage (inspection reconciliation) ──────────────────────
export async function moveAssetsToStorage(asset_ids: string[]) {
  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Not authenticated.' }
  const adminClient = createAdminClient()

  const { data: assets } = await adminClient
    .from('item_assets')
    .select('id, item_id, apparatus_id')
    .in('id', asset_ids)

  const { error: updateErr } = await adminClient
    .from('item_assets')
    .update({ apparatus_id: null })
    .in('id', asset_ids)
  if (updateErr) { await logError(updateErr.message, '/inspections'); return { error: updateErr.message } }

  const logs = (assets ?? [])
    .filter(a => a.apparatus_id)
    .map(a => ({
      department_id: ctx.department_id,
      item_id: a.item_id,
      asset_id: a.id,
      quantity: 1,
      from_type: 'apparatus',
      from_id: a.apparatus_id,
      to_type: 'storage',
      to_id: null,
      moved_by: ctx.user_id,
      source: 'inspection_reconciliation',
    }))
  if (logs.length > 0) await adminClient.from('item_movement_log').insert(logs)

  revalidatePath('/equipment/assets')
  revalidatePath('/equipment/storage')
  return { success: true }
}

// ─── Get Apparatus Inventory (for admin setup tab) ────────────────────────────
export async function getApparatusInventory(apparatus_id: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Officers and admins only.', compartments: [] }
  const adminClient = createAdminClient()

  const { data: compartmentLinks } = await adminClient
    .from('apparatus_compartments')
    .select('id, compartment_name_id')
    .eq('apparatus_id', apparatus_id)
    .eq('active', true)

  const compartmentNameIds = (compartmentLinks ?? []).map(c => c.compartment_name_id).filter(Boolean)
  const { data: compartmentNames } = compartmentNameIds.length > 0
    ? await adminClient.from('compartment_names').select('id, compartment_code, compartment_name, sort_order').in('id', compartmentNameIds)
    : { data: [] }

  const compartmentIds = (compartmentLinks ?? []).map(c => c.id)
  const { data: locationStandards } = compartmentIds.length > 0
    ? await adminClient.from('item_location_standards').select('id, apparatus_compartment_id, item_id, expected_quantity, minimum_quantity').in('apparatus_compartment_id', compartmentIds).eq('active', true)
    : { data: [] }

  const itemIds = (locationStandards ?? []).map(ls => ls.item_id).filter(Boolean)
  const { data: itemData } = itemIds.length > 0
    ? await adminClient.from('items').select('id, item_name, category_id, requires_inspection').in('id', itemIds)
    : { data: [] }

  const catIds = (itemData ?? []).map(i => i.category_id).filter(Boolean)
  const { data: catData } = catIds.length > 0
    ? await adminClient.from('item_categories').select('id, category_name').in('id', catIds)
    : { data: [] }

  const nameMap = Object.fromEntries((compartmentNames ?? []).map(c => [c.id, c]))
  const itemMap = Object.fromEntries((itemData ?? []).map(i => [i.id, i]))
  const catMap = Object.fromEntries((catData ?? []).map(c => [c.id, c.category_name]))

  const compartments = (compartmentLinks ?? [])
    .map(c => {
      const cn = nameMap[c.compartment_name_id]
      const items = (locationStandards ?? [])
        .filter(ls => ls.apparatus_compartment_id === c.id)
        .map(ls => ({
          id: ls.id,
          item_id: ls.item_id,
          item_name: itemMap[ls.item_id]?.item_name ?? '—',
          category_name: catMap[itemMap[ls.item_id]?.category_id] ?? '—',
          requires_inspection: itemMap[ls.item_id]?.requires_inspection ?? false,
          expected_quantity: ls.expected_quantity,
          minimum_quantity: ls.minimum_quantity,
        }))
      return {
        id: c.id,
        compartment_code: cn?.compartment_code ?? '—',
        compartment_name: cn?.compartment_name ?? null,
        sort_order: cn?.sort_order ?? 999,
        items,
      }
    })
    .sort((a, b) => a.sort_order - b.sort_order)

  return { compartments }
}

// ─── Assign Item to Compartment ───────────────────────────────────────────────
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
  const minQty = minimum_quantity ? parseInt(minimum_quantity) : null
  const { data: existing } = await adminClient
    .from('item_location_standards').select('id, active')
    .eq('apparatus_compartment_id', apparatus_compartment_id).eq('item_id', item_id)
  const existingAssignment = existing?.[0]
  if (existingAssignment?.active) return { error: 'This item is already assigned to this compartment.' }
  if (existingAssignment) {
    const { error } = await adminClient
      .from('item_location_standards')
      .update({
        expected_quantity: parseInt(expected_quantity),
        minimum_quantity: minQty,
        notes: notes || null,
        active: true,
      })
      .eq('id', existingAssignment.id)
    if (error) { await logError(error.message, '/equipment'); return { error: error.message } }
    revalidatePath('/equipment')
    revalidatePath('/apparatus')
    return { success: true }
  }
  const { error } = await adminClient.from('item_location_standards').insert({
    apparatus_compartment_id, item_id,
    expected_quantity: parseInt(expected_quantity),
    minimum_quantity: minQty,
    notes: notes || null, active: true,
  })
  if (error) { await logError(error.message, '/equipment'); return { error: error.message } }
  revalidatePath('/equipment')
  return { success: true }
}

// ─── Remove Item from Compartment ─────────────────────────────────────────────
export async function removeItemFromCompartment(location_standard_id: string) {
  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Not authorized.' }
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('item_location_standards')
    .update({ active: false })
    .eq('id', location_standard_id)
  if (error) { await logError(error.message, '/equipment'); return { error: error.message } }
  revalidatePath('/equipment')
  revalidatePath('/apparatus')
  revalidatePath('/inspections')
  return { success: true }
}

// ─── Update Item Expected Quantity + Minimum ─────────────────────────────────
export async function updateItemQuantity(location_standard_id: string, expected_quantity: number, minimum_quantity?: number | null) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can update quantities.' }
  if (!expected_quantity || expected_quantity < 1) return { error: 'Quantity must be at least 1.' }
  const adminClient = createAdminClient()
  const update: Record<string, unknown> = { expected_quantity }
  if (minimum_quantity !== undefined) update.minimum_quantity = minimum_quantity && minimum_quantity > 0 ? minimum_quantity : null
  const { error } = await adminClient
    .from('item_location_standards')
    .update(update)
    .eq('id', location_standard_id)
  if (error) { await logError(error.message, '/equipment'); return { error: error.message } }
  revalidatePath('/equipment')
  return { success: true }
}

// ─── Move Item to Different Compartment ───────────────────────────────────────
export async function moveItemToCompartment(location_standard_id: string, target_compartment_id: string) {
  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Not authorized.' }
  const adminClient = createAdminClient()

  const { data: existing } = await adminClient
    .from('item_location_standards').select('id, item_id, expected_quantity, minimum_quantity, notes')
    .eq('id', location_standard_id)
  const record = existing?.[0]
  if (!record) return { error: 'Item assignment not found.' }

  const { data: conflict } = await adminClient
    .from('item_location_standards').select('id, active')
    .eq('apparatus_compartment_id', target_compartment_id)
    .eq('item_id', record.item_id)
  const targetAssignment = conflict?.[0]
  if (targetAssignment?.active) return { error: 'This item is already assigned to the target compartment.' }

  const targetPayload = {
    apparatus_compartment_id: target_compartment_id,
    item_id: record.item_id,
    expected_quantity: record.expected_quantity,
    minimum_quantity: record.minimum_quantity,
    notes: record.notes,
    active: true,
  }

  const { error } = targetAssignment
    ? await adminClient
        .from('item_location_standards')
        .update(targetPayload)
        .eq('id', targetAssignment.id)
    : await adminClient
        .from('item_location_standards')
        .insert(targetPayload)
  if (error) {
    await logError(error.message, '/equipment')
    return { error: error.message }
  }

  const { error: deactivateErr } = await adminClient
    .from('item_location_standards')
    .update({ active: false })
    .eq('id', location_standard_id)
  if (deactivateErr) { await logError(deactivateErr.message, '/equipment'); return { error: deactivateErr.message } }

  revalidatePath('/equipment')
  revalidatePath('/apparatus')
  revalidatePath('/inspections')
  return { success: true }
}

// ─── Move Quantity to Storage ─────────────────────────────────────────────────
export async function moveQuantityToStorage(location_standard_id: string, quantity: number) {
  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Not authorized.' }
  if (quantity < 1) return { error: 'Quantity must be at least 1.' }
  const department_id = ctx.department_id
  if (!department_id) return { error: 'Department not found.' }
  const adminClient = createAdminClient()

  const { data: standards } = await adminClient
    .from('item_location_standards')
    .select('id, item_id, expected_quantity, minimum_quantity, apparatus_compartment_id')
    .eq('id', location_standard_id)
    .eq('active', true)
  const standard = standards?.[0]
  if (!standard) return { error: 'Item assignment not found.' }
  if (quantity > standard.expected_quantity) return { error: 'Cannot move more than the current compartment quantity.' }

  const newQty = standard.expected_quantity - quantity
  const compartmentUpdate: Record<string, unknown> = { expected_quantity: newQty }
  if (standard.minimum_quantity != null && newQty < standard.minimum_quantity) {
    compartmentUpdate.minimum_quantity = null
  }
  const { error: compartmentErr } = await adminClient
    .from('item_location_standards')
    .update(compartmentUpdate)
    .eq('id', location_standard_id)
  if (compartmentErr) { await logError(compartmentErr.message, '/equipment'); return { error: compartmentErr.message } }

  // Always route to general (null station) storage pool
  const { data: storageList } = await adminClient
    .from('department_item_storage')
    .select('id, quantity')
    .eq('department_id', department_id)
    .eq('item_id', standard.item_id)
    .is('station_id', null)
  const storageRow = storageList?.[0]
  if (storageRow) {
    const { error: storageErr } = await adminClient
      .from('department_item_storage')
      .update({ quantity: storageRow.quantity + quantity, updated_at: new Date().toISOString() })
      .eq('id', storageRow.id)
    if (storageErr) { await logError(storageErr.message, '/equipment'); return { error: storageErr.message } }
  } else {
    const { error: storageErr } = await adminClient
      .from('department_item_storage')
      .insert({ department_id, item_id: standard.item_id, quantity, par_quantity: 0, station_id: null })
    if (storageErr) { await logError(storageErr.message, '/equipment'); return { error: storageErr.message } }
  }

  await adminClient.from('item_movement_log').insert({
    department_id,
    item_id: standard.item_id,
    quantity,
    from_type: 'compartment',
    from_id: standard.apparatus_compartment_id,
    to_type: 'storage',
    to_id: null,
    moved_by: ctx.user_id,
    reason: null,
  })

  revalidatePath('/equipment')
  revalidatePath('/equipment/storage')
  return { success: true }
}

// ─── Move Quantity from Storage to Compartment ────────────────────────────────
export async function moveQuantityFromStorage(
  item_id: string,
  target_compartment_id: string,
  quantity: number,
) {
  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Not authorized.' }
  if (quantity < 1) return { error: 'Quantity must be at least 1.' }
  const department_id = ctx.department_id
  const adminClient = createAdminClient()

  // Pull from general (null station) storage pool
  const { data: storageList } = await adminClient
    .from('department_item_storage')
    .select('id, quantity')
    .eq('department_id', department_id)
    .eq('item_id', item_id)
    .is('station_id', null)
  const storage = storageList?.[0]
  if (!storage || storage.quantity < quantity) return { error: 'Not enough quantity in storage.' }

  const { data: existingList } = await adminClient
    .from('item_location_standards')
    .select('id, active, expected_quantity')
    .eq('apparatus_compartment_id', target_compartment_id)
    .eq('item_id', item_id)
  const existing = existingList?.[0]

  if (existing?.active) {
    const { error: updateErr } = await adminClient
      .from('item_location_standards')
      .update({ expected_quantity: existing.expected_quantity + quantity })
      .eq('id', existing.id)
    if (updateErr) { await logError(updateErr.message, '/equipment'); return { error: updateErr.message } }
  } else if (existing) {
    const { error: updateErr } = await adminClient
      .from('item_location_standards')
      .update({ active: true, expected_quantity: quantity })
      .eq('id', existing.id)
    if (updateErr) { await logError(updateErr.message, '/equipment'); return { error: updateErr.message } }
  } else {
    const { error: insertErr } = await adminClient
      .from('item_location_standards')
      .insert({ apparatus_compartment_id: target_compartment_id, item_id, expected_quantity: quantity, active: true })
    if (insertErr) { await logError(insertErr.message, '/equipment'); return { error: insertErr.message } }
  }

  const { error: storageErr } = await adminClient
    .from('department_item_storage')
    .update({ quantity: storage.quantity - quantity, updated_at: new Date().toISOString() })
    .eq('id', storage.id)
  if (storageErr) { await logError(storageErr.message, '/equipment'); return { error: storageErr.message } }

  await adminClient.from('item_movement_log').insert({
    department_id,
    item_id,
    quantity,
    from_type: 'storage',
    from_id: null,
    to_type: 'compartment',
    to_id: target_compartment_id,
    moved_by: ctx.user_id,
    reason: null,
  })

  revalidatePath('/equipment')
  revalidatePath('/equipment/storage')
  return { success: true }
}

// ─── Remove from Inventory (from storage only) ────────────────────────────────
export async function removeFromInventory(item_id: string, quantity: number, reason: 'retired' | 'lost' | 'damaged') {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can remove items from inventory.' }
  if (quantity < 1) return { error: 'Quantity must be at least 1.' }
  if (!reason) return { error: 'A reason is required.' }
  const department_id = ctx.department_id
  if (!department_id) return { error: 'Department not found.' }
  const adminClient = createAdminClient()

  const { data: storageList } = await adminClient
    .from('department_item_storage')
    .select('id, quantity')
    .eq('department_id', department_id)
    .eq('item_id', item_id)
  const storage = storageList?.[0]
  if (!storage || storage.quantity < quantity) return { error: 'Not enough quantity in storage to remove.' }

  const { error: storageErr } = await adminClient
    .from('department_item_storage')
    .update({ quantity: storage.quantity - quantity, updated_at: new Date().toISOString() })
    .eq('id', storage.id)
  if (storageErr) { await logError(storageErr.message, '/equipment/storage'); return { error: storageErr.message } }

  const { error: logErr } = await adminClient.from('item_movement_log').insert({
    department_id,
    item_id,
    quantity,
    from_type: 'storage',
    from_id: null,
    to_type: reason,
    to_id: null,
    moved_by: ctx.user_id,
    reason,
  })
  if (logErr) { await logError(logErr.message, '/equipment/storage'); return { error: logErr.message } }

  revalidatePath('/equipment/storage')
  return { success: true }
}

// ─── Set Department Quantity (deliberate admin declaration) ───────────────────
export async function setDepartmentQuantity(item_id: string, quantity: number) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can set department quantity.' }
  if (quantity < 0) return { error: 'Quantity cannot be negative.' }
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('items')
    .update({ department_quantity: quantity })
    .eq('id', item_id)
  if (error) { await logError(error.message, '/equipment/storage'); return { error: error.message } }
  revalidatePath('/equipment/storage')
  return { success: true }
}

// ─── Set Storage PAR ──────────────────────────────────────────────────────────
export async function setStoragePar(item_id: string, par_quantity: number) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can set storage PAR.' }
  if (par_quantity < 0) return { error: 'PAR cannot be negative.' }
  const department_id = ctx.department_id
  if (!department_id) return { error: 'Department not found.' }
  const adminClient = createAdminClient()
  // PAR is set on the general (null station) storage row
  const { data: existing } = await adminClient
    .from('department_item_storage')
    .select('id')
    .eq('department_id', department_id)
    .eq('item_id', item_id)
    .is('station_id', null)
  if (existing?.[0]) {
    const { error } = await adminClient
      .from('department_item_storage')
      .update({ par_quantity, updated_at: new Date().toISOString() })
      .eq('id', existing[0].id)
    if (error) { await logError(error.message, '/equipment/storage'); return { error: error.message } }
  } else {
    const { error } = await adminClient
      .from('department_item_storage')
      .insert({ department_id, item_id, quantity: 0, par_quantity, station_id: null })
    if (error) { await logError(error.message, '/equipment/storage'); return { error: error.message } }
  }
  revalidatePath('/equipment/storage')
  return { success: true }
}

// ─── Transfer Quantity Between Compartments (all members) ────────────────────
export async function transferQuantityBetweenCompartments(
  from_location_standard_id: string,
  to_apparatus_compartment_id: string,
  quantity: number,
) {
  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Not authorized.' }
  if (quantity < 1) return { error: 'Quantity must be at least 1.' }
  const department_id = ctx.department_id
  const adminClient = createAdminClient()

  const { data: sourceList } = await adminClient
    .from('item_location_standards')
    .select('id, item_id, expected_quantity, minimum_quantity, apparatus_compartment_id')
    .eq('id', from_location_standard_id)
    .eq('active', true)
  const source = sourceList?.[0]
  if (!source) return { error: 'Source item assignment not found.' }
  if (quantity > source.expected_quantity) return { error: 'Cannot transfer more than the current compartment quantity.' }
  if (source.apparatus_compartment_id === to_apparatus_compartment_id) return { error: 'Source and destination compartment must be different.' }

  // Find or create destination assignment
  const { data: destList } = await adminClient
    .from('item_location_standards')
    .select('id, active, expected_quantity')
    .eq('apparatus_compartment_id', to_apparatus_compartment_id)
    .eq('item_id', source.item_id)
  const dest = destList?.[0]

  if (dest?.active) {
    const { error: destErr } = await adminClient
      .from('item_location_standards')
      .update({ expected_quantity: dest.expected_quantity + quantity })
      .eq('id', dest.id)
    if (destErr) { await logError(destErr.message, '/equipment'); return { error: destErr.message } }
  } else if (dest) {
    const { error: destErr } = await adminClient
      .from('item_location_standards')
      .update({ active: true, expected_quantity: quantity })
      .eq('id', dest.id)
    if (destErr) { await logError(destErr.message, '/equipment'); return { error: destErr.message } }
  } else {
    const { error: insertErr } = await adminClient
      .from('item_location_standards')
      .insert({ apparatus_compartment_id: to_apparatus_compartment_id, item_id: source.item_id, expected_quantity: quantity, active: true })
    if (insertErr) { await logError(insertErr.message, '/equipment'); return { error: insertErr.message } }
  }

  // Update or deactivate source
  const newSourceQty = source.expected_quantity - quantity
  const srcUpdate: Record<string, unknown> = { expected_quantity: newSourceQty }
  if (newSourceQty === 0) {
    srcUpdate.active = false
  } else if (source.minimum_quantity != null && newSourceQty < source.minimum_quantity) {
    srcUpdate.minimum_quantity = null
  }
  const { error: srcErr } = await adminClient
    .from('item_location_standards')
    .update(srcUpdate)
    .eq('id', from_location_standard_id)
  if (srcErr) { await logError(srcErr.message, '/equipment'); return { error: srcErr.message } }

  await adminClient.from('item_movement_log').insert({
    department_id,
    item_id: source.item_id,
    quantity,
    from_type: 'compartment',
    from_id: source.apparatus_compartment_id,
    to_type: 'compartment',
    to_id: to_apparatus_compartment_id,
    moved_by: ctx.user_id,
    reason: null,
  })

  revalidatePath('/equipment')
  revalidatePath('/apparatus')
  revalidatePath('/inspections')
  return { success: true }
}

// ─── Transfer Quantity Between Storage Locations (all members) ────────────────
export async function transferQuantityBetweenStorage(
  item_id: string,
  from_station_id: string | null,
  to_station_id: string | null,
  quantity: number,
) {
  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Not authorized.' }
  if (quantity < 1) return { error: 'Quantity must be at least 1.' }
  if (from_station_id === to_station_id) return { error: 'Source and destination must be different.' }
  const department_id = ctx.department_id
  const adminClient = createAdminClient()

  // Find source row
  const srcQuery = adminClient
    .from('department_item_storage')
    .select('id, quantity')
    .eq('department_id', department_id)
    .eq('item_id', item_id)
  const { data: srcList } = from_station_id
    ? await srcQuery.eq('station_id', from_station_id)
    : await srcQuery.is('station_id', null)
  const src = srcList?.[0]
  if (!src || src.quantity < quantity) return { error: 'Not enough quantity in source storage.' }

  const { error: srcErr } = await adminClient
    .from('department_item_storage')
    .update({ quantity: src.quantity - quantity, updated_at: new Date().toISOString() })
    .eq('id', src.id)
  if (srcErr) { await logError(srcErr.message, '/equipment/storage'); return { error: srcErr.message } }

  // Find or create destination row
  const destQuery = adminClient
    .from('department_item_storage')
    .select('id, quantity')
    .eq('department_id', department_id)
    .eq('item_id', item_id)
  const { data: destList } = to_station_id
    ? await destQuery.eq('station_id', to_station_id)
    : await destQuery.is('station_id', null)
  const dest = destList?.[0]

  if (dest) {
    const { error: destErr } = await adminClient
      .from('department_item_storage')
      .update({ quantity: dest.quantity + quantity, updated_at: new Date().toISOString() })
      .eq('id', dest.id)
    if (destErr) { await logError(destErr.message, '/equipment/storage'); return { error: destErr.message } }
  } else {
    const { error: insertErr } = await adminClient
      .from('department_item_storage')
      .insert({ department_id, item_id, quantity, par_quantity: 0, station_id: to_station_id })
    if (insertErr) { await logError(insertErr.message, '/equipment/storage'); return { error: insertErr.message } }
  }

  await adminClient.from('item_movement_log').insert({
    department_id,
    item_id,
    quantity,
    from_type: 'storage',
    from_id: from_station_id ?? null,
    to_type: 'storage',
    to_id: to_station_id ?? null,
    moved_by: ctx.user_id,
    reason: null,
  })

  revalidatePath('/equipment/storage')
  return { success: true }
}

