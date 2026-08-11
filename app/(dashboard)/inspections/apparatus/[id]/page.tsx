import { redirect } from 'next/navigation'
import { getCurrentPath } from '@/lib/current-path'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { getOrCreateInspectionSession } from '@/app/actions/inspections'
import { formatLocalDateTime } from '@/lib/format-datetime'
import InspectionSessionClient from './InspectionSessionClient'

export default async function InspectionSessionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: apparatus_id } = await params
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')
  const me = { id: ctx.personnelId }

  const isOfficerOrAdmin = await hasPermission(ctx, 'manage_inspection_sessions')

  const { data: appList } = await adminClient
    .from('apparatus')
    .select('id, unit_number, apparatus_name')
    .eq('id', apparatus_id)
    .eq('department_id', ctx.departmentId)
  const apparatus = appList?.[0]
  if (!apparatus) redirect('/inspections')

  const { data: personnelList } = await adminClient
    .from('department_personnel')
    .select('personnel_id')
    .eq('personnel_id', me.id)
    .eq('department_id', ctx.departmentId)
    .limit(1)
  const personnelId = personnelList?.[0]?.personnel_id ?? me.id

  const result = await getOrCreateInspectionSession(apparatus_id)
  if ('error' in result) redirect('/inspections')

  return (
    <div className="pt-20 px-4 pb-4 sm:pt-0 sm:p-6 lg:p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-zinc-900">
          Inspection Session — {apparatus.unit_number || apparatus.apparatus_name}
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Started {formatLocalDateTime(result.session.started_at, ctx.departmentTimezone, { dateStyle: 'medium', timeStyle: 'short' })}
          {' · '}Expires {formatLocalDateTime(result.session.expires_at, ctx.departmentTimezone, { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      </div>

      <InspectionSessionClient
        session={result.session}
        compartments={result.compartments}
        apparatus_id={apparatus_id}
        apparatus_unit_number={apparatus.unit_number}
        personnel_id={personnelId}
        isOfficerOrAdmin={isOfficerOrAdmin}
        departmentTimezone={ctx.departmentTimezone}
      />
    </div>
  )
}
