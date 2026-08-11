import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import AssetDetailClient from './AssetDetailClient'

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (!ctx.departmentId) redirect('/dashboard')

  const admin = createAdminClient()

  // Fetch the asset
  const { data: asset } = await admin
    .from('item_assets')
    .select('id, asset_tag, serial_number, status, in_service_date, notes, item_id, apparatus_id, custom_field_values')
    .eq('id', id)
    .eq('department_id', ctx.departmentId)
    .single()

  if (!asset) redirect('/equipment/assets')

  // Fetch item name + category
  const { data: item } = await admin
    .from('items')
    .select('id, item_name, category_id')
    .eq('id', asset.item_id)
    .single()

  // Fetch custom field definitions for this item type
  const { data: fieldDefs } = await admin
    .from('item_custom_field_definitions')
    .select('id, field_label, field_order')
    .eq('item_id', asset.item_id)
    .eq('department_id', ctx.departmentId)
    .order('field_order')

  // Fetch service logs
  const { data: logsRaw } = await admin
    .from('asset_service_logs')
    .select('id, service_type, service_date, result, technician, vendor, notes, document_path, logged_by, created_at')
    .eq('asset_id', id)
    .order('service_date', { ascending: false })

  // Get personnel names for logs
  const loggerIds = [...new Set((logsRaw ?? []).map(l => l.logged_by).filter(Boolean))]
  const { data: loggers } = loggerIds.length > 0
    ? await admin.from('personnel').select('id, first_name, last_name').in('id', loggerIds)
    : { data: [] }
  const loggerMap = Object.fromEntries((loggers ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  const logs = (logsRaw ?? []).map(l => ({
    ...l,
    logged_by_name: l.logged_by ? (loggerMap[l.logged_by] ?? null) : null,
  }))

  // Fetch stored documents
  const { data: documents } = await admin
    .from('asset_documents')
    .select('id, document_name, document_path, created_at, uploaded_by')
    .eq('asset_id', id)
    .order('created_at', { ascending: false })

  const isOfficer = await hasPermission(ctx, 'manage_inventory')

  return (
    <AssetDetailClient
      asset={asset}
      item={item ?? { id: asset.item_id, item_name: 'Unknown Item', category_id: null }}
      fieldDefs={fieldDefs ?? []}
      logs={logs}
      documents={documents ?? []}
      isOfficer={isOfficer}
      departmentTimezone={ctx.departmentTimezone}
    />
  )
}
