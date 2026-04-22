import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import InspectionRunClient from './InspectionRunClient'

export default async function InspectionRunPage({
  searchParams,
}: {
  searchParams: Promise<{ apparatus_id?: string; compartment_id?: string }>
}) {
  const { apparatus_id, compartment_id } = await searchParams
  if (!apparatus_id || !compartment_id) redirect('/inspections')

  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient
    .from('personnel')
    .select('id, first_name, last_name, is_sys_admin')
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
        .select('id, item_id, asset_tag, serial_number, status, has_linked_asset, linked_item_type_id')
        .eq('department_id', myDept.department_id)
        .in('item_id', assetItemIds)
        .eq('active', true)
        .neq('status', 'RETIRED')
    : { data: [] }

  // For each asset-tracked item, fetch its inspection templates + steps
  const { data: templates } = assetItemIds.length > 0
    ? await adminClient
        .from('item_inspection_templates')
        .select('id, item_id, template_name')
        .eq('department_id', myDept.department_id)
        .in('item_id', assetItemIds)
        .eq('active', true)
    : { data: [] }

  const templateIds = (templates ?? []).map(t => t.id)
  const { data: steps } = templateIds.length > 0
    ? await adminClient
        .from('item_inspection_template_steps')
        .select('id, template_id, step_text, step_type, required, fail_if_negative, linked_item_type_id, sort_order')
        .in('template_id', templateIds)
        .eq('active', true)
        .order('sort_order')
    : { data: [] }

  // Fetch available linked assets for any ASSET_LINK steps
  const linkedItemTypeIds = (steps ?? [])
    .filter(s => s.step_type === 'ASSET_LINK' && s.linked_item_type_id)
    .map(s => s.linked_item_type_id)
  const { data: linkedAssets } = linkedItemTypeIds.length > 0
    ? await adminClient
        .from('item_assets')
        .select('id, item_id, asset_tag, serial_number')
        .eq('department_id', myDept.department_id)
        .in('item_id', linkedItemTypeIds)
        .eq('active', true)
        .eq('status', 'IN SERVICE')
    : { data: [] }

  // Fetch linked item type names
  const { data: linkedItemTypes } = linkedItemTypeIds.length > 0
    ? await adminClient.from('items').select('id, item_name').in('id', linkedItemTypeIds)
    : { data: [] }
  const linkedItemTypeMap = Object.fromEntries((linkedItemTypes ?? []).map(i => [i.id, i.item_name]))

  // Fetch inspection templates + steps for linked asset types (sub-inspections)
  const { data: linkedTemplates } = linkedItemTypeIds.length > 0
    ? await adminClient
        .from('item_inspection_templates')
        .select('id, item_id, template_name')
        .eq('department_id', myDept.department_id)
        .in('item_id', linkedItemTypeIds)
        .eq('active', true)
    : { data: [] }

  const linkedTemplateIds = (linkedTemplates ?? []).map(t => t.id)
  const { data: linkedSteps } = linkedTemplateIds.length > 0
    ? await adminClient
        .from('item_inspection_template_steps')
        .select('id, template_id, step_text, step_type, required, fail_if_negative, linked_item_type_id, sort_order')
        .in('template_id', linkedTemplateIds)
        .eq('active', true)
        .order('sort_order')
    : { data: [] }

  const linkedAssetTemplatesByItemType: Record<string, { template_id: string; template_name: string; steps: any[] }> = {}
  for (const t of linkedTemplates ?? []) {
    linkedAssetTemplatesByItemType[t.item_id] = {
      template_id: t.id,
      template_name: t.template_name,
      steps: (linkedSteps ?? [])
        .filter(s => s.template_id === t.id)
        .map(s => ({
          id: s.id,
          step_text: s.step_text,
          step_type: s.step_type,
          required: s.required,
          fail_if_negative: s.fail_if_negative,
          linked_item_type_id: s.linked_item_type_id ?? null,
          linked_item_type_name: null,
          linked_asset_options: [],
        })),
    }
  }

  // 30-minute dedup: assets already inspected on this apparatus this session
  const allAssetIds = [
    ...(assets ?? []).map(a => a.id),
    ...(linkedAssets ?? []).map(a => a.id),
  ]
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data: recentLogs } = allAssetIds.length > 0
    ? await adminClient
        .from('item_asset_inspection_logs')
        .select('asset_id')
        .eq('apparatus_id', apparatus_id)
        .in('asset_id', allAssetIds)
        .gt('inspected_at', thirtyMinAgo)
    : { data: [] }
  const recentlyInspectedAssetIds = [...new Set((recentLogs ?? []).map(l => l.asset_id as string))]

  // Build checklist items
  const checklistItems = (locationStandards ?? []).map(ls => {
    const item = itemMap[ls.item_id]
    if (!item) return null

    const itemAssets = (assets ?? []).filter(a => a.item_id === ls.item_id)
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
        has_linked_asset: a.has_linked_asset,
        linked_item_type_id: a.linked_item_type_id,
      })),
      templates: itemTemplates.map(t => ({
        id: t.id,
        template_name: t.template_name,
        steps: (steps ?? [])
          .filter(s => s.template_id === t.id)
          .map(s => ({
            id: s.id,
            step_text: s.step_text,
            step_type: s.step_type,
            required: s.required,
            fail_if_negative: s.fail_if_negative,
            linked_item_type_id: s.linked_item_type_id,
            linked_item_type_name: s.linked_item_type_id ? linkedItemTypeMap[s.linked_item_type_id] ?? null : null,
            linked_asset_options: s.linked_item_type_id
              ? (linkedAssets ?? []).filter(a => a.item_id === s.linked_item_type_id).map(a => ({ id: a.id, item_id: a.item_id, asset_tag: a.asset_tag, serial_number: a.serial_number }))
              : [],
          })),
      })),
    }
  }).filter(Boolean)

  return (
    <InspectionRunClient
      apparatus={{ id: apparatus.id, unit_number: apparatus.unit_number, apparatus_name: apparatus.apparatus_name }}
      compartment={{ code: compName?.compartment_code ?? '—', name: compName?.compartment_name ?? null }}
      compartmentId={compartment_id}
      checklistItems={checklistItems as any}
      inspectorName={`${me.first_name} ${me.last_name}`}
      personnelId={me.id}
      departmentId={myDept.department_id}
      linkedAssetTemplatesByItemType={linkedAssetTemplatesByItemType}
      recentlyInspectedAssetIds={recentlyInspectedAssetIds}
    />
  )
}
