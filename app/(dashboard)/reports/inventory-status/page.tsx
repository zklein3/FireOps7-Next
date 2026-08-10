import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import InventoryStatusClient from './InventoryStatusClient'

export default async function InventoryStatusPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  if (!(await hasPermission(ctx, 'manage_inventory'))) redirect('/dashboard')

  const department_id = ctx.departmentId

  // Items — quantity-tracked only
  const { data: itemsRaw } = await adminClient
    .from('items')
    .select('id, item_name, category_id, department_quantity')
    .eq('department_id', department_id)
    .eq('active', true)
    .eq('tracks_quantity', true)
    .order('item_name')

  // Categories flat
  const categoryIds = [...new Set((itemsRaw ?? []).map(i => i.category_id).filter(Boolean))]
  const { data: categoriesRaw } = categoryIds.length > 0
    ? await adminClient.from('item_categories').select('id, category_name').in('id', categoryIds)
    : { data: [] }
  const categoryMap = Object.fromEntries((categoriesRaw ?? []).map(c => [c.id, c.category_name]))

  // Storage records
  const { data: storageRaw } = await adminClient
    .from('department_item_storage')
    .select('item_id, quantity, par_quantity')
    .eq('department_id', department_id)
  const storageMap = Object.fromEntries((storageRaw ?? []).map(s => [s.item_id, s]))

  // Apparatus for dept
  const { data: apparatusRaw } = await adminClient
    .from('apparatus')
    .select('id, unit_number, apparatus_name')
    .eq('department_id', department_id)
    .eq('active', true)
    .order('unit_number')
  const apparatusIds = (apparatusRaw ?? []).map(a => a.id)
  const apparatusMap = Object.fromEntries((apparatusRaw ?? []).map(a => [a.id, a]))

  // Compartments flat
  const { data: compartmentsRaw } = apparatusIds.length > 0
    ? await adminClient
        .from('apparatus_compartments')
        .select('id, apparatus_id, compartment_code, compartment_name')
        .in('apparatus_id', apparatusIds)
        .eq('active', true)
    : { data: [] }
  const compartmentMap = Object.fromEntries((compartmentsRaw ?? []).map(c => [c.id, c]))
  const compartmentIds = (compartmentsRaw ?? []).map(c => c.id)

  // Location standards
  const { data: locationStandards } = compartmentIds.length > 0
    ? await adminClient
        .from('item_location_standards')
        .select('item_id, apparatus_compartment_id, expected_quantity')
        .in('apparatus_compartment_id', compartmentIds)
        .eq('active', true)
    : { data: [] }

  // Build per-item location list + compartment totals
  const itemLocationsMap: Record<string, {
    apparatus_id: string
    unit_number: string
    apparatus_name: string | null
    compartment_code: string
    compartment_name: string | null
    expected_quantity: number
  }[]> = {}

  const compartmentTotalMap: Record<string, number> = {}

  for (const ls of locationStandards ?? []) {
    const compartment = compartmentMap[ls.apparatus_compartment_id]
    if (!compartment) continue
    const apparatus = apparatusMap[compartment.apparatus_id]
    if (!apparatus) continue

    if (!itemLocationsMap[ls.item_id]) itemLocationsMap[ls.item_id] = []
    itemLocationsMap[ls.item_id].push({
      apparatus_id: apparatus.id,
      unit_number: apparatus.unit_number,
      apparatus_name: apparatus.apparatus_name,
      compartment_code: compartment.compartment_code,
      compartment_name: compartment.compartment_name,
      expected_quantity: ls.expected_quantity,
    })
    compartmentTotalMap[ls.item_id] = (compartmentTotalMap[ls.item_id] ?? 0) + (ls.expected_quantity ?? 0)
  }

  // Sort locations per item by unit number
  for (const locs of Object.values(itemLocationsMap)) {
    locs.sort((a, b) => a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true }))
  }

  // Merge into report items
  const reportItems = (itemsRaw ?? []).map(item => {
    const storageRow = storageMap[item.id] ?? null
    const compartment_total = compartmentTotalMap[item.id] ?? 0
    const storage_qty = storageRow?.quantity ?? 0
    const storage_par = storageRow?.par_quantity ?? 0
    const department_quantity = item.department_quantity ?? null
    const accounted_for = compartment_total + storage_qty
    const variance = department_quantity !== null ? accounted_for - department_quantity : null
    const locations = itemLocationsMap[item.id] ?? []

    return {
      item_id: item.id,
      item_name: item.item_name,
      category_name: categoryMap[item.category_id] ?? '',
      storage_qty,
      storage_par,
      compartment_total,
      department_quantity,
      accounted_for,
      variance,
      locations,
    }
  })

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Inventory Status</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Department-wide quantity inventory — storage, trucks, and totals</p>
      </div>
      <InventoryStatusClient items={reportItems} />
    </div>
  )
}
