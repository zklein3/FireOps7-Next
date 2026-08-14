import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import Link from 'next/link'
import HubCard from '@/components/HubCard'
import HelpText from '@/components/HelpText'

export default async function OperationsPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')
  if (ctx.departmentType !== 'fire') redirect('/dashboard')
  const me = { id: ctx.personnelId }

  const departmentId = ctx.departmentId
  const { data: deptFlags } = await adminClient
    .from('departments')
    .select('module_operations, public_site_enabled, module_ics')
    .eq('id', departmentId)
    .single()

  const moduleOperations = (deptFlags as any)?.module_operations ?? false
  const moduleIcs = (deptFlags as any)?.module_ics ?? false

  const [
    { data: allAnnouncements },
    { data: readIds },
    incidentsResult,
  ] = await Promise.all([
    adminClient.from('announcements').select('id').eq('department_id', departmentId),
    adminClient.from('announcement_reads').select('announcement_id').eq('personnel_id', me.id),
    moduleOperations
      ? adminClient.from('incidents')
          .select('id, incident_number, incident_type, incident_date, address, city')
          .eq('department_id', departmentId)
          .order('incident_date', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
  ])

  const readSet = new Set((readIds ?? []).map((r: { announcement_id: string }) => r.announcement_id))
  const unreadCount = (allAnnouncements ?? []).filter(a => !readSet.has(a.id)).length
  const recentIncidents = (incidentsResult as any).data ?? []

  function formatIncidentDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Operations</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Incidents, announcements, and daily activity</p>
      </div>

      <HelpText className="mb-4">
        This hub is officer-facing — cards only show if your role has access to that section, and only the modules
        your department has enabled appear at all.
      </HelpText>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {moduleOperations && (
          <HubCard
            title="Incidents"
            description="Log and manage incident reports"
            href="/incidents"
            stat={recentIncidents.length > 0 ? recentIncidents.length : null}
            statLabel="Recent"
          />
        )}
        {moduleOperations && !moduleIcs && (
          <HubCard
            title="Accountability"
            description="Scan cards, assign lanes, and run PAR checks"
            href="/accountability"
          />
        )}
        <HubCard
          title="Announcements"
          description="Department-wide messages and notices"
          href="/announcements"
          stat={unreadCount > 0 ? unreadCount : null}
          statLabel="Unread"
          alert={unreadCount > 0}
        />
      </div>

      {moduleOperations && recentIncidents.length > 0 && (
        <div className="rounded-xl bg-white border border-zinc-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Recent Incidents</h2>
            <Link href="/incidents" className="text-xs font-semibold text-red-600 hover:text-red-800">
              All Incidents →
            </Link>
          </div>
          <div className="divide-y divide-zinc-100">
            {recentIncidents.map((inc: {
              id: string
              incident_number: string
              incident_type: string
              incident_date: string
              address: string | null
              city: string | null
            }) => (
              <Link
                key={inc.id}
                href={`/incidents/${inc.id}`}
                className="flex items-center px-5 py-3 gap-3 hover:bg-zinc-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900">{inc.incident_number}</p>
                  <p className="text-xs text-zinc-400 mt-0.5 truncate">
                    {inc.incident_type}{inc.address ? ` · ${inc.address}` : ''}{inc.city ? `, ${inc.city}` : ''}
                  </p>
                </div>
                <p className="text-xs text-zinc-400 shrink-0">{formatIncidentDate(inc.incident_date)}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
