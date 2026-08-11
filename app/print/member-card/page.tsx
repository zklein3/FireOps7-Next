import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import MemberCardClient from './MemberCardClient'

export default async function MemberCardPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id } = await searchParams

  if (!id) {
    return <p style={{ padding: '2rem', fontFamily: 'sans-serif' }}>Missing member id.</p>
  }

  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  const me = { id: ctx.personnelId, is_sys_admin: ctx.isSysAdmin }

  const isMe = me.id === id

  if (!isMe && !(await hasPermission(ctx, 'view_personnel_details'))) redirect('/personnel')

  const { data: person } = await adminClient
    .from('personnel')
    .select('id, first_name, last_name')
    .eq('id', id)
    .single()
  if (!person) return <p style={{ padding: '2rem', fontFamily: 'sans-serif' }}>Member not found.</p>

  const { data: deptRecordList } = await adminClient
    .from('department_personnel')
    .select('department_id, role_id, employee_number')
    .eq('personnel_id', id)
    .eq('active', true)
    .limit(1)
  const deptRecord = deptRecordList?.[0]

  const [deptResult, roleResult] = await Promise.all([
    deptRecord?.department_id
      ? adminClient.from('departments').select('name').eq('id', deptRecord.department_id).single()
      : Promise.resolve({ data: null }),
    deptRecord?.role_id
      ? adminClient.from('personnel_roles').select('name').eq('id', deptRecord.role_id).single()
      : Promise.resolve({ data: null }),
  ])

  const deptName = deptResult.data?.name ?? 'Fire Department'
  const roleName = roleResult.data?.name ?? 'Member'
  const fullName = `${person.first_name} ${person.last_name}`.trim()

  return (
    <MemberCardClient
      personnelId={person.id}
      name={fullName}
      deptName={deptName}
      role={roleName}
      employeeNumber={deptRecord?.employee_number ?? null}
    />
  )
}
