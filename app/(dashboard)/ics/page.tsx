import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import NewIcsIncidentForm from './NewIcsIncidentForm'

export default async function IcsListPage() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx || !ctx.departmentId) redirect('/login')
  const adminClient = createAdminClient()
  const departmentId = ctx.departmentId

  const { data: participantRows } = await adminClient
    .from('ics_incident_participants').select('ics_incident_id, status').eq('department_id', departmentId)
  const incidentIds = [...new Set((participantRows ?? []).map(p => p.ics_incident_id))]

  const { data: jurisdictionRows } = await adminClient
    .from('department_jurisdictions').select('child_department_id').eq('parent_department_id', departmentId)
  const childDeptIds = (jurisdictionRows ?? []).map(j => j.child_department_id)
  const { data: jurisdictionIncidents } = childDeptIds.length > 0
    ? await adminClient.from('ics_incidents').select('id').in('department_id', childDeptIds)
    : { data: [] }
  const allIds = [...new Set([...incidentIds, ...(jurisdictionIncidents ?? []).map(i => i.id)])]

  const { data: incidentsRaw } = allIds.length > 0
    ? await adminClient
        .from('ics_incidents')
        .select('id, title, status, department_id, created_at')
        .in('id', allIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  const incidentDeptIds = [...new Set((incidentsRaw ?? []).map(i => i.department_id))]
  const { data: incidentDepartments } = incidentDeptIds.length > 0
    ? await adminClient.from('departments').select('id, name').in('id', incidentDeptIds)
    : { data: [] }
  const incidentDeptNameById = Object.fromEntries((incidentDepartments ?? []).map(d => [d.id, d.name]))
  const incidents = (incidentsRaw ?? []).map(i => ({ ...i, department_name: incidentDeptNameById[i.department_id] ?? '—' }))

  const isOfficerOrAbove = ctx.systemRole === 'admin' || ctx.systemRole === 'officer'

  // Recent boards/incidents for the "new" form
  const { data: boards } = await adminClient
    .from('accountability_boards').select('id, title, board_date').eq('department_id', departmentId)
    .order('board_date', { ascending: false }).limit(20)

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-zinc-900 mb-1">ICS</h1>
      <p className="text-sm text-zinc-500 mb-6">Incident Command System packets — operational-period documentation, shared across departments.</p>

      {isOfficerOrAbove && (
        <div className="mb-6">
          <NewIcsIncidentForm boards={boards ?? []} />
        </div>
      )}

      <div className="space-y-2">
        {incidents.length === 0 && (
          <p className="text-sm text-zinc-400">No ICS incidents yet.</p>
        )}
        {incidents.map(inc => (
          <Link
            key={inc.id}
            href={`/ics/${inc.id}`}
            className="block rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:border-red-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-900">{inc.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {inc.department_name}
                  {inc.department_id !== departmentId ? ' · shared with your department' : ''}
                </p>
              </div>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                inc.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
              }`}>
                {inc.status === 'open' ? 'Open' : 'Closed'}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
