'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createHose, updateHose, addHoseTest, removeHose } from '@/app/actions/iso'
import HelpText from '@/components/HelpText'

const inputCls = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
const labelCls = "block text-xs font-medium text-zinc-700 mb-1"

const HOSE_TYPES = [
  { value: 'attack', label: 'Attack' },
  { value: 'supply', label: 'Supply' },
  { value: 'forestry', label: 'Forestry' },
  { value: 'booster', label: 'Booster' },
  { value: 'hard_suction', label: 'Hard Suction' },
  { value: 'other', label: 'Other' },
]

const STATUS_LABELS: Record<string, string> = {
  in_service: 'In Service',
  out_of_service: 'Out of Service',
  retired: 'Retired',
}

type HoseTest = {
  id: string
  test_date: string
  tested_by_name: string | null
  test_pressure_psi: number
  duration_min: number
  passed: boolean
  failure_reason: string | null
  notes: string | null
}

type Hose = {
  id: string
  hose_identifier: string
  hose_type: string
  diameter_in: number
  length_ft: number
  manufacturer: string | null
  serial_number: string | null
  year_placed_in_service: number | null
  status: string
  notes: string | null
  apparatus_id: string | null
  apparatus_unit: string | null
  tests: HoseTest[]
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function HosesClient({
  hoses,
  deptApparatus,
  isOfficerOrAbove,
}: {
  hoses: Hose[]
  deptApparatus: { id: string; unit_number: string }[]
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
  const [testPassed, setTestPassed] = useState('true')
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setAddError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createHose(fd)
      if (result?.error) { setAddError(result.error); return }
      setShowAddForm(false)
      router.refresh()
    })
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>, hoseId: string) {
    e.preventDefault()
    setEditError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('hose_id', hoseId)
    startTransition(async () => {
      const result = await updateHose(fd)
      if (result?.error) { setEditError(result.error); return }
      setEditingId(null)
      router.refresh()
    })
  }

  async function handleLogTest(e: React.FormEvent<HTMLFormElement>, hoseId: string) {
    e.preventDefault()
    setTestError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('hose_id', hoseId)
    startTransition(async () => {
      const result = await addHoseTest(fd)
      if (result?.error) { setTestError(result.error); return }
      setLoggingTestId(null)
      setTestPassed('true')
      router.refresh()
    })
  }

  const inService = hoses.filter(h => h.status === 'in_service').length
  const now = new Date()
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10)
  const testedThisYear = hoses.filter(h => h.tests[0] && h.tests[0].test_date >= oneYearAgo).length

  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-zinc-900">Hose Inventory</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{hoses.length} total · {inService} in service · {testedThisYear}/{hoses.length} tested in past 12 months</p>
      </div>
      <HelpText className="mb-4">
        This tracks physical hose sections and their annual pressure tests (NFPA 1962) — it's separate from what's
        loaded on a specific truck, which is set on the apparatus's ISO Specs instead.
      </HelpText>
      {isOfficerOrAbove && (
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={() => { setShowAddForm(true); setAddError(null) }}
            className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 transition-colors shadow-sm"
          >
            + Add Hose
          </button>
          <Link
            href="/iso/hoses/session"
            className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors shadow-sm"
          >
            Run Test Session
          </Link>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="rounded-xl bg-white border border-zinc-200 p-5 mb-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-900 mb-1">New Hose</h2>
          {addError && <p className="text-sm text-red-600">{addError}</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Identifier <span className="text-red-600">*</span></label>
              <input name="hose_identifier" required placeholder="e.g. E32-1" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Type <span className="text-red-600">*</span></label>
              <select name="hose_type" required className={inputCls}>
                {HOSE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Apparatus</label>
              <select name="apparatus_id" className={inputCls}>
                <option value="">Not assigned</option>
                {deptApparatus.map(a => <option key={a.id} value={a.id}>{a.unit_number}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={labelCls}>Diameter (in) <span className="text-red-600">*</span></label>
              <input name="diameter_in" type="number" step="0.25" min="0.5" required placeholder="1.75" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Length (ft) <span className="text-red-600">*</span></label>
              <input name="length_ft" type="number" min="1" required placeholder="100" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Manufacturer</label>
              <input name="manufacturer" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Serial #</label>
              <input name="serial_number" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Year Placed In Service</label>
              <input name="year_placed_in_service" type="number" min="1900" max={new Date().getFullYear()} placeholder={String(new Date().getFullYear())} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <input name="notes" className={inputCls} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={isPending} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
              {isPending ? 'Saving…' : 'Add Hose'}
            </button>
            <button type="button" onClick={() => setShowAddForm(false)} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100">
              Cancel
            </button>
          </div>
        </form>
      )}

      {hoses.length === 0 && !showAddForm && (
        <div className="rounded-xl bg-white border border-zinc-200 p-8 text-center text-sm text-zinc-400">
          No hoses added yet.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {hoses.map(hose => {
          const lastTest = hose.tests[0] ?? null
          const isExpanded = expandedId === hose.id
          const isEditing = editingId === hose.id
          const isLoggingTest = loggingTestId === hose.id

          return (
            <div key={hose.id} className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
              {isEditing ? (
                <form onSubmit={e => handleEdit(e, hose.id)} className="p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-zinc-900 mb-1">Edit Hose</h3>
                  {editError && <p className="text-sm text-red-600">{editError}</p>}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div>
                      <label className={labelCls}>Identifier</label>
                      <input name="hose_identifier" defaultValue={hose.hose_identifier} required className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Type</label>
                      <select name="hose_type" defaultValue={hose.hose_type} className={inputCls}>
                        {HOSE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Apparatus</label>
                      <select name="apparatus_id" defaultValue={hose.apparatus_id ?? ''} className={inputCls}>
                        <option value="">Not assigned</option>
                        {deptApparatus.map(a => <option key={a.id} value={a.id}>{a.unit_number}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <label className={labelCls}>Diameter (in)</label>
                      <input name="diameter_in" type="number" step="0.25" defaultValue={hose.diameter_in} required className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Length (ft)</label>
                      <input name="length_ft" type="number" defaultValue={hose.length_ft} required className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Manufacturer</label>
                      <input name="manufacturer" defaultValue={hose.manufacturer ?? ''} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Serial #</label>
                      <input name="serial_number" defaultValue={hose.serial_number ?? ''} className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Year In Service</label>
                      <input name="year_placed_in_service" type="number" defaultValue={hose.year_placed_in_service ?? ''} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Status</label>
                      <select name="status" defaultValue={hose.status} className={inputCls}>
                        <option value="in_service">In Service</option>
                        <option value="out_of_service">Out of Service</option>
                        <option value="retired">Retired</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Notes</label>
                    <input name="notes" defaultValue={hose.notes ?? ''} className={inputCls} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="submit" disabled={isPending} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">Save</button>
                    <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100">Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  {/* Hose row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-sm text-zinc-900">{hose.hose_identifier}</span>
                        <span className="text-xs text-zinc-500 capitalize">{HOSE_TYPES.find(t => t.value === hose.hose_type)?.label ?? hose.hose_type}</span>
                        <span className="text-xs text-zinc-400">{hose.diameter_in}" × {hose.length_ft}ft</span>
                        {hose.apparatus_unit && <span className="text-xs text-zinc-400">· {hose.apparatus_unit}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                          hose.status === 'in_service' ? 'bg-green-100 text-green-700' :
                          hose.status === 'out_of_service' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-zinc-100 text-zinc-500'
                        }`}>{STATUS_LABELS[hose.status]}</span>
                        {lastTest ? (
                          <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${lastTest.passed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            Last test {formatDate(lastTest.test_date)} — {lastTest.passed ? 'Pass' : 'Fail'}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">No tests recorded</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isOfficerOrAbove && (
                        <>
                          <button onClick={() => { setEditingId(hose.id); setEditError(null) }} className="text-xs text-zinc-500 hover:text-zinc-700 font-medium">Edit</button>
                          <button onClick={() => { setLoggingTestId(isLoggingTest ? null : hose.id); setExpandedId(hose.id); setTestError(null); setTestPassed('true') }} className="text-xs text-red-700 hover:underline font-medium">Log Test</button>
                          {removingId === hose.id ? (
                            <>
                              <button onClick={() => { startTransition(async () => { await removeHose(hose.id); setRemovingId(null); router.refresh() }) }} className="text-xs font-semibold text-red-600 hover:text-red-800">Confirm</button>
                              <button onClick={() => setRemovingId(null)} className="text-xs text-zinc-400 hover:text-zinc-600">Cancel</button>
                            </>
                          ) : (
                            <button onClick={() => setRemovingId(hose.id)} className="text-xs text-zinc-400 hover:text-red-600 font-medium">Remove</button>
                          )}
                        </>
                      )}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : hose.id)}
                        className="text-xs text-zinc-400 hover:text-zinc-600 px-1"
                      >
                        {isExpanded ? '▲' : '▼'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded: test history + log form */}
                  {isExpanded && (
                    <div className="border-t border-zinc-100 px-4 py-3 bg-zinc-50">
                      {/* Log test form */}
                      {isLoggingTest && isOfficerOrAbove && (
                        <form onSubmit={e => handleLogTest(e, hose.id)} className="mb-4 rounded-lg bg-white border border-zinc-200 p-4 space-y-3">
                          <h4 className="text-xs font-semibold text-zinc-800">Log Service Test</h4>
                          {testError && <p className="text-xs text-red-600">{testError}</p>}
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div>
                              <label className={labelCls}>Test Date <span className="text-red-600">*</span></label>
                              <input name="test_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>Pressure (PSI) <span className="text-red-600">*</span></label>
                              <input name="test_pressure_psi" type="number" min="1" required placeholder="300" className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>Duration (min)</label>
                              <input name="duration_min" type="number" min="1" defaultValue="3" className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>Result <span className="text-red-600">*</span></label>
                              <select name="passed" value={testPassed} onChange={e => setTestPassed(e.target.value)} className={inputCls}>
                                <option value="true">Pass</option>
                                <option value="false">Fail</option>
                              </select>
                            </div>
                          </div>
                          {testPassed === 'false' && (
                            <div>
                              <label className={labelCls}>Failure Reason</label>
                              <input name="failure_reason" className={inputCls} />
                            </div>
                          )}
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
                      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Test History</p>
                      {hose.tests.length === 0 ? (
                        <p className="text-xs text-zinc-400">No tests recorded.</p>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {hose.tests.map(t => (
                            <div key={t.id} className="flex items-start gap-3 text-xs">
                              <span className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${t.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {t.passed ? 'Pass' : 'Fail'}
                              </span>
                              <div className="min-w-0">
                                <span className="text-zinc-700 font-medium">{formatDate(t.test_date)}</span>
                                <span className="text-zinc-400 ml-2">{t.test_pressure_psi} PSI · {t.duration_min} min</span>
                                {t.tested_by_name && <span className="text-zinc-400 ml-2">by {t.tested_by_name}</span>}
                                {t.failure_reason && <p className="text-red-600 mt-0.5">{t.failure_reason}</p>}
                                {t.notes && <p className="text-zinc-400 mt-0.5">{t.notes}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {hose.notes && (
                        <p className="text-xs text-zinc-500 mt-3">Notes: {hose.notes}</p>
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
