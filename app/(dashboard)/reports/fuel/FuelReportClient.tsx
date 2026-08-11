'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import HelpText from '@/components/HelpText'

const inputCls = 'rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500'

const FUEL_COLORS: Record<string, string> = {
  diesel: 'bg-blue-100 text-blue-700',
  gasoline: 'bg-amber-100 text-amber-700',
  other: 'bg-zinc-100 text-zinc-600',
}
const FUEL_LABELS: Record<string, string> = { diesel: 'Diesel', gasoline: 'Gasoline', other: 'Other' }

type TankLedgerRow = {
  date: string
  type: 'delivery' | 'draw'
  gallons: number
  label: string
  cost_per_gallon: number | null
  total_cost: number | null
  running_balance: number
}

type TankReportEntry = {
  id: string
  name: string
  fuel_type: string
  capacity_gallons: number
  low_level_threshold_gallons: number
  current_gallons: number
  avg_cost_per_gallon: number | null
  daily_usage: number | null
  days_until_reorder: number | null
  ledger: TankLedgerRow[]
}

interface FuelEntry {
  id: string
  apparatus_id: string
  apparatus_label: string
  fuel_date: string
  gallons: number
  cost_per_gallon: number | null
  total_cost: number | null
  fuel_type: string
  fuel_system: string
  aux_description: string | null
  odometer: number | null
  engine_hours: number | null
  vendor: string | null
  notes: string | null
  logged_by_name: string | null
}

interface Apparatus { id: string; unit_number: string; apparatus_name: string | null }

