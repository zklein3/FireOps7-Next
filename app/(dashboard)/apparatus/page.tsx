import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ApparatusListClient from './ApparatusListClient'

export default async function ApparatusPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) redirect('/login')

  const { data: myDeptList } = await adminClient.from('department_personnel').select('department_id, system_role').eq('personnel_id', me.id).eq('active', true)
  const myDept = myDeptList?.[0]
  if (!myDept) redirect('/dashboard')

  const systemRole = myDept.system_role
  const isAdmin = systemRole === 'admin' || me.is_sys_admin
  const isOfficerOrAbove = isAdmin || systemRole === 'officer'

  // Fetch stations
  const { data: stations } = await adminClient
    .from('stations')
    .select('id, station_number, station_name')
    .eq('department_id', myDept.department_id)
    .eq('active', true)
    .order('station_number')

  // Fetch apparatus — flat, no nested joins
  const { data: apparatusRaw } = await adminClient
    .from('apparatus')
    .select('id, unit_number, apparatus_name, make, model, model_year, vin, license_plate, active, in_service_date, apparatus_type_id, station_id')
    .eq('department_id', myDept.department_id)
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
      departmentId={myDept.department_id}
    />
  )
}
