import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'

interface DeptSummary {
  id: string
  name: string
  code: string | null
  active: boolean
  personnel_count: number
  station_count: number
  apparatus_count: number
  scba_count: number
  pending_count: number
}

async function getAllDepartmentSummaries(): Promise<DeptSummary[]> {
  const adminClient = createAdminClient()

  const { data: departments } = await adminClient
    .from('departments')
    .select('id, name, code, active')
    .order('name')

  if (!departments) return []

  const summaries = await Promise.all(
    departments.map(async (dept) => {
      const [personnel, stations, apparatus, scba, pending] = await Promise.all([
        adminClient.from('department_personnel').select('id').eq('department_id', dept.id).eq('active', true).eq('signup_status', 'active'),
        adminClient.from('stations').select('id').eq('department_id', dept.id).eq('active', true),
        adminClient.from('apparatus').select('id').eq('department_id', dept.id).eq('active', true),
        adminClient.from('scba_bottles').select('id').eq('department_id', dept.id).eq('active', true).eq('retired', false),
        adminClient.from('department_personnel').select('id').eq('department_id', dept.id).in('signup_status', ['temp_password', 'profile_setup']),
      ])

      return {
        ...dept,
        personnel_count: personnel.data?.length ?? 0,
        station_count: stations.data?.length ?? 0,
        apparatus_count: apparatus.data?.length ?? 0,
        scba_count: scba.data?.length ?? 0,
        pending_count: pending.data?.length ?? 0,
      }
    })
  )

  return summaries
}

async function getRecentLogs() {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('system_logs')
    .select('id, created_at, log_type, page, message, resolved')
    .order('created_at', { ascending: false })
    .limit(10)
  return data ?? []
}

export default async function SysAdminDashboard() {
  const departments = await getAllDepartmentSummaries()
  const recentLogs = await getRecentLogs()

  const totalPersonnel = departments.reduce((sum, d) => sum + d.personnel_count, 0)
  const totalPending = departments.reduce((sum, d) => sum + d.pending_count, 0)
  const errors = recentLogs.filter(l => l.log_type === 'error' && !l.resolved)
  const reports = recentLogs.filter(l => l.log_type === 'user_report' && !l.resolved)

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">System Administration</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {departments.length} departments · {totalPersonnel} total active personnel
        </p>
      </div>

      {/* Alert Banners */}
      {totalPending > 0 && (
        <div className="mb-4 rounded-xl bg-yellow-50 border border-yellow-200 px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-yellow-800">
            {totalPending} user{totalPending !== 1 ? 's' : ''} across all departments haven&apos;t completed account setup
          </p>
          <Link href="/admin/users" className="text-xs font-semibold text-yellow-800 hover:underline ml-4">
            View Users →
          </Link>
        </div>
      )}
      {errors.length > 0 && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-red-800">
            {errors.length} unresolved error{errors.length !== 1 ? 's' : ''} in the system log
          </p>
          <Link href="/admin/logs" className="text-xs font-semibold text-red-800 hover:underline ml-4">
            View Logs →
          </Link>
        </div>
      )}
      {reports.length > 0 && (
        <div className="mb-6 rounded-xl bg-blue-50 border border-blue-200 px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-blue-800">
            {reports.length} unread user report{reports.length !== 1 ? 's' : ''}
          </p>
          <Link href="/admin/logs" className="text-xs font-semibold text-blue-800 hover:underline ml-4">
            View Reports →
          </Link>
        </div>
      )}

      {/* Department Cards */}
      <h2 className="text-base font-semibold text-zinc-700 mb-3">Departments</h2>
      <div className="grid grid-cols-1 gap-4 mb-8 md:grid-cols-2 xl:grid-cols-3">
        {departments.map(dept => (
          <div
            key={dept.id}
            className={`rounded-xl bg-white shadow-sm border p-5 ${
              dept.active ? 'border-zinc-200' : 'border-zinc-100 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-zinc-900">{dept.name}</h3>
                <p className="text-xs text-zinc-400 mt-0.5">{dept.code ?? '—'}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  dept.active ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
                }`}>
                  {dept.active ? 'Active' : 'Inactive'}
                </span>
                {dept.pending_count > 0 && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700">
                    {dept.pending_count} pending
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <StatMini label="Personnel" value={dept.personnel_count} />
              <StatMini label="Stations" value={dept.station_count} />
              <StatMini label="Apparatus" value={dept.apparatus_count} />
              <StatMini label="SCBA" value={dept.scba_count} />
            </div>

            <div className="flex gap-2 pt-3 border-t border-zinc-100">
              <Link
                href={`/admin/dept/${dept.id}`}
                className="flex-1 text-center rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 transition-colors"
              >
                Manage
              </Link>
              <Link
                href={`/admin/departments`}
                className="flex-1 text-center rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Settings
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Recent System Activity */}
      {recentLogs.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-zinc-700 mb-3">Recent System Activity</h2>
          <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-zinc-600">Time</th>
                  <th className="px-6 py-3 text-left font-semibold text-zinc-600">Type</th>
                  <th className="px-6 py-3 text-left font-semibold text-zinc-600">Page</th>
                  <th className="px-6 py-3 text-left font-semibold text-zinc-600">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {recentLogs.map(log => (
                  <tr key={log.id} className="hover:bg-zinc-50">
                    <td className="px-6 py-3 text-zinc-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        log.log_type === 'error' ? 'bg-red-100 text-red-700' :
                        log.log_type === 'user_report' ? 'bg-blue-100 text-blue-700' :
                        'bg-zinc-100 text-zinc-600'
                      }`}>
                        {log.log_type === 'user_report' ? 'Report' : log.log_type.charAt(0).toUpperCase() + log.log_type.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-zinc-500 whitespace-nowrap">{log.page ?? '—'}</td>
                    <td className="px-6 py-3 text-zinc-700 max-w-xs truncate">{log.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StatMini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-bold text-zinc-900">{value}</p>
    </div>
  )
}
