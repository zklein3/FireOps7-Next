'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createStation, updateStation } from '@/app/actions/stations'
import HelpPrompt from './HelpPrompt'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
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

function AddressFields({ prefix, defaults }: { prefix?: string; defaults?: Partial<Station> }) {
  return (
    <>
      <input
        name="address_line_1"
        type="text"
        placeholder="Street address"
        defaultValue={defaults?.address_line_1 ?? ''}
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
      />
      <div className="flex gap-2">
        <input
          name="city"
          type="text"
          placeholder="City"
          defaultValue={defaults?.city ?? ''}
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        />
        <select
          name="state"
          defaultValue={defaults?.state ?? ''}
          className="w-20 rounded-lg border border-zinc-300 px-2 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        >
          <option value="">—</option>
          {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          name="postal_code"
          type="text"
          placeholder="ZIP"
          maxLength={10}
          defaultValue={defaults?.postal_code ?? ''}
          className="w-24 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        />
      </div>
      <input
        name="notes"
        type="text"
        placeholder="Notes (optional)"
        defaultValue={defaults?.notes ?? ''}
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
      />
    </>
  )
}

export default function StationsStep({
  stations,
  departmentId,
  showHelp,
  helpResetKey,
}: {
  stations: Station[]
  departmentId: string
  showHelp: boolean
  helpResetKey: number
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleCreate(formData: FormData) {
    setError(null); setLoading(true)
    const result = await createStation(formData)
    if (result?.error) setError(result.error)
    else { setShowForm(false); router.refresh() }
    setLoading(false)
  }

  async function handleUpdate(formData: FormData) {
    setError(null); setLoading(true)
    const result = await updateStation(formData)
    if (result?.error) setError(result.error)
    else { setEditingId(null); router.refresh() }
    setLoading(false)
  }

  return (
    <div>
      <HelpPrompt id="stations" showHelp={showHelp} helpResetKey={helpResetKey}>
        Add each physical station location first. Apparatus gets assigned to a station, so stations need to exist first.
      </HelpPrompt>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">Stations</h2>
          <p className="text-sm text-zinc-500">{stations.filter(s => s.active).length} active</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setError(null) }}
          className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Station'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="mb-4 rounded-xl bg-white p-5 shadow-sm border border-zinc-200">
          <p className="text-sm font-semibold text-zinc-900 mb-4">New Station</p>
          <form action={handleCreate} className="flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="w-28">
                <label className="mb-1 block text-xs font-medium text-zinc-600">Station #</label>
                <input name="station_number" type="text" placeholder="1"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-zinc-600">Name <span className="text-red-500">*</span></label>
                <input name="station_name" type="text" required placeholder="Main Station"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <AddressFields />
            <button type="submit" disabled={loading}
              className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
              {loading ? 'Adding...' : 'Add Station'}
            </button>
          </form>
        </div>
      )}

      {/* Search */}
      {stations.length > 0 && (
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search stations..."
          className="w-full mb-4 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
      )}

      {/* Cards */}
      {(() => {
        const q = search.toLowerCase()
        const filtered = q ? stations.filter(s => s.station_name.toLowerCase().includes(q) || (s.city ?? '').toLowerCase().includes(q) || (s.address_line_1 ?? '').toLowerCase().includes(q)) : stations
        if (stations.length === 0) return (
          <div className="rounded-xl border-2 border-dashed border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-400">No stations yet — add your first station above.</div>
        )
        if (filtered.length === 0) return (
          <div className="rounded-xl border-2 border-dashed border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-400">No stations match "{search}".</div>
        )
        return (
        <div className="flex flex-col gap-3">
          {filtered.map(station => (
            <div key={station.id} className={`rounded-xl bg-white border shadow-sm ${
              station.active ? 'border-zinc-200' : 'border-zinc-100 opacity-60'
            }`}>
              {editingId === station.id ? (
                <div className="p-5">
                  <p className="text-sm font-semibold text-zinc-900 mb-4">Edit Station</p>
                  <form action={handleUpdate} className="flex flex-col gap-3">
                    <input type="hidden" name="station_id" value={station.id} />
                    <div className="flex gap-3">
                      <div className="w-28">
                        <label className="mb-1 block text-xs font-medium text-zinc-600">Station #</label>
                        <input name="station_number" type="text" defaultValue={station.station_number ?? ''}
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                      </div>
                      <div className="flex-1">
                        <label className="mb-1 block text-xs font-medium text-zinc-600">Name <span className="text-red-500">*</span></label>
                        <input name="station_name" type="text" required defaultValue={station.station_name}
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                      </div>
                    </div>
                    <AddressFields defaults={station} />
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-600">Status</span>
                      <select name="active" defaultValue={station.active ? 'true' : 'false'}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </select>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="submit" disabled={loading}
                        className="flex-1 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
                        {loading ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button type="button" onClick={() => setEditingId(null)}
                        className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors">
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {station.station_number && (
                        <span className="text-xs font-semibold text-red-600">Station {station.station_number}</span>
                      )}
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        station.active ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
                      }`}>
                        {station.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="font-semibold text-zinc-900">{station.station_name}</p>
                    {(station.address_line_1 || station.city) && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {[station.address_line_1, station.city, station.state, station.postal_code].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {station.notes && (
                      <p className="text-xs text-zinc-400 italic mt-0.5">{station.notes}</p>
                    )}
                  </div>
                  <button
                    onClick={() => { setEditingId(station.id); setShowForm(false); setError(null) }}
                    className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        )
      })()}
    </div>
  )
}
