import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import EventsClient from './EventsClient'

export default async function EventsPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')
  const me = { id: ctx.personnelId, first_name: ctx.firstName, last_name: ctx.lastName }

  const isOfficerOrAbove = await hasPermission(ctx, 'manage_events')
  const department_id = ctx.departmentId

  // Excuse types for the excuse request form
  const { data: excuseTypesRaw } = await adminClient
    .from('excuse_types')
    .select('id, excuse_name')
    .eq('department_id', department_id)
    .eq('active', true)
    .order('excuse_name')

  // Series info — fetch dept series first, then scope instances to those series only
  const { data: seriesData } = await adminClient
    .from('event_series')
    .select('id, title, event_type, department_id, recurrence_type, description, duration_minutes, is_training, training_hours')
    .eq('department_id', department_id)

  const seriesIds = (seriesData ?? []).map(s => s.id)
  const seriesMap = Object.fromEntries((seriesData ?? []).map(s => [s.id, s]))

  // Event instances: scoped to this dept's series, past 30 days + future 365
  const past30 = new Date()
  past30.setDate(past30.getDate() - 30)
  const future365 = new Date()
  future365.setDate(future365.getDate() + 365)
  const future60str = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: instances } = seriesIds.length > 0
    ? await adminClient
        .from('event_instances')
        .select('id, series_id, event_date, start_time, location, status, notes, requires_verification, requires_signature, title_override, description_override')
        .in('series_id', seriesIds)
        .gte('event_date', past30.toISOString().split('T')[0])
        .lte('event_date', future365.toISOString().split('T')[0])
        .order('event_date', { ascending: true })
    : { data: [] }

  // Trim auto-generated recurring events to a 60-day future window. Special events and
  // custom-dates occurrences are entered by hand, so members see the whole schedule.
  const deptInstances = (instances ?? []).filter(i => {
    const series = seriesMap[i.series_id]
    const alwaysShow = series?.event_type === 'special' || series?.recurrence_type === 'custom_dates'
    if (!alwaysShow && i.event_date > future60str) return false
    return true
  })

  const instanceIds = deptInstances.map(i => i.id)

  // My attendance
  const { data: myAttendance } = instanceIds.length > 0
    ? await adminClient
        .from('event_attendance')
        .select('id, instance_id, status, submitted_at')
        .eq('personnel_id', me.id)
        .in('instance_id', instanceIds)
    : { data: [] }

  const myAttendanceMap = Object.fromEntries((myAttendance ?? []).map(a => [a.instance_id, a]))

  // My pending signatures
  const { data: myPendingSigs } = instanceIds.length > 0
    ? await adminClient
        .from('event_attendance_signatures')
        .select('id, instance_id')
        .eq('personnel_id', me.id)
        .is('signed_at', null)
        .in('instance_id', instanceIds)
    : { data: [] }

  const pendingSigByInstance = Object.fromEntries((myPendingSigs ?? []).map(s => [s.instance_id, s.id]))

  const events = deptInstances.map(i => ({
    id: i.id,
    series_id: i.series_id,
    title: i.title_override ?? seriesMap[i.series_id]?.title ?? '—',
    event_type: seriesMap[i.series_id]?.event_type ?? 'meeting',
    description: i.description_override ?? seriesMap[i.series_id]?.description ?? null,
    duration_minutes: seriesMap[i.series_id]?.duration_minutes ?? null,
    is_training: seriesMap[i.series_id]?.is_training ?? false,
    training_hours: seriesMap[i.series_id]?.training_hours ?? null,
    event_date: i.event_date,
    start_time: i.start_time,
    location: i.location,
    status: i.status,
    notes: i.notes,
    requires_verification: i.requires_verification,
    pending_sig_id: pendingSigByInstance[i.id] ?? null,
    my_attendance: myAttendanceMap[i.id] ?? null,
  }))

  return (
    <EventsClient
      events={events}
      excuseTypes={(excuseTypesRaw ?? []).map(e => ({ id: e.id, name: e.excuse_name }))}
      myPersonnelId={me.id}
      myName={`${me.first_name} ${me.last_name}`}
      isOfficerOrAbove={isOfficerOrAbove}
    />
  )
}
