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
    isAdmin: await hasPermission(ctx, 'manage_medical_supply_setup'),
    isOfficerOrAbove: await hasPermission(ctx, 'manage_medical_inventory'),
    fullCtx: ctx,
  }
}

// Resolves the medical storeroom scoped to a specific apparatus compartment,
// auto-creating it (named from the apparatus unit + compartment code) if this
// is the first time anything medical has touched that compartment. Shared by
// transferToCompartment (moving physical stock) and assignMedicalSupplyToCompartment
// (assigning a supply type with no stock yet) so both paths converge on the
// same storeroom instead of creating duplicates.
async function getOrCreateCompartmentStoreroom(
  adminClient: ReturnType<typeof createAdminClient>,
  department_id: string,
  compartment_id: string
) {
  const { data: existingRooms } = await adminClient
    .from('medical_storerooms')
    .select('id')
    .eq('department_id', department_id)
    .eq('compartment_id', compartment_id)
    .eq('active', true)

  if (existingRooms && existingRooms.length > 0) return { storeroom_id: existingRooms[0].id as string }

  const { data: acRow } = await adminClient
    .from('apparatus_compartments')
    .select('apparatus_id, compartment_name_id')
    .eq('id', compartment_id)
    .single()
  if (!acRow) return { error: 'Compartment not found.' }

  const [{ data: apRow }, { data: cnRow }] = await Promise.all([
    adminClient.from('apparatus').select('unit_number').eq('id', acRow.apparatus_id).single(),
    acRow.compartment_name_id
      ? adminClient.from('compartment_names').select('compartment_code').eq('id', acRow.compartment_name_id).single()
      : Promise.resolve({ data: null }),
  ])

  const name = `${apRow?.unit_number ?? 'Unit'} — ${(cnRow as any)?.compartment_code ?? 'Compartment'}`
  const { data: newRoom, error: roomErr } = await adminClient
    .from('medical_storerooms')
    .insert({ department_id, apparatus_id: acRow.apparatus_id, compartment_id, name, active: true })
    .select('id')
    .single()
  if (roomErr) return { error: roomErr.message }

  return { storeroom_id: newRoom.id as string }
}

// ─── Assign Supply Type to a Compartment ──────────────────────────────────────
// The medical counterpart to assignItemToCompartment (app/actions/equipment.ts) --
// lets a compartment's "+ Add Item" flow add a medication the same way it adds
// regular equipment, without requiring stock to already exist anywhere.
export async function assignMedicalSupplyToCompartment(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can assign medications.' }
  if (!ctx.department_id) return { error: 'Department not found.' }
  const adminClient = createAdminClient()

  const apparatus_compartment_id = formData.get('apparatus_compartment_id') as string
  const supply_type_id = formData.get('supply_type_id') as string
  const par_level = parseInt(formData.get('par_level') as string) || 0
  if (!apparatus_compartment_id || !supply_type_id) return { error: 'Compartment and medication are required.' }

  const room = await getOrCreateCompartmentStoreroom(adminClient, ctx.department_id, apparatus_compartment_id)
  if ('error' in room) return { error: room.error }

  const { data: existingInv } = await adminClient
    .from('medical_storeroom_inventory')
    .select('id')
    .eq('storeroom_id', room.storeroom_id)
    .eq('supply_type_id', supply_type_id)
    .maybeSingle()

  if (existingInv) return { error: 'This medication is already assigned to this compartment.' }

  const { error: invErr } = await adminClient.from('medical_storeroom_inventory').insert({
    storeroom_id: room.storeroom_id,
    supply_type_id,
    department_id: ctx.department_id,
    par_level,
  })
  if (invErr) { await logError(invErr.message, '/equipment'); return { error: invErr.message } }

  revalidatePath('/equipment')
  revalidatePath('/apparatus')
  revalidatePath('/dept-admin/setup')
  return { success: true }
}

// ─── Supply Types ─────────────────────────────────────────────────────────────

