'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createApparatus } from '@/app/actions/apparatus'
import HelpPrompt from './HelpPrompt'

interface Station { id: string; station_number: string | null; station_name: string }
interface ApparatusType { id: string; name: string; sort_order: number }
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

function ApparatusForm({
  stations,
  apparatusTypes,
  defaults,
  onSubmit,
  loading,
  submitLabel,
}: {
  stations: Station[]
  apparatusTypes: ApparatusType[]
  defaults?: Apparatus
  onSubmit: (fd: FormData) => Promise<void>
  loading: boolean
  submitLabel: string
}) {
  return (
    <form action={onSubmit} className="flex flex-col gap-3">
      {defaults && <input type="hidden" name="apparatus_id" value={defaults.id} />}

      <div className="flex gap-3">
        <div className="w-28">
          <label className="mb-1 block text-xs font-medium text-zinc-600">Unit # <span className="text-red-500">*</span></label>
          <input name="unit_number" type="text" required placeholder="32" defaultValue={defaults?.unit_number ?? ''}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-zinc-600">Apparatus Name</label>
          <input name="apparatus_name" type="text" placeholder="Engine 32" defaultValue={defaults?.apparatus_name ?? ''}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-zinc-600">Type</label>
          <select name="apparatus_type_id" defaultValue={defaults?.apparatus_type_id ?? ''}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
            <option value="">Select type...</option>
            {apparatusTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-zinc-600">Station</label>
          <select name="station_id" defaultValue={defaults?.station_id ?? ''}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
            <option value="">No station</option>
            {stations.map(s => (
              <option key={s.id} value={s.id}>
                {s.station_number ? `Station ${s.station_number} — ` : ''}{s.station_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-zinc-600">Make</label>
          <input name="make" type="text" placeholder="Rosenbauer" defaultValue={defaults?.make ?? ''}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-zinc-600">Model</label>
          <input name="model" type="text" defaultValue={defaults?.model ?? ''}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
        </div>
        <div className="w-24">
          <label className="mb-1 block text-xs font-medium text-zinc-600">Year</label>
          <input name="model_year" type="number" min="1900" max="2100" defaultValue={defaults?.model_year ?? ''}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-zinc-600">VIN</label>
          <input name="vin" type="text" defaultValue={defaults?.vin ?? ''}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
        </div>
        <div className="w-32">
          <label className="mb-1 block text-xs font-medium text-zinc-600">License Plate</label>
          <input name="license_plate" type="text" defaultValue={defaults?.license_plate ?? ''}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
        </div>
        <div className="w-36">
          <label className="mb-1 block text-xs font-medium text-zinc-600">In Service</label>
          <input name="in_service_date" type="date" defaultValue={defaults?.in_service_date ?? ''}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
        </div>
      </div>

      {defaults && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-600">Status</span>
          <select name="active" defaultValue={defaults.active ? 'true' : 'false'}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      )}

      <button type="submit" disabled={loading}
        className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
        {loading ? 'Saving...' : submitLabel}
      </button>
    </form>
  )
}

export default function ApparatusStep({
  apparatus,
  stations,
  apparatusTypes,
  departmentId,
  showHelp,
  helpResetKey,
}: {
  apparatus: Apparatus[]
  stations: Station[]
  apparatusTypes: ApparatusType[]
  departmentId: string
  showHelp: boolean
  helpResetKey: number
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const q = search.toLowerCase()
  const filteredApparatus = q ? apparatus.filter(a =>
    (a.apparatus_name ?? '').toLowerCase().includes(q) ||
    a.unit_number.toLowerCase().includes(q) ||
    (a.make ?? '').toLowerCase().includes(q) ||
    (a.model ?? '').toLowerCase().includes(q) ||
    (a.station?.station_name ?? '').toLowerCase().includes(q)
  ) : apparatus

  async function handleCreate(formData: FormData) {
    setError(null); setLoading(true)
    const result = await createApparatus(formData)
    if (result?.error) setError(result.error)
    else { setShowForm(false); router.refresh() }
    setLoading(false)
  }

  return (
    <div>
      <HelpPrompt id="apparatus" showHelp={showHelp} helpResetKey={helpResetKey}>
        Add each vehicle or unit and assign it to a station. You'll add compartments to each apparatus separately.
      </HelpPrompt>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">Apparatus</h2>
          <p className="text-sm text-zinc-500">{apparatus.filter(a => a.active).length} active</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(null) }}
          className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Apparatus'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="mb-4 rounded-xl bg-white p-5 shadow-sm border border-zinc-200">
          <p className="text-sm font-semibold text-zinc-900 mb-4">New Apparatus</p>
          <ApparatusForm
            stations={stations}
            apparatusTypes={apparatusTypes}
            onSubmit={handleCreate}
            loading={loading}
            submitLabel="Add Apparatus"
          />
        </div>
      )}

      {apparatus.length > 0 && (
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search apparatus..."
          className="w-full mb-4 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
      )}

      {/* Cards */}
      {apparatus.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-400">
          No apparatus yet — add your first unit above.
        </div>
      ) : filteredApparatus.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-400">No apparatus match "{search}".</div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredApparatus.map(a => (
            <div key={a.id} className={`rounded-xl bg-white border shadow-sm ${
              a.active ? 'border-zinc-200' : 'border-zinc-100 opacity-60'
            }`}>
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl font-bold text-zinc-900">{a.unit_number}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      a.active ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
                    }`}>
                      {a.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {a.apparatus_name && <p className="text-sm font-medium text-zinc-700">{a.apparatus_name}</p>}
                  {a.type_name && <p className="text-xs font-medium text-red-600">{a.type_name}</p>}
                  <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-zinc-500">
                    {(a.make || a.model) && <span>{[a.make, a.model].filter(Boolean).join(' ')}{a.model_year ? ` · ${a.model_year}` : ''}</span>}
                    <span className={a.station ? '' : 'text-yellow-600 font-medium'}>
                      {a.station
                        ? `${a.station.station_number ? `Stn ${a.station.station_number} — ` : ''}${a.station.station_name}`
                        : 'No station assigned'}
                    </span>
                  </div>
                </div>
                <Link
                  href={`/apparatus/${a.id}`}
                  className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