export default function FuelReportClient({
  entries,
  apparatus,
  filters,
  tankReport = [],
}: {
  entries: FuelEntry[]
  apparatus: Apparatus[]
  filters: { from: string; to: string; apparatusId: string }
  tankReport?: TankReportEntry[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [expandedTankId, setExpandedTankId] = useState<string | null>(null)

  function applyFilter(key: string, value: string) {
    const params = new URLSearchParams()
    const next = { ...filters, [key]: value }
    if (next.from) params.set('from', next.from)
    if (next.to) params.set('to', next.to)
    if (next.apparatusId) params.set('apparatusId', next.apparatusId)
    router.push(`${pathname}?${params.toString()}`)
  }

  // Totals
  const totalGallons = entries.reduce((s, e) => s + e.gallons, 0)
  const totalCost = entries.reduce((s, e) => s + (e.total_cost ?? 0), 0)
  const avgPriceEntries = entries.filter(e => e.cost_per_gallon)
  const avgPrice = avgPriceEntries.length > 0
    ? avgPriceEntries.reduce((s, e) => s + e.cost_per_gallon!, 0) / avgPriceEntries.length
    : null

  // By apparatus
  const byApparatus = apparatus.map(a => {
    const aEntries = entries.filter(e => e.apparatus_id === a.id)
    return {
      label: `${a.unit_number}${a.apparatus_name ? ` — ${a.apparatus_name}` : ''}`,
      gallons: aEntries.reduce((s, e) => s + e.gallons, 0),
      cost: aEntries.reduce((s, e) => s + (e.total_cost ?? 0), 0),
      count: aEntries.length,
    }
  }).filter(a => a.count > 0).sort((a, b) => b.gallons - a.gallons)

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Fuel Report</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{entries.length} entries</p>
        </div>
        <button onClick={() => window.print()}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 print:hidden">
          Print
        </button>
      </div>

      <HelpText className="mb-4 print:hidden">
        Pulls every fuel entry logged from apparatus fuel logs department-wide. Filter by apparatus or date range to
        narrow it down, then Print for a paper copy.
      </HelpText>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6 print:hidden">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500">Start Date</label>
          <input type="date" value={filters.from} onChange={e => applyFilter('from', e.target.value)} className={inputCls} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500">End Date</label>
          <input type="date" value={filters.to} onChange={e => applyFilter('to', e.target.value)} className={inputCls} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500">Apparatus</label>
          <select value={filters.apparatusId} onChange={e => applyFilter('apparatusId', e.target.value)} className={inputCls}>
            <option value="">All Apparatus</option>
            {apparatus.map(a => (
              <option key={a.id} value={a.id}>{a.unit_number}{a.apparatus_name ? ` — ${a.apparatus_name}` : ''}</option>
            ))}
          </select>
        </div>
        {filters.apparatusId && (
          <div className="flex items-end">
            <button onClick={() => router.push(pathname)} className="text-sm text-red-600 hover:text-red-800 font-medium pb-2">Clear Filters</button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl bg-white border border-zinc-200 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-zinc-900">{totalGallons.toFixed(1)}</p>
          <p className="text-xs text-zinc-400 mt-0.5">Total Gallons</p>
        </div>
        <div className="rounded-xl bg-white border border-zinc-200 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-zinc-900">${totalCost.toFixed(2)}</p>
          <p className="text-xs text-zinc-400 mt-0.5">Total Cost</p>
        </div>
        <div className="rounded-xl bg-white border border-zinc-200 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-zinc-900">{avgPrice != null ? `$${avgPrice.toFixed(3)}` : '—'}</p>
          <p className="text-xs text-zinc-400 mt-0.5">Avg Price/Gal</p>
        </div>
      </div>

      {/* Tank storage section */}
      {tankReport.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-zinc-700 mb-3">On-Site Storage Tanks</h2>
          <div className="space-y-4">
            {tankReport.map(tank => {
              const levelPct = tank.capacity_gallons > 0
                ? Math.min(100, (tank.current_gallons / tank.capacity_gallons) * 100)
                : 0
              const threshPct = tank.capacity_gallons > 0
                ? Math.min(100, (tank.low_level_threshold_gallons / tank.capacity_gallons) * 100)
                : 0
              const isEmpty = tank.current_gallons <= 0
              const isLow = !isEmpty && tank.current_gallons <= tank.low_level_threshold_gallons
              const barColor = isEmpty ? 'bg-red-400' : isLow ? 'bg-amber-400' : 'bg-green-500'
              const isExpanded = expandedTankId === tank.id

              return (
                <div key={tank.id} className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
                  {/* Tank header */}
                  <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-100">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-zinc-900">{tank.name}</span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${FUEL_COLORS[tank.fuel_type]}`}>
                          {FUEL_LABELS[tank.fuel_type]}
                        </span>
                        {isEmpty && (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Empty</span>
                        )}
                        {isLow && (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Low Fuel</span>
                        )}
                      </div>
                      <div className="text-right text-xs text-zinc-500 shrink-0">
                        <span className={`text-sm font-bold ${isEmpty ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-zinc-900'}`}>
                          {tank.current_gallons.toFixed(1)} gal
                        </span>
                        <span className="text-zinc-400"> / {tank.capacity_gallons.toLocaleString()} ({levelPct.toFixed(0)}%)</span>
                      </div>
                    </div>

                    {/* Level bar */}
                    <div className="relative mb-2">
                      <div className="h-2.5 rounded-full bg-zinc-200 overflow-hidden">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${levelPct}%` }} />
                      </div>
                      {tank.low_level_threshold_gallons > 0 && (
                        <div
                          className="absolute top-0 h-2.5 w-0.5 bg-zinc-500 rounded"
                          style={{ left: `${threshPct}%` }}
                          title={`Alert: ${tank.low_level_threshold_gallons} gal`}
                        />
                      )}
                    </div>

                    {/* Stats row */}
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500 mt-2">
                      {tank.avg_cost_per_gallon != null && (
                        <span>Avg cost: <strong className="text-zinc-700">${tank.avg_cost_per_gallon.toFixed(3)}/gal</strong></span>
                      )}
                      {tank.daily_usage != null && (
                        <span>Usage: <strong className="text-zinc-700">{tank.daily_usage.toFixed(1)} gal/day</strong> <span className="text-zinc-400">(90d avg)</span></span>
                      )}
                      {tank.days_until_reorder != null && (
                        <span>~<strong className="text-zinc-700">{tank.days_until_reorder} days</strong> until alert level</span>
                      )}
                      {tank.daily_usage == null && (
                        <span className="text-zinc-400 italic">No draw data in last 90 days</span>
                      )}
                    </div>
                  </div>

                  {/* Ledger toggle */}
                  <button
                    onClick={() => setExpandedTankId(isExpanded ? null : tank.id)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors print:hidden"
                  >
                    <span>{isExpanded ? 'Hide' : 'Show'} Ledger ({tank.ledger.length} {tank.ledger.length === 1 ? 'entry' : 'entries'} in range)</span>
                    <span className="text-zinc-400">{isExpanded ? '▲' : '▼'}</span>
                  </button>

                  {/* Ledger rows */}
                  {isExpanded && (
                    tank.ledger.length === 0 ? (
                      <div className="px-4 py-6 text-center text-xs text-zinc-400">
                        No transactions in the selected date range.
                      </div>
                    ) : (
                      <div className="divide-y divide-zinc-100">
                        {/* Header */}
                        <div className="grid grid-cols-[90px_1fr_80px_90px] gap-3 px-4 py-1.5 bg-zinc-50 text-xs font-medium text-zinc-400 border-t border-zinc-100">
                          <span>Date</span>
                          <span>Description</span>
                          <span className="text-right">Gallons</span>
                          <span className="text-right">Balance</span>
                        </div>
                        {tank.ledger.map((row, i) => (
                          <div key={i} className="grid grid-cols-[90px_1fr_80px_90px] gap-3 px-4 py-2.5 items-start">
                            <span className="text-xs text-zinc-400">{row.date}</span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-xs ${row.type === 'delivery' ? 'text-green-700' : 'text-zinc-500'}`}>
                                  {row.type === 'delivery' ? '▲ Delivery' : '▼ Fill-up'}
                                </span>
                              </div>
                              <div className="flex gap-2 mt-0.5 text-xs text-zinc-400">
                                <span className="truncate">{row.label}</span>
                                {row.cost_per_gallon != null && <span>${row.cost_per_gallon.toFixed(3)}/gal</span>}
                                {row.total_cost != null && <span>${row.total_cost.toFixed(2)}</span>}
                              </div>
                            </div>
                            <span className={`text-xs font-semibold text-right ${row.type === 'delivery' ? 'text-green-700' : 'text-red-600'}`}>
                              {row.type === 'delivery' ? '+' : '−'}{row.gallons.toFixed(1)}
                            </span>
                            <span className="text-xs text-zinc-600 text-right">{row.running_balance.toFixed(1)} gal</span>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* By apparatus */}
      {byApparatus.length > 1 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-zinc-700 mb-2">By Apparatus</h2>
          <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden divide-y divide-zinc-100">
            {byApparatus.map(a => (
              <div key={a.label} className="flex items-center justify-between px-4 py-3">
                <p className="text-sm font-medium text-zinc-900">{a.label}</p>
                <div className="flex gap-6 text-sm text-zinc-600">
                  <span>{a.gallons.toFixed(1)} gal</span>
                  {a.cost > 0 && <span>${a.cost.toFixed(2)}</span>}
                  <span className="text-zinc-400">{a.count} fill{a.count !== 1 ? 's' : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail table */}
      <h2 className="text-sm font-semibold text-zinc-700 mb-2">All Entries</h2>
      {entries.length === 0 ? (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          No fuel entries found for the selected filters.
        </div>
      ) : (
        <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden divide-y divide-zinc-100">
          {entries.map(entry => (
            <div key={entry.id} className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-zinc-900">
                    {new Date(entry.fuel_date + 'T12:00:00').toLocaleDateString()}
                  </span>
                  <span className="text-xs rounded-full bg-zinc-100 text-zinc-600 px-2 py-0.5">{entry.apparatus_label}</span>
                  <span className={`text-xs rounded-full px-2 py-0.5 ${entry.fuel_type === 'diesel' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                    {entry.fuel_type}
                  </span>
                  {entry.fuel_system === 'auxiliary' && (
                    <span className="text-xs rounded-full bg-purple-100 text-purple-700 px-2 py-0.5">
                      Aux{entry.aux_description ? ` — ${entry.aux_description}` : ''}
                    </span>
                  )}
                </div>
                <div className="flex gap-4 mt-0.5 text-xs text-zinc-500 flex-wrap">
                  {entry.vendor && <span>{entry.vendor}</span>}
                  {entry.odometer && <span>{entry.odometer.toLocaleString()} mi</span>}
                  {entry.engine_hours && <span>{entry.engine_hours} hrs</span>}
                  {entry.logged_by_name && <span>by {entry.logged_by_name}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-zinc-900">{entry.gallons.toFixed(3)} gal</p>
                {entry.total_cost && <p className="text-sm text-zinc-700">${entry.total_cost.toFixed(2)}</p>}
                {entry.cost_per_gallon && <p className="text-xs text-zinc-400">${entry.cost_per_gallon.toFixed(3)}/gal</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
