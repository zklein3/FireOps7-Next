import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { getPermissionSnapshot } from '@/lib/permissions'
import EquipmentDetailClient from './EquipmentDetailClient'
import MedicalBagsSection from '@/app/(dashboard)/apparatus/[id]/MedicalBagsSection'
import MedicalCompartmentsSection from '@/app/(dashboard)/apparatus/[id]/MedicalCompartmentsSection'
import { getMedicalSupplyStatus, type MedicalSupplyStatus } from '@/lib/medical-status'

export default async function EquipmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string }>
}) {
  const { id } = await params
  const { from } = await searchParams
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')
  const me = { id: ctx.personnelId }

  const equipmentPermissions = await getPermissionSnapshot(ctx)
  const isAdmin = equipmentPermissions.manage_apparatus
  const isOfficerOrAbove = equipmentPermissions.manage_inventory

  // Fetch apparatus
  const { data: apparatusList } = await adminClient
    .from('apparatus')
    .select('id, unit_number, apparatus_name, apparatus_type_id, station_id')
    .eq('id', id)

  const apparatus = apparatusList?.[0]
  if (!apparatus) redirect('/equipment')

  // Fetch type + station
  const { data: typeData } = apparatus.apparatus_type_id
    ? await adminClient.from('apparatus_types').select('id, name').eq('id', apparatus.apparatus_type_id)
    : { data: [] }

  const { data: stationData } = apparatus.station_id
    ? await adminClient.from('stations').select('id, station_name, station_number').eq('id', apparatus.station_id)
    : { data: [] }

  // Fetch compartments for this apparatus
  const { data: compartmentLinks } = await adminClient
    .from('apparatus_compartments')
    .select('id, compartment_name_id, active')
    .eq('apparatus_id', id)
    .eq('active', true)

  const compartmentNameIds = (compartmentLinks ?? []).map(c => c.compartment_name_id).filter(Boolean)
  const { data: compartmentNameData } = compartmentNameIds.length > 0
    ? await adminClient.from('compartment_names').select('id, compartment_code, compartment_name, sort_order').in('id', compartmentNameIds)
    : { data: [] }

  const compartmentNameMap = Object.fromEntries((compartmentNameData ?? []).map(c => [c.id, c]))

  // Fetch item location standards for these compartments
  const compartmentIds = (compartmentLinks ?? []).map(c => c.id)
  const { data: locationStandards } = compartmentIds.length > 0
    ? await adminClient
        .from('item_location_standards')
        .select('id, apparatus_compartment_id, item_id, expected_quantity, minimum_quantity, notes, active')
        .in('apparatus_compartment_id', compartmentIds)
        .eq('active', true)
    : { data: [] }

  // Fetch item details
  const itemIds = (locationStandards ?? []).map(ls => ls.item_id).filter(Boolean)
  const { data: itemData } = itemIds.length > 0
    ? await adminClient.from('items').select('id, item_name, item_description, category_id, requires_inspection, tracks_assets').in('id', itemIds)
    : { data: [] }

  // For tracked-asset items, fetch how many are assigned to this apparatus
  const trackedItemIds = (itemData ?? []).filter((i: { tracks_assets: boolean }) => i.tracks_assets).map((i: { id: string }) => i.id)
  const { data: assignedAssetsRaw } = trackedItemIds.length > 0
    ? await adminClient
        .from('item_assets')
        .select('id, item_id')
        .eq('apparatus_id', id)
        .eq('active', true)
        .neq('status', 'RETIRED')
        .in('item_id', trackedItemIds)
    : { data: [] }

  const assignedCountByItem = (assignedAssetsRaw ?? []).reduce<Record<string, number>>((acc, a) => {
    acc[a.item_id] = (acc[a.item_id] ?? 0) + 1
    return acc
  }, {})

  const categoryIds = (itemData ?? []).map(i => i.category_id).filter(Boolean)
  const { data: categoryData } = categoryIds.length > 0
    ? await adminClient.from('item_categories').select('id, category_name').in('id', categoryIds)
    : { data: [] }

  const itemMap = Object.fromEntries((itemData ?? []).map(i => [i.id, i]))
  const categoryMap = Object.fromEntries((categoryData ?? []).map(c => [c.id, c.category_name]))

  // Fetch ALL items for this department for assignment dropdown
  const { data: allItems } = await adminClient
    .from('items')
    .select('id, item_name, category_id')
    .eq('department_id', ctx.departmentId)
    .eq('active', true)
    .order('item_name')

  const { data: allCategories } = await adminClient
    .from('item_categories')
    .select('id, category_name, sort_order')
    .eq('department_id', ctx.departmentId)
    .eq('active', true)
    .order('sort_order')

  // Fetch all apparatus + compartments for move modal
  const { data: allApparatusList } = await adminClient
    .from('apparatus')
    .select('id, unit_number, apparatus_name')
    .eq('department_id', ctx.departmentId)
    .eq('active', true)
    .order('unit_number')

  const allApparatusIds = (allApparatusList ?? []).map(a => a.id)
  const { data: allCompartmentLinks } = allApparatusIds.length > 0
    ? await adminClient
        .from('apparatus_compartments')
        .select('id, apparatus_id, compartment_name_id')
        .in('apparatus_id', allApparatusIds)
        .eq('active', true)
    : { data: [] }

  const allCompartmentNameIds = (allCompartmentLinks ?? []).map(c => c.compartment_name_id).filter(Boolean)
  const { data: allCompartmentNames } = allCompartmentNameIds.length > 0
    ? await adminClient
        .from('compartment_names')
        .select('id, compartment_code, compartment_name, sort_order')
        .in('id', allCompartmentNameIds)
    : { data: [] }

  const allCompartmentNameMap = Object.fromEntries((allCompartmentNames ?? []).map(c => [c.id, c]))

  const allApparatus = (allApparatusList ?? []).map(a => ({
    id: a.id,
    unit_number: a.unit_number,
    apparatus_name: a.apparatus_name,
    compartments: (allCompartmentLinks ?? [])
      .filter(c => c.apparatus_id === a.id)
      .map(c => {
        const cn = allCompartmentNameMap[c.compartment_name_id]
        return {
          id: c.id,
          compartment_code: cn?.compartment_code ?? '—',
          compartment_name: cn?.compartment_name ?? null,
          sort_order: cn?.sort_order ?? 999,
        }
      })
      .sort((a, b) => a.sort_order - b.sort_order),
  }))

  // Build compartment data with their items
  const compartments = (compartmentLinks ?? [])
    .map(c => {
      const nameData = compartmentNameMap[c.compartment_name_id]
      const items = (locationStandards ?? [])
        .filter(ls => ls.apparatus_compartment_id === c.id)
        .map(ls => ({
          id: ls.id,
          item_id: ls.item_id,
          item_name: itemMap[ls.item_id]?.item_name ?? '—',
          category_name: categoryMap[itemMap[ls.item_id]?.category_id] ?? '—',
          requires_inspection: itemMap[ls.item_id]?.requires_inspection ?? false,
          tracks_assets: itemMap[ls.item_id]?.tracks_assets ?? false,
          expected_quantity: ls.expected_quantity,
          minimum_quantity: ls.minimum_quantity,
          notes: ls.notes,
          assigned_count: itemMap[ls.item_id]?.tracks_assets ? (assignedCountByItem[ls.item_id] ?? 0) : null,
        }))

      return {
        id: c.id,
        compartment_code: nameData?.compartment_code ?? '—',
        compartment_name: nameData?.compartment_name ?? null,
        sort_order: nameData?.sort_order ?? 999,
        items,
      }
    })
    .sort((a, b) => a.sort_order - b.sort_order)

  const apparatusWithRefs = {
    id: apparatus.id,
    unit_number: apparatus.unit_number,
    apparatus_name: apparatus.apparatus_name,
    type_name: (typeData ?? [])[0]?.name ?? null,
    station: (stationData ?? [])[0] ?? null,
  }

  // Medical bags + compartment storerooms
  const { data: deptRow } = await adminClient.from('departments').select('module_medical').eq('id', ctx.departmentId).single()
  const moduleMedical = deptRow?.module_medical ?? false

  let medicalBagData: any = null
  let medicalCompartmentData: any = null
  let medicalSupplyTypes: { id: string; name: string; category: string; unit_of_measure: string }[] = []
  let medicationsByCompartment: Record<string, {
    storeroom_inventory_id: string
    supply_type_id: string
    supply_name: string
    unit_of_measure: string
    par_level: number
    current_quantity: number
    status: MedicalSupplyStatus
  }[]> = {}
  if (moduleMedical) {
    const [{ data: bags }, { data: bagTemplates }, { data: deptStorerooms }, { data: deptPersonnel }] = await Promise.all([
      adminClient.from('medical_storerooms').select('id, name, template_id, inventory_mode').eq('apparatus_id', id).eq('active', true).is('compartment_id', null).order('name'),
      adminClient.from('medical_bag_templates').select('id, name').eq('department_id', ctx.departmentId).eq('active', true).order('name'),
      adminClient.from('medical_storerooms').select('id, name').eq('department_id', ctx.departmentId).eq('active', true).is('apparatus_id', null).order('name'),
      adminClient.from('department_personnel').select('personnel_id, personnel(id, first_name, last_name)').eq('department_id', ctx.departmentId).eq('active', true),
    ])

    const bagIds = (bags ?? []).map(b => b.id)
    const { data: bagInventory } = bagIds.length > 0
      ? await adminClient.from('medical_storeroom_inventory').select('id, storeroom_id, supply_type_id, par_level').in('storeroom_id', bagIds)
      : { data: [] }
    const bagInvIds = (bagInventory ?? []).map(i => i.id)
    const supplyTypeIds = [...new Set((bagInventory ?? []).map((i: any) => i.supply_type_id))]

    const [{ data: bagLots }, { data: supplyTypes }] = await Promise.all([
      bagInvIds.length > 0
        ? adminClient.from('medical_stock_lots').select('id, storeroom_inventory_id, lot_number, expiration_date, quantity_received, quantity_remaining, received_date, concentration_amount, concentration_unit, volume_per_unit, volume_unit').in('storeroom_inventory_id', bagInvIds).eq('active', true).gt('quantity_remaining', 0).order('expiration_date', { ascending: true, nullsFirst: false })
        : Promise.resolve({ data: [] }),
      supplyTypeIds.length > 0
        ? adminClient.from('medical_supply_types').select('id, name, category, unit_of_measure, is_controlled, tracks_expiration, required_signatures').in('id', supplyTypeIds)
        : Promise.resolve({ data: [] }),
    ])

    const bagLotIds = (bagLots ?? []).map((l: any) => l.id)
    const { data: bagUnits } = bagLotIds.length > 0
      ? await adminClient.from('medical_stock_units').select('id, lot_id, control_number, status').in('lot_id', bagLotIds)
      : { data: [] }

    const storeroomIds = (deptStorerooms ?? []).map((s: any) => s.id)
    const { data: storeroomInventory } = storeroomIds.length > 0 && supplyTypeIds.length > 0
      ? await adminClient.from('medical_storeroom_inventory').select('id, storeroom_id, supply_type_id').in('storeroom_id', storeroomIds).in('supply_type_id', supplyTypeIds)
      : { data: [] }
    const srcInvIds = (storeroomInventory ?? []).map((i: any) => i.id)
    const { data: storeroomLots } = srcInvIds.length > 0
      ? await adminClient.from('medical_stock_lots').select('id, storeroom_inventory_id, lot_number, quantity_remaining, expiration_date').in('storeroom_inventory_id', srcInvIds).eq('active', true).gt('quantity_remaining', 0)
      : { data: [] }

    const personnel = (deptPersonnel ?? [])
      .map((dp: any) => ({ id: (dp.personnel as any)?.id ?? dp.personnel_id, name: [(dp.personnel as any)?.first_name, (dp.personnel as any)?.last_name].filter(Boolean).join(' ') }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name))

    medicalBagData = {
      bags: bags ?? [], bagInventory: bagInventory ?? [], bagLots: bagLots ?? [],
      supplyTypes: supplyTypes ?? [], deptStorerooms: deptStorerooms ?? [],
      storeroomInventory: storeroomInventory ?? [], storeroomLots: storeroomLots ?? [],
      units: bagUnits ?? [],
      personnel, bagTemplates: bagTemplates ?? [], apparatusId: id,
    }

    // Compartment storerooms for this apparatus
    const { data: compStorerooms } = await adminClient
      .from('medical_storerooms')
      .select('id, name, compartment_id')
      .eq('apparatus_id', id)
      .eq('active', true)
      .not('compartment_id', 'is', null)
      .order('name')

    const compStoreroomIds = (compStorerooms ?? []).map((s: any) => s.id)
    const { data: compInv } = compStoreroomIds.length > 0
      ? await adminClient.from('medical_storeroom_inventory').select('id, storeroom_id, supply_type_id, par_level').in('storeroom_id', compStoreroomIds)
      : { data: [] }
    const compInvIds = (compInv ?? []).map((i: any) => i.id)
    const compSupplyTypeIds = [...new Set((compInv ?? []).map((i: any) => i.supply_type_id))] as string[]

    const [{ data: compLots }, { data: compSupplyTypes }] = await Promise.all([
      compInvIds.length > 0
        ? adminClient.from('medical_stock_lots').select('id, storeroom_inventory_id, lot_number, expiration_date, quantity_received, quantity_remaining, received_date, concentration_amount, concentration_unit, volume_per_unit, volume_unit').in('storeroom_inventory_id', compInvIds).eq('active', true).gt('quantity_remaining', 0).order('expiration_date', { ascending: true, nullsFirst: false })
        : Promise.resolve({ data: [] }),
      compSupplyTypeIds.length > 0
        ? adminClient.from('medical_supply_types').select('id, name, category, unit_of_measure, is_controlled, tracks_expiration, required_signatures').in('id', compSupplyTypeIds)
        : Promise.resolve({ data: [] }),
    ])

    const compLotIds = (compLots ?? []).map((l: any) => l.id)
    const { data: compUnits } = compLotIds.length > 0
      ? await adminClient.from('medical_stock_units').select('id, lot_id, control_number, status').in('lot_id', compLotIds)
      : { data: [] }

    // Source storerooms for Transfer In (station storerooms that have matching supply types)
    const srcStoreroomIds = (deptStorerooms ?? []).map((s: any) => s.id)
    const { data: srcInv } = srcStoreroomIds.length > 0 && compSupplyTypeIds.length > 0
      ? await adminClient.from('medical_storeroom_inventory').select('id, storeroom_id, supply_type_id').in('storeroom_id', srcStoreroomIds).in('supply_type_id', compSupplyTypeIds)
      : { data: [] }
    const compSrcInvIds = (srcInv ?? []).map((i: any) => i.id)
    const { data: srcLots } = compSrcInvIds.length > 0
      ? await adminClient.from('medical_stock_lots').select('id, storeroom_inventory_id, lot_number, quantity_remaining, expiration_date').in('storeroom_inventory_id', compSrcInvIds).eq('active', true).gt('quantity_remaining', 0)
      : { data: [] }

    // Enrich compStorerooms with compartment display info
    const compStoreroomsWithInfo = await Promise.all(
      (compStorerooms ?? []).map(async (s: any) => {
        const { data: acRow } = await adminClient.from('apparatus_compartments').select('compartment_name_id').eq('id', s.compartment_id).single()
        if (!acRow) return { ...s, compartment_code: '—', compartment_name: null }
        const { data: cnRow } = await adminClient.from('compartment_names').select('compartment_code, compartment_name').eq('id', acRow.compartment_name_id).single()
        return { ...s, compartment_code: cnRow?.compartment_code ?? '—', compartment_name: cnRow?.compartment_name ?? null }
      })
    )

    medicalCompartmentData = {
      compartmentStorerooms: compStoreroomsWithInfo,
      compInventory: compInv ?? [],
      compLots: compLots ?? [],
      compSupplyTypes: compSupplyTypes ?? [],
      deptStorerooms: deptStorerooms ?? [],
      srcInventory: srcInv ?? [],
      srcLots: srcLots ?? [],
      units: compUnits ?? [],
      personnel,
      apparatusId: id,
    }

    // All active supply types for the department, for the unified "+ Add Item"
    // picker's Medications group -- independent of what's already assigned.
    const { data: allSupplyTypes } = await adminClient
      .from('medical_supply_types')
      .select('id, name, category, unit_of_measure')
      .eq('department_id', ctx.departmentId)
      .eq('active', true)
      .order('name')
    medicalSupplyTypes = allSupplyTypes ?? []

    // Summarize each compartment's assigned medications for the merged item list.
    for (const room of compStoreroomsWithInfo) {
      const invRows = (compInv ?? []).filter((i: any) => i.storeroom_id === room.id)
      medicationsByCompartment[room.compartment_id] = invRows.map((inv: any) => {
        const supply = (compSupplyTypes ?? []).find((s: any) => s.id === inv.supply_type_id)
        const lots = (compLots ?? []).filter((l: any) => l.storeroom_inventory_id === inv.id)
        const current_quantity = lots.reduce((sum: number, l: any) => sum + l.quantity_remaining, 0)
        return {
          storeroom_inventory_id: inv.id,
          supply_type_id: inv.supply_type_id,
          supply_name: supply?.name ?? 'Unknown',
          unit_of_measure: supply?.unit_of_measure ?? '',
          par_level: inv.par_level,
          current_quantity,
          status: getMedicalSupplyStatus(current_quantity, inv.par_level, lots),
        }
      })
    }
  }

  return (
    <div>
      <EquipmentDetailClient
        apparatus={apparatusWithRefs}
        compartments={compartments}
        allItems={allItems ?? []}
        allCategories={allCategories ?? []}
        allApparatus={allApparatus}
        isAdmin={isAdmin}
        isOfficerOrAbove={isOfficerOrAbove}
        backHref={from}
        medicalSupplyTypes={medicalSupplyTypes}
        medicationsByCompartment={medicationsByCompartment}
      />
      {medicalCompartmentData && medicalCompartmentData.compartmentStorerooms.length > 0 && (
        <div className="max-w-2xl mt-2">
          <MedicalCompartmentsSection
            compartmentStorerooms={medicalCompartmentData.compartmentStorerooms}
            compInventory={medicalCompartmentData.compInventory}
            compLots={medicalCompartmentData.compLots}
            compSupplyTypes={medicalCompartmentData.compSupplyTypes}
            deptStorerooms={medicalCompartmentData.deptStorerooms}
            srcInventory={medicalCompartmentData.srcInventory}
            srcLots={medicalCompartmentData.srcLots}
            units={medicalCompartmentData.units}
            personnel={medicalCompartmentData.personnel}
            apparatusId={medicalCompartmentData.apparatusId}
            isAdmin={isAdmin}
            isOfficerOrAbove={isOfficerOrAbove}
            myPersonnelId={me.id}
          />
        </div>
      )}
      {medicalBagData && (
        <div className="max-w-2xl mt-2">
          <MedicalBagsSection
            bags={medicalBagData.bags}
            bagInventory={medicalBagData.bagInventory}
            bagLots={medicalBagData.bagLots}
            supplyTypes={medicalBagData.supplyTypes}
            deptStorerooms={medicalBagData.deptStorerooms}
            storeroomInventory={medicalBagData.storeroomInventory}
            storeroomLots={medicalBagData.storeroomLots}
            units={medicalBagData.units}
            personnel={medicalBagData.personnel}
            bagTemplates={medicalBagData.bagTemplates}
            apparatusId={medicalBagData.apparatusId}
            isAdmin={isAdmin}
            isOfficerOrAbove={isOfficerOrAbove}
            myPersonnelId={me.id}
          />
        </div>
      )}
    </div>
  )
}
