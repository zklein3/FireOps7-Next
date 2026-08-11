import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { listBiometricCredentials } from '@/app/actions/biometric'
import PersonnelProfileClient from './PersonnelProfileClient'

export default async function PersonnelProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  const systemRole = ctx.systemRole
  const isAdmin = systemRole === 'admin' || ctx.isSysAdmin
  const isOfficerOrAbove = isAdmin || systemRole === 'officer'
  const isMe = ctx.personnelId === id

  if (!isMe && !(await hasPermission(ctx, 'view_personnel_details'))) redirect('/personnel')

  const { data: personList } = await adminClient
    .from('personnel')
    .select('id, first_name, last_name, display_name, email, phone, address, city, state, zip, signup_status, is_sys_admin')
    .eq('id', id)

  const person = personList?.[0]
  if (!person) redirect('/personnel')

  const { data: deptRecordList } = await adminClient
    .from('department_personnel')
    .select('id, system_role, role_id, employee_number, hire_date, active, signup_status, notify_feedback, burn_permit_reviewer')
    .eq('personnel_id', id)
    .eq('department_id', ctx.departmentId)

  const deptRecord = deptRecordList?.[0]
  if (!deptRecord) redirect('/personnel')

  const { data: roles } = await adminClient
    .from('personnel_roles')
    .select('id, name, is_officer, sort_order')
    .eq('active', true)
    .order('sort_order')

  const { data: linkedTokens } = await adminClient
    .from('personnel_qr_tokens')
    .select('id, token_type, label, linked_at')
    .eq('personnel_id', id)
    .order('linked_at')

  const biometricCredentials = isMe ? await listBiometricCredentials() : []

  return (
    <PersonnelProfileClient
      person={person}
      deptRecord={deptRecord}
      roles={roles ?? []}
      linkedTokens={linkedTokens ?? []}
      biometricCredentials={biometricCredentials}
      isMe={isMe}
      isAdmin={isAdmin}
      isOfficerOrAbove={isOfficerOrAbove}
      departmentTimezone={ctx.departmentTimezone}
    />
  )
}
