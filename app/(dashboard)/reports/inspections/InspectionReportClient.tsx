'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { InspectionLogRow, PresenceCheckRow, StepRow } from './page'

type ApparatusOption = { id: string; name: string }
type PersonnelOption = { id: string; name: string }
type ResultFilter = 'all' | 'pass' | 'fail'

type DisplayRow =
  | (InspectionLogRow & { kind: 'inspection' })
  | (PresenceCheckRow & { kind: 'presence' })

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function ResultBadge({ result }: { result: string }) {
  const isPASS = result === 'PASS'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${isPASS ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
      {result}
    </span>
  )
}

function PresenceBadge({ present }: { present: boolean }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${present ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
      {present ? 'Present' : 'Missing'}
    </span>
  )
}

function StepValue({ step }: { step: StepRow }) {
  if (step.step_type === 'BOOLEAN') {
    const isFail = step.boolean_value === false && step.fail_if_negative
    const isWarn = step.boolean_value === false && !step.fail_if_negative
    return (
      <span className={`font-medium ${isFail ? 'text-red-700' : isWarn ? 'text-yellow-700' : 'text-green-700'}`}>
        {step.boolean_value === true ? 'Yes' : step.boolean_value === false ? 'No' : '—'}
      </span>
    )
  }
  if (step.step_type === 'NUMERIC') {
    return <span className="font-medium text-zinc-700">{step.numeric_value ?? '—'}</span>
  }
  if (step.step_type === 'ASSET_LINK') {
    return <span className="font-medium text-zinc-700">{step.linked_asset_tag ?? step.text_value ?? '—'}</span>
  }
  return <span className="text-zinc-600">{step.text_value ?? '—'}</span>
}

function StepList({ steps }: { steps: StepRow[] }) {
  if (steps.length === 0) return <p className="text-xs text-zinc-400 italic">No steps recorded.</p>
  return (
    <div className="divide-y divide-zinc-100">
      {steps.map(s => {
        const isFailing = s.step_type === 'BOOLEAN' && s.boolean_value === false && s.fail_if_negative
        return (
          <div key={s.template_step_id} className={`flex items-start justify-between gap-4 py-2 px-3 ${isFailing ? 'bg-red-50' : ''}`}>
            <span className="text-xs text-zinc-600 flex-1">{s.step_text}</span>
            <StepValue step={s} />
          </div>
        )
      })}
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-4 text-center">
      <div className="text-2xl font-bold text-zinc-800">{value}</div>
      {sub && <div className="text-sm text-zinc-500">{sub}</div>}
      <div className="text-xs text-zinc-400 mt-0.5">{label}</div>
    </div>
  )
}

// ── Level 2: Asset drill-in ──────────────────────────────────────────────────

