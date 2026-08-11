import { redirect } from 'next/navigation'
import { getCurrentPath } from '@/lib/current-path'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import Link from 'next/link'
import MovementLogClient from './MovementLogClient'

export default async function MovementLogPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  if (!(await hasPermission(ctx, 'manage_inventory'))) redirect('/dashboard')

  const department_id = ctx.departmentId

  // Fetch recent movements
  const { data: logsRaw } = await adminClient
    .from('item_movement_log')
    .select('id, item_id, asset_id, quantity, from_type, from_id, to_type, to_id, moved_by, reason, source, created_at')
    .eq('department_id', department_id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (!logsRaw || logsRaw.length === 0) {
    return (
      <div className="pt-20 px-4 pb-4 sm:pt-0 sm:p-6 lg:p-8 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Movement Log</h1>
          <p className="text-sm text-zinc-500 mt-0.5">All asset and inventory movements for this department</p>
        </div>
        <div className="mb-5">
          <Link href="/equipment/storage" className="rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-sm">
            ← Storage
          </Link>
        </div>
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          No movements recorded yet.
        </div>
      </div>
    )
  }

  // Collect all referenced IDs
  const itemIds = [...new Set(logsRaw.map(l => l.item_id).filter(Boolean))]
  const assetIds = [...new Set(logsRaw.map(l => l.asset_id).filter(Boolean))]
  const apparatusIds = [...new Set([
    ...logsRaw.filter(l => l.from_type === 'apparatus').map(l => l.from_id),
    ...logsRaw.filter(l => l.to_type === 'apparatus').map(l => l.to_id),
  ].filter(Boolean))]
  const compartmentIds = [...new Set([
    ...logsRaw.filter(l => l.from_type === 'compartment').map(l => l.from_id),
    ...logsRaw.filter(l => l.to_type === 'compartment').map(l => l.to_id),
  ].filter(Boolean))]
  const userIds = [...new Set(logsRaw.map(l => l.moved_by).filter(Boolean))]

  // Flat lookups
  const [
    { data: items },
    { data: assets },
    { data: apparatus },
    { data: compartmentLinks },
    { data: personnel },
  ] = await Promise.all([
    itemIds.length > 0
      ? adminClient.from('items').select('id, item_name').in('id', itemIds)
      : Promise.resolve({ data: [] }),
    assetIds.length > 0
      ? adminClient.from('item_assets').select('id, asset_tag, serial_number').in('id', assetIds)
      : Promise.resolve({ data: [] }),
    apparatusIds.length > 0
      ? adminClient.from('apparatus').select('id, unit_number, apparatus_name').in('id', apparatusIds)
      : Promise.resolve({ data: [] }),
    compartmentIds.length > 0
      ? adminClient.from('apparatus_compartments').select('id, compartment_name_id').in('id', compartmentIds)
      : Promise.resolve({ data: [] }),
    userIds.length > 0
      ? adminClient.from('personnel').select('auth_user_id, first_name, last_name').in('auth_user_id', userIds)
      : Promise.resolve({ data: [] }),
  ])

  // Compartment names
  const compNameIds = [...new Set((compartmentLinks ?? []).map(c => c.compartment_name_id).filter(Boolean))]
  const { data: compNames } = compNameIds.length > 0
    ? await adminClient.from('compartment_names').select('id, compartment_code, compartment_name').in('id', compNameIds)
    : { data: [] }

  // Build lookup maps
  const itemMap = Object.fromEntries((items ?? []).map(i => [i.id, i.item_name]))
  const assetMap = Object.fromEntries((assets ?? []).map(a => [a.id, { tag: a.asset_tag, sn: a.serial_number }]))
  const apparatusMap = Object.fromEntries((apparatus ?? []).map(a => [a.id, `Unit ${a.unit_number}${a.apparatus_name ? ` — ${a.apparatus_name}` : ''}`]))
  const compNameMap = Object.fromEntries((compNames ?? []).map(c => [c.id, c]))
  const compartmentMap = Object.fromEntries((compartmentLinks ?? []).map(c => {
    const cn = compNameMap[c.compartment_name_id]
    return [c.id, cn ? `${cn.compartment_code}${cn.compartment_name ? ` — ${cn.compartment_name}` : ''}` : '—']
  }))
  const personnelMap = Object.fromEntries((personnel ?? []).map(p => [p.auth_user_id, `${p.first_name} ${p.last_name}`]))

  function locationLabel(type: string, id: string | null): string {
    if (type === 'storage') return 'Storage'
    if (type === 'apparatus' && id) return apparatusMap[id] ?? 'Unknown Apparatus'
    if (type === 'compartment' && id) return compartmentMap[id] ?? 'Unknown Compartment'
    if (type === 'retired') return 'Retired'
    if (type === 'lost') return 'Lost'
    if (type === 'damaged') return 'Damaged'
    return type
  }

  function sourceLabel(source: string | null): string {
    if (source === 'inspection_reconciliation') return 'Inspection'
    if (source === 'manual') return 'Manual'
    return source ?? '—'
  }

  const logs = logsRaw.map(l => ({
    id: l.id,
    created_at: l.created_at,
    item_name: itemMap[l.item_id] ?? '—',
    asset_tag: l.asset_id ? (assetMap[l.asset_id]?.tag ?? null) : null,
    asset_sn: l.asset_id ? (assetMap[l.asset_id]?.sn ?? null) : null,
    quantity: l.quantity,
    from: locationLabel(l.from_type, l.from_id),
    to: locationLabel(l.to_type, l.to_id),
    moved_by: personnelMap[l.moved_by] ?? '—',
    source: sourceLabel(l.source),
    reason: l.reason ?? null,
  }))

  return (
    <div className="pt-20 px-4 pb-4 sm:pt-0 sm:p-6 lg:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Movement Log</h1>
        <p className="text-sm text-zinc-500 mt-0.5">All asset and inventory movements — last {logs.length}</p>
      </div>
      <div className="mb-5">
        <Link href="/equipment/storage" className="rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-sm">
          ← Storage
        </Link>
      </div>
      <MovementLogClient logs={logs} departmentTimezone={ctx.departmentTimezone} />
    </div>
  )
}
