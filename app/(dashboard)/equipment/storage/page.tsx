import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { getPermissionSnapshot } from '@/lib/permissions'
import BackButton from '@/components/BackButton'
import StorageClient from './StorageClient'

export default async function StoragePage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  const storagePermissions = await getPermissionSnapshot(ctx)
  const isAdmin = ctx.isSysAdmin || ctx.systemRole === 'admin'
  const isOfficerOrAbove = storagePermissions.manage_inventory
  const department_id = ctx.departmentId

  // Items — quantity-tracked
  const { data: itemsRaw } = await adminClient
    .from('items')
    .select('id, item_name, category_id, department_quantity')
    .eq('department_id', department_id)
    .eq('active', true)
    .eq('tracks_quantity', true)
    .order('item_name')

  // Items — asset-tracked
  const { data: trackedItemsRaw } = await adminClient
    .from('items')
    .select('id, item_name, category_id')
    .eq('department_id', department_id)
    .eq('active', true)
    .eq('tracks_assets', true)
    .order('item_name')

  // Categories flat (both item types)
  const allCategoryIds = [...new Set([
    ...(itemsRaw ?? []).map(i => i.category_id),
    ...(trackedItemsRaw ?? []).map(i => i.category_id),
  ].filter(Boolean))]
  const { data: categoriesRaw } = allCategoryIds.length > 0
    ? await adminClient.from('item_categories').select('id, category_name').in('id', allCategoryIds)
    : { data: [] }
  const categoryMap = Object.fromEntries((categoriesRaw ?? []).map(c => [c.id, c.category_name]))

  // Tracked assets currently in storage (apparatus_id IS NULL)
  const trackedItemIds = (trackedItemsRaw ?? []).map(i => i.id)
  const { data: storageAssetsRaw } = trackedItemIds.length > 0
    ? await adminClient
        .from('item_assets')
        .select('id, item_id, asset_tag, serial_number, status')
        .eq('department_id', department_id)
        .eq('active', true)
        .is('apparatus_id', null)
        .neq('status', 'RETIRED')
        .in('item_id', trackedItemIds)
        .order('asset_tag')
    : { data: [] }

  const storageAssetGroups = (trackedItemsRaw ?? [])
    .map(item => ({
      item_id: item.id,
      item_name: item.item_name,
      category_name: categoryMap[item.category_id] ?? '',
      assets: (storageAssetsRaw ?? []).filter(a => a.item_id === item.id).map(a => ({
        id: a.id,
        asset_tag: a.asset_tag,
        serial_number: a.serial_number as string | null,
        status: a.status,
      })),
    }))
    .filter(g => g.assets.length > 0)

  // Stations for dept
  const { data: stationsRaw } = await adminClient
    .from('stations')
    .select('id, station_number, station_name')
    .eq('department_id', department_id)
    .eq('active', true)
    .order('station_number')
  const stations = (stationsRaw ?? []).map(s => ({
    id: s.id,
    station_number: s.station_number as string | null,
    station_name: s.station_name as string,
  }))
  const stationNameMap = Object.fromEntries((stationsRaw ?? []).map(s => [s.id, s.station_name as string]))

  // Storage records (may have multiple rows per item when station_id is set)
  const { data: storageRaw } = await adminClient
    .from('department_item_storage')
    .select('id, item_id, quantity, par_quantity, station_id')
    .eq('department_id', department_id)

  // Group by item_id, aggregating totals and per-station breakdown
  const storageByItemId: Record<string, { total_qty: number; total_par: number; breakdown: { station_id: string | null; station_name: string | null; quantity: number; par_quantity: number }[] }> = {}
  for (const row of storageRaw ?? []) {
    if (!storageByItemId[row.item_id]) {
      storageByItemId[row.item_id] = { total_qty: 0, total_par: 0, breakdown: [] }
    }
    storageByItemId[row.item_id].total_qty += row.quantity
    storageByItemId[row.item_id].total_par += row.par_quantity
    storageByItemId[row.item_id].breakdown.push({
      station_id: row.station_id ?? null,
      station_name: row.station_id ? (stationNameMap[row.station_id] ?? 'Unknown Station') : null,
      quantity: row.quantity,
      par_quantity: row.par_quantity,
    })
  }

  // Apparatus for dept
  const { data: apparatusRaw } = await adminClient
    .from('apparatus')
    .select('id, unit_number, apparatus_name')
    .eq('department_id', department_id)
    .eq('active', true)
    .order('unit_number')

  const apparatusIds = (apparatusRaw ?? []).map(a => a.id)

  // Compartments flat (apparatus_compartments links to compartment_names for code/name)
  const { data: compartmentsRaw } = apparatusIds.length > 0
    ? await adminClient
        .from('apparatus_compartments')
        .select('id, apparatus_id, compartment_name_id')
        .in('apparatus_id', apparatusIds)
        .eq('active', true)
    : { data: [] }

  const compNameIds = [...new Set((compartmentsRaw ?? []).map(c => c.compartment_name_id).filter(Boolean) as string[])]
  const { data: compNamesRaw } = compNameIds.length > 0
    ? await adminClient
        .from('compartment_names')
        .select('id, compartment_code, compartment_name, sort_order')
        .in('id', compNameIds)
        .order('sort_order')
    : { data: [] }
  const compNameMap = Object.fromEntries((compNamesRaw ?? []).map(n => [n.id, n]))

  const compartmentIds = (compartmentsRaw ?? []).map(c => c.id)

  // Location standards to compute compartment totals
  const { data: locationStandards } = compartmentIds.length > 0
    ? await adminClient
        .from('item_location_standards')
        .select('item_id, expected_quantity')
        .in('apparatus_compartment_id', compartmentIds)
        .eq('active', true)
    : { data: [] }

  // Compartment total per item
  const compartmentTotalMap: Record<string, number> = {}
  for (const ls of locationStandards ?? []) {
    compartmentTotalMap[ls.item_id] = (compartmentTotalMap[ls.item_id] ?? 0) + (ls.expected_quantity ?? 0)
  }

  // Apparatus with compartments for Add to Compartment modal
  const allApparatus = (apparatusRaw ?? []).map(a => ({
    id: a.id,
    unit_number: a.unit_number,
    apparatus_name: a.apparatus_name,
    compartments: (compartmentsRaw ?? [])
      .filter(c => c.apparatus_id === a.id)
      .sort((a, b) => ((compNameMap[a.compartment_name_id]?.sort_order ?? 999) - (compNameMap[b.compartment_name_id]?.sort_order ?? 999)))
      .map(c => {
        const n = compNameMap[c.compartment_name_id]
        return { id: c.id, compartment_code: n?.compartment_code ?? '—', compartment_name: n?.compartment_name ?? null }
      }),
  }))

  // Merge into storage items
  const storageItems = (itemsRaw ?? []).map(item => {
    const storageGroup = storageByItemId[item.id] ?? { total_qty: 0, total_par: 0, breakdown: [] }
    const compartment_total = compartmentTotalMap[item.id] ?? 0
    const storage_qty = storageGroup.total_qty
    const storage_par = storageGroup.total_par
    const department_quantity = item.department_quantity ?? null
    const accounted_for = compartment_total + storage_qty
    const variance = department_quantity !== null ? accounted_for - department_quantity : null

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
      stationBreakdown: storageGroup.breakdown,
    }
  })

  const belowParCount = storageItems.filter(i => i.storage_par > 0 && i.storage_qty < i.storage_par).length
  const missingCount = storageItems.filter(i => i.variance !== null && i.variance < 0).length

  return (
    <div className="max-w-3xl">
      <div className="mb-2">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Inventory Storage</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Department-wide unassigned item pool and inventory totals</p>
      </div>

      {(belowParCount > 0 || missingCount > 0) && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          {belowParCount > 0 && <span className="font-semibold">{belowParCount} item{belowParCount !== 1 ? 's' : ''} below storage PAR</span>}
          {belowParCount > 0 && missingCount > 0 && ' · '}
          {missingCount > 0 && <span className="font-semibold">{missingCount} item{missingCount !== 1 ? 's' : ''} missing from department total</span>}
        </div>
      )}

      <div className="mb-5 flex gap-3">
        <BackButton href="/equipment" />
        <Link
          href="/equipment/movement-log"
          className="rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-sm"
        >
          Movement Log →
        </Link>
      </div>

      <StorageClient
        items={storageItems}
        storageAssetGroups={storageAssetGroups}
        allApparatus={allApparatus}
        stations={stations}
        isAdmin={isAdmin}
        isOfficerOrAbove={isOfficerOrAbove}
      />
    </div>
  )
}
