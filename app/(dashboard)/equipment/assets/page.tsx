import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import AssetRosterClient from './AssetRosterClient'

export default async function AssetRosterPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) redirect('/login')

  const { data: myDeptList } = await adminClient
    .from('department_personnel')
    .select('department_id, system_role')
    .eq('personnel_id', me.id)
    .eq('active', true)
  const myDept = myDeptList?.[0]
  if (!myDept) redirect('/dashboard')

  const department_id = myDept.department_id
  const isAdmin = myDept.system_role === 'admin' || me.is_sys_admin

  // Fetch asset-tracked items
  const { data: items } = await adminClient
    .from('items')
    .select('id, item_name, category_id, tracks_assets')
    .eq('department_id', department_id)
    .eq('tracks_assets', true)
    .order('item_name')

  const itemIds = (items ?? []).map(i => i.id)

  // Fetch all assets (including retired) — include apparatus_id for location
  const { data: assets } = itemIds.length > 0
    ? await adminClient
        .from('item_assets')
        .select('id, item_id, asset_tag, serial_number, in_service_date, out_of_service_date, status, active, notes, apparatus_id')
        .eq('department_id', department_id)
        .in('item_id', itemIds)
        .order('asset_tag')
    : { data: [] }

  // Fetch categories
  const categoryIds = [...new Set((items ?? []).map(i => i.category_id).filter(Boolean) as string[])]
  const { data: categories } = categoryIds.length > 0
    ? await adminClient
        .from('item_categories')
        .select('id, category_name')
        .in('id', categoryIds)
    : { data: [] }

  // Fetch all active apparatus for the department (for the assign dropdown)
  const { data: apparatus } = await adminClient
    .from('apparatus')
    .select('id, unit_number, apparatus_name')
    .eq('department_id', department_id)
    .eq('active', true)
    .order('unit_number')

  // Build lookup maps
  const itemMap = Object.fromEntries((items ?? []).map(i => [i.id, i]))
  const categoryMap = Object.fromEntries((categories ?? []).map(c => [c.id, c.category_name]))
  const apparatusMap = Object.fromEntries(
    (apparatus ?? []).map(a => [a.id, a.unit_number + (a.apparatus_name ? ` — ${a.apparatus_name}` : '')])
  )

  const assetRows = (assets ?? []).map(a => {
    const item = itemMap[a.item_id]
    return {
      id: a.id,
      asset_tag: a.asset_tag ?? '—',
      item_name: item?.item_name ?? '—',
      item_id: a.item_id,
      category_name: item?.category_id ? (categoryMap[item.category_id] ?? '—') : '—',
      serial_number: a.serial_number,
      status: a.status ?? 'IN SERVICE',
      active: a.active,
      in_service_date: a.in_service_date,
      out_of_service_date: a.out_of_service_date,
      notes: a.notes,
      apparatus_id: a.apparatus_id ?? null,
      apparatus_label: a.apparatus_id ? (apparatusMap[a.apparatus_id] ?? '—') : null,
    }
  })

  const apparatusOptions = (apparatus ?? []).map(a => ({
    id: a.id,
    label: a.unit_number + (a.apparatus_name ? ` — ${a.apparatus_name}` : ''),
  }))

  const itemOptions = (items ?? []).map(i => ({ id: i.id, item_name: i.item_name }))

  return (
    <AssetRosterClient
      assets={assetRows}
      itemOptions={itemOptions}
      apparatusOptions={apparatusOptions}
      isAdmin={isAdmin}
    />
  )
}
