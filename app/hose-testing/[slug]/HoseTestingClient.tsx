'use client'

import { useEffect, useState } from 'react'
import { addPublicHose, claimHose, editPublicHose, getHoseTestingLiveState, releaseHose, setPublicHoseStatus, submitPublicHoseTestSession } from '@/app/actions/hose-testing'

const TESTER_NAME_KEY = 'fireops7_hose_testing_tester_name'

const HOSE_TYPES = [
  { value: 'attack', label: 'Attack' },
  { value: 'supply', label: 'Supply' },
  { value: 'forestry', label: 'Forestry' },
  { value: 'booster', label: 'Booster' },
  { value: 'hard_suction', label: 'Hard Suction' },
  { value: 'other', label: 'Other' },
]

// NFPA 1962: attack hose (1"-3") tests at 300 PSI, supply hose (4"-6") tests at 200 PSI.
function requiredPsi(diameter_in: number): number {
  return diameter_in >= 4 ? 200 : 300
}

type Hose = {
  id: string
  hose_identifier: string
  hose_type: string
  diameter_in: number
  length_ft: number
  status: string
}

type HoseResult = {
  passed: boolean | null
  failure_reason: string
}

export default function HoseTestingClient({ slug, initialHoses }: { slug: string; initialHoses: Hose[] }) {
  const today = new Date().toISOString().slice(0, 10)

  const [step, setStep] = useState<'select' | 'mark' | 'manage'>('select')
  const [hoses, setHoses] = useState(initialHoses)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [sizeFilter, setSizeFilter] = useState<number | null>(null)

  const [testerName, setTesterName] = useState('')
  const [testDate, setTestDate] = useState(today)
  const [pressurePsi, setPressurePsi] = useState('')
  const [durationMin, setDurationMin] = useState('5')
  const [results, setResults] = useState<Record<string, HoseResult>>({})

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [showAddHose, setShowAddHose] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [retiringId, setRetiringId] = useState<string | null>(null)

  // Manually forced back into the testing queue from Manage Hoses, bypassing
  // the 30-day recently-tested exclusion for this hose this session.
  const [forcedIds, setForcedIds] = useState<Set<string>>(new Set())
  // Hoses marked Fail in the current batch that should also be taken out of
  // service once the batch submits.
  const [retireOnFail, setRetireOnFail] = useState<Set<string>>(new Set())

  // Session token identifies this browser tab so concurrent public sessions
  // can tell "my own lock" apart from "someone else's lock" on the same hose.
  const [sessionToken] = useState<string>(() => crypto.randomUUID())
  const [lockedByOthers, setLockedByOthers] = useState<Record<string, string | null>>({})
  const [recentlyTestedIds, setRecentlyTestedIds] = useState<Set<string>>(new Set())
  const [claimingId, setClaimingId] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(TESTER_NAME_KEY)
    if (stored) setTesterName(stored)
  }, [])

  async function refreshLocks() {
    const { locks, recentlyTestedHoseIds } = await getHoseTestingLiveState(slug)
    const map: Record<string, string | null> = {}
    for (const l of locks) {
      if (l.session_token !== sessionToken) map[l.hose_id] = l.tester_name
    }
    setLockedByOthers(map)
    setRecentlyTestedIds(new Set(recentlyTestedHoseIds))
  }

  useEffect(() => {
    refreshLocks()
    const interval = setInterval(refreshLocks, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function saveTesterName(name: string) {
    setTesterName(name)
    localStorage.setItem(TESTER_NAME_KEY, name)
  }

  async function toggleSelected(hoseId: string) {
    setError(null)
    if (selected.has(hoseId)) {
      setSelected(prev => { const next = new Set(prev); next.delete(hoseId); return next })
      releaseHose(slug, hoseId, sessionToken).then(refreshLocks)
      return
    }
    if (hoseId in lockedByOthers) return
    setClaimingId(hoseId)
    const result = await claimHose(slug, hoseId, sessionToken, testerName)
    setClaimingId(null)
    if (result?.error) {
      setError(result.error)
      refreshLocks()
      return
    }
    setSelected(prev => new Set(prev).add(hoseId))
  }

  async function handleSelectAllToggle() {
    const filteredIds = filteredHoses.map(h => h.id)
    const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selected.has(id))
    if (allFilteredSelected) {
      await Promise.all(filteredIds.map(id => releaseHose(slug, id, sessionToken)))
      setSelected(prev => { const next = new Set(prev); filteredIds.forEach(id => next.delete(id)); return next })
    } else {
      const toClaim = filteredIds.filter(id => !selected.has(id) && !(id in lockedByOthers))
      const results = await Promise.all(toClaim.map(id => claimHose(slug, id, sessionToken, testerName)))
      const succeededIds = toClaim.filter((id, i) => !results[i]?.error)
      setSelected(prev => { const next = new Set(prev); succeededIds.forEach(id => next.add(id)); return next })
    }
    refreshLocks()
  }

  // Manage sees the full roster (fixing a typo shouldn't require the hose to
  // re-enter the testing queue first); Select excludes anything tested in
  // the last 30 days so it isn't retested unnecessarily.
  const visibleHoses = step === 'manage' ? hoses : hoses.filter(h => !recentlyTestedIds.has(h.id) || forcedIds.has(h.id))
  const uniqueSizes = Array.from(new Set(visibleHoses.map(h => h.diameter_in))).sort((a, b) => a - b)
  const filteredHoses = visibleHoses
    .filter(h => sizeFilter === null || h.diameter_in === sizeFilter)
    .filter(h => h.hose_identifier.toLowerCase().includes(search.trim().toLowerCase()))
  const groupedHoses = uniqueSizes
    .filter(size => sizeFilter === null || size === sizeFilter)
    .map(size => ({ size, hoses: filteredHoses.filter(h => h.diameter_in === size) }))
    .filter(g => g.hoses.length > 0)
  const selectedHoses = hoses.filter(h => selected.has(h.id))
  const canContinue = selectedHoses.length > 0 && testerName.trim() && pressurePsi

  function handleContinue() {
    setError(null)
    if (!testerName.trim() || !pressurePsi) { setError('Tester name and pressure are required.'); return }
    if (selectedHoses.length === 0) { setError('Select at least one hose to test.'); return }
    setResults(Object.fromEntries(selectedHoses.map(h => [h.id, results[h.id] ?? { passed: null, failure_reason: '' }])))
    setStep('mark')
  }

  const allMarked = selectedHoses.length > 0 && selectedHoses.every(h => results[h.id]?.passed !== null)
  const markedCount = selectedHoses.filter(h => results[h.id]?.passed !== null).length

  function setResult(hoseId: string, passed: boolean) {
    setResults(prev => ({ ...prev, [hoseId]: { ...prev[hoseId], passed, failure_reason: passed ? '' : prev[hoseId]?.failure_reason ?? '' } }))
  }

  function setFailureReason(hoseId: string, reason: string) {
    setResults(prev => ({ ...prev, [hoseId]: { ...prev[hoseId], failure_reason: reason } }))
  }

  function markAllPass() {
    setResults(prev => {
      const next = { ...prev }
      for (const h of selectedHoses) next[h.id] = { passed: true, failure_reason: '' }
      return next
    })
  }

  function toggleRetireOnFail(hoseId: string) {
    setRetireOnFail(prev => {
      const next = new Set(prev)
      if (next.has(hoseId)) next.delete(hoseId)
      else next.add(hoseId)
      return next
    })
  }

  async function handleAddHose(formData: FormData) {
    setAddError(null)
    setAdding(true)
    const result = await addPublicHose(slug, formData)
    if (result?.error || !result.hose) {
      setAddError(result?.error ?? 'Failed to add hose.')
      setAdding(false)
      return
    }
    const newHose = result.hose
    setHoses(prev => [...prev, newHose].sort((a, b) => a.hose_identifier.localeCompare(b.hose_identifier)))
    setSelected(prev => new Set(prev).add(newHose.id))
    setAdding(false)
    setShowAddHose(false)
  }

  async function handleEditHose(hoseId: string, formData: FormData) {
    setEditError(null)
    setEditing(true)
    const result = await editPublicHose(slug, hoseId, formData)
    if (result?.error || !result.hose) {
      setEditError(result?.error ?? 'Failed to update hose.')
      setEditing(false)
      return
    }
    const updated = result.hose
    setHoses(prev => [...prev.filter(h => h.id !== hoseId), updated].sort((a, b) => a.hose_identifier.localeCompare(b.hose_identifier)))
    setEditing(false)
    setEditingId(null)
  }

  function handleForceInclude(hoseId: string) {
    setForcedIds(prev => new Set(prev).add(hoseId))
  }

  async function handleRetire(hoseId: string) {
    if (!confirm('Take this hose out of service? It will no longer show up here for testing.')) return
    setRetiringId(hoseId)
    const result = await setPublicHoseStatus(slug, hoseId, 'out_of_service')
    setRetiringId(null)
    if (result?.error) { setError(result.error); return }
    setHoses(prev => prev.filter(h => h.id !== hoseId))
    setSelected(prev => { const next = new Set(prev); next.delete(hoseId); return next })
  }

  async function handleSubmit() {
    if (!allMarked) { setError('Mark every selected hose pass or fail before submitting.'); return }
    setError(null)
    setSuccess(null)
    setLoading(true)

    const payload = selectedHoses.map(h => ({
      hose_id: h.id,
      passed: results[h.id]!.passed!,
      failure_reason: results[h.id]!.failure_reason || null,
    }))

    const result = await submitPublicHoseTestSession(slug, testerName, testDate, parseInt(pressurePsi), parseInt(durationMin) || 5, payload)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    const toRetire = selectedHoses.filter(h => retireOnFail.has(h.id)).map(h => h.id)
    if (toRetire.length > 0) {
      await Promise.all(toRetire.map(id => setPublicHoseStatus(slug, id, 'out_of_service')))
    }

    setSuccess(`Saved ${result.count} test result${result.count !== 1 ? 's' : ''}.${toRetire.length > 0 ? ` ${toRetire.length} hose${toRetire.length !== 1 ? 's' : ''} taken out of service.` : ''}`)
    const submittedIds = new Set(selectedHoses.map(h => h.id))
    setHoses(prev => prev.filter(h => !submittedIds.has(h.id)))
    setResults({})
    setSelected(new Set())
    setRetireOnFail(new Set())
    setForcedIds(prev => { const next = new Set(prev); submittedIds.forEach(id => next.delete(id)); return next })
    setStep('select')
    setLoading(false)
    refreshLocks()
  }

  return (
    <div>
      {success && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">{success}</div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Test parameters — set once, carried into both steps */}
      <div className="rounded-xl bg-white border border-zinc-200 p-5 mb-5">
        <h2 className="text-sm font-semibold text-zinc-700 mb-3">Test Parameters</h2>
        <div className="mb-3">
          <label className="block text-xs font-medium text-zinc-600 mb-1">Tester Name</label>
          <input type="text" value={testerName} onChange={e => saveTesterName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-zinc-600 mb-1">Test Date</label>
            <input type="date" value={testDate} onChange={e => setTestDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-zinc-600 mb-1">Pressure Used (PSI)</label>
            <input type="number" min="0" value={pressurePsi} onChange={e => setPressurePsi(e.target.value)}
              placeholder="e.g. 300"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
          </div>
          <div className="w-32">
            <label className="block text-xs font-medium text-zinc-600 mb-1">Duration (min)</label>
            <input type="number" min="1" value={durationMin} onChange={e => setDurationMin(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
          </div>
        </div>
      </div>

      {(step === 'select' || step === 'manage') && (
        <>
          <div className="flex items-center justify-between mb-3">
            {step === 'select' ? (
              <h2 className="text-sm font-semibold text-zinc-700">
                Select Hoses to Test{visibleHoses.length > 0 ? ` — ${selected.size}/${visibleHoses.length} selected` : ''}
              </h2>
            ) : (
              <h2 className="text-sm font-semibold text-zinc-700">Manage Hoses — edit ID, size, or type</h2>
            )}
            <div className="flex gap-2">
              {step === 'select' && visibleHoses.length > 0 && (
                <button
                  onClick={handleSelectAllToggle}
                  className="text-xs font-semibold text-red-700 hover:text-red-900"
                >
                  {filteredHoses.length > 0 && filteredHoses.every(h => selected.has(h.id)) ? 'Select None' : 'Select All'}
                </button>
              )}
              {step === 'select' && (
                <button onClick={() => setShowAddHose(v => !v)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
                  {showAddHose ? 'Cancel' : '+ Add Hose'}
                </button>
              )}
              <button
                onClick={() => { setStep(step === 'manage' ? 'select' : 'manage'); setEditingId(null); setEditError(null) }}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
              >
                {step === 'manage' ? '← Back to Testing' : 'Manage Hoses'}
              </button>
            </div>
          </div>

          {visibleHoses.length > 0 && (
            <div className="relative mb-3">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search hose ID..."
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-400 hover:text-zinc-700"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {uniqueSizes.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setSizeFilter(null)}
                className={`rounded-full px-3 py-1 text-xs font-semibold border transition-colors ${
                  sizeFilter === null ? 'bg-red-700 text-white border-red-700' : 'bg-white text-zinc-600 border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                All Sizes
              </button>
              {uniqueSizes.map(size => (
                <button
                  key={size}
                  onClick={() => setSizeFilter(size)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold border transition-colors ${
                    sizeFilter === size ? 'bg-red-700 text-white border-red-700' : 'bg-white text-zinc-600 border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  {size}&quot;
                </button>
              ))}
            </div>
          )}

          {step === 'select' && selected.size > 0 && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3">
              <p className="text-xs font-semibold text-red-800 mb-2">Selected for this round ({selected.size})</p>
              <div className="flex flex-wrap gap-2">
                {selectedHoses.map(h => (
                  <button
                    key={h.id}
                    onClick={() => toggleSelected(h.id)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white border border-red-300 px-2.5 py-1 text-xs font-mono font-semibold text-red-800 hover:bg-red-100"
                  >
                    {h.hose_identifier}
                    <span className="text-red-400">✕</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'select' && showAddHose && (
            <form action={handleAddHose} className="rounded-xl bg-white border border-zinc-200 p-4 mb-5 flex flex-col gap-3">
              {addError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{addError}</div>}
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Hose ID</label>
                <input name="hose_identifier" type="text" required placeholder="H-0001"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Type</label>
                  <select name="hose_type" required defaultValue="attack"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                    {HOSE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="w-28">
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Diameter (in)</label>
                  <input name="diameter_in" type="number" step="0.25" min="0.5" required placeholder="1.75"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                </div>
                <div className="w-28">
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Length (ft)</label>
                  <input name="length_ft" type="number" min="0" required placeholder="50"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                </div>
              </div>
              <button type="submit" disabled={adding}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                {adding ? 'Adding...' : 'Add Hose'}
              </button>
            </form>
          )}

          {hoses.length === 0 ? (
            <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400 mb-5">
              No hoses on file yet — use &quot;+ Add Hose&quot; above to register the first one.
            </div>
          ) : step === 'select' && visibleHoses.length === 0 ? (
            <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400 mb-5">
              All hoses have been tested within the last 30 days — nothing left to test right now.
            </div>
          ) : groupedHoses.length === 0 ? (
            <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400 mb-5">
              No hoses match &quot;{search}&quot;.
            </div>
          ) : (
            <div className="mb-5 space-y-4">
              {groupedHoses.map(group => (
                <div key={group.size}>
                  <h3 className="text-xs font-semibold text-zinc-500 mb-1.5 px-1">
                    {group.size}&quot; Hose <span className="text-zinc-400 font-normal">({group.hoses.length})</span>
                  </h3>
                  <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden divide-y divide-zinc-100">
                    {group.hoses.map(hose => (
                      step === 'manage' && editingId === hose.id ? (
                        <form
                          key={hose.id}
                          action={(formData) => handleEditHose(hose.id, formData)}
                          className="px-4 py-3 flex flex-col gap-2 bg-zinc-50"
                        >
                          {editError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{editError}</div>}
                          <div className="flex gap-2">
                            <input name="hose_identifier" type="text" required defaultValue={hose.hose_identifier}
                              className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm font-mono focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                            <select name="hose_type" required defaultValue={hose.hose_type}
                              className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                              {HOSE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <input name="diameter_in" type="number" step="0.25" min="0.5" required defaultValue={hose.diameter_in}
                              placeholder="Diameter"
                              className="w-24 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                            <input name="length_ft" type="number" min="0" required defaultValue={hose.length_ft}
                              placeholder="Length (ft)"
                              className="w-28 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                            <button type="submit" disabled={editing}
                              className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                              {editing ? 'Saving...' : 'Save'}
                            </button>
                            <button type="button" onClick={() => { setEditingId(null); setEditError(null) }}
                              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : step === 'manage' ? (
                        <div key={hose.id} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50">
                          <div className="min-w-0 flex-1">
                            <span className="font-mono font-semibold text-zinc-900">{hose.hose_identifier}</span>
                            <span className="text-xs text-zinc-400 ml-2">{hose.length_ft} ft · {hose.hose_type}</span>
                            {recentlyTestedIds.has(hose.id) && !forcedIds.has(hose.id) && (
                              <span className="text-xs text-amber-600 ml-2">· tested recently</span>
                            )}
                          </div>
                          <div className="flex gap-2 shrink-0">
                            {recentlyTestedIds.has(hose.id) && !forcedIds.has(hose.id) && (
                              <button
                                onClick={() => handleForceInclude(hose.id)}
                                className="text-xs font-semibold text-amber-700 hover:text-amber-900"
                              >
                                Force Test
                              </button>
                            )}
                            <button
                              onClick={() => { setEditingId(hose.id); setEditError(null) }}
                              className="text-xs font-semibold text-zinc-500 hover:text-red-700"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleRetire(hose.id)}
                              disabled={retiringId === hose.id}
                              className="text-xs font-semibold text-zinc-400 hover:text-red-700 disabled:opacity-50"
                            >
                              {retiringId === hose.id ? 'Saving...' : 'Deactivate'}
                            </button>
                          </div>
                        </div>
                      ) : hose.id in lockedByOthers ? (
                        <div key={hose.id} className="flex items-center gap-3 px-4 py-3 bg-zinc-50">
                          <input type="checkbox" checked={false} disabled className="w-4 h-4 rounded border-zinc-300" />
                          <div className="min-w-0 flex-1">
                            <span className="font-mono font-semibold text-zinc-400">{hose.hose_identifier}</span>
                            <span className="text-xs text-zinc-400 ml-2">{hose.length_ft} ft · {hose.hose_type}</span>
                          </div>
                          <span className="shrink-0 text-xs font-medium text-amber-600">
                            🔒 In progress{lockedByOthers[hose.id] ? ` — ${lockedByOthers[hose.id]}` : ''}
                          </span>
                        </div>
                      ) : (
                        <label key={hose.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-50">
                          <input
                            type="checkbox"
                            checked={selected.has(hose.id)}
                            disabled={claimingId === hose.id}
                            onChange={() => toggleSelected(hose.id)}
                            className="w-4 h-4 rounded border-zinc-300 text-red-600 focus:ring-red-500 disabled:opacity-50"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="font-mono font-semibold text-zinc-900">{hose.hose_identifier}</span>
                            <span className="text-xs text-zinc-400 ml-2">{hose.length_ft} ft · {hose.hose_type}</span>
                          </div>
                        </label>
                      )
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 'select' && hoses.length > 0 && (
            <button
              onClick={handleContinue}
              disabled={!canContinue}
              className="w-full rounded-lg bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
            >
              Continue with {selected.size} Hose{selected.size !== 1 ? 's' : ''} →
            </button>
          )}
        </>
      )}

      {step === 'mark' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-700">Mark Results — {markedCount}/{selectedHoses.length} marked</h2>
            <div className="flex gap-3">
              <button onClick={markAllPass} className="text-xs font-semibold text-green-700 hover:text-green-900">
                Mark All Pass
              </button>
              <button onClick={() => setStep('select')} className="text-xs font-semibold text-zinc-500 hover:text-zinc-800">
                ← Change Selection
              </button>
            </div>
          </div>
          <p className="text-xs text-zinc-400 mb-3">Mark All Pass, then flip any individual hose to Fail below.</p>

          <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden divide-y divide-zinc-100 mb-5">
            {selectedHoses.map(hose => {
              const result = results[hose.id]
              const reqPsi = requiredPsi(hose.diameter_in)
              const psiMet = pressurePsi && parseInt(pressurePsi) >= reqPsi
              return (
                <div key={hose.id} className="px-4 py-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-zinc-900">{hose.hose_identifier}</span>
                        <span className="text-xs text-zinc-400">{hose.diameter_in}&quot; · {hose.length_ft} ft · {hose.hose_type}</span>
                      </div>
                      <p className={`text-xs mt-0.5 ${psiMet ? 'text-zinc-400' : 'text-amber-600 font-medium'}`}>
                        Required: {reqPsi} PSI{!psiMet && pressurePsi ? ' ⚠ pressure entered is below required' : ''}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => setResult(hose.id, true)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors ${
                          result?.passed === true
                            ? 'bg-green-600 text-white border-green-600'
                            : 'bg-white text-zinc-600 border-zinc-300 hover:bg-zinc-50'
                        }`}
                      >
                        Pass
                      </button>
                      <button
                        onClick={() => setResult(hose.id, false)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors ${
                          result?.passed === false
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-white text-zinc-600 border-zinc-300 hover:bg-zinc-50'
                        }`}
                      >
                        Fail
                      </button>
                    </div>
                  </div>
                  {result?.passed === false && (
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        value={result.failure_reason}
                        onChange={e => setFailureReason(hose.id, e.target.value)}
                        placeholder="Failure reason (optional)"
                        className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-zinc-700 focus:border-red-400 focus:outline-none"
                      />
                      <label className="flex items-center gap-2 text-xs text-red-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={retireOnFail.has(hose.id)}
                          onChange={() => toggleRetireOnFail(hose.id)}
                          className="w-3.5 h-3.5 rounded border-red-300 text-red-600 focus:ring-red-500"
                        />
                        Take this hose out of service
                      </label>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading || !allMarked}
            className="w-full rounded-lg bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Saving...' : `Submit ${selectedHoses.length} Test${selectedHoses.length !== 1 ? 's' : ''}`}
          </button>
        </>
      )}
    </div>
  )
}
