import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import PersonnelHubClient from './PersonnelHubClient'

export default async function PersonnelHubPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (!ctx.departmentId || (ctx.systemRole !== 'admin' && !ctx.isSysAdmin)) redirect('/dashboard')

  const department_id = ctx.departmentId
  const department_name = ctx.departmentName ?? 'Your Department'

  // Personnel data
  const { data: deptPersonnelRaw } = await adminClient
    .from('department_personnel')
    .select('id, system_role, signup_status, active, employee_number, hire_date, role_id, personnel_id, shift_id')
    .eq('department_id', department_id)
    .order('system_role')

  const personnelIds = (deptPersonnelRaw ?? []).map(dp => dp.personnel_id).filter(Boolean)
  const { data: personnelData } = personnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name, email, signup_status').in('id', personnelIds)
    : { data: [] }

  const roleIds = (deptPersonnelRaw ?? []).map(dp => dp.role_id).filter(Boolean)
  const { data: roleData } = roleIds.length > 0
    ? await adminClient.from('personnel_roles').select('id, name, is_officer').in('id', roleIds)
    : { data: [] }

  const personnelMap = Object.fromEntries((personnelData ?? []).map(p => [p.id, p]))
  const roleMap = Object.fromEntries((roleData ?? []).map(r => [r.id, r]))

  const { data: shifts } = await adminClient
    .from('department_shifts').select('id, name, sort_order, active').eq('department_id', department_id).order('sort_order')
  const shiftMap = Object.fromEntries((shifts ?? []).map(s => [s.id, s]))

  const personnel = (deptPersonnelRaw ?? []).map(dp => ({
    id: dp.id,
    system_role: dp.system_role,
    signup_status: dp.signup_status,
    active: dp.active,
    employee_number: dp.employee_number,
    hire_date: dp.hire_date,
    role_id: dp.role_id,
    shift_id: dp.shift_id,
    personnel: personnelMap[dp.personnel_id] ?? null,
    personnel_roles: dp.role_id ? (roleMap[dp.role_id] ?? null) : null,
    shift_name: dp.shift_id ? (shiftMap[dp.shift_id]?.name ?? null) : null,
  }))

  const { data: roles } = await adminClient
    .from('personnel_roles')
    .select('id, name, is_officer, sort_order')
    .eq('active', true)
    .order('sort_order')

  // Attendance settings data
  const [{ data: excuseTypes }, { data: requirements }] = await Promise.all([
    adminClient.from('excuse_types').select('id, excuse_name, active').eq('department_id', department_id).order('excuse_name'),
    adminClient.from('participation_requirements').select('id, event_type, minimum_percentage, period, active').eq('department_id', department_id),
  ])

  const reqMap = Object.fromEntries((requirements ?? []).map(r => [r.event_type, r]))

  return (
    <PersonnelHubClient
      personnel={personnel}
      roles={roles ?? []}
      shifts={(shifts ?? []).filter(s => s.active)}
      departmentName={department_name}
      departmentId={department_id}
      excuseTypes={excuseTypes ?? []}
      requirements={reqMap}
    />
  )
}
