import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import AttendanceReportClient from './AttendanceReportClient'

export type MemberSummaryRow = {
  personnel_id: string
  member_name: string
  total_events: number
  present: number
  excused: number
  absent: number
  pending: number
  not_logged: number
  rate: number
}

export type AttendanceDetailRow = {
  attendance_id: string | null
  personnel_id: string
  member_name: string
  instance_id: string
  event_date: string
  event_title: string
  event_type: string
  status: string
}

export type RequirementRow = {
  event_type: string
  minimum_percentage: number
  period: string
}

export type EventTypeOption = { value: string; label: string }

const EVENT_TYPE_LABELS: Record<string, string> = {
  training: 'Training',
  drill: 'Drill',
  meeting: 'Meeting',
  ceremony: 'Ceremony',
  community: 'Community',
  other: 'Other',
}

export default async function AttendanceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; personnelId?: string; eventType?: string }>
}) {
  const { from, to, personnelId, eventType } = await searchParams

  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient
    .from('personnel')
    .select('id, is_sys_admin')
    .eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) redirect('/login')

  const { data: myDeptList } = await adminClient
    .from('department_personnel')
    .select('department_id, system_role')
    .eq('personnel_id', me.id)
    .eq('active', true)
  const myDept = myDeptList?.[0]
  if (!myDept) redirect('/dashboard')

  const { system_role, department_id } = myDept
  if (system_role === 'member' && !me.is_sys_admin) redirect('/dashboard')

  const defaultTo = new Date()
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 90)

  const dateFrom = from ?? defaultFrom.toISOString().split('T')[0]
  const dateTo = to ?? defaultTo.toISOString().split('T')[0]

  // All active dept personnel
  const { data: deptPersonnelList } = await adminClient
    .from('department_personnel')
    .select('personnel_id')
    .eq('department_id', department_id)
    .eq('active', true)

  const allPersonnelIds = (deptPersonnelList ?? []).map(p => p.personnel_id)

  const { data: personnelData } = allPersonnelIds.length > 0
    ? await adminClient
        .from('personnel')
        .select('id, first_name, last_name')
        .in('id', allPersonnelIds)
        .order('last_name')
    : { data: [] as { id: string; first_name: string; last_name: string }[] }

  const personnelNameMap = Object.fromEntries(
    (personnelData ?? []).map(p => [p.id, `${p.last_name}, ${p.first_name}`])
  )

  // Dept event series — optionally filtered by type
  let seriesQuery = adminClient
    .from('event_series')
    .select('id, title, event_type')
    .eq('department_id', department_id)

  if (eventType) seriesQuery = seriesQuery.eq('event_type', eventType)

  const { data: seriesData } = await seriesQuery
  const seriesIds = (seriesData ?? []).map(s => s.id)
  const seriesMap = Object.fromEntries((seriesData ?? []).map(s => [s.id, s]))

  // Event instances in date range
  const { data: instancesRaw } = seriesIds.length > 0
    ? await adminClient
        .from('event_instances')
        .select('id, series_id, event_date')
        .in('series_id', seriesIds)
        .gte('event_date', dateFrom)
        .lte('event_date', dateTo)
        .order('event_date', { ascending: false })
    : { data: [] as { id: string; series_id: string; event_date: string }[] }

  const instanceIds = (instancesRaw ?? []).map(i => i.id)
  const instanceMap = Object.fromEntries((instancesRaw ?? []).map(i => [i.id, i]))

  // All attendance records for those instances, scoped to dept personnel
  const scopePersonnelIds = personnelId
    ? (allPersonnelIds.includes(personnelId) ? [personnelId] : [''])
    : allPersonnelIds.length > 0 ? allPersonnelIds : ['']

  const { data: attendanceRaw } = instanceIds.length > 0 && scopePersonnelIds.length > 0
    ? await adminClient
        .from('event_attendance')
        .select('id, instance_id, personnel_id, status')
        .in('instance_id', instanceIds)
        .in('personnel_id', scopePersonnelIds)
    : { data: [] as { id: string; instance_id: string; personnel_id: string; status: string }[] }

  // Participation requirements
  const { data: requirementsRaw } = await adminClient
    .from('participation_requirements')
    .select('event_type, minimum_percentage, period')
    .eq('department_id', department_id)
    .eq('active', true)

  const requirements: RequirementRow[] = (requirementsRaw ?? []).map(r => ({
    event_type: r.event_type,
    minimum_percentage: r.minimum_percentage,
    period: r.period,
  }))

  const totalEvents = instanceIds.length

  // Build per-member attendance map
  const attendanceByMember: Record<string, { instance_id: string; status: string }[]> = {}
  for (const a of attendanceRaw ?? []) {
    if (!attendanceByMember[a.personnel_id]) attendanceByMember[a.personnel_id] = []
    attendanceByMember[a.personnel_id]!.push({ instance_id: a.instance_id, status: a.status })
  }

  // Member summary rows
  const targetPersonnelIds = personnelId
    ? (allPersonnelIds.includes(personnelId) ? [personnelId] : [])
    : allPersonnelIds

  const memberSummaries: MemberSummaryRow[] = targetPersonnelIds.map(pid => {
    const records = attendanceByMember[pid] ?? []
    const present = records.filter(r => r.status === 'present').length
    const excused = records.filter(r => r.status === 'excused').length
    const absent = records.filter(r => r.status === 'absent').length
    const pending = records.filter(r => r.status === 'pending').length
    const not_logged = totalEvents - records.length
    const rate = totalEvents > 0
      ? Math.round(((present + excused) / totalEvents) * 100)
      : 0
    return {
      personnel_id: pid,
      member_name: personnelNameMap[pid] ?? '—',
      total_events: totalEvents,
      present,
      excused,
      absent,
      pending,
      not_logged,
      rate,
    }
  }).sort((a, b) => a.member_name.localeCompare(b.member_name))

  // Detail rows
  const detailRows: AttendanceDetailRow[] = (attendanceRaw ?? []).map(a => {
    const inst = instanceMap[a.instance_id]
    const series = inst ? seriesMap[inst.series_id] : null
    return {
      attendance_id: a.id,
      personnel_id: a.personnel_id,
      member_name: personnelNameMap[a.personnel_id] ?? '—',
      instance_id: a.instance_id,
      event_date: inst?.event_date ?? '',
      event_title: series?.title ?? '—',
      event_type: series?.event_type ?? '—',
      status: a.status,
    }
  }).sort((a, b) => b.event_date.localeCompare(a.event_date))

  const personnelDropdown = (personnelData ?? []).map(p => ({
    id: p.id,
    name: `${p.last_name}, ${p.first_name}`,
  }))

  // Event types present in dept series for dropdown
  const usedEventTypes = [...new Set((seriesData ?? []).map(s => s.event_type))]
    .filter(Boolean)
    .sort()

  return (
    <AttendanceReportClient
      memberSummaries={memberSummaries}
      detailRows={detailRows}
      requirements={requirements}
      personnelList={personnelDropdown}
      eventTypes={usedEventTypes.map(t => ({ value: t, label: EVENT_TYPE_LABELS[t] ?? t }))}
      dateFrom={dateFrom}
      dateTo={dateTo}
      selectedPersonnelId={personnelId ?? null}
      selectedEventType={eventType ?? null}
      totalEventsInRange={totalEvents}
    />
  )
}