export async function createMedicalSupplyType(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()

  const is_controlled = formData.get('is_controlled') === 'true'
  const required_signatures = parseInt(formData.get('required_signatures') as string) || 0
  const enforced_sigs = is_controlled ? Math.max(required_signatures, 2) : required_signatures

  const { data: newRow, error: dbErr } = await adminClient.from('medical_supply_types').insert({
    department_id: ctx.department_id,
    name: formData.get('name') as string,
    category: formData.get('category') as string,
    unit_of_measure: (formData.get('unit_of_measure') as string) || 'each',
    is_controlled,
    tracks_expiration: formData.get('tracks_expiration') === 'true',
    required_signatures: enforced_sigs,
    notes: (formData.get('notes') as string) || null,
    active: true,
  }).select('id').single()

  if (dbErr) { await logError(dbErr.message, '/dept-admin/medical'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/medical')
  return { success: true, id: newRow.id }
}

export async function updateMedicalSupplyType(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()

  const is_controlled = formData.get('is_controlled') === 'true'
  const required_signatures = parseInt(formData.get('required_signatures') as string) || 0
  const enforced_sigs = is_controlled ? Math.max(required_signatures, 2) : required_signatures

  const { error: dbErr } = await adminClient.from('medical_supply_types').update({
    name: formData.get('name') as string,
    category: formData.get('category') as string,
    unit_of_measure: (formData.get('unit_of_measure') as string) || 'each',
    is_controlled,
    tracks_expiration: formData.get('tracks_expiration') === 'true',
    required_signatures: enforced_sigs,
    notes: (formData.get('notes') as string) || null,
    active: formData.get('active') === 'true',
    updated_at: new Date().toISOString(),
  }).eq('id', formData.get('id') as string)

  if (dbErr) { await logError(dbErr.message, '/dept-admin/medical'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/medical')
  return { success: true }
}

export async function deleteMedicalSupplyType(id: string) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()

  const [
    { count: inventoryCount },
    { count: templateItemCount },
  ] = await Promise.all([
    adminClient.from('medical_storeroom_inventory').select('id', { count: 'exact', head: true }).eq('supply_type_id', id),
    adminClient.from('medical_bag_template_items').select('id', { count: 'exact', head: true }).eq('supply_type_id', id),
  ])

  const blockers: string[] = []
  if ((inventoryCount ?? 0) > 0) blockers.push('assigned to a storeroom, bag, or compartment')
  if ((templateItemCount ?? 0) > 0) blockers.push('used in a bag template')

  if (blockers.length > 0) {
    return { error: `Can't delete — this supply type ${blockers.join('; ')}. Deactivate it instead.` }
  }

  const { error: dbErr } = await adminClient.from('medical_supply_types').delete().eq('id', id)
  if (dbErr) { await logError(dbErr.message, '/dept-admin/medical'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/medical')
  revalidatePath('/dept-admin/setup')
  return { success: true }
}

// ─── Bag Templates ────────────────────────────────────────────────────────────

export async function createBagTemplate(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()

  const { data: row, error: dbErr } = await adminClient.from('medical_bag_templates').insert({
    department_id: ctx.department_id,
    name: formData.get('name') as string,
    description: (formData.get('description') as string) || null,
    active: true,
  }).select('id').single()

  if (dbErr) { await logError(dbErr.message, '/dept-admin/medical'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/medical')
  return { success: true, id: row.id }
}

export async function updateBagTemplate(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()

  const { error: dbErr } = await adminClient.from('medical_bag_templates').update({
    name: formData.get('name') as string,
    description: (formData.get('description') as string) || null,
    active: formData.get('active') === 'true',
    updated_at: new Date().toISOString(),
  }).eq('id', formData.get('id') as string)

  if (dbErr) { await logError(dbErr.message, '/dept-admin/medical'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/medical')
  return { success: true }
}

export async function addTemplateItem(template_id: string, supply_type_id: string, par_level: number) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()

  const { error: dbErr } = await adminClient.from('medical_bag_template_items').upsert({
    template_id, supply_type_id, par_level,
  }, { onConflict: 'template_id,supply_type_id' })

  if (dbErr) { await logError(dbErr.message, '/dept-admin/medical'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/medical')
  return { success: true }
}

export async function removeTemplateItem(item_id: string) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()

  const { error: dbErr } = await adminClient.from('medical_bag_template_items').delete().eq('id', item_id)
  if (dbErr) { await logError(dbErr.message, '/dept-admin/medical'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/medical')
  return { success: true }
}

export async function deployBagFromTemplate(data: {
  apparatus_id: string
  template_id: string
  name: string
  inventory_mode: 'standard' | 'independent'
  compartment_id?: string | null
}) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  if (!ctx.department_id) return { error: 'Department not found.' }
  const adminClient = createAdminClient()

  let bagId: string

  if (data.compartment_id) {
    // Pinning to a physical compartment: reuse whatever storeroom already lives there
    // (e.g. loose medications added via "+ Add Item") rather than creating a second,
    // colliding storeroom for the same compartment.
    const room = await getOrCreateCompartmentStoreroom(adminClient, ctx.department_id, data.compartment_id)
    if ('error' in room) { await logError(room.error, '/apparatus'); return { error: room.error } }

    const { data: existingRoom } = await adminClient
      .from('medical_storerooms')
      .select('template_id')
      .eq('id', room.storeroom_id)
      .single()
    if (existingRoom?.template_id && existingRoom.template_id !== data.template_id) {
      return { error: 'This compartment already has a different bag assigned — remove it first.' }
    }

    const { error: updateErr } = await adminClient.from('medical_storerooms').update({
      name: data.name,
      template_id: data.template_id,
      inventory_mode: data.inventory_mode,
      updated_at: new Date().toISOString(),
    }).eq('id', room.storeroom_id)
    if (updateErr) { await logError(updateErr.message, '/apparatus'); return { error: updateErr.message } }
    bagId = room.storeroom_id
  } else {
    const { data: bag, error: bagErr } = await adminClient.from('medical_storerooms').insert({
      department_id: ctx.department_id,
      apparatus_id: data.apparatus_id,
      template_id: data.template_id,
      inventory_mode: data.inventory_mode,
      name: data.name,
      active: true,
    }).select('id').single()
    if (bagErr) { await logError(bagErr.message, '/apparatus'); return { error: bagErr.message } }
    bagId = bag.id
  }

  // Copy template items with their PAR levels — skip any supply type already assigned to
  // this storeroom (e.g. a loose item that predates the bag being pinned here) so we don't
  // collide with the storeroom_id/supply_type_id unique constraint or clobber its PAR.
  const { data: templateItems } = await adminClient
    .from('medical_bag_template_items')
    .select('supply_type_id, par_level')
    .eq('template_id', data.template_id)

  if (templateItems && templateItems.length > 0) {
    const { data: existingInv } = await adminClient
      .from('medical_storeroom_inventory')
      .select('supply_type_id')
      .eq('storeroom_id', bagId)
    const existingSupplyTypeIds = new Set((existingInv ?? []).map(i => i.supply_type_id))

    const rows = templateItems
      .filter(item => !existingSupplyTypeIds.has(item.supply_type_id))
      .map(item => ({
        storeroom_id: bagId,
        supply_type_id: item.supply_type_id,
        department_id: ctx.department_id,
        par_level: item.par_level,
      }))
    if (rows.length > 0) {
      const { error: invErr } = await adminClient.from('medical_storeroom_inventory').insert(rows)
      if (invErr) { await logError(invErr.message, '/apparatus'); return { error: invErr.message } }
    }
  }

  revalidatePath(`/apparatus/${data.apparatus_id}`)
  revalidatePath('/dept-admin/setup')
  return { success: true }
}

export async function assignBagToApparatus(data: {
  template_id: string
  apparatus_id: string
  name: string
  inventory_mode: 'standard' | 'independent'
  compartment_id?: string | null
}) {
  return deployBagFromTemplate({
    apparatus_id: data.apparatus_id,
    template_id: data.template_id,
    name: data.name,
    inventory_mode: data.inventory_mode,
    compartment_id: data.compartment_id,
  })
}

// Move (or unpin) a deployed bag between compartments on its own apparatus — same merge
// safety as deployBagFromTemplate: reuses whatever storeroom already lives at the target
// compartment instead of creating a colliding second one.
export async function updateBagCompartment(storeroom_id: string, compartment_id: string | null) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()

  const { data: bag } = await adminClient
    .from('medical_storerooms')
    .select('id, name, template_id, inventory_mode, apparatus_id, department_id')
    .eq('id', storeroom_id)
    .single()
  if (!bag) return { error: 'Bag not found.' }

  if (!compartment_id) {
    const { error: dbErr } = await adminClient.from('medical_storerooms')
      .update({ compartment_id: null, updated_at: new Date().toISOString() })
      .eq('id', storeroom_id)
    if (dbErr) { await logError(dbErr.message, '/apparatus'); return { error: dbErr.message } }
    revalidatePath('/dept-admin/setup')
    return { success: true }
  }

  const room = await getOrCreateCompartmentStoreroom(adminClient, bag.department_id, compartment_id)
  if ('error' in room) { await logError(room.error, '/apparatus'); return { error: room.error } }

  if (room.storeroom_id === storeroom_id) {
    revalidatePath('/dept-admin/setup')
    return { success: true }
  }

  const { data: targetRoom } = await adminClient
    .from('medical_storerooms')
    .select('template_id')
    .eq('id', room.storeroom_id)
    .single()
  if (targetRoom?.template_id && targetRoom.template_id !== bag.template_id) {
    return { error: 'That compartment already has a different bag assigned — remove it first.' }
  }

  // Merge this bag's own inventory into the target storeroom, then retire the old row.
  const { data: myInv } = await adminClient
    .from('medical_storeroom_inventory')
    .select('id, supply_type_id, par_level')
    .eq('storeroom_id', storeroom_id)
  const { data: targetInv } = await adminClient
    .from('medical_storeroom_inventory')
    .select('supply_type_id')
    .eq('storeroom_id', room.storeroom_id)
  const targetSupplyTypeIds = new Set((targetInv ?? []).map(i => i.supply_type_id))

  const toMove = (myInv ?? []).filter(i => !targetSupplyTypeIds.has(i.supply_type_id)).map(i => i.id)
  if (toMove.length > 0) {
    const { error: moveErr } = await adminClient.from('medical_storeroom_inventory')
      .update({ storeroom_id: room.storeroom_id })
      .in('id', toMove)
    if (moveErr) { await logError(moveErr.message, '/apparatus'); return { error: moveErr.message } }
  }

  const { error: renameErr } = await adminClient.from('medical_storerooms').update({
    name: bag.name,
    template_id: bag.template_id,
    inventory_mode: bag.inventory_mode,
    updated_at: new Date().toISOString(),
  }).eq('id', room.storeroom_id)
  if (renameErr) { await logError(renameErr.message, '/apparatus'); return { error: renameErr.message } }

  const { error: retireErr } = await adminClient.from('medical_storerooms')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', storeroom_id)
  if (retireErr) { await logError(retireErr.message, '/apparatus'); return { error: retireErr.message } }

  revalidatePath('/dept-admin/setup')
  return { success: true }
}

export async function removeBagFromApparatus(storeroom_id: string) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()

  const { data: lots } = await adminClient
    .from('medical_stock_lots')
    .select('id')
    .eq('storeroom_inventory_id', storeroom_id)
    .gt('quantity_remaining', 0)
    .limit(1)

  if (lots && lots.length > 0)
    return { error: 'Cannot remove — bag has active stock. Waste or transfer stock first.' }

  const { error: dbErr } = await adminClient
    .from('medical_storerooms')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', storeroom_id)

  if (dbErr) { await logError(dbErr.message, '/dept-admin/medical'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/medical')
  return { success: true }
}

export async function updateBagInventoryMode(storeroom_id: string, mode: 'standard' | 'independent') {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()

  const { error: dbErr } = await adminClient
    .from('medical_storerooms')
    .update({ inventory_mode: mode, updated_at: new Date().toISOString() })
    .eq('id', storeroom_id)

  if (dbErr) { await logError(dbErr.message, '/apparatus'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/medical')
  return { success: true }
}

// ─── Storerooms ───────────────────────────────────────────────────────────────

export async function createMedicalStoreroom(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()

  const { error: dbErr } = await adminClient.from('medical_storerooms').insert({
    department_id: ctx.department_id,
    station_id: (formData.get('station_id') as string) || null,
    apparatus_id: (formData.get('apparatus_id') as string) || null,
    compartment_id: (formData.get('compartment_id') as string) || null,
    name: formData.get('name') as string,
    notes: (formData.get('notes') as string) || null,
    active: true,
  })

  if (dbErr) { await logError(dbErr.message, '/dept-admin/medical'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/medical')
  return { success: true }
}

export async function updateMedicalStoreroom(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()

  const { error: dbErr } = await adminClient.from('medical_storerooms').update({
    station_id: (formData.get('station_id') as string) || null,
    apparatus_id: (formData.get('apparatus_id') as string) || null,
    compartment_id: (formData.get('compartment_id') as string) || null,
    name: formData.get('name') as string,
    notes: (formData.get('notes') as string) || null,
    active: formData.get('active') === 'true',
    updated_at: new Date().toISOString(),
  }).eq('id', formData.get('id') as string)

  if (dbErr) { await logError(dbErr.message, '/dept-admin/medical'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/medical')
  return { success: true }
}

export async function assignSupplyToStoreroom(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()

  const { error: dbErr } = await adminClient.from('medical_storeroom_inventory').upsert({
    storeroom_id: formData.get('storeroom_id') as string,
    supply_type_id: formData.get('supply_type_id') as string,
    department_id: ctx.department_id,
    par_level: parseInt(formData.get('par_level') as string) || 0,
  }, { onConflict: 'storeroom_id,supply_type_id' })

  if (dbErr) { await logError(dbErr.message, '/dept-admin/medical'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/medical')
  revalidatePath('/medical')
  return { success: true }
}

export async function updateStoreroomPar(inventory_id: string, par_level: number) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()

  const { error: dbErr } = await adminClient.from('medical_storeroom_inventory')
    .update({ par_level, updated_at: new Date().toISOString() })
    .eq('id', inventory_id)

  if (dbErr) { await logError(dbErr.message, '/dept-admin/medical'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/medical')
  revalidatePath('/medical')
  return { success: true }
}

// ─── Receive Stock ────────────────────────────────────────────────────────────

export async function receiveStock(data: {
  storeroom_inventory_id: string
  lot_number: string | null
  expiration_date: string | null
  quantity_received: number
  notes: string | null
  signer_1_id: string | null
  signer_2_id: string | null
  signer_1_signature: string | null
  signer_2_signature: string | null
  concentration_amount: number | null
  concentration_unit: string | null
  volume_per_unit: number | null
  volume_unit: string | null
  control_numbers: string[] | null
}) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Officers and admins only.' }
  const adminClient = createAdminClient()

  if (!data.storeroom_inventory_id || data.quantity_received < 1)
    return { error: 'Supply type and quantity are required.' }

  // Fetch inventory row to get storeroom + supply type for transaction
  const { data: invRow } = await adminClient
    .from('medical_storeroom_inventory')
    .select('storeroom_id, supply_type_id, department_id')
    .eq('id', data.storeroom_inventory_id)
    .single()
  if (!invRow) return { error: 'Inventory record not found.' }

  // Verify supply type signature requirements are satisfied
  const { data: supplyType } = await adminClient
    .from('medical_supply_types')
    .select('required_signatures, name, is_controlled')
    .eq('id', invRow.supply_type_id)
    .single()

  const sigsRequired = supplyType?.required_signatures ?? 0
  if (sigsRequired >= 1 && !data.signer_1_id) return { error: 'Signer 1 is required for this supply type.' }
  if (sigsRequired >= 1 && !data.signer_1_signature) return { error: 'Signer 1 must sign.' }
  if (sigsRequired >= 2 && !data.signer_2_id) return { error: 'A second signer is required for controlled substances.' }
  if (sigsRequired >= 2 && !data.signer_2_signature) return { error: 'The second signer must sign.' }

  // Controlled substances get one control number per vial — checked here rather than left
  // to the DB unique constraint alone so a typo'd duplicate surfaces as a clear error.
  if (supplyType?.is_controlled) {
    const numbers = (data.control_numbers ?? []).map(n => n.trim())
    if (numbers.length !== data.quantity_received || numbers.some(n => !n))
      return { error: 'A control number is required for every vial.' }
    if (new Set(numbers).size !== numbers.length)
      return { error: 'Control numbers must be unique — two vials have the same number.' }
  }

  const now = new Date().toISOString()

  // Create the lot
  const { data: lot, error: lotErr } = await adminClient.from('medical_stock_lots').insert({
    storeroom_inventory_id: data.storeroom_inventory_id,
    department_id: invRow.department_id,
    lot_number: data.lot_number || null,
    expiration_date: data.expiration_date || null,
    quantity_received: data.quantity_received,
    quantity_remaining: data.quantity_received,
    received_date: now.split('T')[0],
    received_by: ctx.me.id,
    notes: data.notes || null,
    active: true,
    concentration_amount: data.concentration_amount || null,
    concentration_unit: data.concentration_unit || null,
    volume_per_unit: data.volume_per_unit || null,
    volume_unit: data.volume_unit || null,
  }).select('id').single()

  if (lotErr) { await logError(lotErr.message, '/medical'); return { error: lotErr.message } }

  // Create the transaction record first so controlled-substance vials can be tagged with it
  // below — that's what lets the CS log resolve a "Received" line back to its control numbers
  // even after the vials are later transferred to a different lot (which reassigns lot_id).
  const { data: tx, error: txErr } = await adminClient.from('medical_stock_transactions').insert({
    department_id: invRow.department_id,
    storeroom_id: invRow.storeroom_id,
    supply_type_id: invRow.supply_type_id,
    supply_type_name: supplyType?.name ?? null,
    lot_id: lot.id,
    transaction_type: 'received',
    quantity: data.quantity_received,
    performed_by: ctx.me.id,
    signer_1_id: data.signer_1_id || null,
    signer_1_at: data.signer_1_id ? now : null,
    signer_1_signature_data: data.signer_1_signature || null,
    signer_2_id: data.signer_2_id || null,
    signer_2_at: data.signer_2_id ? now : null,
    signer_2_signature_data: data.signer_2_signature || null,
    notes: data.notes || null,
  }).select('id').single()

  if (txErr) { await logError(txErr.message, '/medical'); return { error: txErr.message } }

  if (supplyType?.is_controlled) {
    const { error: unitsErr } = await adminClient.from('medical_stock_units').insert(
      (data.control_numbers ?? []).map(control_number => ({
        lot_id: lot.id,
        department_id: invRow.department_id,
        control_number: control_number.trim(),
        status: 'available' as const,
        transaction_id: tx.id,
      }))
    )
    if (unitsErr) {
      await logError(unitsErr.message, '/medical', { metadata: { lot_id: lot.id } })
      const dup = unitsErr.code === '23505'
      return { error: dup ? 'One of these control numbers is already in use in this department.' : unitsErr.message }
    }
  }

  revalidatePath('/medical')
  return { success: true }
}

export async function dispenseStock(data: {
  storeroom_inventory_id: string
  lot_id: string
  quantity: number
  notes: string | null
  signer_1_id: string | null
  signer_2_id: string | null
  signer_1_signature: string | null
  signer_2_signature: string | null
}) {
  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Not authorized.' }
  if (!(await hasPermission(ctx.fullCtx, 'dispense_controlled_substances'))) return { error: 'Not authorized.' }
  const adminClient = createAdminClient()

  if (!data.lot_id || data.quantity < 1)
    return { error: 'Lot and quantity are required.' }

  // Fetch lot to verify quantity and get storeroom/supply context
  const { data: lot } = await adminClient
    .from('medical_stock_lots')
    .select('quantity_remaining, storeroom_inventory_id')
    .eq('id', data.lot_id)
    .single()
  if (!lot) return { error: 'Lot not found.' }
  if (lot.quantity_remaining < data.quantity)
    return { error: `Only ${lot.quantity_remaining} units available in this lot.` }

  // Fetch inventory row for storeroom + supply type
  const { data: invRow } = await adminClient
    .from('medical_storeroom_inventory')
    .select('storeroom_id, supply_type_id, department_id')
    .eq('id', data.storeroom_inventory_id)
    .single()
  if (!invRow) return { error: 'Inventory record not found.' }

  // Check signature requirements
  const { data: supplyType } = await adminClient
    .from('medical_supply_types')
    .select('name, required_signatures')
    .eq('id', invRow.supply_type_id)
    .single()

  const sigsRequired = supplyType?.required_signatures ?? 0
  if (sigsRequired >= 1 && !data.signer_1_id) return { error: 'Signer 1 is required for this supply type.' }
  if (sigsRequired >= 1 && !data.signer_1_signature) return { error: 'Signer 1 must sign.' }
  if (sigsRequired >= 2 && !data.signer_2_id) return { error: 'A second signer is required for controlled substances.' }
  if (sigsRequired >= 2 && !data.signer_2_signature) return { error: 'The second signer must sign.' }

  const now = new Date().toISOString()
  const newQty = lot.quantity_remaining - data.quantity

  // Deduct from lot
  const { error: lotErr } = await adminClient
    .from('medical_stock_lots')
    .update({ quantity_remaining: newQty, active: newQty > 0, updated_at: now })
    .eq('id', data.lot_id)
  if (lotErr) { await logError(lotErr.message, '/medical'); return { error: lotErr.message } }

  // Record transaction
  const { error: txErr } = await adminClient.from('medical_stock_transactions').insert({
    department_id: invRow.department_id,
    storeroom_id: invRow.storeroom_id,
    supply_type_id: invRow.supply_type_id,
    supply_type_name: supplyType?.name ?? null,
    lot_id: data.lot_id,
    transaction_type: 'dispensed',
    quantity: data.quantity,
    performed_by: ctx.me.id,
    signer_1_id: data.signer_1_id || null,
    signer_1_at: data.signer_1_id ? now : null,
    signer_1_signature_data: data.signer_1_signature || null,
    signer_2_id: data.signer_2_id || null,
    signer_2_at: data.signer_2_id ? now : null,
    signer_2_signature_data: data.signer_2_signature || null,
    notes: data.notes || null,
  })
  if (txErr) { await logError(txErr.message, '/medical'); return { error: txErr.message } }

  revalidatePath('/medical')
  return { success: true }
}

// ─── Administer (per-vial: amount given, remainder auto-wasted) ──────────────

export async function administerStock(data: {
  storeroom_inventory_id: string
  unit_id: string
  administered_amount: number
  notes: string | null
  signer_1_id: string | null
  signer_2_id: string | null
  signer_1_signature: string | null
  signer_2_signature: string | null
}) {
  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Not authorized.' }
  if (!(await hasPermission(ctx.fullCtx, 'dispense_controlled_substances'))) return { error: 'Not authorized.' }
  const adminClient = createAdminClient()

  if (!data.unit_id || !data.administered_amount || data.administered_amount <= 0)
    return { error: 'Select a vial and enter the amount administered.' }

  const { data: unit } = await adminClient
    .from('medical_stock_units')
    .select('id, lot_id, status, control_number')
    .eq('id', data.unit_id)
    .single()
  if (!unit) return { error: 'Vial not found.' }
  if (unit.status !== 'available') return { error: `Vial ${unit.control_number} has already been ${unit.status}.` }

  const { data: lot } = await adminClient
    .from('medical_stock_lots')
    .select('quantity_remaining, volume_per_unit, volume_unit, storeroom_inventory_id')
    .eq('id', unit.lot_id)
    .single()
  if (!lot) return { error: 'Lot not found.' }
  if (lot.storeroom_inventory_id !== data.storeroom_inventory_id) return { error: 'Vial does not belong to this storeroom.' }
  if (lot.quantity_remaining < 1) return { error: 'No vials remaining in this lot.' }
  if (!lot.volume_per_unit) return { error: 'This lot has no volume per unit on file — cannot log administration.' }
  if (data.administered_amount > lot.volume_per_unit)
    return { error: `Administered amount cannot exceed ${lot.volume_per_unit} ${lot.volume_unit ?? ''} per vial.` }

  const { data: invRow } = await adminClient
    .from('medical_storeroom_inventory')
    .select('storeroom_id, supply_type_id, department_id')
    .eq('id', data.storeroom_inventory_id)
    .single()
  if (!invRow) return { error: 'Inventory record not found.' }

  const { data: supplyType } = await adminClient
    .from('medical_supply_types')
    .select('name, required_signatures')
    .eq('id', invRow.supply_type_id)
    .single()

  const sigsRequired = supplyType?.required_signatures ?? 0
  if (sigsRequired >= 1 && !data.signer_1_id) return { error: 'Signer 1 is required.' }
  if (sigsRequired >= 1 && !data.signer_1_signature) return { error: 'Signer 1 must sign.' }
  if (sigsRequired >= 2 && !data.signer_2_id) return { error: 'A witness is required for controlled substance administration.' }
  if (sigsRequired >= 2 && !data.signer_2_signature) return { error: 'The witness must sign.' }

  const wasteAmount = Math.round((lot.volume_per_unit - data.administered_amount) * 1000) / 1000
  const now = new Date().toISOString()
  const newQty = lot.quantity_remaining - 1

  const { error: lotErr } = await adminClient
    .from('medical_stock_lots')
    .update({ quantity_remaining: newQty, active: newQty > 0, updated_at: now })
    .eq('id', unit.lot_id)
  if (lotErr) { await logError(lotErr.message, '/medical'); return { error: lotErr.message } }

  const { data: tx, error: txErr } = await adminClient.from('medical_stock_transactions').insert({
    department_id: invRow.department_id,
    storeroom_id: invRow.storeroom_id,
    supply_type_id: invRow.supply_type_id,
    supply_type_name: supplyType?.name ?? null,
    lot_id: unit.lot_id,
    transaction_type: 'administered',
    quantity: 1,
    administered_amount: data.administered_amount,
    waste_amount: wasteAmount,
    volume_unit: lot.volume_unit,
    performed_by: ctx.me.id,
    signer_1_id: data.signer_1_id || null,
    signer_1_at: data.signer_1_id ? now : null,
    signer_1_signature_data: data.signer_1_signature || null,
    signer_2_id: data.signer_2_id || null,
    signer_2_at: data.signer_2_id ? now : null,
    signer_2_signature_data: data.signer_2_signature || null,
    notes: data.notes || null,
  }).select('id').single()
  if (txErr) { await logError(txErr.message, '/medical'); return { error: txErr.message } }

  const { error: unitErr } = await adminClient
    .from('medical_stock_units')
    .update({ status: 'administered', transaction_id: tx.id })
    .eq('id', unit.id)
  if (unitErr) await logError(unitErr.message, '/medical', { metadata: { unit_id: unit.id, transaction_id: tx.id } })

  revalidatePath('/medical')
  return { success: true, wasteAmount }
}

export async function wasteStock(data: {
  storeroom_inventory_id: string
  lot_id: string
  quantity: number
  unit_ids: string[] | null
  waste_reason: string
  notes: string | null
  signer_1_id: string | null
  signer_2_id: string | null
  signer_1_signature: string | null
  signer_2_signature: string | null
}) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Officers and admins only.' }
  const adminClient = createAdminClient()

  if (!data.lot_id || data.quantity < 1)
    return { error: 'Lot and quantity are required.' }

  const { data: lot } = await adminClient
    .from('medical_stock_lots')
    .select('quantity_remaining')
    .eq('id', data.lot_id)
    .single()
  if (!lot) return { error: 'Lot not found.' }
  if (lot.quantity_remaining < data.quantity)
    return { error: `Only ${lot.quantity_remaining} units available in this lot.` }

  const { data: invRow } = await adminClient
    .from('medical_storeroom_inventory')
    .select('storeroom_id, supply_type_id, department_id')
    .eq('id', data.storeroom_inventory_id)
    .single()
  if (!invRow) return { error: 'Inventory record not found.' }

  const { data: supplyType } = await adminClient
    .from('medical_supply_types')
    .select('name, required_signatures, is_controlled')
    .eq('id', invRow.supply_type_id)
    .single()

  const sigsRequired = supplyType?.required_signatures ?? 0
  if (sigsRequired >= 1 && !data.signer_1_id) return { error: 'Signer 1 is required.' }
  if (sigsRequired >= 1 && !data.signer_1_signature) return { error: 'Signer 1 must sign.' }
  if (sigsRequired >= 2 && !data.signer_2_id) return { error: 'A witness is required for controlled substance waste.' }
  if (sigsRequired >= 2 && !data.signer_2_signature) return { error: 'The witness must sign.' }

  // Controlled substances are wasted by specific vial, not a raw count — verify the
  // selected vials are actually available and belong to this lot before touching anything.
  let units: { id: string; control_number: string }[] = []
  if (supplyType?.is_controlled) {
    const unitIds = data.unit_ids ?? []
    if (unitIds.length !== data.quantity) return { error: 'Select which vials are being wasted.' }
    const { data: fetchedUnits } = await adminClient
      .from('medical_stock_units')
      .select('id, control_number, status, lot_id')
      .in('id', unitIds)
    if (!fetchedUnits || fetchedUnits.length !== unitIds.length) return { error: 'One or more selected vials could not be found.' }
    const badUnit = fetchedUnits.find(u => u.lot_id !== data.lot_id || u.status !== 'available')
    if (badUnit) return { error: `Vial ${badUnit.control_number} is not available in this lot.` }
    units = fetchedUnits
  }

  const now = new Date().toISOString()
  const newQty = lot.quantity_remaining - data.quantity

  const { error: lotErr } = await adminClient
    .from('medical_stock_lots')
    .update({ quantity_remaining: newQty, active: newQty > 0, updated_at: now })
    .eq('id', data.lot_id)
  if (lotErr) { await logError(lotErr.message, '/medical'); return { error: lotErr.message } }

  const noteText = [data.waste_reason, data.notes].filter(Boolean).join(' — ')
  const { data: tx, error: txErr } = await adminClient.from('medical_stock_transactions').insert({
    department_id: invRow.department_id,
    storeroom_id: invRow.storeroom_id,
    supply_type_id: invRow.supply_type_id,
    supply_type_name: supplyType?.name ?? null,
    lot_id: data.lot_id,
    transaction_type: 'wasted',
    quantity: data.quantity,
    performed_by: ctx.me.id,
    signer_1_id: data.signer_1_id || null,
    signer_1_at: data.signer_1_id ? now : null,
    signer_1_signature_data: data.signer_1_signature || null,
    signer_2_id: data.signer_2_id || null,
    signer_2_at: data.signer_2_id ? now : null,
    signer_2_signature_data: data.signer_2_signature || null,
    notes: noteText || null,
  }).select('id').single()
  if (txErr) { await logError(txErr.message, '/medical'); return { error: txErr.message } }

  if (units.length > 0) {
    const { error: unitsErr } = await adminClient
      .from('medical_stock_units')
      .update({ status: 'wasted', transaction_id: tx.id })
      .in('id', units.map(u => u.id))
    if (unitsErr) await logError(unitsErr.message, '/medical', { metadata: { transaction_id: tx.id } })
  }

  revalidatePath('/medical')
  return { success: true }
}

export async function transferStock(data: {
  source_inventory_id: string
  lot_id: string
  destination_storeroom_id: string
  quantity: number
  notes: string | null
}) {
  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Not authorized.' }
  const adminClient = createAdminClient()

  if (!data.lot_id || data.quantity < 1)
    return { error: 'Lot and quantity are required.' }

  // Fetch source lot
  const { data: lot } = await adminClient
    .from('medical_stock_lots')
    .select('quantity_remaining, lot_number, expiration_date, received_date, concentration_amount, concentration_unit, volume_per_unit, volume_unit')
    .eq('id', data.lot_id)
    .single()
  if (!lot) return { error: 'Lot not found.' }
  if (lot.quantity_remaining < data.quantity)
    return { error: `Only ${lot.quantity_remaining} units available in this lot.` }

  // Fetch source inventory row
  const { data: srcInv } = await adminClient
    .from('medical_storeroom_inventory')
    .select('storeroom_id, supply_type_id, department_id')
    .eq('id', data.source_inventory_id)
    .single()
  if (!srcInv) return { error: 'Source inventory record not found.' }
  if (srcInv.storeroom_id === data.destination_storeroom_id)
    return { error: 'Source and destination storeroom must be different.' }

  // Controlled substances require officer+
  const { data: supplyTypeRow } = await adminClient
    .from('medical_supply_types')
    .select('name, is_controlled')
    .eq('id', srcInv.supply_type_id)
    .single()
  if (supplyTypeRow?.is_controlled && !ctx.isOfficerOrAbove)
    return { error: 'Controlled substances can only be transferred by officers or admins.' }

  // Find destination inventory row for same supply type
  const { data: destInvList } = await adminClient
    .from('medical_storeroom_inventory')
    .select('id')
    .eq('storeroom_id', data.destination_storeroom_id)
    .eq('supply_type_id', srcInv.supply_type_id)
  const destInv = destInvList?.[0]
  if (!destInv) return { error: 'Destination storeroom does not have this supply type assigned.' }

  const now = new Date().toISOString()
  const newSrcQty = lot.quantity_remaining - data.quantity

  // Deduct from source lot
  const { error: srcLotErr } = await adminClient
    .from('medical_stock_lots')
    .update({ quantity_remaining: newSrcQty, active: newSrcQty > 0, updated_at: now })
    .eq('id', data.lot_id)
  if (srcLotErr) { await logError(srcLotErr.message, '/medical'); return { error: srcLotErr.message } }

  // Create new lot in destination
  const { data: newLot, error: newLotErr } = await adminClient
    .from('medical_stock_lots')
    .insert({
      storeroom_inventory_id: destInv.id,
      department_id: srcInv.department_id,
      lot_number: lot.lot_number,
      expiration_date: lot.expiration_date,
      quantity_received: data.quantity,
      quantity_remaining: data.quantity,
      received_date: lot.received_date,
      received_by: ctx.me.id,
      notes: data.notes || null,
      active: true,
      concentration_amount: lot.concentration_amount,
      concentration_unit: lot.concentration_unit,
      volume_per_unit: lot.volume_per_unit,
      volume_unit: lot.volume_unit,
    })
    .select('id')
    .single()
  if (newLotErr) { await logError(newLotErr.message, '/medical'); return { error: newLotErr.message } }

  // Controlled substances carry their physical vial identity with them — move the oldest
  // available control-numbered units from the source lot onto the new destination lot.
  if (supplyTypeRow?.is_controlled) {
    const { data: movableUnits } = await adminClient
      .from('medical_stock_units')
      .select('id')
      .eq('lot_id', data.lot_id)
      .eq('status', 'available')
      .order('created_at', { ascending: true })
      .limit(data.quantity)
    if (movableUnits && movableUnits.length > 0) {
      const { error: moveErr } = await adminClient
        .from('medical_stock_units')
        .update({ lot_id: newLot.id })
        .in('id', movableUnits.map(u => u.id))
      if (moveErr) await logError(moveErr.message, '/medical', { metadata: { lot_id: data.lot_id, new_lot_id: newLot.id } })
    }
  }

  // transferred_out transaction
  const { error: txOutErr } = await adminClient.from('medical_stock_transactions').insert({
    department_id: srcInv.department_id,
    storeroom_id: srcInv.storeroom_id,
    supply_type_id: srcInv.supply_type_id,
    supply_type_name: supplyTypeRow?.name ?? null,
    lot_id: data.lot_id,
    transaction_type: 'transferred_out',
    quantity: data.quantity,
    performed_by: ctx.me.id,
    notes: data.notes || null,
  })
  if (txOutErr) { await logError(txOutErr.message, '/medical'); return { error: txOutErr.message } }

  // transferred_in transaction
  const { error: txInErr } = await adminClient.from('medical_stock_transactions').insert({
    department_id: srcInv.department_id,
    storeroom_id: data.destination_storeroom_id,
    supply_type_id: srcInv.supply_type_id,
    supply_type_name: supplyTypeRow?.name ?? null,
    lot_id: newLot.id,
    transaction_type: 'transferred_in',
    quantity: data.quantity,
    performed_by: ctx.me.id,
    notes: data.notes || null,
  })
  if (txInErr) { await logError(txInErr.message, '/medical'); return { error: txInErr.message } }

  revalidatePath('/medical')
  return { success: true }
}

export async function transferToCompartment(data: {
  source_inventory_id: string
  lot_id: string
  compartment_id: string   // apparatus_compartments.id
  quantity: number
  notes: string | null
}) {
  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Not authorized.' }
  const adminClient = createAdminClient()

  if (!data.lot_id || data.quantity < 1)
    return { error: 'Lot and quantity are required.' }

  const { data: lot } = await adminClient
    .from('medical_stock_lots')
    .select('quantity_remaining, lot_number, expiration_date, received_date')
    .eq('id', data.lot_id)
    .single()
  if (!lot) return { error: 'Lot not found.' }
  if (lot.quantity_remaining < data.quantity)
    return { error: `Only ${lot.quantity_remaining} units available in this lot.` }

  const { data: srcInv } = await adminClient
    .from('medical_storeroom_inventory')
    .select('storeroom_id, supply_type_id, department_id')
    .eq('id', data.source_inventory_id)
    .single()
  if (!srcInv) return { error: 'Source inventory record not found.' }

  const { data: supplyTypeRow } = await adminClient
    .from('medical_supply_types')
    .select('is_controlled')
    .eq('id', srcInv.supply_type_id)
    .single()
  if (supplyTypeRow?.is_controlled && !ctx.isOfficerOrAbove)
    return { error: 'Controlled substances can only be transferred by officers or admins.' }

  // Resolve (or auto-create) the compartment's medical storeroom
  const room = await getOrCreateCompartmentStoreroom(adminClient, ctx.department_id, data.compartment_id)
  if ('error' in room) { await logError(room.error, '/medical'); return { error: room.error } }
  const destStoreroomId = room.storeroom_id

  // Get or auto-create inventory assignment for this supply type
  const { data: existingInv } = await adminClient
    .from('medical_storeroom_inventory')
    .select('id')
    .eq('storeroom_id', destStoreroomId)
    .eq('supply_type_id', srcInv.supply_type_id)

  if (!existingInv || existingInv.length === 0) {
    const { error: invErr } = await adminClient
      .from('medical_storeroom_inventory')
      .insert({
        storeroom_id: destStoreroomId,
        supply_type_id: srcInv.supply_type_id,
        department_id: ctx.department_id,
        par_level: 0,
      })
    if (invErr) { await logError(invErr.message, '/medical'); return { error: invErr.message } }
  }

  // Now delegate to transferStock with the resolved destination storeroom
  return transferStock({
    source_inventory_id: data.source_inventory_id,
    lot_id: data.lot_id,
    destination_storeroom_id: destStoreroomId,
    quantity: data.quantity,
    notes: data.notes,
  })
}

export async function adjustStock(data: {
  lot_id: string
  storeroom_inventory_id: string
  new_quantity: number
  reason: string
  notes: string | null
}) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()

  if (data.new_quantity < 0) return { error: 'Quantity cannot be negative.' }

  const { data: lot } = await adminClient
    .from('medical_stock_lots')
    .select('quantity_remaining')
    .eq('id', data.lot_id)
    .single()
  if (!lot) return { error: 'Lot not found.' }

  // Controlled substances are vial-tracked by control number — a blind count adjustment
  // can't tell which physical vial it's supposedly adding or removing. Use Waste/Administer
  // instead so the specific vial stays accounted for.
  const { count: unitCount } = await adminClient
    .from('medical_stock_units')
    .select('id', { count: 'exact', head: true })
    .eq('lot_id', data.lot_id)
  if (unitCount && unitCount > 0)
    return { error: 'This lot is tracked by control number — use Waste to remove a specific vial instead of adjusting the count.' }

  const delta = data.new_quantity - lot.quantity_remaining
  if (delta === 0) return { error: 'New quantity is the same as current quantity.' }

  const { data: invRow } = await adminClient
    .from('medical_storeroom_inventory')
    .select('storeroom_id, supply_type_id, department_id')
    .eq('id', data.storeroom_inventory_id)
    .single()
  if (!invRow) return { error: 'Inventory record not found.' }

  const { data: supplyType } = await adminClient
    .from('medical_supply_types')
    .select('name')
    .eq('id', invRow.supply_type_id)
    .single()

  const now = new Date().toISOString()
  const noteText = [data.reason, data.notes].filter(Boolean).join(' — ')

  const { error: lotErr } = await adminClient
    .from('medical_stock_lots')
    .update({ quantity_remaining: data.new_quantity, active: data.new_quantity > 0, updated_at: now })
    .eq('id', data.lot_id)
  if (lotErr) { await logError(lotErr.message, '/medical'); return { error: lotErr.message } }

  const { error: txErr } = await adminClient.from('medical_stock_transactions').insert({
    department_id: invRow.department_id,
    storeroom_id: invRow.storeroom_id,
    supply_type_id: invRow.supply_type_id,
    supply_type_name: supplyType?.name ?? null,
    lot_id: data.lot_id,
    transaction_type: 'adjusted',
    quantity: Math.abs(delta),
    performed_by: ctx.me.id,
    notes: `${delta > 0 ? '+' : ''}${delta} — ${noteText}`,
  })
  if (txErr) { await logError(txErr.message, '/medical'); return { error: txErr.message } }

  revalidatePath('/medical')
  return { success: true }
}

export async function submitReorderRequest(inventory_id: string, notes: string | null) {
  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Not authorized.' }
  const adminClient = createAdminClient()

  const { data: inv } = await adminClient
    .from('medical_storeroom_inventory')
    .select('department_id')
    .eq('id', inventory_id)
    .single()
  if (!inv) return { error: 'Inventory record not found.' }

  // Avoid duplicate pending requests for the same item
  const { data: existing } = await adminClient
    .from('medical_reorder_requests')
    .select('id')
    .eq('storeroom_inventory_id', inventory_id)
    .eq('status', 'pending')
    .limit(1)
  if (existing && existing.length > 0) return { error: 'A pending restock request already exists for this item.' }

  const { error: dbErr } = await adminClient.from('medical_reorder_requests').insert({
    department_id: inv.department_id,
    storeroom_inventory_id: inventory_id,
    requested_by: ctx.me.id,
    notes: notes || null,
    status: 'pending',
  })
  if (dbErr) { await logError(dbErr.message, '/medical'); return { error: dbErr.message } }

  revalidatePath('/medical')
  revalidatePath('/inbox')
  return { success: true }
}

export async function fulfillReorderRequest(request_id: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Officers and admins only.' }
  const adminClient = createAdminClient()

  const { error: dbErr } = await adminClient
    .from('medical_reorder_requests')
    .update({ status: 'fulfilled', fulfilled_by: ctx.me.id, fulfilled_at: new Date().toISOString() })
    .eq('id', request_id)
  if (dbErr) { await logError(dbErr.message, '/inbox'); return { error: dbErr.message } }

  revalidatePath('/inbox')
  revalidatePath('/medical')
  return { success: true }
}

export async function dismissReorderRequest(request_id: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Officers and admins only.' }
  const adminClient = createAdminClient()

  const { error: dbErr } = await adminClient
    .from('medical_reorder_requests')
    .update({ status: 'dismissed', fulfilled_by: ctx.me.id, fulfilled_at: new Date().toISOString() })
    .eq('id', request_id)
  if (dbErr) { await logError(dbErr.message, '/inbox'); return { error: dbErr.message } }

  revalidatePath('/inbox')
  return { success: true }
}

export async function updateStockLot(data: {
  lot_id: string
  lot_number: string | null
  expiration_date: string | null
}) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Officers and admins only.' }
  const adminClient = createAdminClient()

  const { error: dbErr } = await adminClient
    .from('medical_stock_lots')
    .update({ lot_number: data.lot_number || null, expiration_date: data.expiration_date || null })
    .eq('id', data.lot_id)
  if (dbErr) { await logError(dbErr.message, '/medical'); return { error: dbErr.message } }

  revalidatePath('/medical')
  revalidatePath('/equipment')
  return { success: true }
}

export async function wasteExpiredLots(data: {
  storeroom_inventory_id: string
  waste_reason: string
  notes: string | null
  signer_1_id: string | null
  signer_2_id: string | null
  signer_1_signature: string | null
  signer_2_signature: string | null
}) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Officers and admins only.' }
  const adminClient = createAdminClient()

  const { data: invRow } = await adminClient
    .from('medical_storeroom_inventory')
    .select('storeroom_id, supply_type_id, department_id')
    .eq('id', data.storeroom_inventory_id)
    .single()
  if (!invRow) return { error: 'Inventory record not found.' }

  const { data: supplyType } = await adminClient
    .from('medical_supply_types')
    .select('name, required_signatures')
    .eq('id', invRow.supply_type_id)
    .single()

  const sigsRequired = supplyType?.required_signatures ?? 0
  if (sigsRequired >= 1 && !data.signer_1_id) return { error: 'Signer 1 is required.' }
  if (sigsRequired >= 1 && !data.signer_1_signature) return { error: 'Signer 1 must sign.' }
  if (sigsRequired >= 2 && !data.signer_2_id) return { error: 'A witness is required for controlled substance waste.' }
  if (sigsRequired >= 2 && !data.signer_2_signature) return { error: 'The witness must sign.' }

  const now = new Date()
  const { data: expiredLots } = await adminClient
    .from('medical_stock_lots')
    .select('id, lot_number, quantity_remaining')
    .eq('storeroom_inventory_id', data.storeroom_inventory_id)
    .eq('active', true)
    .gt('quantity_remaining', 0)
    .lt('expiration_date', now.toISOString().split('T')[0])

  if (!expiredLots || expiredLots.length === 0)
    return { error: 'No expired lots found.' }

  const noteText = [data.waste_reason, data.notes].filter(Boolean).join(' — ')

  for (const lot of expiredLots) {
    const { error: lotErr } = await adminClient
      .from('medical_stock_lots')
      .update({ quantity_remaining: 0, active: false })
      .eq('id', lot.id)
    if (lotErr) { await logError(lotErr.message, '/medical'); return { error: lotErr.message } }

    const { data: tx, error: txErr } = await adminClient.from('medical_stock_transactions').insert({
      department_id: invRow.department_id,
      storeroom_id: invRow.storeroom_id,
      supply_type_id: invRow.supply_type_id,
      supply_type_name: supplyType?.name ?? null,
      lot_id: lot.id,
      transaction_type: 'wasted',
      quantity: lot.quantity_remaining,
      performed_by: ctx.me.id,
      signer_1_id: data.signer_1_id || null,
      signer_1_at: data.signer_1_id ? now.toISOString() : null,
      signer_1_signature_data: data.signer_1_signature || null,
      signer_2_id: data.signer_2_id || null,
      signer_2_at: data.signer_2_id ? now.toISOString() : null,
      signer_2_signature_data: data.signer_2_signature || null,
      notes: noteText || null,
    }).select('id').single()
    if (txErr) { await logError(txErr.message, '/medical'); return { error: txErr.message } }

    const { error: unitsErr } = await adminClient
      .from('medical_stock_units')
      .update({ status: 'wasted', transaction_id: tx.id })
      .eq('lot_id', lot.id)
      .eq('status', 'available')
    if (unitsErr) await logError(unitsErr.message, '/medical', { metadata: { lot_id: lot.id, transaction_id: tx.id } })
  }

  revalidatePath('/medical')
  revalidatePath('/equipment')
  return { success: true, count: expiredLots.length }
}

export async function removeSupplyFromStoreroom(inventory_id: string) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()

  // Only allow removal if no active lots exist
  const { data: lots } = await adminClient
    .from('medical_stock_lots')
    .select('id')
    .eq('storeroom_inventory_id', inventory_id)
    .gt('quantity_remaining', 0)

  if (lots && lots.length > 0) return { error: 'Cannot remove — active stock lots exist. Adjust quantities first.' }

  const { error: dbErr } = await adminClient
    .from('medical_storeroom_inventory')
    .delete()
    .eq('id', inventory_id)

  if (dbErr) { await logError(dbErr.message, '/dept-admin/medical'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/medical')
  revalidatePath('/medical')
  return { success: true }
}
