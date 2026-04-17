import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import AttendanceSettingsClient from './AttendanceSettingsClient'

export default async function AttendanceSettingsPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) redirect('/login')

  const { data: myDeptList } = await adminClient
    .from('department_personnel')
    .select('department_id, system_role')
    .eq('personnel_id', me.id)
    .eq('active', true)
  const myDept = myDeptList?.[0]
  if (!myDept || myDept.system_role !== 'admin') redirect('/dashboard')

  const department_id = myDept.department_id

  const { data: excuseTypes } = await adminClient
    .from('excuse_types')
    .select('id, excuse_name, active')
    .eq('department_id', department_id)
    .order('excuse_name')

  const { data: requirements } = await adminClient
    .from('participation_requirements')
    .select('id, event_type, minimum_percentage, period, active')
    .eq('department_id', department_id)

  const reqMap = Object.fromEntries((requirements ?? []).map(r => [r.event_type, r]))

  return (
    <AttendanceSettingsClient
      excuseTypes={excuseTypes ?? []}
      requirements={reqMap}
      departmentId={department_id}
    />
  )
}
