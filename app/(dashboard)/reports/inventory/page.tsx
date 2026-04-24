import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import InventoryReportClient from './InventoryReportClient'

export default async function InventoryReportPage({
  searchParams,
}: {
  searchParams: Promise<{ apparatusId?: string; from?: string; to?: string }>
}) {
  const { apparatusId, from, to } = await searchParams

  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient
    .from('personnel')
    .select('id, is_sys_admin')
    .eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) redirect('/login')

  const { data: myDeptList } = await adminClient
    .from('department_personnel')
    .select('department_id, system_role')
    .eq('personnel_id', me.id)
    .eq('active', true)
  const myDept = myDeptList?.[0]
  if (!myDept) redirect('/dashboard')

  const { system_role } = myDept
  if (system_role === 'member' && !me.is_sys_admin) redirect('/dashboard')

  const departmentId = myDept.department_id

  // Default date range: last 30 days
  const defaultTo = new Date()
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 30)

  const dateFrom = from ?? defaultFrom.toISOString().split('T')[0]
  const dateTo = to ?? defaultTo.toISOString().split('T')[0]

  // Fetch all apparatus for this department
  const { data: apparatusList } = await adminClient
    .from('apparatus')
    .select('id, unit_number, apparatus_name')
    .eq('department_id', departmentId)
    .eq('active', true)
    .order('unit_number')

  const fromTs = dateFrom ? `${dateFrom}T00:00:00.000Z` : null
  const toTs = dateTo ? `${dateTo}T23:59:59.999Z` : null

  const apparatusIds = (apparatusList ?? []).map(a => a.id)

  // Fetch all asset inspection logs in range
  let inspLogQuery = adminClient
    .from('item_asset_inspection_logs')
    .select('id, apparatus_id, asset_id, template_id, inspected_at, overall_result, inspected_by_name')
    .in('apparatus_id', apparatusIds.length > 0 ? apparatusIds : [''])
  if (fromTs) inspLogQuery = inspLogQuery.gte('inspected_at', fromTs)
  if (toTs) inspLogQuery = inspLogQuery.lte('inspected_at', toTs)
  const { data: inspLogs } = await inspLogQuery.order('inspected_at', { ascending: false })

  // Fetch ALL step results for those logs
  const logIds = (inspLogs ?? []).map(l => l.id)
  let allStepLogs: {
    inspection_log_id: string
    template_step_id: string
    boolean_value: boolean | null
    numeric_value: number | null
    text_value: string | null
    step_text: string
    step_type: string
    fail_if_negative: boolean
  }[] = []

  if (logIds.length > 0) {
    const { data: stepLogs } = await adminClient
      .from('item_asset_inspection_log_steps')
      .select('inspection_log_id, template_step_id, boolean_value, numeric_value, text_value')
      .in('inspection_log_id', logIds)

    const stepIds = [...new Set((stepLogs ?? []).map(s => s.template_step_id))]
    const { data: templateSteps } = stepIds.length > 0
      ? await adminClient
          .from('item_inspection_template_steps')
          .select('id, step_text, fail_if_negative, step_type')
          .in('id', stepIds)
      : { data: [] }

    const stepDefMap = Object.fromEntries((templateSteps ?? []).map(s => [s.id, s]))

    allStepLogs = (stepLogs ?? []).map(sl => ({
      inspection_log_id: sl.inspection_log_id,
      template_step_id: sl.template_step_id,
      boolean_value: sl.boolean_value,
      numeric_value: sl.numeric_value,
      text_value: sl.text_value,
      step_text: stepDefMap[sl.template_step_id]?.step_text ?? '',
      step_type: stepDefMap[sl.template_step_id]?.step_type ?? '',
      fail_if_negative: stepDefMap[sl.template_step_id]?.fail_if_negative ?? false,
    }))
  }

  // Fetch ALL presence check logs in range (pass and fail)
  let presenceQuery = adminClient
    .from('compartment_presence_check_logs')
    .select('id, apparatus_id, item_id, inspected_at, inspected_by_name, present, actual_quantity, location_standard_id')
    .in('apparatus_id', apparatusIds.length > 0 ? apparatusIds : [''])
  if (fromTs) presenceQuery = presenceQuery.gte('inspected_at', fromTs)
  if (toTs) presenceQuery = presenceQuery.lte('inspected_at', toTs)
  const { data: presenceLogs } = await presenceQuery.order('inspected_at', { ascending: false })

  // Fetch item names for presence logs
  const presenceItemIds = [...new Set((presenceLogs ?? []).map(p => p.item_id))]
  const { data: presenceItems } = presenceItemIds.length > 0
    ? await adminClient.from('items').select('id, item_name').in('id', presenceItemIds)
    : { data: [] }
  const presenceItemMap = Object.fromEntries((presenceItems ?? []).map(i => [i.id, i.item_name]))

  // Fetch asset info for inspection logs
  const assetIds = [...new Set((inspLogs ?? []).map(l => l.asset_id))]
  const { data: assets } = assetIds.length > 0
    ? await adminClient.from('item_assets').select('id, asset_tag, item_id').in('id', assetIds)
    : { data: [] }
  const assetMap = Object.fromEntries((assets ?? []).map(a => [a.id, a]))

  // Fetch item names for assets
  const assetItemIds = [...new Set((assets ?? []).map(a => a.item_id))]
  const { data: assetItems } = assetItemIds.length > 0
    ? await adminClient.from('items').select('id, item_name').in('id', assetItemIds)
    : { data: [] }
  const assetItemMap = Object.fromEntries((assetItems ?? []).map(i => [i.id, i.item_name]))

  return (
    <InventoryReportClient
      apparatusList={apparatusList ?? []}
      inspLogs={inspLogs ?? []}
      allStepLogs={allStepLogs}
      presenceLogs={(presenceLogs ?? []).map(p => ({ ...p, item_name: presenceItemMap[p.item_id] ?? 'Unknown Item' }))}
      assetMap={assetMap}
      assetItemMap={assetItemMap}
      selectedApparatusId={apparatusId ?? null}
      dateFrom={dateFrom}
      dateTo={dateTo}
    />
  )
}
