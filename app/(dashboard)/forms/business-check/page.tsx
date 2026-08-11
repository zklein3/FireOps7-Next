import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import BackButton from '@/components/BackButton'
import BusinessCheckClient from './BusinessCheckClient'

export default async function BusinessCheckPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.selectionPending) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  const isOfficerOrAbove = await hasPermission(ctx, 'manage_pd_logs')
  const department_id = ctx.departmentId

  const [{ data: checksRaw }, { data: businessesRaw }] = await Promise.all([
    adminClient
      .from('pd_business_checks')
      .select('id, round_id, check_date, time_arrived, time_cleared, business_id, business_name, address, check_type, doors_secure, windows_secure, lights_as_expected, suspicious_activity, interior_check, interior_authorized_by, interior_findings, alarm_status, owner_notified, owner_name, owner_notified_time, disposition, notes, secured_on_departure, officer_name')
      .eq('department_id', department_id)
      .order('check_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100),
    adminClient
      .from('pd_businesses')
      .select('id, name, address, active')
      .eq('department_id', department_id)
      .order('name'),
  ])

  return (
    <div className="max-w-2xl">
      <div className="mb-2">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Business Check Log</h1>
        <p className="text-sm text-zinc-500 mt-0.5">After hours business welfare and security checks</p>
      </div>
      <div className="mb-5">
        <BackButton />
      </div>
      <BusinessCheckClient
        entries={checksRaw ?? []}
        businesses={businessesRaw ?? []}
        isOfficerOrAbove={isOfficerOrAbove}
      />
    </div>
  )
}
