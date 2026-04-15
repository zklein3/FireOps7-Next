import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import CompartmentsClient from './CompartmentsClient'

export default async function CompartmentsPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) redirect('/login')

  const { data: myDeptList } = await adminClient.from('department_personnel').select('department_id, system_role, departments(name)').eq('personnel_id', me.id).eq('active', true)
  const myDept = myDeptList?.[0]

  if (!myDept || (myDept.system_role !== 'admin' && !me.is_sys_admin)) redirect('/dashboard')

  const department_id = myDept.department_id
  const department_name = (myDept.departments as any)?.name ?? 'Your Department'

  const { data: compartments } = await adminClient
    .from('compartment_names')
    .select('id, compartment_code, compartment_name, sort_order, active')
    .eq('department_id', department_id)
    .order('sort_order', { ascending: true, nullsFirst: false })

  // Count how many apparatus use each compartment
  const { data: assignments } = await adminClient
    .from('apparatus_compartments')
    .select('compartment_name_id')
    .eq('active', true)

  const usageMap: Record<string, number> = {}
  for (const a of assignments ?? []) {
    usageMap[a.compartment_name_id] = (usageMap[a.compartment_name_id] ?? 0) + 1
  }

  return (
    <CompartmentsClient
      compartments={compartments ?? []}
      usageMap={usageMap}
      departmentName={department_name}
    />
  )
}
