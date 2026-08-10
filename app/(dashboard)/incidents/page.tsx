import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import IncidentsClient from './IncidentsClient'

export default async function IncidentsPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')
  if (ctx.departmentType !== 'fire') redirect('/dashboard')
  const me = { id: ctx.personnelId }

  // Module gate — Bundle A required
  const { data: deptFlags } = await adminClient.from('departments').select('module_operations').eq('id', ctx.departmentId).single()
  if (!deptFlags?.module_operations) redirect('/dashboard')

  const department_id = ctx.departmentId
  const isOfficerOrAbove = await hasPermission(ctx, 'manage_incidents')

  // Last 6 months of incidents
  const since = new Date()
  since.setMonth(since.getMonth() - 6)

  const { data: incidents } = await adminClient
    .from('incidents')
    .select('id, incident_number, cad_number, incident_date, incident_type, fire_subtype, address, city, state, zip, status, neris_reported, created_by, created_at')
    .eq('department_id', department_id)
    .gte('incident_date', since.toISOString().split('T')[0])
    .order('incident_date', { ascending: false })

  // Creator names
  const creatorIds = [...new Set((incidents ?? []).map(i => i.created_by).filter(Boolean))]
  const { data: creatorsRaw } = creatorIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', creatorIds)
    : { data: [] }
  const creatorMap = Object.fromEntries((creatorsRaw ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  // Member's own attendance on these incidents
  const incidentIds = (incidents ?? []).map(i => i.id)
  const { data: myAttendanceRaw } = incidentIds.length > 0
    ? await adminClient
        .from('incident_personnel')
        .select('incident_id, status')
        .eq('personnel_id', me.id)
        .in('incident_id', incidentIds)
    : { data: [] }
  const myAttendanceMap = Object.fromEntries((myAttendanceRaw ?? []).map(a => [a.incident_id, a.status]))

  return (
    <IncidentsClient
      incidents={(incidents ?? []).map(i => ({ ...i, creator_name: creatorMap[i.created_by] ?? '—' }))}
      isOfficerOrAbove={isOfficerOrAbove}
      myPersonnelId={me.id}
      myAttendanceMap={myAttendanceMap}
    />
  )
}
