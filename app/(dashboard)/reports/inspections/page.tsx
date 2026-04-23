import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import InspectionReportClient from './InspectionReportClient'

export type StepRow = {
  template_step_id: string
  step_text: string
  step_type: string
  boolean_value: boolean | null
  numeric_value: number | null
  text_value: string | null
  fail_if_negative: boolean
  required: boolean
  sort_order: number
  linked_asset_tag: string | null
}

export type InspectionLogRow = {
  id: string
  inspected_at: string
  overall_result: string
  apparatus_id: string
  apparatus_name: string
  compartment: string
  asset_id: string
  asset_tag: string
  item_name: string
  item_id: string
  inspector_name: string
  inspector_personnel_id: string | null
  steps: StepRow[]
}

export type PresenceCheckRow = {
  id: string
  inspected_at: string
  apparatus_id: string
  apparatus_name: string
  compartment: string
  item_name: string
  item_id: string
  inspector_name: string
  inspector_personnel_id: string | null
  present: boolean
  actual_quantity: number | null
  notes: string | null
  asset_tag?: string  // set for linked-asset rows that have no inspection template
}

export default async function InspectionReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; apparatusId?: string; personnelId?: string }>
}) {
  const { from, to, apparatusId, personnelId } = await searchParams

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

  const { system_role, department_id } = myDept
  if (system_role === 'member' && !me.is_sys_admin) redirect('/dashboard')

  const defaultTo = new Date()
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 30)

  const dateFrom = from ?? defaultFrom.toISOString().split('T')[0]
  const dateTo = to ?? defaultTo.toISOString().split('T')[0]
  const fromTs = `${dateFrom}T00:00:00.000Z`
  const toTs = `${dateTo}T23:59:59.999Z`

  // All dept apparatus (for filter dropdown + dept scoping)
  const { data: apparatusList } = await adminClient
    .from('apparatus')
    .select('id, unit_number, apparatus_name')
    .eq('department_id', department_id)
    .eq('active', true)
    .order('unit_number')

  const deptApparatusIds = (apparatusList ?? []).map(a => a.id)

  // All active dept personnel (for inspector dropdown)
  const { data: personnelList } = await adminClient
    .from('department_personnel')
    .select('personnel_id, system_role')
    .eq('department_id', department_id)
    .eq('active', true)

  const personnelIds = (personnelList ?? []).map(p => p.personnel_id)
  const { data: personnelData } = personnelIds.length > 0
    ? await adminClient
        .from('personnel')
        .select('id, first_name, last_name')
        .in('id', personnelIds)
        .order('last_name')
    : { data: [] as { id: string; first_name: string; last_name: string }[] }

  // Inspection logs — scoped to dept apparatus, filtered by date range
  const scopeIds = apparatusId
    ? (deptApparatusIds.includes(apparatusId) ? [apparatusId] : [''])
    : deptApparatusIds.length > 0 ? deptApparatusIds : ['']

  let logsQuery = adminClient
    .from('item_asset_inspection_logs')
    .select('id, apparatus_id, asset_id, compartment_id, inspected_at, overall_result, inspected_by_name, inspected_by_personnel_id')
    .in('apparatus_id', scopeIds)
    .gte('inspected_at', fromTs)
    .lte('inspected_at', toTs)
    .order('inspected_at', { ascending: false })

  if (personnelId) logsQuery = logsQuery.eq('inspected_by_personnel_id', personnelId)

  const { data: logsRaw } = await logsQuery

  const logs = logsRaw ?? []
  const logIds = logs.map(l => l.id)

  // Step responses
  const { data: stepResponses } = logIds.length > 0
    ? await adminClient
        .from('item_asset_inspection_log_steps')
        .select('inspection_log_id, template_step_id, boolean_value, numeric_value, text_value')
        .in('inspection_log_id', logIds)
    : { data: [] as { inspection_log_id: string; template_step_id: string; boolean_value: boolean | null; numeric_value: number | null; text_value: string | null }[] }

  // Template steps (for step text, type, fail rules)
  const templateStepIds = [...new Set((stepResponses ?? []).map(s => s.template_step_id))]
  const { data: templateSteps } = templateStepIds.length > 0
    ? await adminClient
        .from('item_inspection_template_steps')
        .select('id, step_text, step_type, fail_if_negative, required, sort_order')
        .in('id', templateStepIds)
    : { data: [] as { id: string; step_text: string; step_type: string; fail_if_negative: boolean; required: boolean; sort_order: number }[] }

  const templateStepMap = Object.fromEntries((templateSteps ?? []).map(s => [s.id, s]))

  // Assets (from logs)
  const logAssetIds = [...new Set(logs.filter(l => l.asset_id).map(l => l.asset_id as string))]

  // Also collect linked asset ids from ASSET_LINK step responses
  const linkedAssetIds = [...new Set(
    (stepResponses ?? [])
      .filter(sr => {
        const ts = templateStepMap[sr.template_step_id]
        return ts?.step_type === 'ASSET_LINK' && sr.text_value
      })
      .map(sr => sr.text_value as string)
  )]

  const allAssetIds = [...new Set([...logAssetIds, ...linkedAssetIds])]
  const { data: assetsData } = allAssetIds.length > 0
    ? await adminClient.from('item_assets').select('id, asset_tag, item_id').in('id', allAssetIds)
    : { data: [] as { id: string; asset_tag: string; item_id: string }[] }

  // Items (for item names)
  const assetItemIds = [...new Set((assetsData ?? []).map(a => a.item_id))]
  const { data: itemsData } = assetItemIds.length > 0
    ? await adminClient.from('items').select('id, item_name').in('id', assetItemIds)
    : { data: [] as { id: string; item_name: string }[] }

  // Compartments
  const compartmentIds = [...new Set(logs.filter(l => l.compartment_id).map(l => l.compartment_id as string))]
  const { data: compartmentLinks } = compartmentIds.length > 0
    ? await adminClient.from('apparatus_compartments').select('id, compartment_name_id').in('id', compartmentIds)
    : { data: [] as { id: string; compartment_name_id: string }[] }

  const compNameIds = [...new Set((compartmentLinks ?? []).map(c => c.compartment_name_id))]
  const { data: compartmentNames } = compNameIds.length > 0
    ? await adminClient.from('compartment_names').select('id, compartment_code').in('id', compNameIds)
    : { data: [] as { id: string; compartment_code: string }[] }

  // Build maps
  const assetMap = Object.fromEntries((assetsData ?? []).map(a => [a.id, a]))
  const itemMap = Object.fromEntries((itemsData ?? []).map(i => [i.id, i.item_name]))
  const compNameCodeMap = Object.fromEntries((compartmentNames ?? []).map(c => [c.id, c.compartment_code]))
  const compMap = Object.fromEntries((compartmentLinks ?? []).map(c => [c.id, compNameCodeMap[c.compartment_name_id] ?? '—']))
  const apparatusMap = Object.fromEntries((apparatusList ?? []).map(a => [a.id, `${a.unit_number} ${a.apparatus_name ?? ''}`.trim()]))

  // Group step responses by log id
  const stepsByLog: Record<string, typeof stepResponses> = {}
  for (const sr of stepResponses ?? []) {
    if (!stepsByLog[sr.inspection_log_id]) stepsByLog[sr.inspection_log_id] = []
    stepsByLog[sr.inspection_log_id]!.push(sr)
  }

  // Shape final rows
  const inspectionLogs: InspectionLogRow[] = logs.map(l => {
    const asset = l.asset_id ? assetMap[l.asset_id] : null
    const rawSteps = (stepsByLog[l.id] ?? [])
      .sort((a, b) => {
        const ao = templateStepMap[a.template_step_id]?.sort_order ?? 0
        const bo = templateStepMap[b.template_step_id]?.sort_order ?? 0
        return ao - bo
      })

    const steps: StepRow[] = rawSteps.map(sr => {
      const ts = templateStepMap[sr.template_step_id]
      const linkedTag = ts?.step_type === 'ASSET_LINK' && sr.text_value
        ? (assetMap[sr.text_value]?.asset_tag ?? null)
        : null
      return {
        template_step_id: sr.template_step_id,
        step_text: ts?.step_text ?? '—',
        step_type: ts?.step_type ?? 'BOOLEAN',
        boolean_value: sr.boolean_value,
        numeric_value: sr.numeric_value,
        text_value: sr.text_value,
        fail_if_negative: ts?.fail_if_negative ?? false,
        required: ts?.required ?? false,
        sort_order: ts?.sort_order ?? 0,
        linked_asset_tag: linkedTag,
      }
    })

    return {
      id: l.id,
      inspected_at: l.inspected_at,
      overall_result: l.overall_result,
      apparatus_id: l.apparatus_id,
      apparatus_name: apparatusMap[l.apparatus_id] ?? '—',
      compartment: l.compartment_id ? (compMap[l.compartment_id] ?? '—') : '—',
      asset_id: l.asset_id ?? '',
      asset_tag: asset?.asset_tag ?? '—',
      item_name: asset ? (itemMap[asset.item_id] ?? '—') : '—',
      item_id: asset?.item_id ?? '',
      inspector_name: l.inspected_by_name ?? '—',
      inspector_personnel_id: l.inspected_by_personnel_id ?? null,
      steps,
    }
  })

  // Presence check logs — same apparatus scope, date range, optional filters
  let presenceQuery = adminClient
    .from('compartment_presence_check_logs')
    .select('id, apparatus_id, compartment_id, item_id, inspected_at, inspected_by_name, inspected_by_personnel_id, present, actual_quantity, notes')
    .in('apparatus_id', scopeIds)
    .gte('inspected_at', fromTs)
    .lte('inspected_at', toTs)
    .order('inspected_at', { ascending: false })

  if (personnelId) presenceQuery = presenceQuery.eq('inspected_by_personnel_id', personnelId)

  const { data: presenceRaw } = await presenceQuery

  // Fetch item names for presence check items not already in itemMap
  const presenceItemIds = [...new Set((presenceRaw ?? []).map(p => p.item_id as string))]
  const missingItemIds = presenceItemIds.filter(id => !itemMap[id])
  const { data: extraItems } = missingItemIds.length > 0
    ? await adminClient.from('items').select('id, item_name').in('id', missingItemIds)
    : { data: [] as { id: string; item_name: string }[] }
  for (const item of extraItems ?? []) itemMap[item.id] = item.item_name

  // Fetch compartments for presence checks not already in compMap
  const presenceCompIds = [...new Set((presenceRaw ?? []).filter(p => p.compartment_id).map(p => p.compartment_id as string))]
  const missingCompIds = presenceCompIds.filter(id => !compMap[id])
  if (missingCompIds.length > 0) {
    const { data: extraComps } = await adminClient
      .from('apparatus_compartments')
      .select('id, compartment_name_id')
      .in('id', missingCompIds)
    const extraCompNameIds = [...new Set((extraComps ?? []).map(c => c.compartment_name_id))]
    const { data: extraCompNames } = extraCompNameIds.length > 0
      ? await adminClient.from('compartment_names').select('id, compartment_code').in('id', extraCompNameIds)
      : { data: [] as { id: string; compartment_code: string }[] }
    const extraCodeMap = Object.fromEntries((extraCompNames ?? []).map(c => [c.id, c.compartment_code]))
    for (const c of extraComps ?? []) compMap[c.id] = extraCodeMap[c.compartment_name_id] ?? '—'
  }

  const presenceChecks: PresenceCheckRow[] = (presenceRaw ?? []).map(p => ({
    id: p.id,
    inspected_at: p.inspected_at,
    apparatus_id: p.apparatus_id,
    apparatus_name: apparatusMap[p.apparatus_id] ?? '—',
    compartment: p.compartment_id ? (compMap[p.compartment_id] ?? '—') : '—',
    item_name: itemMap[p.item_id] ?? '—',
    item_id: p.item_id,
    inspector_name: p.inspected_by_name ?? '—',
    inspector_personnel_id: p.inspected_by_personnel_id ?? null,
    present: p.present,
    actual_quantity: p.actual_quantity ?? null,
    notes: p.notes ?? null,
  }))

  // Synthesize "Present" rows for ASSET_LINK picks that have no own inspection log
  // (i.e. the linked asset — e.g. a bottle — has no template and was never submitted as its own log)
  const inspectedAssetIds = new Set(inspectionLogs.map(l => l.asset_id))
  for (const log of inspectionLogs) {
    for (const step of log.steps) {
      if (step.step_type !== 'ASSET_LINK' || !step.text_value) continue
      const linkedAssetId = step.text_value
      if (inspectedAssetIds.has(linkedAssetId)) continue // already has its own inspection row
      const linkedAsset = assetMap[linkedAssetId]
      if (!linkedAsset) continue
      presenceChecks.push({
        id: `${log.id}-link-${linkedAssetId}`,
        inspected_at: log.inspected_at,
        apparatus_id: log.apparatus_id,
        apparatus_name: log.apparatus_name,
        compartment: log.compartment,
        item_name: itemMap[linkedAsset.item_id] ?? '—',
        item_id: linkedAsset.item_id,
        inspector_name: log.inspector_name,
        inspector_personnel_id: log.inspector_personnel_id,
        present: true,
        actual_quantity: null,
        notes: null,
        asset_tag: linkedAsset.asset_tag,
      })
    }
  }

  const personnelDropdown = (personnelData ?? []).map(p => ({
    id: p.id,
    name: `${p.last_name}, ${p.first_name}`,
  }))

  return (
    <InspectionReportClient
      logs={inspectionLogs}
      presenceChecks={presenceChecks}
      apparatusList={(apparatusList ?? []).map(a => ({ id: a.id, name: `${a.unit_number} ${a.apparatus_name ?? ''}`.trim() }))}
      personnelList={personnelDropdown}
      dateFrom={dateFrom}
      dateTo={dateTo}
      selectedApparatusId={apparatusId ?? null}
      selectedPersonnelId={personnelId ?? null}
    />
  )
}
