import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import PersonnelProfileClient from './PersonnelProfileClient'

export default async function PersonnelProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient
    .from('personnel')
    .select('id, is_sys_admin')
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

  const systemRole = myDept.system_role
  const isAdmin = systemRole === 'admin' || me.is_sys_admin
  const isOfficerOrAbove = isAdmin || systemRole === 'officer'
  const isMe = me.id === id

  if (!isOfficerOrAbove && !isMe) redirect('/personnel')

  const { data: personList } = await adminClient
    .from('personnel')
    .select('id, first_name, last_name, display_name, email, phone, address, city, state, zip, signup_status, is_sys_admin')
    .eq('id', id)

  const person = personList?.[0]
  if (!person) redirect('/personnel')

  const { data: deptRecordList } = await adminClient
    .from('department_personnel')
    .select('id, system_role, role_id, employee_number, hire_date, active, signup_status')
    .eq('personnel_id', id)
    .eq('department_id', myDept.department_id)

  const deptRecord = deptRecordList?.[0]
  if (!deptRecord) redirect('/personnel')

  const { data: roles } = await adminClient
    .from('personnel_roles')
    .select('id, name, is_officer, sort_order')
    .eq('active', true)
    .order('sort_order')

  return (
    <PersonnelProfileClient
      person={person}
      deptRecord={deptRecord}
      roles={roles ?? []}
      isMe={isMe}
      isAdmin={isAdmin}
      isOfficerOrAbove={isOfficerOrAbove}
    />
  )
}
