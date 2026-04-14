import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import DeptPersonnelClient from './DeptPersonnelClient'

export default async function DeptPersonnelPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) redirect('/login')

  const { data: myDeptList } = await adminClient
    .from('department_personnel')
    .select('department_id, system_role, departments(name)')
    .eq('personnel_id', me.id)
    .eq('active', true)

  const myDept = myDeptList?.[0]
  if (!myDept || (myDept.system_role !== 'admin' && !me.is_sys_admin)) redirect('/dashboard')

  const department_id = myDept.department_id
  const department_name = (myDept.departments as any)?.name ?? 'Your Department'

  // Fetch dept personnel — flat, no nested joins
  const { data: deptPersonnelRaw } = await adminClient
    .from('department_personnel')
    .select('id, system_role, signup_status, active, employee_number, hire_date, role_id, personnel_id')
    .eq('department_id', department_id)
    .order('system_role')

  // Fetch personnel records separately
  const personnelIds = (deptPersonnelRaw ?? []).map(dp => dp.personnel_id).filter(Boolean)
  const { data: personnelData } = personnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name, email, signup_status').in('id', personnelIds)
    : { data: [] }

  // Fetch role names separately
  const roleIds = (deptPersonnelRaw ?? []).map(dp => dp.role_id).filter(Boolean)
  const { data: roleData } = roleIds.length > 0
    ? await adminClient.from('personnel_roles').select('id, name, is_officer').in('id', roleIds)
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
    personnel_roles: dp.role_id ? (roleMap[dp.role_id] ?? null) : null,
  }))

  // Fetch all roles for dropdown
  const { data: roles } = await adminClient
    .from('personnel_roles')
    .select('id, name, is_officer, sort_order')
    .eq('active', true)
    .order('sort_order')

  return (
    <DeptPersonnelClient
      personnel={personnel}
      roles={roles ?? []}
      departmentName={department_name}
      departmentId={department_id}
    />
  )
}
