import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { getPermissionSnapshot } from '@/lib/permissions'
import ApparatusDetailClient from './ApparatusDetailClient'

export default async function ApparatusDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')
  const me = { id: ctx.personnelId, is_sys_admin: ctx.isSysAdmin }

  const apparatusPermissions = await getPermissionSnapshot(ctx)
  const isAdmin = apparatusPermissions.manage_apparatus
  const isOfficerOrAbove = apparatusPermissions.change_apparatus_service_status

  // Fetch apparatus — no nested joins to avoid type issues
  const { data: apparatusList } = await adminClient
    .from('apparatus')
    .select('id, unit_number, apparatus_name, make, model, model_year, vin, license_plate, active, in_service_date, out_of_service_date, notes, apparatus_type_id, station_id, qr_code, exclude_from_iso, has_air_brakes, has_engine_hours')
    .eq('id', id)
    .eq('department_id', ctx.departmentId)

  const apparatus = apparatusList?.[0]
  if (!apparatus) redirect('/apparatus')

  // Fetch apparatus type name separately
  const { data: apparatusTypeData } = apparatus.apparatus_type_id
    ? await adminClient.from('apparatus_types').select('id, name').eq('id', apparatus.apparatus_type_id)
    : { data: [] }

  // Fetch station separately
  const { data: stationData } = apparatus.station_id
    ? await adminClient.from('stations').select('id, station_name, station_number').eq('id', apparatus.station_id)
    : { data: [] }

  // Fetch all stations for reassignment dropdown
  const { data: stations } = await adminClient
    .from('stations')
    .select('id, station_number, station_name')
    .eq('department_id', ctx.departmentId)
    .eq('active', true)
    .order('station_number')

  // Fetch apparatus types for dropdown
  const { data: apparatusTypes } = await adminClient
    .from('apparatus_types')
    .select('id, name, sort_order')
    .eq('active', true)
    .order('sort_order')

  // Fetch compartments
  const { data: compartmentLinks } = await adminClient
    .from('apparatus_compartments')
    .select('id, active, notes, compartment_name_id')
    .eq('apparatus_id', id)

  // Fetch compartment name details separately
  const compartmentNameIds = (compartmentLinks ?? []).map(c => c.compartment_name_id).filter(Boolean)
  const { data: compartmentNameData } = compartmentNameIds.length > 0
    ? await adminClient.from('compartment_names').select('id, compartment_code, compartment_name, sort_order').in('id', compartmentNameIds)
    : { data: [] }

  const compartmentNameMap = Object.fromEntries((compartmentNameData ?? []).map(c => [c.id, c]))

  // Fetch location standards (items) for all compartments
  const allCompartmentIds = (compartmentLinks ?? []).map(c => c.id)
  const { data: locationStandards } = allCompartmentIds.length > 0
    ? await adminClient
        .from('item_location_standards')
        .select('id, apparatus_compartment_id, item_id, expected_quantity')
        .in('apparatus_compartment_id', allCompartmentIds)
        .eq('active', true)
    : { data: [] as { id: string; apparatus_compartment_id: string; item_id: string; expected_quantity: number }[] }

  const lsItemIds = [...new Set((locationStandards ?? []).map(ls => ls.item_id))]
  const { data: itemData } = lsItemIds.length > 0
    ? await adminClient
        .from('items')
        .select('id, item_name')
        .in('id', lsItemIds)
    : { data: [] as { id: string; item_name: string }[] }

  const itemMap = Object.fromEntries((itemData ?? []).map(i => [i.id, i]))

  // Build compartment items map
  const compartmentItemsMap: Record<string, { item_name: string; expected_quantity: number }[]> = {}
  for (const ls of locationStandards ?? []) {
    const item = itemMap[ls.item_id]
    if (!item) continue
    if (!compartmentItemsMap[ls.apparatus_compartment_id]) compartmentItemsMap[ls.apparatus_compartment_id] = []
    compartmentItemsMap[ls.apparatus_compartment_id]!.push({
      item_name: item.item_name,
      expected_quantity: ls.expected_quantity,
    })
  }

  const compartments = (compartmentLinks ?? []).map(c => ({
    id: c.id,
    active: c.active,
    notes: c.notes,
    compartment_name: compartmentNameMap[c.compartment_name_id] ?? null,
    items: compartmentItemsMap[c.id] ?? [],
  }))

  // Fetch available compartment names for this department
  const { data: compartmentNames } = await adminClient
    .from('compartment_names')
    .select('id, compartment_code, compartment_name, sort_order')
    .eq('department_id', ctx.departmentId)
    .eq('active', true)
    .order('sort_order')

  // Fetch ISO specs
  const { data: isoSpecsList } = await adminClient
    .from('apparatus_iso_specs')
    .select('pump_rating_gpm, tank_capacity_gal, foam_capacity_gal, aerial_length_ft, turning_radius_ft, gvwr_lbs, hose_loads')
    .eq('apparatus_id', id)
  const isoSpecs = isoSpecsList?.[0] ?? null

  // Fetch pump tests
  const { data: pumpTests } = await adminClient
    .from('apparatus_pump_tests')
    .select('id, test_date, vendor, passed, notes, document_path, created_at')
    .eq('apparatus_id', id)
    .order('test_date', { ascending: false })

  // Medical bags — only if module enabled
  const { data: modRow } = await adminClient.from('departments').select('module_medical').eq('id', ctx.departmentId).single()
  const moduleMedical = modRow?.module_medical ?? false

  let medicalBagData: {
    bags: { id: string; name: string; template_id: string | null; inventory_mode: string | null }[]
    bagInventory: { id: string; storeroom_id: string; supply_type_id: string; par_level: number }[]
    bagLots: {
      id: string; storeroom_inventory_id: string; lot_number: string | null; expiration_date: string | null
      quantity_received: number; quantity_remaining: number; received_date: string
      concentration_amount: number | null; concentration_unit: string | null
      volume_per_unit: number | null; volume_unit: string | null
    }[]
    supplyTypes: { id: string; name: string; category: string; unit_of_measure: string; is_controlled: boolean; tracks_expiration: boolean; required_signatures: number }[]
    deptStorerooms: { id: string; name: string }[]
    storeroomInventory: { id: string; storeroom_id: string; supply_type_id: string }[]
    storeroomLots: { id: string; storeroom_inventory_id: string; lot_number: string | null; quantity_remaining: number; expiration_date: string | null }[]
    units: { id: string; lot_id: string; control_number: string; status: string }[]
    personnel: { id: string; name: string }[]
    bagTemplates: { id: string; name: string }[]
    apparatusId: string
  } | null = null

  if (moduleMedical) {
    const [{ data: bags }, { data: bagTemplates }, { data: deptStorerooms }, { data: deptPersonnel }] = await Promise.all([
      adminClient.from('medical_storerooms')
        .select('id, name, template_id, inventory_mode')
        .eq('apparatus_id', id).eq('active', true).is('compartment_id', null).order('name'),
      adminClient.from('medical_bag_templates')
        .select('id, name').eq('department_id', ctx.departmentId).eq('active', true).order('name'),
      adminClient.from('medical_storerooms')
        .select('id, name').eq('department_id', ctx.departmentId).eq('active', true).is('apparatus_id', null).order('name'),
      adminClient.from('department_personnel')
        .select('personnel_id, personnel(id, first_name, last_name)')
        .eq('department_id', ctx.departmentId).eq('active', true),
    ])

    const bagIds = (bags ?? []).map(b => b.id)
    const { data: bagInventory } = bagIds.length > 0
      ? await adminClient.from('medical_storeroom_inventory').select('id, storeroom_id, supply_type_id, par_level').in('storeroom_id', bagIds)
      : { data: [] }
    const bagInvIds = (bagInventory ?? []).map(i => i.id)
    const supplyTypeIds = [...new Set((bagInventory ?? []).map(i => i.supply_type_id))]

    const [{ data: bagLots }, { data: supplyTypes }] = await Promise.all([
      bagInvIds.length > 0
        ? adminClient.from('medical_stock_lots').select('id, storeroom_inventory_id, lot_number, expiration_date, quantity_received, quantity_remaining, received_date, concentration_amount, concentration_unit, volume_per_unit, volume_unit').in('storeroom_inventory_id', bagInvIds).eq('active', true).gt('quantity_remaining', 0).order('expiration_date', { ascending: true, nullsFirst: false })
        : Promise.resolve({ data: [] }),
      supplyTypeIds.length > 0
        ? adminClient.from('medical_supply_types').select('id, name, category, unit_of_measure, is_controlled, tracks_expiration, required_signatures').in('id', supplyTypeIds)
        : Promise.resolve({ data: [] }),
    ])

    const bagLotIds = (bagLots ?? []).map(l => l.id)
    const { data: units } = bagLotIds.length > 0
      ? await adminClient.from('medical_stock_units').select('id, lot_id, control_number, status').in('lot_id', bagLotIds)
      : { data: [] }

    const storeroomIds = (deptStorerooms ?? []).map(s => s.id)
    const { data: storeroomInventory } = storeroomIds.length > 0 && supplyTypeIds.length > 0
      ? await adminClient.from('medical_storeroom_inventory').select('id, storeroom_id, supply_type_id').in('storeroom_id', storeroomIds).in('supply_type_id', supplyTypeIds)
      : { data: [] }
    const srcInvIds = (storeroomInventory ?? []).map(i => i.id)
    const { data: storeroomLots } = srcInvIds.length > 0
      ? await adminClient.from('medical_stock_lots').select('id, storeroom_inventory_id, lot_number, quantity_remaining, expiration_date').in('storeroom_inventory_id', srcInvIds).eq('active', true).gt('quantity_remaining', 0)
      : { data: [] }

    const personnel = (deptPersonnel ?? [])
      .map(dp => ({ id: (dp.personnel as any)?.id ?? dp.personnel_id, name: [(dp.personnel as any)?.first_name, (dp.personnel as any)?.last_name].filter(Boolean).join(' ') }))
      .sort((a, b) => a.name.localeCompare(b.name))

    medicalBagData = {
      bags: bags ?? [],
      bagInventory: bagInventory ?? [],
      bagLots: bagLots ?? [],
      supplyTypes: supplyTypes ?? [],
      deptStorerooms: deptStorerooms ?? [],
      storeroomInventory: storeroomInventory ?? [],
      storeroomLots: storeroomLots ?? [],
      units: units ?? [],
      personnel,
      bagTemplates: bagTemplates ?? [],
      apparatusId: id,
    }
  }

  // Build clean apparatus object
  const apparatusWithRefs = {
    ...apparatus,
    apparatus_type: (apparatusTypeData ?? [])[0] ?? null,
    station: (stationData ?? [])[0] ?? null,
  }

  return (
    <ApparatusDetailClient
      apparatus={apparatusWithRefs}
      stations={stations ?? []}
      apparatusTypes={apparatusTypes ?? []}
      compartments={compartments}
      compartmentNames={compartmentNames ?? []}
      isAdmin={isAdmin}
      isOfficerOrAbove={isOfficerOrAbove}
      departmentId={ctx.departmentId}
      isoSpecs={isoSpecs}
      pumpTests={pumpTests ?? []}
      medicalBagData={medicalBagData}
      myPersonnelId={me.id}
    />
  )
}
