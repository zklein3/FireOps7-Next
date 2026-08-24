import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import EventsAdminClient from './EventsAdminClient'

export default async function EventsAdminPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (!ctx.departmentId) redirect('/events')
  if (!(await hasPermission(ctx, 'manage_events'))) redirect('/events')
  const me = { id: ctx.personnelId, first_name: ctx.firstName, last_name: ctx.lastName }

  const isAdmin = ctx.systemRole === 'admin'
  const department_id = ctx.departmentId

  const past30 = new Date()
  past30.setDate(past30.getDate() - 30)
  const future365 = new Date()
  future365.setDate(future365.getDate() + 365)
  const future60cutoff = new Date()
  future60cutoff.setDate(future60cutoff.getDate() + 60)
  const future60str = future60cutoff.toISOString().split('T')[0]

  const [
    { data: excuseTypesRaw },
    { data: certTypesRaw },
    { data: instances },
    { data: deptData },
    { data: personnel },
  ] = await Promise.all([
    adminClient
      .from('excuse_types')
      .select('id, excuse_name')
      .eq('department_id', department_id)
      .eq('active', true)
      .order('excuse_name'),
    adminClient
      .from('certification_types')
      .select('id, cert_name')
      .eq('department_id', department_id)
      .eq('active', true)
      .order('cert_name'),
    adminClient
      .from('event_instances')
      .select('id, series_id, event_date, start_time, location, status, notes, requires_verification, requires_signature, title_override, description_override')
      .gte('event_date', past30.toISOString().split('T')[0])
      .lte('event_date', future365.toISOString().split('T')[0])
      .order('event_date', { ascending: true }),
    adminClient
      .from('departments')
      .select('public_site_enabled')
      .eq('id', department_id)
      .single(),
    adminClient
      .from('department_personnel')
      .select('personnel_id, personnel(id, first_name, last_name)')
      .eq('department_id', department_id)
      .eq('active', true),
  ])
  const publicSiteEnabled = deptData?.public_site_enabled ?? false

  const seriesIds = [...new Set((instances ?? []).map(i => i.series_id))]
  const { data: seriesData } = seriesIds.length > 0
    ? await adminClient
        .from('event_series')
        .select('id, title, event_type, department_id, recurrence_type, description, is_public, duration_minutes, is_training, training_hours, training_cert_type_id, training_instructor')
        .in('id', seriesIds)
        .eq('department_id', department_id)
    : { data: [] }

  const deptSeriesIds = new Set((seriesData ?? []).map(s => s.id))
  const seriesMap = Object.fromEntries((seriesData ?? []).map(s => [s.id, s]))
  const deptInstances = (instances ?? []).filter(i => {
    if (!deptSeriesIds.has(i.series_id)) return false
    const isSpecial = seriesMap[i.series_id]?.event_type === 'special'
    if (!isSpecial && i.event_date > future60str) return false
    return true
  })

  const instanceIds = deptInstances.map(i => i.id)

  const [
    { data: myAttendance },
    { data: myPendingSigs },
    { data: allAttendanceRaw },
    { data: allPendingRaw },
    { data: allSignaturesRaw },
    { data: trainingEventsRaw },
  ] = instanceIds.length > 0
    ? await Promise.all([
        adminClient
          .from('event_attendance')
          .select('id, instance_id, status, submitted_at')
          .eq('personnel_id', me.id)
          .in('instance_id', instanceIds),
        adminClient
          .from('event_attendance_signatures')
          .select('id, instance_id')
          .eq('personnel_id', me.id)
          .is('signed_at', null)
          .in('instance_id', instanceIds),
        adminClient
          .from('event_attendance')
          .select('instance_id, personnel_id')
          .in('instance_id', instanceIds),
        adminClient
          .from('event_attendance')
          .select('id, instance_id, personnel_id, submitted_at, status, excuse_type_id, notes')
          .in('instance_id', instanceIds)
          .in('status', ['pending', 'excused_pending']),
        adminClient
          .from('event_attendance_signatures')
          .select('id, instance_id, personnel_id, signed_at')
          .in('instance_id', instanceIds),
        adminClient
          .from('training_events')
          .select('event_instance_id, hours, certification_type_id, instructor, cancelled')
          .in('event_instance_id', instanceIds)
          .eq('cancelled', false),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }]

  const myAttendanceMap = Object.fromEntries((myAttendance ?? []).map(a => [a.instance_id, a]))
  const pendingSigByInstance = Object.fromEntries((myPendingSigs ?? []).map(s => [s.instance_id, s.id]))
  const excuseTypeMap = Object.fromEntries((excuseTypesRaw ?? []).map(e => [e.id, e.excuse_name]))

  let pendingByInstance: Record<string, { id: string; personnel_id: string; name: string; submitted_at: string }[]> = {}
  let excuseByInstance: Record<string, { id: string; personnel_id: string; name: string; submitted_at: string; excuse_type: string; notes: string | null }[]> = {}
  let loggedByInstance: Record<string, string[]> = {}

  for (const a of allAttendanceRaw ?? []) {
    if (!loggedByInstance[a.instance_id]) loggedByInstance[a.instance_id] = []
    loggedByInstance[a.instance_id].push(a.personnel_id)
  }

  if (allPendingRaw && allPendingRaw.length > 0) {
    const personnelIds = [...new Set(allPendingRaw.map(p => p.personnel_id))]
    const { data: pendingPersonnel } = await adminClient
      .from('personnel')
      .select('id, first_name, last_name')
      .in('id', personnelIds)

    const nameMap = Object.fromEntries(
      (pendingPersonnel ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`])
    )

    for (const p of allPendingRaw) {
      const name = nameMap[p.personnel_id] ?? 'Unknown'
      if (p.status === 'pending') {
        if (!pendingByInstance[p.instance_id]) pendingByInstance[p.instance_id] = []
        pendingByInstance[p.instance_id].push({ id: p.id, personnel_id: p.personnel_id, name, submitted_at: p.submitted_at })
      } else {
        if (!excuseByInstance[p.instance_id]) excuseByInstance[p.instance_id] = []
        excuseByInstance[p.instance_id].push({
          id: p.id, personnel_id: p.personnel_id, name, submitted_at: p.submitted_at,
          excuse_type: p.excuse_type_id ? (excuseTypeMap[p.excuse_type_id] ?? '—') : '—',
          notes: p.notes ?? null,
        })
      }
    }
  }

  let signatureByInstance: Record<string, { sig_id: string; personnel_id: string; name: string; signed_at: string | null }[]> = {}

  if (allSignaturesRaw && allSignaturesRaw.length > 0) {
    const sigPersonnelIds = [...new Set(allSignaturesRaw.map(s => s.personnel_id))]
    const { data: sigPersonnel } = await adminClient
      .from('personnel')
      .select('id, first_name, last_name')
      .in('id', sigPersonnelIds)

    const sigNameMap = Object.fromEntries(
      (sigPersonnel ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`])
    )

    for (const s of allSignaturesRaw) {
      if (!signatureByInstance[s.instance_id]) signatureByInstance[s.instance_id] = []
      signatureByInstance[s.instance_id].push({
        sig_id: s.id,
        personnel_id: s.personnel_id,
        name: sigNameMap[s.personnel_id] ?? 'Unknown',
        signed_at: s.signed_at,
      })
    }
  }

  const trainingByInstance = Object.fromEntries(
    (trainingEventsRaw ?? []).map(t => [t.event_instance_id, t])
  )

  const events = deptInstances.map(i => ({
    id: i.id,
    series_id: i.series_id,
    title: i.title_override ?? seriesMap[i.series_id]?.title ?? '—',
    event_type: seriesMap[i.series_id]?.event_type ?? 'training',
    description: i.description_override ?? seriesMap[i.series_id]?.description ?? null,
    recurrence_type: seriesMap[i.series_id]?.recurrence_type ?? 'one_time',
    duration_minutes: seriesMap[i.series_id]?.duration_minutes ?? null,
    is_public: seriesMap[i.series_id]?.is_public ?? false,
    // An active training_events row is the real per-occurrence signal (set on
    // creation and kept in sync by the series-level toggle) — it can diverge
    // from the series default when a single instance was toggled on its own.
    is_training: trainingByInstance[i.id] ? true : (seriesMap[i.series_id]?.is_training ?? false),
    training_hours: trainingByInstance[i.id]?.hours ?? seriesMap[i.series_id]?.training_hours ?? null,
    training_cert_type_id: trainingByInstance[i.id]?.certification_type_id ?? seriesMap[i.series_id]?.training_cert_type_id ?? null,
    training_instructor: trainingByInstance[i.id]?.instructor ?? seriesMap[i.series_id]?.training_instructor ?? null,
    event_date: i.event_date,
    start_time: i.start_time,
    location: i.location,
    status: i.status,
    notes: i.notes,
    requires_verification: i.requires_verification,
    requires_signature: i.requires_signature,
    pending_sig_id: pendingSigByInstance[i.id] ?? null,
    my_attendance: myAttendanceMap[i.id] ?? null,
    pending_count: (pendingByInstance[i.id]?.length ?? 0) + (excuseByInstance[i.id]?.length ?? 0),
    pending_submissions: pendingByInstance[i.id] ?? [],
    excuse_submissions: excuseByInstance[i.id] ?? [],
    logged_personnel_ids: loggedByInstance[i.id] ?? [],
    signature_roster: (signatureByInstance[i.id] ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  }))

  const personnelList = (personnel ?? []).map(p => ({
    id: (p.personnel as any)?.id ?? p.personnel_id,
    name: [(p.personnel as any)?.first_name, (p.personnel as any)?.last_name].filter(Boolean).join(' '),
  })).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <EventsAdminClient
      events={events}
      personnelList={personnelList}
      excuseTypes={(excuseTypesRaw ?? []).map(e => ({ id: e.id, name: e.excuse_name }))}
      certTypes={certTypesRaw ?? []}
      myPersonnelId={me.id}
      myName={`${me.first_name} ${me.last_name}`}
      isAdmin={isAdmin}
      publicSiteEnabled={publicSiteEnabled}
      departmentId={department_id}
      departmentTimezone={ctx.departmentTimezone}
    />
  )
}
