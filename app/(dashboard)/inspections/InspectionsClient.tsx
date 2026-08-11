'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import QRScanner from '@/components/QRScanner'
import HelpText from '@/components/HelpText'

interface Compartment {
  id: string
  compartment_code: string
  compartment_name: string | null
  sort_order: number
  item_count: number
  apparatusId: string
}

interface ActiveSession {
  session_id: string
  done: number
  total: number
  completedCompartmentIds: Set<string>
}

interface Apparatus {
  id: string
  unit_number: string
  apparatus_name: string | null
  type_name: string | null
  station: { id: string; station_name: string; station_number: string | null } | null
  compartments: Compartment[]
  activeSession: ActiveSession | null
}

interface StationGroup {
  id: string | null
  label: string
  apparatus: Apparatus[]
}

export default function InspectionsClient({ apparatus }: { apparatus: Apparatus[] }) {
  const router = useRouter()
  const [scannerOpen, setScannerOpen] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleScan(raw: string) {
    setScannerOpen(false)
    try {
      const url = new URL(raw)
      const code = url.searchParams.get('code')
      const type = url.searchParams.get('type')
      if (code) {
        const params = new URLSearchParams({ code })
        if (type) params.set('type', type)
        router.push(`/scan?${params.toString()}`)
        return
      }
    } catch {
      // not a URL — fall through
    }
    router.push(`/scan?code=${encodeURIComponent(raw)}`)
  }

  // Group by station
  const stationMap = new Map<string | null, StationGroup>()
  for (const a of apparatus) {
    const key = a.station?.id ?? null
    if (!stationMap.has(key)) {
      stationMap.set(key, {
        id: key,
        label: a.station
          ? `Station ${a.station.station_number ? a.station.station_number + ' — ' : ''}${a.station.station_name}`
          : 'Unassigned',
        apparatus: [],
      })
    }
    stationMap.get(key)!.apparatus.push(a)
  }

  const stations = Array.from(stationMap.values()).sort((a, b) => {
    if (a.id === null) return 1
    if (b.id === null) return -1
    return a.label.localeCompare(b.label)
  })

  if (apparatus.length === 0) {
    return (
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 mb-6">Inspections</h1>
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          No apparatus found for this department.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Inspections</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Select a unit to begin an inspection or daily check</p>
        </div>
        <button
          onClick={() => setScannerOpen(true)}
          className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors flex items-center gap-1.5"
        >
          <span>📷</span> Scan QR
        </button>
      </div>

      <HelpText className="mb-4">
        Scan a compartment's QR code to jump straight to inspecting it, or pick a unit below and choose Vehicle
        Check or Inventory Inspection manually.
      </HelpText>

      {scannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-sm font-semibold text-zinc-900 mb-4">Scan Compartment QR Code</h2>
            <QRScanner
              onScan={handleScan}
              onClose={() => setScannerOpen(false)}
              hint="Point camera at a compartment QR label"
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-8">
        {stations.map(station => (
          <div key={station.id ?? 'unassigned'}>
            {/* Station header */}
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">{station.label}</h2>
              <div className="flex-1 h-px bg-zinc-200" />
            </div>

            {/* Apparatus cards */}
            <div className="flex flex-col gap-4">
              {station.apparatus.map(a => {
                const expanded = expandedIds.has(a.id)
                const session = a.activeSession
                return (
                  <div key={a.id} className="rounded-xl bg-white border border-zinc-200 overflow-hidden">

                    {/* Active session banner */}
                    {session && (
                      <div className="flex items-center gap-2 px-5 py-2 bg-yellow-50 border-b border-yellow-200">
                        <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse shrink-0" />
                        <p className="text-xs font-medium text-yellow-800">
                          Inspection in progress — {session.done} of {session.total} compartments done
                        </p>
                        <Link
                          href={`/inspections/apparatus/${a.id}`}
                          className="ml-auto text-xs font-semibold text-yellow-700 hover:text-yellow-900 underline shrink-0"
                        >
                          View →
                        </Link>
                      </div>
                    )}

                    {/* Apparatus header */}
                    <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <button
                        onClick={() => toggleExpand(a.id)}
                        className="flex items-center gap-2 text-left group min-w-0"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-lg font-bold text-zinc-900 group-hover:text-red-700 transition-colors">
                              {a.unit_number}
                            </span>
                            {a.apparatus_name && (
                              <span className="text-sm text-zinc-500">{a.apparatus_name}</span>
                            )}
                            {a.type_name && (
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">{a.type_name}</span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            {a.compartments.length} compartment{a.compartments.length !== 1 ? 's' : ''}
                            {' · '}
                            <span className="text-zinc-400">{expanded ? 'tap to collapse' : 'tap to expand'}</span>
                          </p>
                        </div>
                        <span className="text-zinc-400 text-sm ml-1 shrink-0">{expanded ? '▲' : '▼'}</span>
                      </button>

                      <div className="flex gap-2 flex-wrap">
                        <Link
                          href={`/equipment/${a.id}?from=/inspections`}
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors"
                        >
                          Equipment
                        </Link>
                        <Link
                          href={`/inspections/vehicle-check/${a.id}`}
                          className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          Vehicle Check
                        </Link>
                        <Link
                          href={`/inspections/apparatus/${a.id}`}
                          className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 transition-colors"
                        >
                          {session ? 'Resume Session' : 'Start Session'}
                        </Link>
                      </div>
                    </div>

                    {/* Compartments — only when expanded */}
                    {expanded && a.compartments.length > 0 && (
                      <div className="border-t border-zinc-100">
                        {a.compartments.map((c, i) => {
                          const isDone = session?.completedCompartmentIds.has(c.id) ?? false
                          return (
                            <div
                              key={c.id}
                              className={`flex flex-col sm:flex-row sm:items-center sm:justify-between px-5 py-3 gap-2 ${
                                i < a.compartments.length - 1 ? 'border-b border-zinc-100' : ''
                              } ${c.item_count === 0 ? 'opacity-40' : ''}`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-mono font-bold shrink-0 ${
                                  isDone
                                    ? 'bg-green-50 border border-green-200 text-green-700'
                                    : 'bg-red-50 border border-red-100 text-red-700'
                                }`}>
                                  {isDone ? '✓ ' : ''}{a.unit_number} - {c.compartment_code}
                                </span>
                                {c.compartment_name && (
                                  <span className="text-sm text-zinc-600 truncate">{c.compartment_name}</span>
                                )}
                                <span className="text-xs text-zinc-400 shrink-0">{c.item_count} item{c.item_count !== 1 ? 's' : ''}</span>
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                <Link
                                  href={`/equipment/${a.id}/${c.id}?from=/inspections`}
                                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors"
                                >
                                  View
                                </Link>
                                {c.item_count > 0 && (
                                  <>
                                    <Link
                                      href={`/inspections/run?apparatus_id=${a.id}&compartment_id=${c.id}`}
                                      className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 transition-colors"
                                    >
                                      Inspect
                                    </Link>
                                    <Link
                                      href={`/inspections/run?apparatus_id=${a.id}&compartment_id=${c.id}&mode=presence`}
                                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
                                    >
                                      Daily Check
                                    </Link>
                                  </>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
