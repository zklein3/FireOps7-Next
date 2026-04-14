'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createStation } from '@/app/actions/stations'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY'
]

interface Station {
  id: string
  station_number: string | null
  station_name: string
  address_line_1: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  active: boolean
  notes: string | null
}

export default function StationsListClient({
  stations,
  apparatusCountMap,
  personnelCount,
  isAdmin,
  departmentId,
}: {
  stations: Station[]
  apparatusCountMap: Record<string, number>
  personnelCount: number
  isAdmin: boolean
  departmentId: string
}) {
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const filtered = showInactive ? stations : stations.filter(s => s.active)

  async function handleCreate(formData: FormData) {
    setError(null)
    setLoading(true)
    const result = await createStation(formData)
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
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Stations</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {filtered.length} station{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <button
                onClick={() => setShowInactive(!showInactive)}
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors border ${
                  showInactive ? 'bg-zinc-600 text-white border-zinc-600' : 'bg-white text-zinc-400 border-zinc-200'
                }`}
              >
                {showInactive ? 'Active Only' : 'Show All'}
              </button>
              <button
                onClick={() => { setShowForm(!showForm); setError(null) }}
                className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
              >
                {showForm ? 'Cancel' : '+ Add'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Add Station Form */}
      {showForm && isAdmin && (
        <div className="mb-6 rounded-xl bg-white p-5 shadow-sm border border-zinc-200">
          <h2 className="text-base font-semibold text-zinc-900 mb-4">Add Station</h2>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>
          )}
          <form action={handleCreate} className="flex flex-col gap-4">
            <div className="flex gap-3">
              <div className="w-28">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Station #</label>
                <input name="station_number" type="text"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  placeholder="2" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Station Name <span className="text-red-500">*</span></label>
                <input name="station_name" type="text" required
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  placeholder="Station 2 / East Side" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Address</label>
              <input name="address_line_1" type="text"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="123 Main St" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Address Line 2</label>
              <input name="address_line_2" type="text"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="Optional" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">City</label>
                <input name="city" type="text"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="w-24">
                <label className="mb-1 block text-sm font-medium text-zinc-700">State</label>
                <select name="state"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                  <option value="">—</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="w-28">
                <label className="mb-1 block text-sm font-medium text-zinc-700">ZIP</label>
                <input name="postal_code" type="text" maxLength={10}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Notes</label>
              <input name="notes" type="text"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
              {loading ? 'Adding...' : 'Add Station'}
            </button>
          </form>
        </div>
      )}

      {/* Station Cards */}
      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          No stations found.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(station => {
            const apparatusCount = apparatusCountMap[station.id] ?? 0
            const address = [station.address_line_1, station.city, station.state, station.postal_code]
              .filter(Boolean).join(', ')

            return (
              <Link
                key={station.id}
                href={`/stations/${station.id}`}
                className={`rounded-xl bg-white border shadow-sm p-5 hover:border-red-300 hover:shadow-md transition-all group ${
                  station.active ? 'border-zinc-200' : 'border-zinc-100 opacity-60'
                }`}
              >
                {/* Station number + status */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-xs font-medium text-red-600 mb-0.5">
                      {station.station_number ? `Station ${station.station_number}` : 'Station'}
                    </p>
                    <h3 className="text-lg font-bold text-zinc-900 group-hover:text-red-700 transition-colors leading-tight">
                      {station.station_name}
                    </h3>
                  </div>
                  <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    station.active ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
                  }`}>
                    {station.active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Address */}
                {address && (
                  <p className="text-xs text-zinc-500 mb-3">{address}</p>
                )}

                {/* Stats */}
                <div className="flex gap-3 mb-3">
                  <div className="rounded-lg bg-zinc-50 px-3 py-2 flex-1 text-center">
                    <p className="text-xs text-zinc-500">Apparatus</p>
                    <p className="text-lg font-bold text-zinc-900">{apparatusCount}</p>
                  </div>
                </div>

                {station.notes && (
                  <p className="text-xs text-zinc-400 italic">{station.notes}</p>
                )}

                <div className="mt-3 pt-3 border-t border-zinc-100 flex justify-end">
                  <span className="text-xs font-semibold text-red-600 group-hover:text-red-800">
                    View Details →
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
