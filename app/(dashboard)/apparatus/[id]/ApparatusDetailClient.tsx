'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateApparatus } from '@/app/actions/apparatus'

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

interface Compartment {
  id: string
  active: boolean
  notes: string | null
  compartment_name: {
    id: string
    compartment_code: string
    compartment_name: string | null
    sort_order: number | null
  } | null
}

interface CompartmentName {
  id: string
  compartment_code: string
  compartment_name: string | null
  sort_order: number | null
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
  out_of_service_date: string | null
  notes: string | null
  apparatus_type_id: string | null
  station_id: string | null
  apparatus_type: { id: string; name: string } | null
  station: { id: string; station_name: string; station_number: string | null } | null
}

export default function ApparatusDetailClient({
  apparatus,
  stations,
  apparatusTypes,
  compartments,
  compartmentNames,
  isAdmin,
  isOfficerOrAbove,
  departmentId,
}: {
  apparatus: Apparatus
  stations: Station[]
  apparatusTypes: ApparatusType[]
  compartments: Compartment[]
  compartmentNames: CompartmentName[]
  isAdmin: boolean
  isOfficerOrAbove: boolean
  departmentId: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setSuccess(null)
    setLoading(true)
    formData.set('apparatus_id', apparatus.id)
    const result = await updateApparatus(formData)
    if (result?.error) setError(result.error)
    else setSuccess('Apparatus updated successfully.')
    setLoading(false)
  }

  const typeName = apparatus.apparatus_type?.name ?? '—'
  const stationLabel = apparatus.station
    ? `Station ${apparatus.station.station_number} — ${apparatus.station.station_name}`
    : 'No station assigned'

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm text-zinc-500 hover:text-zinc-700">← Back</button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 truncate">
            Unit {apparatus.unit_number}{apparatus.apparatus_name ? ` — ${apparatus.apparatus_name}` : ''}
          </h1>
          <p className="text-sm text-zinc-500">{typeName} · {stationLabel}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
          apparatus.active ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
        }`}>
          {apparatus.active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Apparatus Info */}
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5 mb-5">
        <h2 className="text-base font-semibold text-zinc-900 mb-4">Apparatus Information</h2>
        {success && <Alert type="success" message={success} />}
        {error && <Alert type="error" message={error} />}

        {isOfficerOrAbove ? (
          <form action={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Apparatus Name</label>
                <input name="apparatus_name" type="text" defaultValue={apparatus.apparatus_name ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="sm:w-48">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Type</label>
                <select name="apparatus_type_id" defaultValue={apparatus.apparatus_type_id ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                  <option value="">Select type...</option>
                  {apparatusTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Station Assignment</label>
              <select name="station_id" defaultValue={apparatus.station_id ?? ''}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="">No station assigned</option>
                {stations.map(s => <option key={s.id} value={s.id}>Station {s.station_number} — {s.station_name}</option>)}
              </select>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Make</label>
                <input name="make" type="text" defaultValue={apparatus.make ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Model</label>
                <input name="model" type="text" defaultValue={apparatus.model ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="sm:w-24">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Year</label>
                <input name="model_year" type="number" defaultValue={apparatus.model_year ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">VIN</label>
                <input name="vin" type="text" defaultValue={apparatus.vin ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="sm:w-36">
                <label className="mb-1 block text-sm font-medium text-zinc-700">License Plate</label>
                <input name="license_plate" type="text" defaultValue={apparatus.license_plate ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">In Service Date</label>
                <input name="in_service_date" type="date" defaultValue={apparatus.in_service_date ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              {isAdmin && (
                <div className="sm:w-36">
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Status</label>
                  <select name="active" defaultValue={apparatus.active ? 'true' : 'false'}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              )}
            </div>

            <button type="submit" disabled={loading}
              className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <ReadField label="Unit Number" value={apparatus.unit_number} />
            <ReadField label="Type" value={typeName} />
            <ReadField label="Make" value={apparatus.make} />
            <ReadField label="Model" value={apparatus.model} />
            <ReadField label="Year" value={apparatus.model_year?.toString()} />
            <ReadField label="Station" value={stationLabel} />
            <ReadField label="VIN" value={apparatus.vin} />
            <ReadField label="License Plate" value={apparatus.license_plate} />
            <ReadField label="In Service" value={apparatus.in_service_date} />
          </div>
        )}
      </div>

      {/* Compartments */}
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5">
        <h2 className="text-base font-semibold text-zinc-900 mb-4">Compartments</h2>
        {compartments.length === 0 ? (
          <p className="text-sm text-zinc-400">No compartments assigned yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {[...compartments]
              .sort((a, b) => (a.compartment_name?.sort_order ?? 999) - (b.compartment_name?.sort_order ?? 999))
              .map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3">
                  <div>
                    <span className="text-sm font-semibold text-zinc-800">{c.compartment_name?.compartment_code ?? '—'}</span>
                    {c.compartment_name?.compartment_name && (
                      <span className="ml-2 text-sm text-zinc-500">{c.compartment_name.compartment_name}</span>
                    )}
                  </div>
                  <span className={`text-xs rounded-full px-2 py-0.5 ${
                    c.active ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-400'
                  }`}>
                    {c.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
          </div>
        )}
        {isOfficerOrAbove && (
          <p className="mt-4 text-xs text-zinc-400">
            {compartmentNames.length === 0
              ? 'No compartment names defined for this department yet.'
              : 'Full compartment management coming in next update.'}
          </p>
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
