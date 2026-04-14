import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DeptPersonnelClient from './DeptPersonnelClient'

export default async function DeptPersonnelPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get calling user's personnel + dept info
  const { data: me } = await supabase
    .from('personnel')
    .select('id, is_sys_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!me) redirect('/dashboard')

  const { data: myDept } = await supabase
    .from('department_personnel')
    .select('department_id, system_role, departments(name)')
    .eq('personnel_id', me.id)
    .eq('active', true)
    .single()

  if (!myDept || (myDept.system_role !== 'admin' && !me.is_sys_admin)) {
    redirect('/dashboard')
  }

  const department_id = myDept.department_id
  const department_name = (myDept.departments as any)?.name ?? 'Your Department'

  // Get all personnel in this department
  const { data: personnel } = await supabase
    .from('department_personnel')
    .select(`
      id, system_role, signup_status, active, employee_number, hire_date,
      role_id,
      personnel(id, first_name, last_name, email, signup_status),
      personnel_roles(name, is_officer)
    `)
    .eq('department_id', department_id)
    .order('system_role')

  // Get all personnel roles for the dropdown
  const { data: roles } = await supabase
    .from('personnel_roles')
    .select('id, name, is_officer, sort_order')
    .eq('active', true)
    .order('sort_order')

  return (
    <DeptPersonnelClient
      personnel={personnel ?? []}
      roles={roles ?? []}
      departmentName={department_name}
      departmentId={department_id}
    />
  )
}
