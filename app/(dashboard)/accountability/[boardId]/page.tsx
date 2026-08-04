import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect, notFound } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import AccountabilityBoard from '../AccountabilityBoard'
import BoardHeader from './BoardHeader'

export default async function AccountabilityBoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>
}) {
  const { boardId } = await params

  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')
  const me = { id: ctx.personnelId, first_name: ctx.firstName, last_name: ctx.lastName }

  const department_id = ctx.departmentId
  const isOfficerOrAbove = ctx.systemRole === 'admin' || ctx.systemRole === 'officer'
  const isAdmin = ctx.systemRole === 'admin' || ctx.isSysAdmin

  const { data: deptFlags } = await adminClient.from('departments').select('module_ics').eq('id', department_id).single()
  const moduleIcs = deptFlags?.module_ics ?? false

  const { data: existingIcsIncident } = moduleIcs
    ? await adminClient.from('ics_incidents').select('id').eq('linked_accountability_board_id', boardId).maybeSingle()
    : { data: null }

  const { data: board } = await adminClient
    .from('accountability_boards')
    .select('id, title, board_date, status, archived_at, linked_incident_id, linked_training_event_id, linked_event_instance_id, objectives, safety_message, weather, is_active_violence, nims_mode')
    .eq('id', boardId)
    .eq('department_id', department_id)
    .single()
  if (!board) notFound()

  // Linked incident label
  let linkedIncidentLabel: string | null = null
  let linkedIncidentId: string | null = board.linked_incident_id ?? null
  if (board.linked_incident_id) {
    const { data: incList } = await adminClient
      .from('incidents').select('incident_number').eq('id', board.linked_incident_id)
    linkedIncidentLabel = incList?.[0]?.incident_number ?? null
  }

  // Lanes + entries
  const { data: lanes } = await adminClient
    .from('accountability_lanes')
    .select('id, name, sort_order, leader_entry_id, work_assignment, profile')
    .eq('board_id', boardId)
    .order('sort_order')

  const { data: entriesRaw } = await adminClient
    .from('accountability_entries')
    .select('id, lane_id, personnel_id, raw_name, raw_dept, status, checked_in_at, ics_role, released_at, tag_ref, resource_id, guest_access_tier')
    .eq('board_id', boardId)
    .order('checked_in_at')

  const { data: resourcesRaw } = await adminClient
    .from('accountability_resources')
    .select('id, lane_id, apparatus_id, raw_description, raw_agency, kind, type_tier, status, checked_in_at, released_at')
    .eq('board_id', boardId)
    .order('checked_in_at')

  const resourceApparatusIds = [...new Set((resourcesRaw ?? []).map(r => r.apparatus_id).filter(Boolean))] as string[]
  const { data: resourceApparatusRaw } = resourceApparatusIds.length > 0
    ? await adminClient.from('apparatus').select('id, unit_number').in('id', resourceApparatusIds)
    : { data: [] }
  const resourceApparatusUnitById = Object.fromEntries((resourceApparatusRaw ?? []).map(a => [a.id, a.unit_number]))
  const resources = (resourcesRaw ?? []).map(r => ({
    ...r,
    display_desc: r.apparatus_id ? (resourceApparatusUnitById[r.apparatus_id] ?? '—') : (r.raw_description ?? r.kind ?? '—'),
  }))

  const { data: fleetApparatus } = await adminClient
    .from('apparatus').select('id, unit_number').eq('department_id', department_id).eq('active', true).order('unit_number')

  // Activity log
  const { data: activityLogRaw } = await adminClient
    .from('accountability_activity_log')
    .select('id, entry_time, note, author_personnel_id, lane_id')
    .eq('board_id', boardId)
    .order('entry_time', { ascending: false })

  // Resolve personnel names (entries + activity log authors share one lookup)
  const personnelIds = [...new Set([
    ...(entriesRaw ?? []).map(e => e.personnel_id),
    ...(activityLogRaw ?? []).map(a => a.author_personnel_id),
  ].filter(Boolean))] as string[]
  const { data: personnelRaw } = personnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', personnelIds)
    : { data: [] }
  const nameMap = Object.fromEntries((personnelRaw ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  const laneNameMap = Object.fromEntries((lanes ?? []).map(l => [l.id, l.name]))
  const activityLog = (activityLogRaw ?? []).map(a => ({
    ...a,
    author_name: a.author_personnel_id ? (nameMap[a.author_personnel_id] ?? '—') : '—',
    lane_name: a.lane_id ? (laneNameMap[a.lane_id] ?? null) : null,
  }))

  // Dept personnel list — includes role title so checked-in members show dept + position
  const { data: deptPersonnelRaw } = await adminClient
    .from('department_personnel')
    .select('personnel_id, role_id, personnel(id, first_name, last_name)')
    .eq('department_id', department_id)
    .eq('active', true)

  const roleIds = [...new Set((deptPersonnelRaw ?? []).map(p => p.role_id).filter(Boolean))] as string[]
  const { data: rolesRaw } = roleIds.length > 0
    ? await adminClient.from('personnel_roles').select('id, name').in('id', roleIds)
    : { data: [] }
  const roleTitleMap = Object.fromEntries((rolesRaw ?? []).map(r => [r.id, r.name]))
  const titleMap = Object.fromEntries(
    (deptPersonnelRaw ?? []).map(p => [p.personnel_id, p.role_id ? roleTitleMap[p.role_id] ?? null : null])
  )

  const departmentName = ctx.departmentName
  function deptAndTitle(personnelId: string) {
    const title = titleMap[personnelId]
    return [departmentName, title].filter(Boolean).join(' · ')
  }

  const entries = (entriesRaw ?? []).map(e => ({
    ...e,
    display_name: e.personnel_id ? (nameMap[e.personnel_id] ?? '—') : (e.raw_name ?? '—'),
    display_dept: e.personnel_id ? deptAndTitle(e.personnel_id) : (e.raw_dept ?? ''),
  }))

  const deptPersonnel = (deptPersonnelRaw ?? [])
    .map(p => ({
      id: (p.personnel as any)?.id ?? p.personnel_id,
      name: [(p.personnel as any)?.first_name, (p.personnel as any)?.last_name].filter(Boolean).join(' '),
      title: p.role_id ? roleTitleMap[p.role_id] ?? null : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // QR tokens
  const { data: qrTokensRaw } = await adminClient
    .from('personnel_qr_tokens')
    .select('personnel_id, token_type, token_value')
    .in('personnel_id', deptPersonnel.map(p => p.id))
  const qrTokens = (qrTokensRaw ?? []).map(t => ({
    ...t,
    display_name: deptPersonnel.find(p => p.id === t.personnel_id)?.name ?? '—',
  }))

  // Recent incidents for link picker
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const { data: recentIncidents } = isOfficerOrAbove
    ? await adminClient
        .from('incidents')
        .select('id, incident_number, address')
        .eq('department_id', department_id)
        .gte('incident_date', since.toISOString().split('T')[0])
        .order('incident_date', { ascending: false })
        .limit(30)
    : { data: [] }

  const incidentOptions = (recentIncidents ?? []).map(i => ({
    id: i.id,
    label: `${i.incident_number}${i.address ? ' · ' + i.address : ''}`,
  }))

  return (
    <div className="max-w-2xl">
      <BoardHeader
        boardId={boardId}
        title={board.title}
        boardDate={board.board_date}
        status={board.status}
        archivedAt={board.archived_at}
        linkedIncidentId={linkedIncidentId}
        linkedIncidentLabel={linkedIncidentLabel}
        isOfficerOrAbove={isOfficerOrAbove}
        isAdmin={isAdmin}
        incidentOptions={incidentOptions}
        moduleIcs={moduleIcs}
        existingIcsIncidentId={existingIcsIncident?.id ?? null}
        initialIsActiveViolence={board.is_active_violence}
        initialNimsMode={board.nims_mode}
      />

      <AccountabilityBoard
        boardId={boardId}
        initialLanes={lanes ?? []}
        initialEntries={entries}
        qrTokens={qrTokens}
        deptPersonnel={deptPersonnel}
        departmentName={departmentName}
        isOfficerOrAbove={isOfficerOrAbove}
        initialObjectives={board.objectives}
        initialSafetyMessage={board.safety_message}
        initialWeather={board.weather}
        initialIsActiveViolence={board.is_active_violence}
        initialNimsMode={board.nims_mode}
        initialActivityLog={activityLog}
        initialResources={resources}
        fleetApparatus={fleetApparatus ?? []}
        currentUserName={[me.first_name, me.last_name].filter(Boolean).join(' ') || '—'}
      />
    </div>
  )
}
