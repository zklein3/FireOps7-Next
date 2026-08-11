'use client'

import { useRouter, usePathname } from 'next/navigation'
import type { RunReportRow } from './page'
import HelpText from '@/components/HelpText'

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  fire:       'Fire',
  rescue:     'Rescue',
  standby:    'Standby',
  training:   'Training',
  meeting:    'Meeting',
  special:    'Special',
  mutual_aid: 'Mutual Aid',
}

const TYPE_COLORS: Record<string, string> = {
  fire:       'bg-red-100 text-red-700',
  rescue:     'bg-orange-100 text-orange-700',
  standby:    'bg-yellow-100 text-yellow-700',
  training:   'bg-blue-100 text-blue-700',
  meeting:    'bg-zinc-100 text-zinc-600',
  special:    'bg-purple-100 text-purple-700',
  mutual_aid: 'bg-green-100 text-green-700',
}

export default function RunReportClient({
  rows, dateFrom, dateTo, selectedType, availableTypes,
}: {
  rows: RunReportRow[]
  dateFrom: string
  dateTo: string
  selectedType: string | null
  availableTypes: { value: string; label: string }[]
}) {
  const router = useRouter()
  const pathname = usePathname()

  function applyFilters(updates: Record<string, string | null>) {
    const params = new URLSearchParams()
    const current = { from: dateFrom, to: dateTo, type: selectedType }
    const merged = { ...current, ...updates }
    if (merged.from)  params.set('from', merged.from)
    if (merged.to)    params.set('to',   merged.to)
    if (merged.type)  params.set('type', merged.type)
    router.push(`${pathname}?${params.toString()}`)
  }

  function fmtDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const inputCls = "rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 bg-white"

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Run Report</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Incident run sheets — filter and print</p>
      </div>

      <HelpText className="mb-4">
        Each row's Print ↗ opens a single-page run sheet formatted to match the department's paper Run Field
        Report — the same layout dispatch and records requests expect.
      </HelpText>

      {/* Filter bar */}
      <div className="mb-5 rounded-xl bg-white border border-zinc-200 shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => applyFilters({ from: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => applyFilters({ to: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Type</label>
          <select
            value={selectedType ?? ''}
            onChange={e => applyFilters({ type: e.target.value || null })}
            className={inputCls}
          >
            <option value="">All types</option>
            {availableTypes.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        {selectedType && (
          <button
            onClick={() => applyFilters({ type: null })}
            className="text-xs text-zinc-400 hover:text-zinc-600 pb-2"
          >
            Clear filter
          </button>
        )}
        <div className="ml-auto pb-1 text-sm text-zinc-400">
          {rows.length} incident{rows.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Results */}
      <div className="rounded-xl bg-white border border-zinc-200 shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-400">
            No incidents found for the selected filters.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {rows.map(row => (
              <div key={row.id} className="flex items-center px-5 py-4 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-zinc-900">
                      {fmtDate(row.incident_date)}
                    </span>
                    {row.incident_number && (
                      <span className="text-xs text-zinc-400">#{row.incident_number}</span>
                    )}
                    {row.incident_type && (
                      <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${TYPE_COLORS[row.incident_type] ?? 'bg-zinc-100 text-zinc-600'}`}>
                        {INCIDENT_TYPE_LABELS[row.incident_type] ?? row.incident_type}
                      </span>
                    )}
                  </div>
                  {(row.address || row.city) && (
                    <p className="text-xs text-zinc-500 mt-0.5 truncate">
                      {[row.address, row.city].filter(Boolean).join(', ')}
                    </p>
                  )}
                  <div className="flex gap-3 text-xs text-zinc-400 mt-0.5">
                    {row.apparatus_count > 0 && <span>{row.apparatus_count} unit{row.apparatus_count !== 1 ? 's' : ''}</span>}
                    {row.responder_count > 0 && <span>{row.responder_count} responder{row.responder_count !== 1 ? 's' : ''}</span>}
                  </div>
                </div>
                <a
                  href={`/print/run-sheet?id=${row.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  Print ↗
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
