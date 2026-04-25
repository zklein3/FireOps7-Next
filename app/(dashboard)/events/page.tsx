import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import EventsClient from './EventsClient'

export default async function EventsPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient.from('personnel').select('id, first_name, last_name, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) redirect('/login')

  const { data: myDeptList } = await adminClient
    .from('department_personnel')
    .select('department_id, system_role')
    .eq('personnel_id', me.id)
    .eq('active', true)
  const myDept = myDeptList?.[0]
  if (!myDept) redirect('/dashboard')

  const isOfficerOrAbove = myDept.system_role === 'admin' || myDept.system_role === 'officer'
  const isAdmin = myDept.system_role === 'admin'
  const department_id = myDept.department_id

  // Excuse types for this dept
  const { data: excuseTypesRaw } = await adminClient
    .from('excuse_types')
    .select('id, excuse_name')
    .eq('department_id', department_id)
    .eq('active', true)
    .order('excuse_name')

  // Fetch instances: next 60 days + last 30 days
  const past30 = new Date()
  past30.setDate(past30.getDate() - 30)
  const future60 = new Date()
  future60.setDate(future60.getDate() + 60)

  const { data: instances } = await adminClient
    .from('event_instances')
    .select('id, series_id, event_date, start_time, location, status, notes, requires_verification')
    .gte('event_date', past30.toISOString().split('T')[0])
    .lte('event_date', future60.toISOString().split('T')[0])
    .order('event_date', { ascending: true })

  // Fetch series info
  const seriesIds = [...new Set((instances ?? []).map(i => i.series_id))]
  const { data: seriesData } = seriesIds.length > 0
    ? await adminClient
        .from('event_series')
        .select('id, title, event_type, department_id, recurrence_type, description')
        .in('id', seriesIds)
        .eq('department_id', department_id)
    : { data: [] }

  // Filter to this department only
  const deptSeriesIds = new Set((seriesData ?? []).map(s => s.id))
  const deptInstances = (instances ?? []).filter(i => deptSeriesIds.has(i.series_id))
  const seriesMap = Object.fromEntries((seriesData ?? []).map(s => [s.id, s]))

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

  // For officers — fetch pending attendance + pending excuse requests
  let pendingByInstance: Record<string, { id: string; personnel_id: string; name: string; submitted_at: string }[]> = {}
  let excuseByInstance: Record<string, { id: string; personnel_id: string; name: string; submitted_at: string; excuse_type: string; notes: string | null }[]> = {}

  const excuseTypeMap = Object.fromEntries((excuseTypesRaw ?? []).map(e => [e.id, e.excuse_name]))

  if (isOfficerOrAbove && instanceIds.length > 0) {
    const { data: allPendingRaw } = await adminClient
      .from('event_attendance')
      .select('id, instance_id, personnel_id, submitted_at, status, excuse_type_id, notes')
      .in('instance_id', instanceIds)
      .in('status', ['pending', 'excused_pending'])

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
            id: p.id,
            personnel_id: p.personnel_id,
            name,
            submitted_at: p.submitted_at,
            excuse_type: p.excuse_type_id ? (excuseTypeMap[p.excuse_type_id] ?? '—') : '—',
            notes: p.notes ?? null,
          })
        }
      }
    }
  }

  const events = deptInstances.map(i => ({
    id: i.id,
    series_id: i.series_id,
    title: seriesMap[i.series_id]?.title ?? '—',
    event_type: seriesMap[i.series_id]?.event_type ?? 'training',
    description: seriesMap[i.series_id]?.description ?? null,
    recurrence_type: seriesMap[i.series_id]?.recurrence_type ?? 'one_time',
    event_date: i.event_date,
    start_time: i.start_time,
    location: i.location,
    status: i.status,
    notes: i.notes,
    requires_verification: i.requires_verification,
    my_attendance: myAttendanceMap[i.id] ?? null,
    pending_count: (pendingByInstance[i.id]?.length ?? 0) + (excuseByInstance[i.id]?.length ?? 0),
    pending_submissions: pendingByInstance[i.id] ?? [],
    excuse_submissions: excuseByInstance[i.id] ?? [],
  }))

  // All personnel for bulk logging (officers only)
  const { data: personnel } = isOfficerOrAbove
    ? await adminClient
        .from('department_personnel')
        .select('personnel_id, personnel(id, first_name, last_name)')
        .eq('department_id', department_id)
        .eq('active', true)
    : { data: [] }

  const personnelList = (personnel ?? []).map(p => ({
    id: (p.personnel as any)?.id ?? p.personnel_id,
    name: [(p.personnel as any)?.first_name, (p.personnel as any)?.last_name].filter(Boolean).join(' '),
  })).sort((a, b) => a.name.localeCompare(b.name))

  const excuseTypes = (excuseTypesRaw ?? []).map(e => ({ id: e.id, name: e.excuse_name }))

  return (
    <EventsClient
      events={events}
      personnelList={personnelList}
      excuseTypes={excuseTypes}
      myPersonnelId={me.id}
      myName={`${me.first_name} ${me.last_name}`}
      isOfficerOrAbove={isOfficerOrAbove}
      isAdmin={isAdmin}
    />
  )
}
