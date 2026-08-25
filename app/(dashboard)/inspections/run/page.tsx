import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { getMedicalSupplyStatus } from '@/lib/medical-status'
import InspectionRunClient from './InspectionRunClient'

export default async function InspectionRunPage({
  searchParams,
}: {
  searchParams: Promise<{ apparatus_id?: string; compartment_id?: string; mode?: string; session_id?: string; session_compartment_id?: string }>
}) {
  const { apparatus_id, compartment_id, mode, session_id, session_compartment_id } = await searchParams
  if (!apparatus_id || !compartment_id) redirect('/inspections')
  const presenceOnly = mode === 'presence'

  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')
  const me = { id: ctx.personnelId, first_name: ctx.firstName, last_name: ctx.lastName }

  // Fetch apparatus info
  const { data: appList } = await adminClient
    .from('apparatus')
    .select('id, unit_number, apparatus_name')
    .eq('id', apparatus_id)
  const apparatus = appList?.[0]
  if (!apparatus) redirect('/inspections')

  // Fetch compartment info
  const { data: compLinkList } = await adminClient
    .from('apparatus_compartments')
    .select('id, compartment_name_id')
    .eq('id', compartment_id)
  const compLink = compLinkList?.[0]
  if (!compLink) redirect('/inspections')

  const { data: compNameList } = await adminClient
    .from('compartment_names')
    .select('compartment_code, compartment_name')
    .eq('id', compLink.compartment_name_id)
  const compName = compNameList?.[0]

  // Fetch items in this compartment
  const { data: locationStandards } = await adminClient
    .from('item_location_standards')
    .select('id, item_id, expected_quantity')
    .eq('apparatus_compartment_id', compartment_id)
    .eq('active', true)

  const itemIds = (locationStandards ?? []).map(ls => ls.item_id)
  const { data: itemsRaw } = itemIds.length > 0
    ? await adminClient
        .from('items')
        .select('id, item_name, requires_inspection, tracks_assets, requires_presence_check')
        .in('id', itemIds)
    : { data: [] }
  const itemMap = Object.fromEntries((itemsRaw ?? []).map(i => [i.id, i]))

  // For asset-tracked items, fetch their assets
  const assetItemIds = (itemsRaw ?? []).filter(i => i.tracks_assets).map(i => i.id)
  const { data: assets } = assetItemIds.length > 0
    ? await adminClient
        .from('item_assets')
        .select('id, item_id, asset_tag, serial_number, status, apparatus_id')
        .eq('department_id', ctx.departmentId)
        .in('item_id', assetItemIds)
        .eq('active', true)
        .neq('status', 'RETIRED')
    : { data: [] }

  // Exclude assets already confirmed in OTHER compartments this session
  // (assets from the current compartment stay visible so they show as already-submitted on resume)
  let usedAssetIds = new Set<string>()
  let initialSubmittedAssets: string[] = []
  let initialSelectedAssets: Record<string, string[]> = {}
  if (session_id && assetItemIds.length > 0) {
    const [{ data: otherLogs }, { data: currentLogs }] = await Promise.all([
      adminClient
        .from('item_asset_inspection_logs')
        .select('asset_id')
        .eq('inspection_session_id', session_id)
        .neq('compartment_id', compartment_id),
      adminClient
        .from('item_asset_inspection_logs')
        .select('asset_id')
        .eq('inspection_session_id', session_id)
        .eq('compartment_id', compartment_id),
    ])
    usedAssetIds = new Set((otherLogs ?? []).map(l => l.asset_id))
    initialSubmittedAssets = (currentLogs ?? []).map(l => l.asset_id)

    // Rebuild selectedAssets so each slot shows the asset that was previously saved
    const assetToItemId = Object.fromEntries((assets ?? []).map(a => [a.id, a.item_id]))
    const itemIdToLocStdId = Object.fromEntries((locationStandards ?? []).map(ls => [ls.item_id, ls.id]))
    for (const log of currentLogs ?? []) {
      const itemId = assetToItemId[log.asset_id]
      const locStdId = itemId ? itemIdToLocStdId[itemId] : null
      if (locStdId) {
        if (!initialSelectedAssets[locStdId]) initialSelectedAssets[locStdId] = []
        initialSelectedAssets[locStdId].push(log.asset_id)
      }
    }
  }

  // For each asset-tracked item, fetch its inspection templates + steps
  const { data: templates } = assetItemIds.length > 0
    ? await adminClient
        .from('item_inspection_templates')
        .select('id, item_id, template_name')
        .eq('department_id', ctx.departmentId)
        .in('item_id', assetItemIds)
        .eq('active', true)
    : { data: [] }

  const templateIds = (templates ?? []).map(t => t.id)
  const { data: steps } = templateIds.length > 0
    ? await adminClient
        .from('item_inspection_template_steps')
        .select('id, template_id, step_text, step_type, required, fail_if_negative, sort_order')
        .in('template_id', templateIds)
        .eq('active', true)
        .order('sort_order')
    : { data: [] }

  // Build checklist items
  const checklistItems = (locationStandards ?? []).map(ls => {
    const item = itemMap[ls.item_id]
    if (!item) return null

    const itemAssets = (assets ?? []).filter(a => a.item_id === ls.item_id && !usedAssetIds.has(a.id))
    const itemTemplates = (templates ?? []).filter(t => t.item_id === ls.item_id)

    return {
      location_standard_id: ls.id,
      item_id: ls.item_id,
      item_name: item.item_name,
      requires_inspection: item.requires_inspection,
      tracks_assets: item.tracks_assets,
      requires_presence_check: item.requires_presence_check,
      expected_quantity: ls.expected_quantity,
      assets: itemAssets.map(a => ({
        id: a.id,
        asset_tag: a.asset_tag,
        serial_number: a.serial_number,
        status: a.status,
        apparatus_id: a.apparatus_id ?? null,
      })),
      templates: itemTemplates.map(t => ({
        id: t.id,
        template_name: t.template_name,
        steps: (steps ?? [])
          .filter(s => s.template_id === t.id && s.step_type !== 'ASSET_LINK')
          .map(s => ({
            id: s.id,
            step_text: s.step_text,
            step_type: s.step_type,
            required: s.required,
            fail_if_negative: s.fail_if_negative,
          })),
      })),
    }
  }).filter(Boolean)

  // Medications assigned to this compartment (if module_medical is on)
  let medicationItems: {
    storeroom_id: string
    storeroom_inventory_id: string
    supply_type_id: string
    supply_name: string
    unit_of_measure: string
    par_level: number
    tracks_expiration: boolean
    current_quantity: number
    lots: { id: string; lot_number: string | null; expiration_date: string | null; quantity_remaining: number }[]
    status: string
  }[] = []

  const { data: deptRow } = await adminClient.from('departments').select('module_medical').eq('id', ctx.departmentId).single()
  if (deptRow?.module_medical) {
    const { data: roomList } = await adminClient
      .from('medical_storerooms')
      .select('id')
      .eq('apparatus_id', apparatus_id)
      .eq('compartment_id', compartment_id)
      .eq('active', true)
    const room = roomList?.[0]

    if (room) {
      const { data: invRows } = await adminClient
        .from('medical_storeroom_inventory')
        .select('id, supply_type_id, par_level')
        .eq('storeroom_id', room.id)

      const invIds = (invRows ?? []).map(i => i.id)
      const supplyTypeIds = [...new Set((invRows ?? []).map(i => i.supply_type_id))]

      const [{ data: lots }, { data: supplyTypes }] = await Promise.all([
        invIds.length > 0
          ? adminClient
              .from('medical_stock_lots')
              .select('id, storeroom_inventory_id, lot_number, expiration_date, quantity_remaining')
              .in('storeroom_inventory_id', invIds)
              .eq('active', true)
              .gt('quantity_remaining', 0)
              .order('expiration_date', { ascending: true, nullsFirst: false })
          : Promise.resolve({ data: [] }),
        supplyTypeIds.length > 0
          ? adminClient.from('medical_supply_types').select('id, name, unit_of_measure, tracks_expiration').in('id', supplyTypeIds)
          : Promise.resolve({ data: [] }),
      ])

      medicationItems = (invRows ?? []).map(inv => {
        const supply = (supplyTypes ?? []).find(s => s.id === inv.supply_type_id)
        const invLots = (lots ?? []).filter(l => l.storeroom_inventory_id === inv.id)
        const current_quantity = invLots.reduce((sum, l) => sum + l.quantity_remaining, 0)
        return {
          storeroom_id: room.id,
          storeroom_inventory_id: inv.id,
          supply_type_id: inv.supply_type_id,
          supply_name: supply?.name ?? 'Unknown',
          unit_of_measure: supply?.unit_of_measure ?? '',
          par_level: inv.par_level,
          tracks_expiration: supply?.tracks_expiration ?? false,
          current_quantity,
          lots: invLots.map(l => ({ id: l.id, lot_number: l.lot_number, expiration_date: l.expiration_date, quantity_remaining: l.quantity_remaining })),
          status: getMedicalSupplyStatus(current_quantity, inv.par_level, invLots),
        }
      })
    }
  }

  return (
    <InspectionRunClient
      apparatus={{ id: apparatus.id, unit_number: apparatus.unit_number, apparatus_name: apparatus.apparatus_name }}
      compartment={{ code: compName?.compartment_code ?? '—', name: compName?.compartment_name ?? null }}
      compartmentId={compartment_id}
      checklistItems={checklistItems as any}
      medicationItems={medicationItems}
      inspectorName={`${me.first_name} ${me.last_name}`}
      personnelId={me.id}
      departmentId={ctx.departmentId}
      presenceOnly={presenceOnly}
      inspectionSessionId={session_id}
      sessionCompartmentId={session_compartment_id}
      initialSubmittedAssets={initialSubmittedAssets}
      initialSelectedAssets={initialSelectedAssets}
    />
  )
}
