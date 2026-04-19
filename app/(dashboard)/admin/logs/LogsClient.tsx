'use client'

import { useState } from 'react'
import { resolveLog, resolveAllLogs } from '@/app/actions/admin'

interface LogEntry {
  id: string
  created_at: string
  log_type: string
  page: string | null
  message: string
  metadata: Record<string, unknown> | null
  personnel_id: string | null
  department_id: string | null
  resolved: boolean
}

interface Props {
  logs: LogEntry[]
  personnelMap: Record<string, string>
}

const TAB_TYPES = ['all', 'error', 'user_report'] as const
type TabType = (typeof TAB_TYPES)[number]

const TAB_LABELS: Record<TabType, string> = {
  all: 'All',
  error: 'Errors',
  user_report: 'User Reports',
}

const TYPE_BADGE: Record<string, string> = {
  error: 'bg-red-100 text-red-700',
  user_report: 'bg-blue-100 text-blue-700',
  info: 'bg-zinc-100 text-zinc-600',
}

export default function LogsClient({ logs, personnelMap }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [showResolved, setShowResolved] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [resolving, setResolving] = useState<string | null>(null)
  const [resolvingAll, setResolvingAll] = useState(false)

  const filtered = logs.filter((l) => {
    if (!showResolved && l.resolved) return false
    if (activeTab !== 'all' && l.log_type !== activeTab) return false
    return true
  })

  const unresolvedCount = logs.filter(
    (l) => !l.resolved && (activeTab === 'all' || l.log_type === activeTab)
  ).length

  async function handleResolve(id: string) {
    setResolving(id)
    await resolveLog(id)
    setResolving(null)
  }

  async function handleResolveAll() {
    setResolvingAll(true)
    await resolveAllLogs(activeTab === 'all' ? undefined : activeTab)
    setResolvingAll(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">System Logs</h1>
          <p className="text-sm text-zinc-500 mt-1">{logs.filter((l) => !l.resolved).length} unresolved</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
              className="rounded"
            />
            Show resolved
          </label>
          {unresolvedCount > 0 && (
            <button
              onClick={handleResolveAll}
              disabled={resolvingAll}
              className="text-sm px-3 py-1.5 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50"
            >
              {resolvingAll ? 'Resolving…' : `Resolve all (${unresolvedCount})`}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-zinc-200">
        {TAB_TYPES.map((tab) => {
          const count = logs.filter((l) => !l.resolved && (tab === 'all' || l.log_type === tab)).length
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? 'border-red-700 text-red-700'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              {TAB_LABELS[tab]}
              {count > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-red-100 text-red-700">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Log list */}
      {filtered.length === 0 ? (
        <p className="text-zinc-400 text-sm py-8 text-center">No logs to show.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((log) => (
            <div
              key={log.id}
              className={`rounded-lg border p-4 transition-opacity ${
                log.resolved ? 'opacity-50 bg-zinc-50 border-zinc-200' : 'bg-white border-zinc-200'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className={`mt-0.5 shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                      TYPE_BADGE[log.log_type] ?? TYPE_BADGE.info
                    }`}
                  >
                    {log.log_type.replace('_', ' ')}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">{log.message}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-zinc-400">
                      <span>{new Date(log.created_at).toLocaleString()}</span>
                      {log.page && <span>Page: {log.page}</span>}
                      {log.personnel_id && personnelMap[log.personnel_id] && (
                        <span>User: {personnelMap[log.personnel_id]}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {log.metadata && (
                    <button
                      onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                      className="text-xs text-zinc-400 hover:text-zinc-700 underline"
                    >
                      {expanded === log.id ? 'Hide' : 'Details'}
                    </button>
                  )}
                  {!log.resolved && (
                    <button
                      onClick={() => handleResolve(log.id)}
                      disabled={resolving === log.id}
                      className="text-xs px-2.5 py-1 rounded-md bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 border border-green-200"
                    >
                      {resolving === log.id ? '…' : 'Resolve'}
                    </button>
                  )}
                  {log.resolved && (
                    <span className="text-xs text-zinc-400 italic">Resolved</span>
                  )}
                </div>
              </div>
              {expanded === log.id && log.metadata && (
                <pre className="mt-3 p-3 bg-zinc-50 rounded text-xs text-zinc-600 overflow-x-auto">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
