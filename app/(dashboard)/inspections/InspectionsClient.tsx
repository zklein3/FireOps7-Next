'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Compartment {
  id: string
  compartment_code: string
  compartment_name: string | null
  sort_order: number
  item_count: number
}

interface Apparatus {
  id: string
  unit_number: string
  apparatus_name: string | null
  station: { station_name: string; station_number: string | null } | null
  compartments: Compartment[]
}

export default function InspectionsClient({ apparatus }: { apparatus: Apparatus[] }) {
  const router = useRouter()
  const [selectedApparatus, setSelectedApparatus] = useState<string | null>(null)

  const selected = apparatus.find(a => a.id === selectedApparatus)

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Inspections</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Select an apparatus and compartment to begin</p>
      </div>

      {/* Step 1 — Select Apparatus */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Step 1 — Select Apparatus</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {apparatus.map(a => (
            <button
              key={a.id}
              onClick={() => setSelectedApparatus(a.id === selectedApparatus ? null : a.id)}
              className={`rounded-xl border p-4 text-left transition-all ${
                selectedApparatus === a.id
                  ? 'border-red-500 bg-red-50 shadow-sm'
                  : 'border-zinc-200 bg-white hover:border-red-300 hover:shadow-sm'
              }`}
            >
              <p className="text-2xl font-bold text-zinc-900">{a.unit_number}</p>
              {a.apparatus_name && <p className="text-sm text-zinc-600">{a.apparatus_name}</p>}
              {a.station && <p className="text-xs text-zinc-400">Station {a.station.station_number} — {a.station.station_name}</p>}
              <p className="text-xs text-zinc-400 mt-1">{a.compartments.length} compartments</p>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2 — Select Compartment */}
      {selected && (
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            Step 2 — Select Compartment on Unit {selected.unit_number}
          </p>
          {selected.compartments.length === 0 ? (
            <div className="rounded-xl bg-white border border-zinc-200 px-5 py-8 text-center text-sm text-zinc-400">
              No compartments assigned to this apparatus.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {selected.compartments.map(c => (
                <button
                  key={c.id}
                  onClick={() => {
                    if (c.item_count > 0) {
                      router.push(`/inspections/run?apparatus_id=${selected.id}&compartment_id=${c.id}`)
                    }
                  }}
                  disabled={c.item_count === 0}
                  className={`flex items-center justify-between rounded-xl border px-5 py-4 text-left transition-all ${
                    c.item_count > 0
                      ? 'border-zinc-200 bg-white hover:border-red-300 hover:shadow-sm cursor-pointer'
                      : 'border-zinc-100 bg-zinc-50 cursor-not-allowed opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center rounded-lg bg-red-50 border border-red-100 px-2.5 py-1 text-sm font-mono font-bold text-red-700">
                      {c.compartment_code}
                    </span>
                    {c.compartment_name && <span className="text-sm text-zinc-700">{c.compartment_name}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">{c.item_count} item{c.item_count !== 1 ? 's' : ''}</span>
                    {c.item_count > 0 && <span className="text-xs font-semibold text-red-600">Inspect →</span>}
                    {c.item_count === 0 && <span className="text-xs text-zinc-400">No items</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {apparatus.length === 0 && (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          No apparatus found for this department.
        </div>
      )}
    </div>
  )
}