function AssetDrillIn({
  asset,
  logs,
  onBack,
}: {
  asset: { id: string; tag: string; item_name: string }
  logs: InspectionLogRow[]
  onBack: () => void
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [printMode, setPrintMode] = useState(false)

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handlePrint() {
    setExpandedIds(new Set(logs.map(l => l.id)))
    setPrintMode(true)
    setTimeout(() => {
      window.print()
      setPrintMode(false)
    }, 100)
  }

  const passCount = logs.filter(l => l.overall_result === 'PASS').length
  const failCount = logs.filter(l => l.overall_result === 'FAIL').length

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 print:hidden">
        <div>
          <button
            onClick={onBack}
            className="text-sm text-red-700 hover:text-red-800 font-medium mb-2 flex items-center gap-1"
          >
            ← Back to results
          </button>
          <h2 className="text-xl font-bold text-zinc-900">{asset.item_name}</h2>
          <p className="text-sm text-zinc-500 font-mono">{asset.tag}</p>
        </div>
        <button
          onClick={handlePrint}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors print:hidden"
        >
          Print
        </button>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h2 className="text-lg font-bold">{asset.item_name} — {asset.tag}</h2>
        <p className="text-sm text-zinc-500">Inspection History</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Inspections" value={logs.length} />
        <StatCard label="Pass" value={passCount} sub={logs.length > 0 ? `${Math.round(passCount / logs.length * 100)}%` : undefined} />
        <StatCard label="Fail" value={failCount} />
      </div>

      {/* Inspection cards */}
      {logs.length === 0 ? (
        <p className="text-sm text-zinc-500 py-8 text-center">No inspections match the current filters.</p>
      ) : (
        <div className="space-y-3">
          {logs.map(log => {
            const isExpanded = printMode || expandedIds.has(log.id)
            return (
              <div key={log.id} className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
                <div
                  className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-50 print:cursor-default"
                  onClick={() => toggleExpand(log.id)}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-medium text-zinc-700 whitespace-nowrap">{formatDateTime(log.inspected_at)}</span>
                    <span className="text-sm text-zinc-500">{log.apparatus_name}</span>
                    {log.compartment !== '—' && <span className="text-xs text-zinc-400">{log.compartment}</span>}
                    <span className="text-sm text-zinc-500">{log.inspector_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ResultBadge result={log.overall_result} />
                    <span className="text-zinc-400 text-xs print:hidden">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-zinc-100">
                    <StepList steps={log.steps} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function InspectionReportClient({
  logs,
  presenceChecks,
  apparatusList,
  personnelList,
  dateFrom,
  dateTo,
  selectedApparatusId,
  selectedPersonnelId,
}: {
  logs: InspectionLogRow[]
  presenceChecks: PresenceCheckRow[]
  apparatusList: ApparatusOption[]
  personnelList: PersonnelOption[]
  dateFrom: string
  dateTo: string
  selectedApparatusId: string | null
  selectedPersonnelId: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()

  const [fromVal, setFromVal] = useState(dateFrom)
  const [toVal, setToVal] = useState(dateTo)
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [selectedAsset, setSelectedAsset] = useState<{ id: string; tag: string; item_name: string } | null>(null)
  const [printMode, setPrintMode] = useState(false)

  // Reset asset drill-in when server filter changes (apparatus/personnel/date change triggers re-render)
  useEffect(() => { setSelectedAsset(null) }, [dateFrom, dateTo, selectedApparatusId, selectedPersonnelId])

  function applyFilters({
    apparatusId = selectedApparatusId,
    personId = selectedPersonnelId,
  }: { apparatusId?: string | null; personId?: string | null } = {}) {
    const params = new URLSearchParams()
    if (fromVal) params.set('from', fromVal)
    if (toVal) params.set('to', toVal)
    if (apparatusId) params.set('apparatusId', apparatusId)
    if (personId) params.set('personnelId', personId)
    router.push(`${pathname}?${params.toString()}`)
  }

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Apply result filter client-side — maps consistently across both types
  const filteredLogs = logs.filter(l => {
    if (resultFilter === 'pass') return l.overall_result === 'PASS'
    if (resultFilter === 'fail') return l.overall_result === 'FAIL'
    return true
  })

  const filteredPresence = presenceChecks.filter(p => {
    if (resultFilter === 'pass') return p.present === true
    if (resultFilter === 'fail') return p.present === false
    return true
  })

  // Merge and sort by date descending
  const displayRows: DisplayRow[] = [
    ...filteredLogs.map(l => ({ ...l, kind: 'inspection' as const })),
    ...filteredPresence.map(p => ({ ...p, kind: 'presence' as const })),
  ].sort((a, b) => b.inspected_at.localeCompare(a.inspected_at))

  // Asset drill-in — inspection logs only
  const drillLogs = selectedAsset
    ? filteredLogs.filter(l => l.asset_id === selectedAsset.id)
    : []

  const passCount = filteredLogs.filter(l => l.overall_result === 'PASS').length
  const failCount = filteredLogs.filter(l => l.overall_result === 'FAIL').length
  const passRate = filteredLogs.length > 0 ? Math.round(passCount / filteredLogs.length * 100) : 0
  const presentCount = filteredPresence.filter(p => p.present).length
  const missingCount = filteredPresence.filter(p => !p.present).length

  function handlePrint() {
    setExpandedIds(new Set(displayRows.map(r => r.id)))
    setPrintMode(true)
    setTimeout(() => {
      window.print()
      setPrintMode(false)
    }, 100)
  }

  // If asset drill-in is active, render Level 2
  if (selectedAsset) {
    return (
      <div className="max-w-4xl mx-auto">
        {/* Print title */}
        <div className="hidden print:block mb-2 text-xs text-zinc-400">
          {selectedApparatusId ? apparatusList.find(a => a.id === selectedApparatusId)?.name : 'All Apparatus'} ·{' '}
          {formatDate(dateFrom)} – {formatDate(dateTo)}
        </div>
        <AssetDrillIn
          asset={selectedAsset}
          logs={drillLogs}
          onBack={() => setSelectedAsset(null)}
        />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold text-zinc-900">Inspection Report</h1>
        <button
          onClick={handlePrint}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors print:hidden"
        >
          Print
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-zinc-200 p-4 mb-6 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">From</label>
            <input
              type="date"
              value={fromVal}
              onChange={e => setFromVal(e.target.value)}
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">To</label>
            <input
              type="date"
              value={toVal}
              onChange={e => setToVal(e.target.value)}
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Apparatus</label>
            <select
              value={selectedApparatusId ?? ''}
              onChange={e => applyFilters({ apparatusId: e.target.value || null })}
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
            >
              <option value="">All Apparatus</option>
              {apparatusList.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Inspector</label>
            <select
              value={selectedPersonnelId ?? ''}
              onChange={e => applyFilters({ personId: e.target.value || null })}
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
            >
              <option value="">All Inspectors</option>
              {personnelList.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => applyFilters()}
            className="rounded-lg bg-red-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-600 transition-colors"
          >
            Apply
          </button>
        </div>

        {/* Result filter — client side */}
        <div className="flex gap-2 mt-3">
          {(['all', 'pass', 'fail'] as ResultFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setResultFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                resultFilter === f
                  ? f === 'fail' ? 'bg-red-700 text-white' : f === 'pass' ? 'bg-green-700 text-white' : 'bg-zinc-700 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {f === 'all' ? 'All Results' : f === 'pass' ? 'Pass Only' : 'Fail Only'}
            </button>
          ))}
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h2 className="text-base font-semibold">
          {selectedApparatusId ? apparatusList.find(a => a.id === selectedApparatusId)?.name : 'All Apparatus'} ·{' '}
          {selectedPersonnelId ? personnelList.find(p => p.id === selectedPersonnelId)?.name : 'All Inspectors'} ·{' '}
          {formatDate(dateFrom)} – {formatDate(dateTo)}
        </h2>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Inspections" value={filteredLogs.length} />
        <StatCard label="Insp. Pass" value={passCount} />
        <StatCard label="Insp. Fail" value={failCount} />
        <StatCard label="Pass Rate" value={`${passRate}%`} />
        <StatCard label="Present" value={presentCount} />
        <StatCard label="Missing" value={missingCount} />
      </div>

      {/* Table */}
      {displayRows.length === 0 ? (
        <p className="text-sm text-zinc-500 py-8 text-center">No records match the current filters.</p>
      ) : (
        <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 print:bg-white">
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Apparatus</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Comp.</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Item</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Asset</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Inspector</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Result</th>
                <th className="px-4 py-3 print:hidden" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {displayRows.map(row => {
                const isExpanded = printMode || expandedIds.has(row.id)

                if (row.kind === 'presence') {
                  const hasDetail = row.actual_quantity !== null || row.notes
                  return (
                    <>
                      <tr
                        key={row.id}
                        className={`hover:bg-zinc-50 print:cursor-default ${hasDetail ? 'cursor-pointer' : ''}`}
                        onClick={() => hasDetail && toggleExpand(row.id)}
                      >
                        <td className="px-4 py-2.5 text-zinc-700 whitespace-nowrap">{formatDate(row.inspected_at)}</td>
                        <td className="px-4 py-2.5 text-zinc-700">{row.apparatus_name}</td>
                        <td className="px-4 py-2.5 text-zinc-500">{row.compartment}</td>
                        <td className="px-4 py-2.5 text-zinc-700">{row.item_name}</td>
                        <td className="px-4 py-2.5 text-zinc-400 text-xs">—</td>
                        <td className="px-4 py-2.5 text-zinc-500">{row.inspector_name}</td>
                        <td className="px-4 py-2.5"><PresenceBadge present={row.present} /></td>
                        <td className="px-4 py-2.5 text-zinc-400 text-xs text-right print:hidden">
                          {hasDetail ? (isExpanded ? '▲' : '▼') : ''}
                        </td>
                      </tr>
                      {isExpanded && hasDetail && (
                        <tr key={`${row.id}-detail`} className="bg-zinc-50 print:bg-white">
                          <td colSpan={8} className="px-6 py-2 text-xs text-zinc-600">
                            {row.actual_quantity !== null && <span className="mr-4">Qty reported: <strong>{row.actual_quantity}</strong></span>}
                            {row.notes && <span>Notes: {row.notes}</span>}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                }

                // kind === 'inspection'
                return (
                  <>
                    <tr
                      key={row.id}
                      className="hover:bg-zinc-50 cursor-pointer print:cursor-default"
                      onClick={() => toggleExpand(row.id)}
                    >
                      <td className="px-4 py-2.5 text-zinc-700 whitespace-nowrap">{formatDate(row.inspected_at)}</td>
                      <td className="px-4 py-2.5 text-zinc-700">{row.apparatus_name}</td>
                      <td className="px-4 py-2.5 text-zinc-500">{row.compartment}</td>
                      <td className="px-4 py-2.5 text-zinc-700">{row.item_name}</td>
                      <td className="px-4 py-2.5">
                        <button
                          className="font-mono text-red-700 hover:underline text-xs print:text-zinc-700 print:no-underline"
                          onClick={e => {
                            e.stopPropagation()
                            setSelectedAsset({ id: row.asset_id, tag: row.asset_tag, item_name: row.item_name })
                          }}
                        >
                          {row.asset_tag}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500">{row.inspector_name}</td>
                      <td className="px-4 py-2.5"><ResultBadge result={row.overall_result} /></td>
                      <td className="px-4 py-2.5 text-zinc-400 text-xs text-right print:hidden">
                        {isExpanded ? '▲' : '▼'}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${row.id}-steps`} className="bg-zinc-50 print:bg-white">
                        <td colSpan={8} className="px-4 py-0">
                          <div className="my-2 rounded border border-zinc-200 overflow-hidden">
                            <StepList steps={row.steps} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
