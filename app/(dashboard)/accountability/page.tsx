import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import Link from 'next/link'
import GuestAccessControl from './GuestAccessControl'

export default async function AccountabilityHubPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  const department_id = ctx.departmentId

  const { data: boards } = await adminClient
    .from('accountability_boards')
    .select('id, title, board_date, status, linked_incident_id, created_at')
    .eq('department_id', department_id)
    .order('created_at', { ascending: false })
    .limit(50)

  // Fetch entry counts per board
  const boardIds = (boards ?? []).map(b => b.id)
  const { data: entryCounts } = boardIds.length > 0
    ? await adminClient
        .from('accountability_entries')
        .select('board_id')
        .in('board_id', boardIds)
    : { data: [] }

  const countMap: Record<string, number> = {}
  for (const row of entryCounts ?? []) {
    countMap[row.board_id] = (countMap[row.board_id] ?? 0) + 1
  }

  // Fetch linked incident numbers
  const incidentIds = (boards ?? []).map(b => b.linked_incident_id).filter(Boolean) as string[]
  const { data: incidentRaw } = incidentIds.length > 0
    ? await adminClient.from('incidents').select('id, incident_number').in('id', incidentIds)
    : { data: [] }
  const incidentMap = Object.fromEntries((incidentRaw ?? []).map(i => [i.id, i.incident_number]))

  function formatDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const active = (boards ?? []).filter(b => b.status === 'active')
  const closed = (boards ?? []).filter(b => b.status === 'closed')
  const isOfficerOrAbove = ctx.systemRole === 'officer' || ctx.systemRole === 'admin' || ctx.isSysAdmin

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Accountability</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Scan cards, assign lanes, and run PAR checks for any event.</p>
        </div>
        <Link href="/accountability/new"
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors shrink-0">
          New Board
        </Link>
      </div>

      {(boards ?? []).length === 0 ? (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-10 text-center">
          <p className="text-sm text-zinc-500 mb-3">No accountability boards yet.</p>
          <Link href="/accountability/new"
            className="inline-block text-sm font-semibold text-red-700 hover:text-red-800">
            Create your first board →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {active.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">Active</h2>
              <div className="rounded-xl bg-white border border-zinc-200 shadow-sm overflow-hidden">
                <div className="divide-y divide-zinc-100">
                  {active.map(board => {
                    const count = countMap[board.id] ?? 0
                    const incNum = board.linked_incident_id ? incidentMap[board.linked_incident_id] : null
                    return (
                      <div key={board.id} className="flex items-center px-5 py-4 gap-4 hover:bg-zinc-50 transition-colors">
                        <Link href={`/accountability/${board.id}`} className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-zinc-900 truncate">{board.title}</p>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            {formatDate(board.board_date)}
                            {incNum && <span className="ml-2 text-zinc-500">· Incident {incNum}</span>}
                          </p>
                        </Link>
                        <div className="flex items-center gap-3 shrink-0">
                          {count > 0 ? (
                            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                              {count} on board
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400">Empty</span>
                          )}
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Active</span>
                          {isOfficerOrAbove && <GuestAccessControl boardId={board.id} />}
                          <Link href={`/accountability/${board.id}`} className="text-zinc-300">→</Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {closed.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">Closed</h2>
              <div className="rounded-xl bg-white border border-zinc-200 shadow-sm overflow-hidden">
                <div className="divide-y divide-zinc-100">
                  {closed.map(board => {
                    const count = countMap[board.id] ?? 0
                    const incNum = board.linked_incident_id ? incidentMap[board.linked_incident_id] : null
                    return (
                      <Link key={board.id} href={`/accountability/${board.id}`}
                        className="flex items-center px-5 py-4 gap-4 hover:bg-zinc-50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-zinc-900 truncate">{board.title}</p>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            {formatDate(board.board_date)}
                            {incNum && <span className="ml-2 text-zinc-500">· Incident {incNum}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {count > 0 && (
                            <span className="text-xs text-zinc-400">{count} logged</span>
                          )}
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">Closed</span>
                          <span className="text-zinc-300">→</span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
