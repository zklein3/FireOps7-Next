import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import MyActivityClient from './MyActivityClient'

export default async function MyActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { from, to } = await searchParams

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

  const defaultTo = new Date()
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 90)

  const dateFrom = from ?? defaultFrom.toISOString().split('T')[0]
  const dateTo = to ?? defaultTo.toISOString().split('T')[0]

  const fromTs = `${dateFrom}T00:00:00.000Z`
  const toTs = `${dateTo}T23:59:59.999Z`

  // --- Attendance ---
  const { data: attendanceRaw } = await adminClient
    .from('event_attendance')
    .select('id, instance_id, status, submitted_at')
    .eq('personnel_id', me.id)

  const allInstanceIds = [...new Set((attendanceRaw ?? []).map(a => a.instance_id))]

  const { data: instancesInRange } = allInstanceIds.length > 0
    ? await adminClient
        .from('event_instances')
        .select('id, event_date, series_id, start_time')
        .in('id', allInstanceIds)
        .gte('event_date', dateFrom)
        .lte('event_date', dateTo)
    : { data: [] }

  const seriesIds = [...new Set((instancesInRange ?? []).map(i => i.series_id))]
  const { data: seriesRaw } = seriesIds.length > 0
    ? await adminClient
        .from('event_series')
        .select('id, title, event_type')
        .in('id', seriesIds)
    : { data: [] }

  const instanceMap = Object.fromEntries((instancesInRange ?? []).map(i => [i.id, i]))
  const seriesMap = Object.fromEntries((seriesRaw ?? []).map(s => [s.id, s]))
  const instanceIdsInRange = new Set((instancesInRange ?? []).map(i => i.id))

  const attendance = (attendanceRaw ?? [])
    .filter(a => instanceIdsInRange.has(a.instance_id))
    .map(a => {
      const inst = instanceMap[a.instance_id]
      const series = inst ? seriesMap[inst.series_id] : null
      return {
        id: a.id,
        status: a.status as string,
        submitted_at: a.submitted_at as string | null,
        event_date: inst?.event_date ?? '',
        event_title: series?.title ?? '—',
        event_type: series?.event_type ?? '—',
      }
    })
    .sort((a, b) => b.event_date.localeCompare(a.event_date))

  // --- Inspections ---
  const { data: inspLogs } = await adminClient
    .from('item_asset_inspection_logs')
    .select('id, apparatus_id, asset_id, compartment_id, inspected_at, overall_result')
    .eq('inspected_by_personnel_id', me.id)
    .gte('inspected_at', fromTs)
    .lte('inspected_at', toTs)
    .order('inspected_at', { ascending: false })

  const inspApparatusIds = [...new Set((inspLogs ?? []).filter(l => l.apparatus_id).map(l => l.apparatus_id as string))]
  const inspAssetIds = [...new Set((inspLogs ?? []).filter(l => l.asset_id).map(l => l.asset_id as string))]
  const inspCompartmentIds = [...new Set((inspLogs ?? []).filter(l => l.compartment_id).map(l => l.compartment_id as string))]

  const [{ data: apparatusData }, { data: assetData }, { data: compartmentLinks }] = await Promise.all([
    inspApparatusIds.length > 0
      ? adminClient.from('apparatus').select('id, unit_number, apparatus_name').in('id', inspApparatusIds)
      : Promise.resolve({ data: [] as { id: string; unit_number: string; apparatus_name: string }[] }),
    inspAssetIds.length > 0
      ? adminClient.from('item_assets').select('id, asset_tag, item_id').in('id', inspAssetIds)
      : Promise.resolve({ data: [] as { id: string; asset_tag: string; item_id: string }[] }),
    inspCompartmentIds.length > 0
      ? adminClient.from('apparatus_compartments').select('id, compartment_name_id').in('id', inspCompartmentIds)
      : Promise.resolve({ data: [] as { id: string; compartment_name_id: string }[] }),
  ])

  const compartmentNameIds = [...new Set((compartmentLinks ?? []).map(c => c.compartment_name_id))]
  const { data: compartmentNamesData } = compartmentNameIds.length > 0
    ? await adminClient.from('compartment_names').select('id, compartment_code').in('id', compartmentNameIds)
    : { data: [] as { id: string; compartment_code: string }[] }

  const assetItemIds = [...new Set((assetData ?? []).map(a => a.item_id))]
  const { data: assetItemData } = assetItemIds.length > 0
    ? await adminClient.from('items').select('id, item_name').in('id', assetItemIds)
    : { data: [] as { id: string; item_name: string }[] }

  const apparatusMap = Object.fromEntries((apparatusData ?? []).map(a => [a.id, `${a.unit_number} ${a.apparatus_name}`]))
  const compartmentNameCodeMap = Object.fromEntries((compartmentNamesData ?? []).map(c => [c.id, c.compartment_code]))
  const compartmentMap = Object.fromEntries((compartmentLinks ?? []).map(c => [c.id, compartmentNameCodeMap[c.compartment_name_id] ?? '—']))
  const assetItemMap = Object.fromEntries((assetItemData ?? []).map(i => [i.id, i.item_name]))
  const assetMap = Object.fromEntries((assetData ?? []).map(a => [a.id, { tag: a.asset_tag, item_name: assetItemMap[a.item_id] ?? '—' }]))

  const inspections = (inspLogs ?? []).map(l => ({
    id: l.id,
    inspected_at: l.inspected_at as string,
    overall_result: l.overall_result as string,
    apparatus: l.apparatus_id ? (apparatusMap[l.apparatus_id] ?? '—') : '—',
    compartment: l.compartment_id ? (compartmentMap[l.compartment_id] ?? '—') : '—',
    asset_tag: l.asset_id ? (assetMap[l.asset_id]?.tag ?? '—') : '—',
    item_name: l.asset_id ? (assetMap[l.asset_id]?.item_name ?? '—') : '—',
  }))

  // --- Incidents ---
  const { data: incidentPersonnelRaw } = await adminClient
    .from('incident_personnel')
    .select('id, incident_id, role, status')
    .eq('personnel_id', me.id)

  const allIncidentIds = [...new Set((incidentPersonnelRaw ?? []).map(ip => ip.incident_id))]
  const { data: incidentsRaw } = allIncidentIds.length > 0
    ? await adminClient
        .from('incidents')
        .select('id, incident_number, incident_date, incident_type, address')
        .in('id', allIncidentIds)
        .gte('incident_date', dateFrom)
        .lte('incident_date', dateTo)
        .order('incident_date', { ascending: false })
    : { data: [] }

  const incidentMap = Object.fromEntries((incidentsRaw ?? []).map(i => [i.id, i]))
  const incidentIdsInRange = new Set((incidentsRaw ?? []).map(i => i.id))

  const incidents = (incidentPersonnelRaw ?? [])
    .filter(ip => incidentIdsInRange.has(ip.incident_id))
    .map(ip => {
      const inc = incidentMap[ip.incident_id]
      return {
        id: ip.id,
        incident_number: inc?.incident_number ?? '—',
        incident_date: inc?.incident_date ?? '',
        incident_type: inc?.incident_type ?? '—',
        address: inc?.address ?? '—',
        role: ip.role ?? '—',
        personnel_status: ip.status as string,
      }
    })
    .sort((a, b) => b.incident_date.localeCompare(a.incident_date))

  return (
    <MyActivityClient
      myName={`${me.first_name} ${me.last_name}`}
      attendance={attendance}
      inspections={inspections}
      incidents={incidents}
      dateFrom={dateFrom}
      dateTo={dateTo}
    />
  )
}
