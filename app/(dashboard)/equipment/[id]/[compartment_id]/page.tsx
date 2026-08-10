import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { setCompartmentQrCode } from '@/app/actions/compartments'
import QrPrintLabel from '@/components/QrPrintLabel'
import CompartmentItemsClient from './CompartmentItemsClient'
import BackButton from '@/components/BackButton'

function fmt(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}


export default async function CompartmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; compartment_id: string }>
  searchParams: Promise<{ from?: string }>
}) {
  const { id: apparatus_id, compartment_id } = await params
  const { from } = await searchParams
  const backHref = from ?? `/equipment/${apparatus_id}`
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  const department_id = ctx.departmentId
  const isAdmin = await hasPermission(ctx, 'manage_apparatus')

  // Fetch apparatus
  const { data: appList } = await adminClient
    .from('apparatus')
    .select('id, unit_number, apparatus_name, qr_code')
    .eq('id', apparatus_id)
  const apparatus = appList?.[0]
  if (!apparatus) redirect('/equipment')

  // Fetch compartment link + name
  const { data: compLinkList } = await adminClient
    .from('apparatus_compartments')
    .select('id, compartment_name_id, apparatus_id, qr_code')
    .eq('id', compartment_id)
  const compLink = compLinkList?.[0]
  if (!compLink || compLink.apparatus_id !== apparatus_id) redirect(`/equipment/${apparatus_id}`)

  const { data: compNameList } = await adminClient
    .from('compartment_names')
    .select('id, compartment_code, compartment_name')
    .eq('id', compLink.compartment_name_id)
  const compName = compNameList?.[0]

  // Items in this compartment
  const { data: locationStandards } = await adminClient
    .from('item_location_standards')
    .select('id, item_id, expected_quantity, minimum_quantity, notes')
    .eq('apparatus_compartment_id', compartment_id)
    .eq('active', true)

  const itemIds = (locationStandards ?? []).map(ls => ls.item_id).filter(Boolean) as string[]

  const { data: items } = itemIds.length > 0
    ? await adminClient
        .from('items')
        .select('id, item_name, category_id, tracks_assets, requires_inspection')
        .in('id', itemIds)
    : { data: [] }

  const categoryIds = [...new Set((items ?? []).map(i => i.category_id).filter(Boolean) as string[])]
  const { data: categories } = categoryIds.length > 0
    ? await adminClient.from('item_categories').select('id, category_name').in('id', categoryIds)
    : { data: [] }

  // Assets for asset-tracked items
  const assetItemIds = (items ?? []).filter(i => i.tracks_assets).map(i => i.id)
  const { data: assets } = assetItemIds.length > 0
    ? await adminClient
        .from('item_assets')
        .select('id, item_id, asset_tag, status')
        .eq('department_id', department_id)
        .in('item_id', assetItemIds)
        .eq('active', true)
        .order('asset_tag')
    : { data: [] }

  // Recent full inspections for this compartment
  const { data: recentInspections } = await adminClient
    .from('item_asset_inspection_logs')
    .select('id, inspected_at, overall_result, inspected_by_name, asset_id')
    .eq('compartment_id', compartment_id)
    .order('inspected_at', { ascending: false })
    .limit(6)

  // Recent presence checks for this compartment
  const { data: recentPresence } = await adminClient
    .from('compartment_presence_check_logs')
    .select('id, inspected_at, inspected_by_name, present, item_id')
    .eq('compartment_id', compartment_id)
    .order('inspected_at', { ascending: false })
    .limit(6)

  // Asset tags for inspection log display
  const logAssetIds = [...new Set((recentInspections ?? []).map(l => l.asset_id).filter(Boolean) as string[])]
  const { data: logAssets } = logAssetIds.length > 0
    ? await adminClient.from('item_assets').select('id, asset_tag').in('id', logAssetIds)
    : { data: [] }

  // Item names for presence check display
  const presenceItemIds = [...new Set((recentPresence ?? []).map(l => l.item_id).filter(Boolean) as string[])]
  const { data: presenceItems } = presenceItemIds.length > 0
    ? await adminClient.from('items').select('id, item_name').in('id', presenceItemIds)
    : { data: [] }

  // Build maps
  const itemMap = Object.fromEntries((items ?? []).map(i => [i.id, i]))
  const categoryMap = Object.fromEntries((categories ?? []).map(c => [c.id, c.category_name]))
  const logAssetMap = Object.fromEntries((logAssets ?? []).map(a => [a.id, a.asset_tag ?? '—']))
  const presenceItemMap = Object.fromEntries((presenceItems ?? []).map(i => [i.id, i.item_name]))

  const assetsByItem: Record<string, { id: string; asset_tag: string | null; status: string }[]> = {}
  for (const a of assets ?? []) {
    if (!assetsByItem[a.item_id]) assetsByItem[a.item_id] = []
    assetsByItem[a.item_id].push({ id: a.id, asset_tag: a.asset_tag, status: a.status ?? 'IN SERVICE' })
  }

  // All apparatus + compartments for the move modal
  const { data: allApparatusRaw } = await adminClient
    .from('apparatus')
    .select('id, unit_number, apparatus_name')
    .eq('department_id', ctx.departmentId)
    .eq('active', true)
    .order('unit_number')

  const allAppIds = (allApparatusRaw ?? []).map(a => a.id)
  const { data: allCompLinks } = allAppIds.length > 0
    ? await adminClient
        .from('apparatus_compartments')
        .select('id, apparatus_id, compartment_name_id')
        .in('apparatus_id', allAppIds)
        .eq('active', true)
    : { data: [] }

  const allCompNameIds = [...new Set((allCompLinks ?? []).map(c => c.compartment_name_id).filter(Boolean) as string[])]
  const { data: allCompNames } = allCompNameIds.length > 0
    ? await adminClient.from('compartment_names').select('id, compartment_code, compartment_name').in('id', allCompNameIds)
    : { data: [] }
  const allCompNameMap = Object.fromEntries((allCompNames ?? []).map(c => [c.id, c]))

  const allApparatus = (allApparatusRaw ?? []).map(a => ({
    id: a.id,
    unit_number: a.unit_number,
    apparatus_name: a.apparatus_name,
    compartments: (allCompLinks ?? [])
      .filter(c => c.apparatus_id === a.id)
      .map(c => {
        const n = allCompNameMap[c.compartment_name_id]
        return { id: c.id, compartment_code: n?.compartment_code ?? '—', compartment_name: n?.compartment_name ?? null }
      }),
  }))

  const compartmentItems = (locationStandards ?? []).map(ls => {
    const item = itemMap[ls.item_id]
    return {
      id: ls.id,
      item_id: ls.item_id,
      item_name: item?.item_name ?? '—',
      category_name: item?.category_id ? (categoryMap[item.category_id] ?? '') : '',
      tracks_assets: item?.tracks_assets ?? false,
      requires_inspection: item?.requires_inspection ?? false,
      expected_quantity: ls.expected_quantity,
      minimum_quantity: ls.minimum_quantity ?? null,
      assets: assetsByItem[ls.item_id] ?? [],
    }
  })

  const apparatusBase = apparatus.qr_code ?? apparatus.unit_number
  const suggestedQrCode = compName?.compartment_code
    ? `${apparatusBase}-${compName.compartment_code}`.toUpperCase()
    : null

  // Auto-assign suggested code on first open so Print QR always works
  let currentQrCode = compLink.qr_code ?? null
  if (!currentQrCode && suggestedQrCode) {
    await adminClient
      .from('apparatus_compartments')
      .update({ qr_code: suggestedQrCode })
      .eq('id', compartment_id)
    currentQrCode = suggestedQrCode
  }

  async function handleSetQrCode(formData: FormData): Promise<void> {
    'use server'
    await setCompartmentQrCode(compartment_id, apparatus_id, formData)
  }
  const compartmentLabel = compName
    ? `${compName.compartment_code}${compName.compartment_name ? ' — ' + compName.compartment_name : ''}`
    : '—'
  const apparatusLabel = apparatus.unit_number + (apparatus.apparatus_name ? ` — ${apparatus.apparatus_name}` : '')

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-4">
        <p className="text-sm text-zinc-500">{apparatusLabel}</p>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center rounded-lg bg-red-50 border border-red-200 px-2.5 py-1 text-lg font-mono font-bold text-red-700">
            {apparatus.unit_number} - {compName?.compartment_code ?? '—'}
          </span>
          {compName?.compartment_name && (
            <span>{compName.compartment_name}</span>
          )}
        </h1>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        <BackButton href={backHref} className="rounded-lg bg-white border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 hover:border-red-300 hover:text-red-700 transition-colors shadow-sm flex-1 text-center print:hidden" />
        {currentQrCode && (
          <QrPrintLabel
            code={currentQrCode}
            type="compartment"
            title={compartmentLabel}
            subtitle={apparatusLabel}
            buttonClassName="rounded-lg bg-white border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 hover:border-red-300 hover:text-red-700 transition-colors shadow-sm text-center print:hidden"
          />
        )}
      </div>

      {/* QR Code — admin only */}
      {isAdmin && (
        <div className="mb-6 rounded-xl bg-white border border-zinc-200 overflow-hidden">
          <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">QR Code</p>
          </div>
          <div className="px-4 py-4">
            <form action={handleSetQrCode} className="flex items-end gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-zinc-600">Compartment Code</label>
                <input
                  name="qr_code"
                  type="text"
                  defaultValue={currentQrCode ?? suggestedQrCode ?? ''}
                  placeholder="e.g. ENGINE-32-D1"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-mono uppercase focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                <p className="mt-1 text-xs text-zinc-400">
                  {currentQrCode ? 'Unique code for this compartment\'s QR label.' : 'Auto-suggested from apparatus + compartment code. Edit if needed, then Save.'}
                </p>
              </div>
              <button
                type="submit"
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 transition-colors shrink-0"
              >
                Save
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Item list */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
          Items in Compartment ({compartmentItems.length})
        </h2>
        <CompartmentItemsClient
          items={compartmentItems}
          allApparatus={allApparatus}
          currentCompartmentId={compartment_id}
        />
      </div>

      {/* Recent activity */}
      {(recentInspections ?? []).length > 0 || (recentPresence ?? []).length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">Recent Activity</h2>
          <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden divide-y divide-zinc-100">

            {/* Full inspections */}
            {(recentInspections ?? []).length > 0 && (
              <div className="px-4 py-3">
                <p className="text-xs font-semibold text-zinc-500 mb-2">Full Inspections</p>
                <div className="space-y-2">
                  {(recentInspections ?? []).map(log => (
                    <div key={log.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            log.overall_result === 'PASS'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {log.overall_result}
                        </span>
                        <span className="text-zinc-700 truncate font-medium">
                          {log.asset_id ? logAssetMap[log.asset_id] : '—'}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-zinc-500">{log.inspected_by_name ?? '—'}</p>
                        <p className="text-xs text-zinc-400">{fmt(log.inspected_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Presence checks */}
            {(recentPresence ?? []).length > 0 && (
              <div className="px-4 py-3">
                <p className="text-xs font-semibold text-zinc-500 mb-2">Presence Checks</p>
                <div className="space-y-2">
                  {(recentPresence ?? []).map(log => (
                    <div key={log.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            log.present ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {log.present ? 'Present' : 'Missing'}
                        </span>
                        <span className="text-zinc-700 truncate">
                          {log.item_id ? presenceItemMap[log.item_id] : '—'}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-zinc-500">{log.inspected_by_name ?? '—'}</p>
                        <p className="text-xs text-zinc-400">{fmt(log.inspected_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
