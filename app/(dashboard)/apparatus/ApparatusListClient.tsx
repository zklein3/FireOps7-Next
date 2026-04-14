'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createApparatus } from '@/app/actions/apparatus'

interface Station {
  id: string
  station_number: string | null
  station_name: string
}

interface ApparatusType {
  id: string
  name: string
  sort_order: number
}

interface Apparatus {
  id: string
  unit_number: string
  apparatus_name: string | null
  make: string | null
  model: string | null
  model_year: number | null
  vin: string | null
  license_plate: string | null
  active: boolean
  in_service_date: string | null
  apparatus_type_id: string | null
  station_id: string | null
  type_name: string | null
  station: { id: string; station_name: string; station_number: string | null } | null
}

export default function ApparatusListClient({
  apparatus,
  stations,
  apparatusTypes,
  isAdmin,
  isOfficerOrAbove,
  departmentId,
}: {
  apparatus: Apparatus[]
  stations: Station[]
  apparatusTypes: ApparatusType[]
  isAdmin: boolean
  isOfficerOrAbove: boolean
  departmentId: string
}) {
  const [selectedStation, setSelectedStation] = useState<string>(
    stations.length === 1 ? stations[0].id : 'all'
  )
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const filtered = apparatus.filter(a => {
    const stationMatch = selectedStation === 'all' || a.station_id === selectedStation
    const activeMatch = showInactive ? true : a.active
    return stationMatch && activeMatch
  })

  async function handleCreate(formData: FormData) {
    setError(null)
    setLoading(true)
    const result = await createApparatus(formData)
    if (result?.error) {
      setError(result.error)
    } else {
      setShowForm(false)
    }
    setLoading(false)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Apparatus</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{filtered.length} unit{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setShowForm(!showForm); setError(null) }}
            className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
          >
            {showForm ? 'Cancel' : '+ Add'}
          </button>
        )}
      </div>

      {/* Station Filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        {stations.length > 1 && (
          <>
            {isAdmin && (
              <button onClick={() => setSelectedStation('all')}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  selectedStation === 'all' ? 'bg-red-700 text-white' : 'bg-white border border-zinc-200 text-zinc-600 hover:border-red-300'
                }`}>
                All Stations
              </button>
            )}
            {stations.map(s => (
              <button key={s.id} onClick={() => setSelectedStation(s.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  selectedStation === s.id ? 'bg-red-700 text-white' : 'bg-white border border-zinc-200 text-zinc-600 hover:border-red-300'
                }`}>
                Station {s.station_number} — {s.station_name}
              </button>
            ))}
          </>
        )}
        {isAdmin && (
          <button onClick={() => setShowInactive(!showInactive)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ml-auto ${
              showInactive ? 'bg-zinc-600 text-white' : 'bg-white border border-zinc-200 text-zinc-400 hover:border-zinc-300'
            }`}>
            {showInactive ? 'Active Only' : 'Show Inactive'}
          </button>
        )}
      </div>

      {/* Add Form */}
      {showForm && isAdmin && (
        <div className="mb-6 rounded-xl bg-white p-5 shadow-sm border border-zinc-200">
          <h2 className="text-base font-semibold text-zinc-900 mb-4">Add Apparatus</h2>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>
          )}
          <form action={handleCreate} className="flex flex-col gap-4">
            <div className="flex gap-3">
              <div className="w-28">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Unit # <span className="text-red-500">*</span></label>
                <input name="unit_number" type="text" required placeholder="32"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Apparatus Name</label>
                <input name="apparatus_name" type="text" placeholder="Engine 32"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Type</label>
                <select name="apparatus_type_id"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                  <option value="">Select type...</option>
                  {apparatusTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Station</label>
                <select name="station_id"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                  <option value="">Select station...</option>
                  {stations.map(s => <option key={s.id} value={s.id}>Station {s.station_number} — {s.station_name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Make</label>
                <input name="make" type="text" placeholder="Rosenbauer"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Model</label>
                <input name="model" type="text"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="w-24">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Year</label>
                <input name="model_year" type="number" min="1900" max="2100"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">VIN</label>
                <input name="vin" type="text"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="w-32">
                <label className="mb-1 block text-sm font-medium text-zinc-700">License Plate</label>
                <input name="license_plate" type="text"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="w-36">
                <label className="mb-1 block text-sm font-medium text-zinc-700">In Service Date</label>
                <input name="in_service_date" type="date"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
              {loading ? 'Adding...' : 'Add Apparatus'}
            </button>
          </form>
        </div>
      )}

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          No apparatus found for this station.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(a => {
            const stationLabel = a.station
              ? `Station ${a.station.station_number} — ${a.station.station_name}`
              : 'No station assigned'

            return (
              <Link key={a.id} href={`/apparatus/${a.id}`}
                className={`rounded-xl bg-white border shadow-sm p-4 hover:border-red-300 hover:shadow-md transition-all group ${
                  a.active ? 'border-zinc-200' : 'border-zinc-100 opacity-60'
                }`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-3xl font-bold text-zinc-900 group-hover:text-red-700 transition-colors">
                      {a.unit_number}
                    </span>
                    {a.apparatus_name && (
                      <p className="text-sm font-medium text-zinc-700 mt-0.5">{a.apparatus_name}</p>
                    )}
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    a.active ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
                  }`}>
                    {a.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {a.type_name && <p className="text-xs font-medium text-red-600 mb-3">{a.type_name}</p>}
                <div className="flex flex-col gap-1 text-xs text-zinc-500">
                  {(a.make || a.model) && <p>{[a.make, a.model].filter(Boolean).join(' · ')}</p>}
                  {a.model_year && <p>{a.model_year}</p>}
                  <p className="text-zinc-400">{stationLabel}</p>
                </div>
                <div className="mt-3 pt-3 border-t border-zinc-100 flex justify-end">
                  <span className="text-xs font-semibold text-red-600 group-hover:text-red-800">View Details →</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
