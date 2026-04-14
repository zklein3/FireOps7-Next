import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ApparatusDetailClient from './ApparatusDetailClient'

export default async function ApparatusDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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

  // Fetch apparatus — no nested joins to avoid type issues
  const { data: apparatusList } = await adminClient
    .from('apparatus')
    .select('id, unit_number, apparatus_name, make, model, model_year, vin, license_plate, active, in_service_date, out_of_service_date, notes, apparatus_type_id, station_id')
    .eq('id', id)

  const apparatus = apparatusList?.[0]
  if (!apparatus) redirect('/apparatus')

  // Fetch apparatus type name separately
  const { data: apparatusTypeData } = apparatus.apparatus_type_id
    ? await adminClient.from('apparatus_types').select('id, name').eq('id', apparatus.apparatus_type_id)
    : { data: [] }

  // Fetch station separately
  const { data: stationData } = apparatus.station_id
    ? await adminClient.from('stations').select('id, station_name, station_number').eq('id', apparatus.station_id)
    : { data: [] }

  // Fetch all stations for reassignment dropdown
  const { data: stations } = await adminClient
    .from('stations')
    .select('id, station_number, station_name')
    .eq('department_id', myDept.department_id)
    .eq('active', true)
    .order('station_number')

  // Fetch apparatus types for dropdown
  const { data: apparatusTypes } = await adminClient
    .from('apparatus_types')
    .select('id, name, sort_order')
    .eq('active', true)
    .order('sort_order')

  // Fetch compartments
  const { data: compartmentLinks } = await adminClient
    .from('apparatus_compartments')
    .select('id, active, notes, compartment_name_id')
    .eq('apparatus_id', id)

  // Fetch compartment name details separately
  const compartmentNameIds = (compartmentLinks ?? []).map(c => c.compartment_name_id).filter(Boolean)
  const { data: compartmentNameData } = compartmentNameIds.length > 0
    ? await adminClient.from('compartment_names').select('id, compartment_code, compartment_name, sort_order').in('id', compartmentNameIds)
    : { data: [] }

  const compartmentNameMap = Object.fromEntries((compartmentNameData ?? []).map(c => [c.id, c]))

  const compartments = (compartmentLinks ?? []).map(c => ({
    id: c.id,
    active: c.active,
    notes: c.notes,
    compartment_name: compartmentNameMap[c.compartment_name_id] ?? null,
  }))

  // Fetch available compartment names for this department
  const { data: compartmentNames } = await adminClient
    .from('compartment_names')
    .select('id, compartment_code, compartment_name, sort_order')
    .eq('department_id', myDept.department_id)
    .eq('active', true)
    .order('sort_order')

  // Build clean apparatus object
  const apparatusWithRefs = {
    ...apparatus,
    apparatus_type: (apparatusTypeData ?? [])[0] ?? null,
    station: (stationData ?? [])[0] ?? null,
  }

  return (
    <ApparatusDetailClient
      apparatus={apparatusWithRefs}
      stations={stations ?? []}
      apparatusTypes={apparatusTypes ?? []}
      compartments={compartments}
      compartmentNames={compartmentNames ?? []}
      isAdmin={isAdmin}
      isOfficerOrAbove={isOfficerOrAbove}
      departmentId={myDept.department_id}
    />
  )
}
