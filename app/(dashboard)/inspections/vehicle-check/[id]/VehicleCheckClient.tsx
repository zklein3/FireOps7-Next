'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { submitVehicleCheck } from '@/app/actions/inspections'
import HelpText from '@/components/HelpText'

interface CheckItem {
  id: string
  label: string
  group_name: string
  sort_order: number
  has_amount_field: boolean
  requires_air_brakes: boolean
  active: boolean
  instructions?: string | null
}

function InstructionPanel({ text }: { text: string }) {
  const sections = text.split(/\n\n+/)
  return (
    <div className="mt-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 text-xs text-blue-900 space-y-1.5">
      {sections.map((section, i) => {
        const colonIdx = section.indexOf(':')
        if (colonIdx > 0 && colonIdx < 20 && !section.startsWith(' ')) {
          const label = section.slice(0, colonIdx)
          const body = section.slice(colonIdx + 1).trim()
          const labelStyle =
            label === 'Pass' ? 'text-green-700 font-semibold' :
            label === 'Fail' ? 'text-red-700 font-semibold' :
            'text-blue-800 font-semibold'
          return (
            <p key={i}><span className={labelStyle}>{label}:</span> {body}</p>
          )
        }
        return <p key={i}>{section}</p>
      })}
    </div>
  )
}

interface HistoryRecord {
  id: string
  inspected_at: string
  odometer: number | null
  engine_hours: number | null
  notes: string | null
  inspector_name: string
}

interface Apparatus {
  id: string
  unit_number: string
  apparatus_name: string | null
  type_name: string | null
  has_air_brakes: boolean
  has_engine_hours: boolean
}

type Result = 'ok' | 'issue' | 'na'

interface ItemState {
  result: Result | null
  amount_added: string
  notes: string
}

const GROUP_ORDER = ['Fluids', 'Mechanical', 'Lights', 'Communications', 'Emergency Equipment', 'Cleaning', 'Air Brakes']

function resultLabel(r: Result) {
  if (r === 'ok') return '✓ OK'
  if (r === 'issue') return '✗ Issue'
  return '— N/A'
}

function resultStyle(r: Result | null, selected: Result) {
  const active = r === selected
  if (selected === 'ok') return active
    ? 'bg-green-600 border-green-600 text-white'
    : 'border-zinc-300 text-zinc-500 hover:border-green-400 hover:text-green-600'
  if (selected === 'issue') return active
    ? 'bg-red-600 border-red-600 text-white'
    : 'border-zinc-300 text-zinc-500 hover:border-red-400 hover:text-red-600'
  return active
    ? 'bg-zinc-400 border-zinc-400 text-white'
    : 'border-zinc-300 text-zinc-400 hover:border-zinc-500 hover:text-zinc-500'
}

