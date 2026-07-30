import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { redirect, notFound } from 'next/navigation'
import IcsIncidentClient from './IcsIncidentClient'

export default async function IcsIncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getCurrentDepartmentContext()
  if (!ctx || !ctx.departmentId) redirect('/login')
  const adminClient = createAdminClient()
  const departmentId = ctx.departmentId

  const { data: incident } = await adminClient
    .from('ics_incidents')
    .select('id, title, status, department_id, linked_accountability_board_id, linked_incident_id')
    .eq('id', id).single()
  if (!incident) notFound()

  const { data: participantsRaw } = await adminClient
    .from('ics_incident_participants')
    .select('id, department_id, status, added_at, closed_at')
    .eq('ics_incident_id', id)

  const isParticipant = (participantsRaw ?? []).some(p => p.department_id === departmentId)
  const { data: jurisdiction } = await adminClient
    .from('department_jurisdictions')
    .select('id').eq('parent_department_id', departmentId).eq('child_department_id', incident.department_id).maybeSingle()
  if (!isParticipant && !jurisdiction) notFound()

  const { data: periods } = await adminClient
    .from('ics_operational_periods')
    .select('id, period_number, start_at, end_at, objectives, safety_message, weather, narrative')
    .eq('ics_incident_id', id).order('period_number', { ascending: false })

  const latestPeriod = periods?.[0] ?? null

  let assignmentsRaw: any[] = []
  let resourcesRaw: any[] = []
  if (latestPeriod) {
    const { data: a } = await adminClient
      .from('ics_assignments').select('id, personnel_id, raw_name, raw_agency, ics_role, lane_label')
      .eq('ics_operational_period_id', latestPeriod.id).order('lane_label')
    assignmentsRaw = a ?? []

    const { data: r } = await adminClient
      .from('ics_resources').select('id, apparatus_id, kind, raw_description, raw_agency, lane_label, status')
      .eq('ics_operational_period_id', latestPeriod.id).order('lane_label')
    resourcesRaw = r ?? []
  }

  // Live 211 / 214 off the linked board, if any
  let checkInsRaw: any[] = []
  let activityLogRaw: any[] = []
  let linkedBoardStatus: string | null = null
  if (incident.linked_accountability_board_id) {
    const { data: boardRow } = await adminClient
      .from('accountability_boards').select('status').eq('id', incident.linked_accountability_board_id).single()
    linkedBoardStatus = boardRow?.status ?? null

    const { data: entries } = await adminClient
      .from('accountability_entries')
      .select('personnel_id, raw_name, raw_dept, ics_role, checked_in_at, released_at')
      .eq('board_id', incident.linked_accountability_board_id)
      .order('checked_in_at', { ascending: false })
    checkInsRaw = entries ?? []

    const { data: log } = await adminClient
      .from('accountability_activity_log')
      .select('entry_time, note, author_personnel_id')
      .eq('board_id', incident.linked_accountability_board_id)
      .order('entry_time', { ascending: false })
    activityLogRaw = log ?? []
  }

  // Flat-fetch + JS-join: department names (incident owner + all participants)
  const departmentIds = [...new Set([incident.department_id, ...(participantsRaw ?? []).map(p => p.department_id)])]
  const { data: departmentsRaw } = departmentIds.length > 0
    ? await adminClient.from('departments').select('id, name').in('id', departmentIds)
    : { data: [] }
  const departmentNameById = Object.fromEntries((departmentsRaw ?? []).map(d => [d.id, d.name]))

  // Flat-fetch + JS-join: personnel names (assignments + check-ins + activity log authors share one lookup)
  const personnelIds = [...new Set([
    ...assignmentsRaw.map(a => a.personnel_id),
    ...checkInsRaw.map(c => c.personnel_id),
    ...activityLogRaw.map(a => a.author_personnel_id),
  ].filter(Boolean))] as string[]
  const { data: personnelRaw } = personnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', personnelIds)
    : { data: [] }
  const personnelNameById = Object.fromEntries((personnelRaw ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  // Flat-fetch + JS-join: apparatus unit numbers
  const apparatusIds = [...new Set(resourcesRaw.map(r => r.apparatus_id).filter(Boolean))] as string[]
  const { data: apparatusRaw } = apparatusIds.length > 0
    ? await adminClient.from('apparatus').select('id, unit_number').in('id', apparatusIds)
    : { data: [] }
  const apparatusUnitById = Object.fromEntries((apparatusRaw ?? []).map(a => [a.id, a.unit_number]))

  const participants = (participantsRaw ?? []).map(p => ({ ...p, department_name: departmentNameById[p.department_id] ?? '—' }))
  const assignments = assignmentsRaw.map(x => ({ ...x, display_name: x.personnel_id ? (personnelNameById[x.personnel_id] ?? '—') : x.raw_name }))
  const resources = resourcesRaw.map(x => ({ ...x, display_desc: x.apparatus_id ? (apparatusUnitById[x.apparatus_id] ?? '—') : (x.raw_description ?? x.kind) }))
  const checkIns = checkInsRaw.map(e => ({ ...e, display_name: e.personnel_id ? (personnelNameById[e.personnel_id] ?? '—') : e.raw_name }))
  const activityLog = activityLogRaw.map(l => ({ ...l, author_name: l.author_personnel_id ? (personnelNameById[l.author_personnel_id] ?? '—') : '—' }))

  const { data: allDepartments } = await adminClient.from('departments').select('id, name').eq('active', true).order('name')

  const isOfficerOrAbove = ctx.systemRole === 'admin' || ctx.systemRole === 'officer'
  const isOwner = incident.department_id === departmentId

  return (
    <IcsIncidentClient
      incident={{ id: incident.id, title: incident.title, status: incident.status, departmentId: incident.department_id, departmentName: departmentNameById[incident.department_id] ?? '—', linkedAccountabilityBoardId: incident.linked_accountability_board_id }}
      currentDepartmentId={departmentId}
      isOwner={isOwner}
      isJurisdictionParent={!!jurisdiction}
      isOfficerOrAbove={isOfficerOrAbove}
      participants={participants}
      periods={periods ?? []}
      latestPeriod={latestPeriod}
      assignments={assignments}
      resources={resources}
      checkIns={checkIns}
      activityLog={activityLog}
      hasLinkedBoard={!!incident.linked_accountability_board_id}
      linkedBoardStatus={linkedBoardStatus}
      allDepartments={(allDepartments ?? []).filter(d => d.id !== departmentId)}
    />
  )
}
