'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { updateStation } from '@/app/actions/stations'

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
  address_line_2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  active: boolean
  notes: string | null
}

interface Apparatus {
  id: string
  unit_number: string
  apparatus_name: string | null
  active: boolean
  type_name: string | null
}

export default function StationDetailClient({
  station,
  apparatus,
  isAdmin,
}: {
  station: Station
  apparatus: Apparatus[]
  isAdmin: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setSuccess(null)
    setLoading(true)
    formData.set('station_id', station.id)
    const result = await updateStation(formData)
    if (result?.error) setError(result.error)
    else setSuccess('Station updated successfully.')
    setLoading(false)
  }

  const activeApparatus = apparatus.filter(a => a.active)
  const inactiveApparatus = apparatus.filter(a => !a.active)

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm text-zinc-500 hover:text-zinc-700">← Back</button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-red-600">
            {station.station_number ? `Station ${station.station_number}` : 'Station'}
          </p>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 truncate">{station.station_name}</h1>
        </div>
        <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
          station.active ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
        }`}>
          {station.active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Station Info */}
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5 mb-5">
        <h2 className="text-base font-semibold text-zinc-900 mb-4">Station Information</h2>
        {success && <Alert type="success" message={success} />}
        {error && <Alert type="error" message={error} />}

        {isAdmin ? (
          <form action={handleSubmit} className="flex flex-col gap-4">
            <div className="flex gap-3">
              <div className="w-28">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Station #</label>
                <input name="station_number" type="text" defaultValue={station.station_number ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Station Name <span className="text-red-500">*</span></label>
                <input name="station_name" type="text" required defaultValue={station.station_name}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Address Line 1</label>
              <input name="address_line_1" type="text" defaultValue={station.address_line_1 ?? ''}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="123 Main St" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Address Line 2</label>
              <input name="address_line_2" type="text" defaultValue={station.address_line_2 ?? ''}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">City</label>
                <input name="city" type="text" defaultValue={station.city ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="w-24">
                <label className="mb-1 block text-sm font-medium text-zinc-700">State</label>
                <select name="state" defaultValue={station.state ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                  <option value="">—</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="w-28">
                <label className="mb-1 block text-sm font-medium text-zinc-700">ZIP</label>
                <input name="postal_code" type="text" maxLength={10} defaultValue={station.postal_code ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Notes</label>
              <input name="notes" type="text" defaultValue={station.notes ?? ''}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Status</label>
              <select name="active" defaultValue={station.active ? 'true' : 'false'}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <button type="submit" disabled={loading}
              className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <ReadField label="Station Number" value={station.station_number} />
            <ReadField label="Station Name" value={station.station_name} />
            <ReadField label="Address" value={[station.address_line_1, station.address_line_2].filter(Boolean).join(', ')} />
            <ReadField label="City / State / ZIP" value={[station.city, station.state, station.postal_code].filter(Boolean).join(', ')} />
            {station.notes && <ReadField label="Notes" value={station.notes} />}
          </div>
        )}
      </div>

      {/* Assigned Apparatus */}
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-zinc-900">
            Apparatus ({activeApparatus.length} active)
          </h2>
          <Link href="/apparatus" className="text-xs font-semibold text-red-600 hover:text-red-800">
            Manage Apparatus →
          </Link>
        </div>

        {apparatus.length === 0 ? (
          <p className="text-sm text-zinc-400">No apparatus assigned to this station.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {activeApparatus.map(a => (
              <Link key={a.id} href={`/apparatus/${a.id}`}
                className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 hover:border-red-200 hover:bg-red-50 transition-colors group">
                <div>
                  <span className="text-sm font-bold text-zinc-900 group-hover:text-red-700">
                    Unit {a.unit_number}
                  </span>
                  {a.apparatus_name && (
                    <span className="ml-2 text-sm text-zinc-500">{a.apparatus_name}</span>
                  )}
                </div>
                <span className="text-xs text-zinc-400">{a.type_name ?? '—'}</span>
              </Link>
            ))}
            {inactiveApparatus.length > 0 && (
              <p className="text-xs text-zinc-400 mt-1">{inactiveApparatus.length} inactive apparatus not shown</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ReadField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-zinc-900">{value || '—'}</p>
    </div>
  )
}

function Alert({ type, message }: { type: 'success' | 'error'; message: string }) {
  return (
    <div className={`mb-4 rounded-lg px-4 py-3 text-sm border ${
      type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
    }`}>
      {message}
    </div>
  )
}
