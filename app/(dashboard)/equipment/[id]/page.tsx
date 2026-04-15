import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import EquipmentDetailClient from './EquipmentDetailClient'

export default async function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) redirect('/login')

  const { data: myDeptList } = await adminClient.from('department_personnel').select('department_id, system_role').eq('personnel_id', me.id).eq('active', true)
  const myDept = myDeptList?.[0]
  if (!myDept) redirect('/dashboard')

  const isAdmin = myDept.system_role === 'admin' || me.is_sys_admin
  const isOfficerOrAbove = isAdmin || myDept.system_role === 'officer'

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
    ? await adminClient.from('items').select('id, item_name, item_description, category_id, requires_inspection').in('id', itemIds)
    : { data: [] }

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
    .eq('department_id', myDept.department_id)
    .eq('active', true)
    .order('item_name')

  const { data: allCategories } = await adminClient
    .from('item_categories')
    .select('id, category_name, sort_order')
    .eq('department_id', myDept.department_id)
    .eq('active', true)
    .order('sort_order')

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
          expected_quantity: ls.expected_quantity,
          minimum_quantity: ls.minimum_quantity,
          notes: ls.notes,
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

  return (
    <EquipmentDetailClient
      apparatus={apparatusWithRefs}
      compartments={compartments}
      allItems={allItems ?? []}
      allCategories={allCategories ?? []}
      isAdmin={isAdmin}
      isOfficerOrAbove={isOfficerOrAbove}
    />
  )
}
