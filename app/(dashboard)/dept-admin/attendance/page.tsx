import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import AttendanceSettingsClient from './AttendanceSettingsClient'

export default async function AttendanceSettingsPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (!ctx.departmentId) redirect('/dashboard')
  if (!(await hasPermission(ctx, 'manage_attendance_settings'))) redirect('/dashboard')

  const department_id = ctx.departmentId

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
