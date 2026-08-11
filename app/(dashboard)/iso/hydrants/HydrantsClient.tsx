'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createHydrant, updateHydrant, addHydrantFlowTest, removeHydrant } from '@/app/actions/iso'
import HelpText from '@/components/HelpText'

const inputCls = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
const labelCls = "block text-xs font-medium text-zinc-700 mb-1"

const HYDRANT_TYPES = [
  { value: 'wet_barrel', label: 'Wet Barrel' },
  { value: 'dry_barrel', label: 'Dry Barrel' },
  { value: 'other', label: 'Other' },
]

type FlowTest = {
  id: string
  test_date: string
  tested_by_name: string | null
  static_pressure_psi: number
  residual_pressure_psi: number
  flow_gpm: number
  pitot_reading_psi: number | null
  nozzle_diameter_in: number | null
  notes: string | null
}

type Hydrant = {
  id: string
  hydrant_number: string
  location_description: string
  street_address: string | null
  lat: number | null
  lng: number | null
  owner: string | null
  hydrant_type: string | null
  main_size_in: number | null
  out_of_service: boolean
  notes: string | null
  tests: FlowTest[]
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function HydrantsClient({
  hydrants,
  isOfficerOrAbove,
}: {
  hydrants: Hydrant[]
  isOfficerOrAbove: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [showAddForm, setShowAddForm] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loggingTestId, setLoggingTestId] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setAddError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createHydrant(fd)
      if (result?.error) { setAddError(result.error); return }
      setShowAddForm(false)
      router.refresh()
    })
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>, hydrantId: string) {
    e.preventDefault()
    setEditError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('hydrant_id', hydrantId)
    startTransition(async () => {
      const result = await updateHydrant(fd)
      if (result?.error) { setEditError(result.error); return }
      setEditingId(null)
      router.refresh()
    })
  }

  async function handleLogTest(e: React.FormEvent<HTMLFormElement>, hydrantId: string) {
    e.preventDefault()
    setTestError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('hydrant_id', hydrantId)
    startTransition(async () => {
      const result = await addHydrantFlowTest(fd)
      if (result?.error) { setTestError(result.error); return }
      setLoggingTestId(null)
      router.refresh()
    })
  }

  const now = new Date()
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10)
  const outOfService = hydrants.filter(h => h.out_of_service).length
  const testedThisYear = hydrants.filter(h => h.tests[0] && h.tests[0].test_date >= oneYearAgo).length

  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-zinc-900">Hydrants</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{hydrants.length} total · {outOfService} out of service · {testedThisYear}/{hydrants.length} flow tested in past 12 months</p>
      </div>
      <HelpText className="mb-4">
        Log a flow test at least once a year per hydrant — the ISO Report pulls straight from these records to show
        current compliance.
      </HelpText>
      {isOfficerOrAbove && (
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={() => { setShowAddForm(true); setAddError(null) }}
            className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 transition-colors shadow-sm"
          >
            + Add Hydrant
          </button>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="rounded-xl bg-white border border-zinc-200 p-5 mb-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-900 mb-1">New Hydrant</h2>
          {addError && <p className="text-sm text-red-600">{addError}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Hydrant # <span className="text-red-600">*</span></label>
              <input name="hydrant_number" required placeholder="e.g. H-001" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Type</label>
              <select name="hydrant_type" className={inputCls}>
                <option value="">Unknown</option>
                {HYDRANT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Location Description <span className="text-red-600">*</span></label>
            <input name="location_description" required placeholder="e.g. NW corner of Main St & Oak Ave" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Street Address</label>
            <input name="street_address" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={labelCls}>Owner</label>
              <input name="owner" placeholder="City, Private…" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Main Size (in)</label>
              <input name="main_size_in" type="number" step="0.5" min="1" placeholder="6" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Latitude</label>
              <input name="lat" type="number" step="0.0000001" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Longitude</label>
              <input name="lng" type="number" step="0.0000001" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <input name="notes" className={inputCls} />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={isPending} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
              {isPending ? 'Saving…' : 'Add Hydrant'}
            </button>
            <button type="button" onClick={() => setShowAddForm(false)} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100">
              Cancel
            </button>
          </div>
        </form>
      )}

      {hydrants.length === 0 && !showAddForm && (
        <div className="rounded-xl bg-white border border-zinc-200 p-8 text-center text-sm text-zinc-400">
          No hydrants added yet.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {hydrants.map(hydrant => {
          const lastTest = hydrant.tests[0] ?? null
          const isExpanded = expandedId === hydrant.id
          const isEditing = editingId === hydrant.id
          const isLoggingTest = loggingTestId === hydrant.id

          return (
            <div key={hydrant.id} className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
              {isEditing ? (
                <form onSubmit={e => handleEdit(e, hydrant.id)} className="p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-zinc-900 mb-1">Edit Hydrant</h3>
                  {editError && <p className="text-sm text-red-600">{editError}</p>}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Hydrant #</label>
                      <input name="hydrant_number" defaultValue={hydrant.hydrant_number} required className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Type</label>
                      <select name="hydrant_type" defaultValue={hydrant.hydrant_type ?? ''} className={inputCls}>
                        <option value="">Unknown</option>
                        {HYDRANT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Location Description</label>
                    <input name="location_description" defaultValue={hydrant.location_description} required className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Street Address</label>
                    <input name="street_address" defaultValue={hydrant.street_address ?? ''} className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <label className={labelCls}>Owner</label>
                      <input name="owner" defaultValue={hydrant.owner ?? ''} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Main Size (in)</label>
                      <input name="main_size_in" type="number" step="0.5" defaultValue={hydrant.main_size_in ?? ''} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Latitude</label>
                      <input name="lat" type="number" step="0.0000001" defaultValue={hydrant.lat ?? ''} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Longitude</label>
                      <input name="lng" type="number" step="0.0000001" defaultValue={hydrant.lng ?? ''} className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Status</label>
                      <select name="out_of_service" defaultValue={hydrant.out_of_service ? 'true' : 'false'} className={inputCls}>
                        <option value="false">In Service</option>
                        <option value="true">Out of Service</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Notes</label>
                      <input name="notes" defaultValue={hydrant.notes ?? ''} className={inputCls} />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="submit" disabled={isPending} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">Save</button>
                    <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100">Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  {/* Hydrant row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-sm text-zinc-900">{hydrant.hydrant_number}</span>
                        {hydrant.hydrant_type && (
                          <span className="text-xs text-zinc-500">{HYDRANT_TYPES.find(t => t.value === hydrant.hydrant_type)?.label ?? hydrant.hydrant_type}</span>
                        )}
                        {hydrant.main_size_in && <span className="text-xs text-zinc-400">{hydrant.main_size_in}" main</span>}
                        {hydrant.owner && <span className="text-xs text-zinc-400">· {hydrant.owner}</span>}
                      </div>
                      <p className="text-xs text-zinc-600 mt-0.5 truncate">{hydrant.location_description}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${hydrant.out_of_service ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {hydrant.out_of_service ? 'Out of Service' : 'In Service'}
                        </span>
                        {lastTest ? (
                          <span className="text-xs text-zinc-400">
                            Last flow test {formatDate(lastTest.test_date)} — {lastTest.flow_gpm} GPM
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">No flow tests recorded</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isOfficerOrAbove && (
                        <>
                          <button onClick={() => { setEditingId(hydrant.id); setEditError(null) }} className="text-xs text-zinc-500 hover:text-zinc-700 font-medium">Edit</button>
                          <button onClick={() => { setLoggingTestId(isLoggingTest ? null : hydrant.id); setExpandedId(hydrant.id); setTestError(null) }} className="text-xs text-red-700 hover:underline font-medium">Log Test</button>
                          {removingId === hydrant.id ? (
                            <>
                              <button onClick={() => { startTransition(async () => { await removeHydrant(hydrant.id); setRemovingId(null); router.refresh() }) }} className="text-xs font-semibold text-red-600 hover:text-red-800">Confirm</button>
                              <button onClick={() => setRemovingId(null)} className="text-xs text-zinc-400 hover:text-zinc-600">Cancel</button>
                            </>
                          ) : (
                            <button onClick={() => setRemovingId(hydrant.id)} className="text-xs text-zinc-400 hover:text-red-600 font-medium">Remove</button>
                          )}
                        </>
                      )}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : hydrant.id)}
                        className="text-xs text-zinc-400 hover:text-zinc-600 px-1"
                      >
                        {isExpanded ? '▲' : '▼'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded: flow test log + history */}
                  {isExpanded && (
                    <div className="border-t border-zinc-100 px-4 py-3 bg-zinc-50">
                      {/* Log test form */}
                      {isLoggingTest && isOfficerOrAbove && (
                        <form onSubmit={e => handleLogTest(e, hydrant.id)} className="mb-4 rounded-lg bg-white border border-zinc-200 p-4 space-y-3">
                          <h4 className="text-xs font-semibold text-zinc-800">Log Flow Test</h4>
                          {testError && <p className="text-xs text-red-600">{testError}</p>}
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div>
                              <label className={labelCls}>Test Date <span className="text-red-600">*</span></label>
                              <input name="test_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>Static PSI <span className="text-red-600">*</span></label>
                              <input name="static_pressure_psi" type="number" min="0" required placeholder="65" className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>Residual PSI <span className="text-red-600">*</span></label>
                              <input name="residual_pressure_psi" type="number" min="0" required placeholder="45" className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>Flow GPM <span className="text-red-600">*</span></label>
                              <input name="flow_gpm" type="number" min="0" required placeholder="1000" className={inputCls} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={labelCls}>Pitot Reading (PSI)</label>
                              <input name="pitot_reading_psi" type="number" step="0.1" min="0" className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>Nozzle Diameter (in)</label>
                              <input name="nozzle_diameter_in" type="number" step="0.25" min="0.5" className={inputCls} />
                            </div>
                          </div>
                          <div>
                            <label className={labelCls}>Notes</label>
                            <input name="notes" className={inputCls} />
                          </div>
                          <div className="flex gap-2">
                            <button type="submit" disabled={isPending} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">Submit</button>
                            <button type="button" onClick={() => setLoggingTestId(null)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100">Cancel</button>
                          </div>
                        </form>
                      )}

                      {/* Test history */}
                      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Flow Test History</p>
                      {hydrant.tests.length === 0 ? (
                        <p className="text-xs text-zinc-400">No flow tests recorded.</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {hydrant.tests.map(t => (
                            <div key={t.id} className="text-xs rounded-lg bg-white border border-zinc-200 px-3 py-2">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="font-medium text-zinc-800">{formatDate(t.test_date)}</span>
                                <span className="text-zinc-600">{t.flow_gpm} GPM</span>
                                <span className="text-zinc-400">Static {t.static_pressure_psi} PSI · Residual {t.residual_pressure_psi} PSI</span>
                                {t.pitot_reading_psi != null && <span className="text-zinc-400">Pitot {t.pitot_reading_psi} PSI</span>}
                                {t.nozzle_diameter_in != null && <span className="text-zinc-400">Nozzle {t.nozzle_diameter_in}"</span>}
                                {t.tested_by_name && <span className="text-zinc-400">by {t.tested_by_name}</span>}
                              </div>
                              {t.notes && <p className="text-zinc-400 mt-0.5">{t.notes}</p>}
                            </div>
                          ))}
                        </div>
                      )}

                      {hydrant.notes && (
                        <p className="text-xs text-zinc-500 mt-3">Notes: {hydrant.notes}</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
