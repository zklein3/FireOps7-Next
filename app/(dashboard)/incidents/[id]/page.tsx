import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import IncidentDetailClient from './IncidentDetailClient'

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient.from('personnel').select('id, first_name, last_name, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) redirect('/login')

  const { data: myDeptList } = await adminClient.from('department_personnel').select('department_id, system_role').eq('personnel_id', me.id).eq('active', true)
  const myDept = myDeptList?.[0]
  if (!myDept) redirect('/dashboard')

  const department_id = myDept.department_id
  const isOfficerOrAbove = myDept.system_role === 'admin' || myDept.system_role === 'officer'

  // Incident
  const { data: incident } = await adminClient
    .from('incidents')
    .select('*')
    .eq('id', id)
    .eq('department_id', department_id)
    .single()

  if (!incident) notFound()

  // Apparatus on incident
  const { data: incidentApparatus } = await adminClient
    .from('incident_apparatus')
    .select('id, apparatus_id, role, paged_at, enroute_at, on_scene_at, leaving_scene_at, available_at')
    .eq('incident_id', id)
    .order('created_at')

  // Personnel on incident
  const { data: incidentPersonnel } = await adminClient
    .from('incident_personnel')
    .select('id, personnel_id, apparatus_id, role, status, rejection_reason, submitted_by, verified_by, verified_at')
    .eq('incident_id', id)
    .order('created_at')

  // Fire details
  const { data: fireDetails } = await adminClient
    .from('incident_fire_details')
    .select('*')
    .eq('incident_id', id)
    .maybeSingle()

  // Names for personnel
  const personnelIds = [...new Set([
    ...(incidentPersonnel ?? []).map(p => p.personnel_id),
    ...(incidentPersonnel ?? []).map(p => p.submitted_by).filter(Boolean),
    ...(incidentPersonnel ?? []).map(p => p.verified_by).filter(Boolean),
    incident.created_by,
    incident.finalized_by,
  ].filter(Boolean))]

  const { data: personnelRaw } = personnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', personnelIds)
    : { data: [] }
  const personnelNameMap = Object.fromEntries((personnelRaw ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  // Apparatus names
  const apparatusIds = [...new Set([
    ...(incidentApparatus ?? []).map(a => a.apparatus_id),
    ...(incidentPersonnel ?? []).map(p => p.apparatus_id).filter(Boolean),
  ])]
  const { data: apparatusRaw } = apparatusIds.length > 0
    ? await adminClient.from('apparatus').select('id, unit_number').in('id', apparatusIds)
    : { data: [] }
  const apparatusNameMap = Object.fromEntries((apparatusRaw ?? []).map(a => [a.id, a.unit_number]))

  // Dept apparatus list for adding
  const { data: deptApparatus } = await adminClient
    .from('apparatus')
    .select('id, unit_number')
    .eq('department_id', department_id)
    .eq('active', true)
    .order('unit_number')

  // Dept personnel list for adding
  const { data: deptPersonnelRaw } = await adminClient
    .from('department_personnel')
    .select('personnel_id, personnel(id, first_name, last_name)')
    .eq('department_id', department_id)
    .eq('active', true)

  const deptPersonnel = (deptPersonnelRaw ?? [])
    .map(p => ({
      id: (p.personnel as any)?.id ?? p.personnel_id,
      name: [(p.personnel as any)?.first_name, (p.personnel as any)?.last_name].filter(Boolean).join(' '),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <IncidentDetailClient
      incident={incident}
      incidentApparatus={(incidentApparatus ?? []).map(a => ({
        ...a,
        unit_number: apparatusNameMap[a.apparatus_id] ?? '—',
      }))}
      incidentPersonnel={(incidentPersonnel ?? []).map(p => ({
        ...p,
        name: personnelNameMap[p.personnel_id] ?? '—',
        apparatus_unit: p.apparatus_id ? (apparatusNameMap[p.apparatus_id] ?? '—') : null,
        submitted_by_name: p.submitted_by ? (personnelNameMap[p.submitted_by] ?? '—') : null,
      }))}
      fireDetails={fireDetails}
      personnelNameMap={personnelNameMap}
      deptApparatus={deptApparatus ?? []}
      deptPersonnel={deptPersonnel}
      isOfficerOrAbove={isOfficerOrAbove}
      myPersonnelId={me.id}
    />
  )
}
