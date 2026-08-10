import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import NerisReportClient from './NerisReportClient'
import { evaluateNerisRequirements } from '@/lib/neris-requirements'

export default async function NerisReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (!ctx.departmentId && !ctx.isSysAdmin) redirect('/dashboard')
  if (ctx.departmentId && ctx.departmentType !== 'fire') redirect('/dashboard')
  const me = { id: ctx.personnelId, is_sys_admin: ctx.isSysAdmin }

  const isOfficerOrAbove = await hasPermission(ctx, 'manage_incidents')
  if (!isOfficerOrAbove) redirect(`/incidents/${id}`)
  const isNerisAdmin = await hasPermission(ctx, 'submit_neris')

  // Fetch incident (cover sheet) — sys admin can access any incident
  const { data: incident } = await adminClient
    .from('incidents')
    .select('*')
    .eq('id', id)
    .single()
  if (!incident) redirect('/incidents')
  if (ctx.departmentId && ctx.departmentId !== incident.department_id) redirect('/incidents')

  // Fetch fire details if fire type
  const { data: fireDetailsList } = incident.incident_type === 'fire'
    ? await adminClient.from('incident_fire_details').select('*').eq('incident_id', id)
    : { data: [] }
  const fireDetails = fireDetailsList?.[0] ?? null

  // Fetch apparatus on this incident. Fall back to cover-sheet columns if the
  // NERIS-specific columns have not been applied in Supabase yet.
  let { data: apparatusRaw, error: apparatusError } = await adminClient
    .from('incident_apparatus')
    .select('id, apparatus_id, role, response_mode, staffing_count, notes, paged_at, enroute_at, on_scene_at, leaving_scene_at, available_at')
    .eq('incident_id', id)
    .order('created_at')

  if (apparatusError) {
    const fallback = await adminClient
      .from('incident_apparatus')
      .select('id, apparatus_id, role, paged_at, enroute_at, on_scene_at, leaving_scene_at, available_at')
      .eq('incident_id', id)
      .order('created_at')

    apparatusRaw = (fallback.data ?? []).map(a => ({
      ...a,
      response_mode: null,
      staffing_count: null,
      notes: null,
    }))
  }

  const apparatusIds = (apparatusRaw ?? []).map(a => a.apparatus_id).filter(Boolean)
  const { data: apparatusNames } = apparatusIds.length > 0
    ? await adminClient.from('apparatus').select('id, unit_number, apparatus_name').in('id', apparatusIds)
    : { data: [] }
  const apparatusNameMap = Object.fromEntries((apparatusNames ?? []).map(a => [a.id, a]))

  // Fetch personnel on this incident
  const { data: personnelRaw } = await adminClient
    .from('incident_personnel')
    .select('id, personnel_id, apparatus_id, role, status')
    .eq('incident_id', id)

  const personnelByApparatus = new Map<string, number>()
  for (const row of personnelRaw ?? []) {
    if (!row.apparatus_id || row.status === 'absent') continue
    personnelByApparatus.set(row.apparatus_id, (personnelByApparatus.get(row.apparatus_id) ?? 0) + 1)
  }

  const incidentApparatus = (apparatusRaw ?? []).map(a => ({
    ...a,
    staffing_count: a.staffing_count ?? personnelByApparatus.get(a.apparatus_id) ?? null,
    unit_number: apparatusNameMap[a.apparatus_id]?.unit_number ?? '?',
    apparatus_name: apparatusNameMap[a.apparatus_id]?.apparatus_name ?? null,
  }))

  const personnelIds = (personnelRaw ?? []).map(p => p.personnel_id).filter(Boolean)
  const { data: personnelNames } = personnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', personnelIds)
    : { data: [] }
  const personnelNameMap = Object.fromEntries(
    (personnelNames ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`])
  )
  const incidentPersonnel = (personnelRaw ?? []).map(p => ({
    ...p,
    name: personnelNameMap[p.personnel_id] ?? 'Unknown',
    unit_number: p.apparatus_id ? apparatusNameMap[p.apparatus_id]?.unit_number ?? null : null,
  }))

  // Fetch mutual aid rows — used to trigger mutual aid section in NERIS form
  const { data: mutualAidRows } = await adminClient
    .from('incident_mutual_aid')
    .select('id, external_department_name, role, apparatus_description, personnel_count')
    .eq('incident_id', id)
    .order('created_at')

  // Fetch existing NERIS record — do NOT auto-create, lazy creation happens on first save
  const { data: nerisRecord } = await adminClient
    .from('incident_neris')
    .select('*')
    .eq('incident_id', id)
    .maybeSingle()

  const { data: deptList } = await adminClient
    .from('departments')
    .select('neris_entity_id')
    .eq('id', incident.department_id)
  const nerisEntityId = deptList?.[0]?.neris_entity_id ?? null
  const apiEnrollmentReady = !!(
    nerisEntityId &&
    process.env.NERIS_CLIENT_ID &&
    process.env.NERIS_CLIENT_SECRET
  )

  const requirementSummary = evaluateNerisRequirements({
    incident,
    nerisRecord: nerisRecord ?? null,
    incidentApparatus,
    incidentPersonnel,
    mutualAidRows: mutualAidRows ?? [],
    apiEnrollmentReady,
  })

  return (
    <div className="max-w-2xl">
      <NerisReportClient
        incident={incident}
        fireDetails={fireDetails}
        incidentApparatus={incidentApparatus}
        incidentPersonnel={incidentPersonnel}
        nerisRecord={nerisRecord ?? null}
        mutualAidRows={mutualAidRows ?? []}
        requirementSummary={requirementSummary}
        isAdmin={isNerisAdmin}
        isOfficerOrAbove={isOfficerOrAbove}
      />
    </div>
  )
}
