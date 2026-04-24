'use client'

import { useState, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

interface ApparatusItem {
  id: string
  unit_number: string
  apparatus_name: string | null
}

interface InspLog {
  id: string
  apparatus_id: string | null
  asset_id: string
  template_id: string
  inspected_at: string
  overall_result: string
  inspected_by_name: string | null
}

interface StepLog {
  inspection_log_id: string
  template_step_id: string
  boolean_value: boolean | null
  numeric_value: number | null
  text_value: string | null
  step_text: string
  step_type: string
  fail_if_negative: boolean
}

interface PresenceLog {
  id: string
  apparatus_id: string
  item_id: string
  item_name: string
  inspected_at: string
  inspected_by_name: string | null
  present: boolean
  actual_quantity: number | null
  location_standard_id: string | null
}

interface AssetInfo {
  id: string
  asset_tag: string | null
  item_id: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function stepResult(step: StepLog): { label: string; severity: 'pass' | 'warn' | 'fail' } {
  if (step.step_type === 'BOOLEAN') {
    if (step.boolean_value === true) return { label: 'Yes', severity: 'pass' }
    if (step.boolean_value === false) {
      return step.fail_if_negative
        ? { label: 'No — FAIL', severity: 'fail' }
        : { label: 'No', severity: 'warn' }
    }
    return { label: '—', severity: 'warn' }
  }
  if (step.step_type === 'NUMERIC') {
    const val = step.numeric_value
    return { label: val !== null ? String(val) : '—', severity: val !== null && val > 0 ? 'pass' : 'warn' }
  }
  if (step.step_type === 'TEXT' || step.step_type === 'LONG_TEXT') {
    return { label: step.text_value ?? '—', severity: 'pass' }
  }
  return { label: '—', severity: 'pass' }
}

const severityClass: Record<string, string> = {
  pass: 'bg-green-100 text-green-700',
  warn: 'bg-amber-100 text-amber-700',
  fail: 'bg-red-100 text-red-700',
}

export default function InventoryReportClient({
  apparatusList, inspLogs, allStepLogs, presenceLogs,
  assetMap, assetItemMap, selectedApparatusId, dateFrom, dateTo,
}: {
  apparatusList: ApparatusItem[]
  inspLogs: InspLog[]
  allStepLogs: StepLog[]
  presenceLogs: PresenceLog[]
  assetMap: Record<string, AssetInfo>
  assetItemMap: Record<string, string>
  selectedApparatusId: string | null
  dateFrom: string
  dateTo: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const printRef = useRef<HTMLDivElement>(null)

  const [fromVal, setFromVal] = useState(dateFrom)
  const [toVal, setToVal] = useState(dateTo)
  const [printLog, setPrintLog] = useState<InspLog | null>(null)

  function applyFilters(apparatusId?: string | null) {
    const params = new URLSearchParams()
    if (fromVal) params.set('from', fromVal)
    if (toVal) params.set('to', toVal)
    const aid = apparatusId !== undefined ? apparatusId : selectedApparatusId
    if (aid) params.set('apparatusId', aid)
    router.push(`${pathname}?${params.toString()}`)
  }

  function selectApparatus(id: string) {
    const params = new URLSearchParams()
    if (fromVal) params.set('from', fromVal)
    if (toVal) params.set('to', toVal)
    params.set('apparatusId', id)
    router.push(`${pathname}?${params.toString()}`)
  }

  function clearApparatus() {
    const params = new URLSearchParams()
    if (fromVal) params.set('from', fromVal)
    if (toVal) params.set('to', toVal)
    router.push(`${pathname}?${params.toString()}`)
  }

  const selectedApparatus = apparatusList.find(a => a.id === selectedApparatusId) ?? null

  const filteredLogs = selectedApparatusId
    ? inspLogs.filter(l => l.apparatus_id === selectedApparatusId)
    : inspLogs

  const filteredPresence = selectedApparatusId
    ? presenceLogs.filter(p => p.apparatus_id === selectedApparatusId)
    : presenceLogs

  function stepsForLog(logId: string) {
    return allStepLogs.filter(s => s.inspection_log_id === logId)
  }

  function isFlaggedStep(step: StepLog): boolean {
    if (step.step_type === 'BOOLEAN' && step.boolean_value === false) return true
    if (step.step_type === 'NUMERIC' && (step.numeric_value === 0 || step.numeric_value === null)) return true
    return false
  }

  function apparatusStats(appId: string) {
    const logs = inspLogs.filter(l => l.apparatus_id === appId)
    const logIdSet = new Set(logs.map(l => l.id))
    const flagCount =
      allStepLogs.filter(s => logIdSet.has(s.inspection_log_id) && isFlaggedStep(s)).length +
      presenceLogs.filter(p => p.apparatus_id === appId && (!p.present || p.actual_quantity === 0)).length
    return { inspectionCount: logs.length, flagCount }
  }

  function handlePrint(log: InspLog) {
    setPrintLog(log)
    setTimeout(() => window.print(), 100)
  }

  const printSteps = printLog ? stepsForLog(printLog.id) : []
  const printPresence = printLog
    ? presenceLogs.filter(p =>
        p.apparatus_id === printLog.apparatus_id &&
        p.inspected_at === printLog.inspected_at &&
        p.inspected_by_name === printLog.inspected_by_name
      )
    : []

  return (
    <div className="max-w-4xl mx-auto">
      {/* Print overlay */}
      {printLog && (
        <div ref={printRef} className="hidden print:block print-content">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-zinc-900">Inventory Inspection Report</h1>
            <p className="text-sm text-zinc-600 mt-1">
              {apparatusList.find(a => a.id === printLog.apparatus_id)?.unit_number ?? '—'}
              {' · '}{formatDate(printLog.inspected_at)}
            </p>
            <p className="text-sm text-zinc-600">Inspector: {printLog.inspected_by_name ?? '—'}</p>
            <p className="text-sm font-semibold mt-1">
              Overall: <span className={printLog.overall_result === 'FAIL' ? 'text-red-600' : 'text-green-600'}>{printLog.overall_result}</span>
            </p>
          </div>

          {printSteps.length > 0 && (
            <div className="mb-6">
              <h2 className="text-base font-semibold text-zinc-800 mb-2">
                {assetItemMap[assetMap[printLog.asset_id]?.item_id ?? ''] ?? 'Asset'} — {assetMap[printLog.asset_id]?.asset_tag ?? '—'}
              </h2>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-zinc-300">
                    <th className="text-left py-1 pr-4 font-semibold text-zinc-700">Step</th>
                    <th className="text-left py-1 font-semibold text-zinc-700">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {printSteps.map(sl => {
                    const r = stepResult(sl)
                    return (
                      <tr key={sl.template_step_id} className="border-b border-zinc-100">
                        <td className="py-1 pr-4 text-zinc-800">{sl.step_text}</td>
                        <td className={`py-1 font-medium ${r.severity === 'fail' ? 'text-red-600' : r.severity === 'warn' ? 'text-amber-600' : 'text-green-600'}`}>
                          {r.label}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {printPresence.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-zinc-800 mb-2">Presence Checks</h2>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-zinc-300">
                    <th className="text-left py-1 pr-4 font-semibold text-zinc-700">Item</th>
                    <th className="text-left py-1 font-semibold text-zinc-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {printPresence.map(p => (
                    <tr key={p.id} className="border-b border-zinc-100">
                      <td className="py-1 pr-4 text-zinc-800">{p.item_name}</td>
                      <td className={`py-1 font-medium ${!p.present ? 'text-red-600' : 'text-green-600'}`}>
                        {!p.present ? 'Not present' : `Present · Qty: ${p.actual_quantity ?? '—'}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Screen content */}
      <div className="print:hidden">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900">Inventory Reports</h1>
          <p className="text-sm text-zinc-500 mt-1">All apparatus inspections and presence checks</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-zinc-200 p-4 mb-6 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">From</label>
            <input
              type="date"
              value={fromVal}
              onChange={e => setFromVal(e.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">To</label>
            <input
              type="date"
              value={toVal}
              onChange={e => setToVal(e.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => applyFilters()}
              className="rounded-lg bg-red-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-600 transition-colors"
            >
              Apply
            </button>
            <button
              onClick={() => { setFromVal(''); setToVal(''); applyFilters(null) }}
              className="rounded-lg border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              All time
            </button>
          </div>
        </div>

        {/* Back navigation */}
        {selectedApparatus && (
          <div className="mb-4 flex items-center gap-4">
            <Link
              href={`/apparatus/${selectedApparatus.id}`}
              className="text-sm text-zinc-500 hover:text-zinc-700"
            >
              ← Back to {selectedApparatus.unit_number}
            </Link>
            <button
              onClick={clearApparatus}
              className="text-sm text-zinc-400 hover:text-zinc-600"
            >
              All apparatus
            </button>
          </div>
        )}
        {selectedApparatus && (
          <h2 className="text-lg font-semibold text-zinc-800 mb-4">
            {selectedApparatus.unit_number}
            {selectedApparatus.apparatus_name && ` — ${selectedApparatus.apparatus_name}`}
          </h2>
        )}

        {/* Apparatus card list */}
        {!selectedApparatus && (
          <div className="flex flex-col gap-3">
            {apparatusList.length === 0 && (
              <p className="text-sm text-zinc-500">No apparatus found.</p>
            )}
            {apparatusList.map(app => {
              const { inspectionCount, flagCount } = apparatusStats(app.id)
              return (
                <button
                  key={app.id}
                  onClick={() => selectApparatus(app.id)}
                  className="w-full text-left bg-white rounded-xl border border-zinc-200 px-5 py-4 hover:border-red-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-zinc-900">{app.unit_number}</p>
                      {app.apparatus_name && <p className="text-xs text-zinc-500 mt-0.5">{app.apparatus_name}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-zinc-600">{inspectionCount} inspection{inspectionCount !== 1 ? 's' : ''}</p>
                      {flagCount > 0
                        ? <p className="text-sm font-semibold text-red-600">{flagCount} item{flagCount !== 1 ? 's' : ''} flagged</p>
                        : <p className="text-sm text-green-600">{inspectionCount > 0 ? 'No flags' : 'No records'}</p>
                      }
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Selected apparatus — full inspection detail */}
        {selectedApparatus && (
          <div className="flex flex-col gap-4">
            {filteredLogs.length === 0 && filteredPresence.length === 0 && (
              <div className="bg-white rounded-xl border border-zinc-200 px-5 py-8 text-center">
                <p className="text-sm text-zinc-500">No inspections found for this apparatus in the selected date range.</p>
              </div>
            )}

            {/* Asset inspection logs */}
            {filteredLogs.map(log => {
              const steps = stepsForLog(log.id)
              const asset = assetMap[log.asset_id]
              const itemName = asset ? assetItemMap[asset.item_id] : null
              const flaggedCount = steps.filter(isFlaggedStep).length

              return (
                <div key={log.id} className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
                  {/* Log header */}
                  <div className="px-5 py-4 flex items-start justify-between border-b border-zinc-100">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">
                        {itemName ?? 'Inspection'} — {asset?.asset_tag ?? '—'}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">{formatDate(log.inspected_at)}</p>
                      <p className="text-xs text-zinc-500">Inspector: {log.inspected_by_name ?? '—'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {flaggedCount > 0 && (
                        <span className="text-xs text-red-600 font-medium">{flaggedCount} flag{flaggedCount !== 1 ? 's' : ''}</span>
                      )}
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        log.overall_result === 'FAIL'
                          ? 'bg-red-100 text-red-700'
                          : log.overall_result === 'PASS'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-zinc-100 text-zinc-600'
                      }`}>
                        {log.overall_result}
                      </span>
                      <button
                        onClick={() => handlePrint(log)}
                        className="text-xs text-red-700 hover:underline"
                      >
                        Print
                      </button>
                    </div>
                  </div>

                  {/* All steps */}
                  {steps.length > 0 ? (
                    <div className="divide-y divide-zinc-100">
                      {steps.map(step => {
                        const r = stepResult(step)
                        return (
                          <div key={step.template_step_id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-sm text-zinc-700">{step.step_text}</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${severityClass[r.severity]}`}>
                              {r.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="px-5 py-3">
                      <p className="text-sm text-zinc-400">No step data recorded.</p>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Presence checks */}
            {filteredPresence.length > 0 && (
              <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-100">
                  <p className="text-sm font-semibold text-zinc-900">Presence Checks</p>
                  <p className="text-xs text-zinc-500 mt-0.5">All items checked for presence</p>
                </div>
                <div className="divide-y divide-zinc-100">
                  {filteredPresence.map(p => {
                    const isMissing = !p.present || p.actual_quantity === 0
                    return (
                      <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                        <div>
                          <span className="text-sm font-medium text-zinc-800">{p.item_name}</span>
                          <span className="text-xs text-zinc-400 ml-2">
                            {formatDate(p.inspected_at)} · {p.inspected_by_name ?? '—'}
                          </span>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                          isMissing ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {!p.present
                            ? 'Not present'
                            : p.actual_quantity !== null
                            ? `Present · Qty ${p.actual_quantity}`
                            : 'Present'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .print-content, .print-content * { visibility: visible; }
          .print-content { position: absolute; left: 0; top: 0; width: 100%; padding: 2rem; }
        }
      `}</style>
    </div>
  )
}
