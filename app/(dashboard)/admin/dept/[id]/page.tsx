import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import SysAdminDeptClient from './SysAdminDeptClient'

export default async function SysAdminDeptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify sys admin
  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me?.is_sys_admin) redirect('/dashboard')

  // Fetch department
  const { data: deptList } = await adminClient.from('departments').select('id, name, code, active').eq('id', id)
  const dept = deptList?.[0]
  if (!dept) redirect('/dashboard')

  // Fetch personnel
  const { data: deptPersonnelRaw } = await adminClient
    .from('department_personnel')
    .select('id, system_role, signup_status, active, employee_number, hire_date, role_id, personnel_id')
    .eq('department_id', id)
    .order('system_role')

  const personnelIds = (deptPersonnelRaw ?? []).map(dp => dp.personnel_id).filter(Boolean)
  const { data: personnelData } = personnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name, email, signup_status').in('id', personnelIds)
    : { data: [] }

  const roleIds = (deptPersonnelRaw ?? []).map(dp => dp.role_id).filter(Boolean)
  const { data: roleData } = roleIds.length > 0
    ? await adminClient.from('personnel_roles').select('id, name').in('id', roleIds)
    : { data: [] }

  const personnelMap = Object.fromEntries((personnelData ?? []).map(p => [p.id, p]))
  const roleMap = Object.fromEntries((roleData ?? []).map(r => [r.id, r]))

  const personnel = (deptPersonnelRaw ?? []).map(dp => ({
    id: dp.id,
    system_role: dp.system_role,
    signup_status: dp.signup_status,
    active: dp.active,
    employee_number: dp.employee_number,
    hire_date: dp.hire_date,
    role_id: dp.role_id,
    personnel: personnelMap[dp.personnel_id] ?? null,
    role_name: dp.role_id ? (roleMap[dp.role_id]?.name ?? null) : null,
  }))

  // Fetch stations
  const { data: stations } = await adminClient
    .from('stations')
    .select('id, station_number, station_name, address_line_1, city, state, active')
    .eq('department_id', id)
    .order('station_number')

  // Fetch apparatus
  const { data: apparatusRaw } = await adminClient
    .from('apparatus')
    .select('id, unit_number, apparatus_name, apparatus_type_id, station_id, active')
    .eq('department_id', id)
    .order('unit_number')

  const typeIds = (apparatusRaw ?? []).map(a => a.apparatus_type_id).filter(Boolean)
  const { data: typeData } = typeIds.length > 0
    ? await adminClient.from('apparatus_types').select('id, name').in('id', typeIds)
    : { data: [] }

  const stationMap = Object.fromEntries((stations ?? []).map(s => [s.id, s]))
  const typeMap = Object.fromEntries((typeData ?? []).map(t => [t.id, t.name]))

  const apparatus = (apparatusRaw ?? []).map(a => ({
    id: a.id,
    unit_number: a.unit_number,
    apparatus_name: a.apparatus_name,
    active: a.active,
    type_name: a.apparatus_type_id ? (typeMap[a.apparatus_type_id] ?? null) : null,
    station_name: a.station_id ? (stationMap[a.station_id]?.station_name ?? null) : null,
    station_number: a.station_id ? (stationMap[a.station_id]?.station_number ?? null) : null,
  }))

  // Fetch roles for add personnel form
  const { data: roles } = await adminClient
    .from('personnel_roles')
    .select('id, name, is_officer, sort_order')
    .eq('active', true)
    .order('sort_order')

  // Fetch compartment names
  const { data: compartmentNames } = await adminClient
    .from('compartment_names')
    .select('id, compartment_code, compartment_name, sort_order, active')
    .eq('department_id', id)
    .order('sort_order')

  return (
    <SysAdminDeptClient
      dept={dept}
      personnel={personnel}
      stations={stations ?? []}
      apparatus={apparatus}
      roles={roles ?? []}
      compartmentNames={compartmentNames ?? []}
      departmentId={id}
    />
  )
}
