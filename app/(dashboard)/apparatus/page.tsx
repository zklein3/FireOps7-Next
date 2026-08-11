import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { getPermissionSnapshot } from '@/lib/permissions'
import ApparatusListClient from './ApparatusListClient'

export default async function ApparatusPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  const apparatusPermissions = await getPermissionSnapshot(ctx)
  const isAdmin = apparatusPermissions.manage_apparatus
  const isOfficerOrAbove = apparatusPermissions.change_apparatus_service_status

  // Fetch stations
  const { data: stations } = await adminClient
    .from('stations')
    .select('id, station_number, station_name')
    .eq('department_id', ctx.departmentId)
    .eq('active', true)
    .order('station_number')

  // Fetch apparatus — flat, no nested joins
  const { data: apparatusRaw } = await adminClient
    .from('apparatus')
    .select('id, unit_number, apparatus_name, make, model, model_year, vin, license_plate, active, in_service_date, apparatus_type_id, station_id')
    .eq('department_id', ctx.departmentId)
    .order('unit_number')

  // Fetch apparatus types and stations for lookup
  const { data: apparatusTypes } = await adminClient
    .from('apparatus_types')
    .select('id, name, sort_order')
    .eq('active', true)
    .order('sort_order')

  const typeMap = Object.fromEntries((apparatusTypes ?? []).map(t => [t.id, t.name]))
  const stationMap = Object.fromEntries((stations ?? []).map(s => [s.id, s]))

  // Build clean apparatus list
  const apparatus = (apparatusRaw ?? []).map(a => ({
    id: a.id,
    unit_number: a.unit_number,
    apparatus_name: a.apparatus_name,
    make: a.make,
    model: a.model,
    model_year: a.model_year,
    vin: a.vin,
    license_plate: a.license_plate,
    active: a.active,
    in_service_date: a.in_service_date,
    apparatus_type_id: a.apparatus_type_id,
    station_id: a.station_id,
    type_name: a.apparatus_type_id ? (typeMap[a.apparatus_type_id] ?? null) : null,
    station: a.station_id ? (stationMap[a.station_id] ?? null) : null,
  }))

  return (
    <ApparatusListClient
      apparatus={apparatus}
      stations={stations ?? []}
      apparatusTypes={apparatusTypes ?? []}
      isAdmin={isAdmin}
      isOfficerOrAbove={isOfficerOrAbove}
      departmentId={ctx.departmentId}
    />
  )
}