export default function VehicleCheckClient({
  apparatus,
  items,
  history,
  personnelId,
  departmentId,
  inspectorName,
  nextPath,
}: {
  apparatus: Apparatus
  items: CheckItem[]
  history: HistoryRecord[]
  personnelId: string
  departmentId: string
  inspectorName: string
  nextPath?: string
}) {
  const router = useRouter()
  const [itemState, setItemState] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(items.map(i => [i.id, { result: null, amount_added: '', notes: '' }]))
  )
  const [odometer, setOdometer] = useState('')
  const [engineHours, setEngineHours] = useState('')
  const [overallNotes, setOverallNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [expandedInstructions, setExpandedInstructions] = useState<Set<string>>(
    () => new Set(items.filter(i => i.instructions).map(i => i.id))
  )

  const visibleItems = useMemo(
    () => items.filter(i => i.active && (!i.requires_air_brakes || apparatus.has_air_brakes)),
    [items, apparatus.has_air_brakes]
  )

  const groups = useMemo(() => {
    const map = new Map<string, CheckItem[]>()
    for (const item of visibleItems) {
      if (!map.has(item.group_name)) map.set(item.group_name, [])
      map.get(item.group_name)!.push(item)
    }
    return GROUP_ORDER
      .filter(g => map.has(g))
      .map(g => ({ name: g, items: map.get(g)! }))
      .concat(
        Array.from(map.entries())
          .filter(([g]) => !GROUP_ORDER.includes(g))
          .map(([g, its]) => ({ name: g, items: its }))
      )
  }, [visibleItems])

  const totalItems = visibleItems.length
  const answeredItems = visibleItems.filter(i => itemState[i.id]?.result !== null).length
  const issueCount = visibleItems.filter(i => itemState[i.id]?.result === 'issue').length
  const allAnswered = answeredItems === totalItems

  function toggleInstructions(id: string) {
    setExpandedInstructions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function setResult(id: string, result: Result) {
    setItemState(prev => ({ ...prev, [id]: { ...prev[id], result } }))
  }

  function setAmountAdded(id: string, val: string) {
    setItemState(prev => ({ ...prev, [id]: { ...prev[id], amount_added: val } }))
  }

  function setItemNotes(id: string, val: string) {
    setItemState(prev => ({ ...prev, [id]: { ...prev[id], notes: val } }))
  }

  async function handleSubmit() {
    if (!allAnswered) {
      setError(`Please complete all ${totalItems} items before submitting.`)
      return
    }
    setSubmitting(true)
    setError(null)

    const results = visibleItems.map(i => ({
      item_id: i.id,
      result: itemState[i.id].result as Result,
      amount_added: itemState[i.id].amount_added || undefined,
      notes: itemState[i.id].notes || undefined,
    }))

    const res = await submitVehicleCheck({
      apparatus_id: apparatus.id,
      department_id: departmentId,
      personnel_id: personnelId,
      odometer: odometer ? parseInt(odometer) : null,
      engine_hours: engineHours ? parseFloat(engineHours) : null,
      notes: overallNotes || undefined,
      results,
    })

    setSubmitting(false)
    if (res.error) { setError(res.error); return }
    router.push(nextPath ?? `/inspections?checked=${apparatus.id}`)
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <Link href="/inspections" className="text-xs text-zinc-400 hover:text-zinc-600 mb-2 inline-block">
          ← Inspections
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Vehicle Check</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-sm font-medium text-zinc-700">{apparatus.unit_number}</span>
              {apparatus.apparatus_name && <span className="text-sm text-zinc-500">{apparatus.apparatus_name}</span>}
              {apparatus.type_name && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">{apparatus.type_name}</span>
              )}
              {apparatus.has_air_brakes && (
                <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs text-blue-700">Air Brakes</span>
              )}
            </div>
          </div>
          {history.length > 0 && (
            <button
              onClick={() => setShowHistory(v => !v)}
              className="shrink-0 text-xs text-zinc-500 hover:text-zinc-700 underline"
            >
              {showHistory ? 'Hide history' : 'View history'}
            </button>
          )}
        </div>

        <HelpText className="mt-3">
          Every item has instructions expanded by default — what to look for and what counts as pass or fail. This
          covers the truck itself; use "Inspect Inventory" separately for compartment equipment.
        </HelpText>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
            <span>{answeredItems} of {totalItems} items completed</span>
            {issueCount > 0 && (
              <span className="text-red-600 font-medium">{issueCount} issue{issueCount !== 1 ? 's' : ''} flagged</span>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-red-600 transition-all"
              style={{ width: totalItems > 0 ? `${(answeredItems / totalItems) * 100}%` : '0%' }}
            />
          </div>
        </div>
      </div>

      {/* History panel */}
      {showHistory && history.length > 0 && (
        <div className="mb-6 rounded-xl bg-white border border-zinc-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100">
            <h2 className="text-sm font-semibold text-zinc-900">Recent Vehicle Checks</h2>
          </div>
          <div className="divide-y divide-zinc-100">
            {history.map(h => (
              <div key={h.id} className="px-4 py-3 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-zinc-800">
                    {new Date(h.inspected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                    {' '}
                    <span className="text-zinc-500">
                      {new Date(h.inspected_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })}
                    </span>
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {h.inspector_name}
                    {h.odometer ? ` · ${h.odometer.toLocaleString()} mi` : ''}
                    {h.engine_hours ? ` · ${h.engine_hours} hrs` : ''}
                  </p>
                  {h.notes && <p className="text-xs text-zinc-500 mt-1">{h.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inspector info */}
      <div className="mb-4 rounded-xl bg-white border border-zinc-200 p-4 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <p className="text-xs text-zinc-500 mb-0.5">Inspector</p>
          <p className="text-sm font-medium text-zinc-800">{inspectorName}</p>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-0.5">Odometer (optional)</label>
          <input
            type="number"
            value={odometer}
            onChange={e => setOdometer(e.target.value)}
            placeholder="Current mileage"
            className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>
        {apparatus.has_engine_hours && (
          <div className="flex-1">
            <label className="block text-xs text-zinc-500 mb-0.5">Engine Hours (optional)</label>
            <input
              type="number"
              step="0.1"
              value={engineHours}
              onChange={e => setEngineHours(e.target.value)}
              placeholder="Current hours"
              className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mb-4 flex items-center gap-4 text-xs text-zinc-500">
        <span className="font-medium text-zinc-700">Mark each item:</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-green-500" /> OK / Full</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-red-500" /> Issue</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-zinc-400" /> N/A</span>
      </div>
      <p className="mb-4 text-xs text-zinc-400">Fluid items: if you added any, enter the amount in the field that appears.</p>

      {/* Checklist groups */}
      <div className="flex flex-col gap-5 mb-6">
        {groups.map(group => (
          <div key={group.name} className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{group.name}</h2>
            </div>
            <div className="divide-y divide-zinc-100">
              {group.items.map(item => {
                const state = itemState[item.id]
                const answered = state?.result !== null
                return (
                  <div
                    key={item.id}
                    className={`px-4 py-3 transition-colors ${answered && state.result === 'ok' ? 'bg-green-50/40' : answered && state.result === 'issue' ? 'bg-red-50/40' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-sm ${answered ? 'text-zinc-700 font-medium' : 'text-zinc-600'}`}>
                          {item.label}
                        </span>
                        {item.instructions && (
                          <button
                            type="button"
                            onClick={() => toggleInstructions(item.id)}
                            className="shrink-0 rounded-full w-4 h-4 bg-blue-100 text-blue-600 text-xs font-bold leading-none flex items-center justify-center hover:bg-blue-200 transition-colors"
                            title={expandedInstructions.has(item.id) ? 'Hide instructions' : 'Show instructions'}
                          >
                            {expandedInstructions.has(item.id) ? '▲' : '?'}
                          </button>
                        )}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {(['ok', 'issue', 'na'] as Result[]).map(r => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setResult(item.id, r)}
                            className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${resultStyle(state?.result ?? null, r)}`}
                          >
                            {resultLabel(r)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Instructions panel */}
                    {item.instructions && expandedInstructions.has(item.id) && (
                      <InstructionPanel text={item.instructions} />
                    )}

                    {/* Amount added — shown for fluid items when result is not null */}
                    {item.has_amount_field && state?.result !== null && (
                      <div className="mt-2">
                        <input
                          type="text"
                          value={state.amount_added}
                          onChange={e => setAmountAdded(item.id, e.target.value)}
                          placeholder="Amount added (leave blank if none)"
                          className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-800 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                        />
                      </div>
                    )}

                    {/* Notes — shown when result is 'issue' */}
                    {state?.result === 'issue' && (
                      <div className="mt-2">
                        <textarea
                          value={state.notes}
                          onChange={e => setItemNotes(item.id, e.target.value)}
                          placeholder="Describe the issue…"
                          rows={2}
                          className="w-full rounded-lg border border-red-300 px-3 py-1.5 text-xs text-zinc-800 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Overall notes */}
      <div className="mb-6 rounded-xl bg-white border border-zinc-200 p-4">
        <label className="block text-sm font-medium text-zinc-700 mb-1.5">Overall Notes (optional)</label>
        <textarea
          value={overallNotes}
          onChange={e => setOverallNotes(e.target.value)}
          placeholder="Any general observations about this vehicle…"
          rows={3}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !allAnswered}
          className="flex-1 rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Submitting…' : allAnswered ? 'Submit Vehicle Check' : `${totalItems - answeredItems} items remaining`}
        </button>

        {/* Inventory prompt */}
        <Link
          href={`/inspections/apparatus/${apparatus.id}`}
          className="flex-1 rounded-xl border-2 border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors text-center"
        >
          Do inventory on this vehicle?
        </Link>
      </div>

      <p className="mt-3 text-center text-xs text-zinc-400">
        The inventory check covers compartment contents — a separate process from this vehicle check.
      </p>
    </div>
  )
}
