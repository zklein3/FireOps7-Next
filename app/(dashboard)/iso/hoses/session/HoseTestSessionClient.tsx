'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { submitHoseTestSession, claimHoseInApp, releaseHoseInApp, forceReleaseHoseInApp } from '@/app/actions/iso'
import { createClient } from '@/lib/supabase/client'

// NFPA 1962: attack hose (1"–3") tests at 300 PSI, supply hose (4"–6") tests at 200 PSI —
// driven purely by diameter, not the user-assigned hose_type (which can be mistagged).
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

type Lock = { id: string; hose_id: string; session_token: string; tester_name: string | null }

const SESSION_TOKEN_KEY = 'fireops7_hose_testing_session_token_inapp'

export default function HoseTestSessionClient({
  hoses,
  testerName,
  departmentId,
  initialLocks,
}: {
  hoses: Hose[]
  testerName: string
  departmentId: string
  initialLocks: Lock[]
}) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)

  const [step, setStep] = useState<'select' | 'mark'>('select')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [sizeFilter, setSizeFilter] = useState<number | null>(null)

  const [testDate, setTestDate] = useState(today)
  const [pressurePsi, setPressurePsi] = useState('')
  const [durationMin, setDurationMin] = useState('5')
  const [results, setResults] = useState<Record<string, HoseResult>>({})

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [claimingId, setClaimingId] = useState<string | null>(null)

  // Identifies this browser tab so it can tell "my own lock" apart from
  // someone else's — same locking model as the public hose-testing page,
  // shared via the same hose_testing_locks table so an officer here and a
  // public/mutual-aid tester there can't both grab the same physical hose.
  // Persisted per-tab so reloading this same tab reconnects to claims already
  // made, instead of orphaning them under a fresh random ID.
  const [sessionToken] = useState<string>(() => {
    if (typeof window === 'undefined') return crypto.randomUUID()
    const existing = sessionStorage.getItem(SESSION_TOKEN_KEY)
    if (existing) return existing
    const fresh = crypto.randomUUID()
    sessionStorage.setItem(SESSION_TOKEN_KEY, fresh)
    return fresh
  })
  const [lockedByOthers, setLockedByOthers] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(initialLocks.map(l => [l.hose_id, l.tester_name]))
  )
  // Realtime DELETE payloads only ever carry the row's own primary key (`id`),
  // never other columns, even with replica identity full — a hard Realtime+RLS
  // restriction. This ref (built from INSERT/UPDATE payloads, which do carry
  // full rows) lets a bare-PK DELETE resolve back to a hose_id.
  const lockIdToHoseId = useRef<Record<string, string>>(
    Object.fromEntries(initialLocks.map(l => [l.id, l.hose_id]))
  )

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`hose_testing_locks_app_${departmentId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'hose_testing_locks', filter: `department_id=eq.${departmentId}` },
        payload => {
          const row = payload.new as Lock
          lockIdToHoseId.current = { ...lockIdToHoseId.current, [row.id]: row.hose_id }
          if (row.session_token !== sessionToken) setLockedByOthers(prev => ({ ...prev, [row.hose_id]: row.tester_name }))
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'hose_testing_locks', filter: `department_id=eq.${departmentId}` },
        payload => {
          const row = payload.new as Lock
          lockIdToHoseId.current = { ...lockIdToHoseId.current, [row.id]: row.hose_id }
          setLockedByOthers(prev => {
            const next = { ...prev }
            if (row.session_token !== sessionToken) next[row.hose_id] = row.tester_name
            else delete next[row.hose_id]
            return next
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'hose_testing_locks', filter: `department_id=eq.${departmentId}` },
        payload => {
          const deletedId = (payload.old as { id: string }).id
          const hoseId = lockIdToHoseId.current[deletedId]
          if (!hoseId) return
          const rest = { ...lockIdToHoseId.current }
          delete rest[deletedId]
          lockIdToHoseId.current = rest
          setLockedByOthers(prev => {
            const next = { ...prev }
            delete next[hoseId]
            return next
          })
          // If this was *our own* selection, someone else force-releasing it
          // wouldn't otherwise be reflected here (this session was never in
          // lockedByOthers for its own claim, so nothing above touches it).
          let wasMine = false
          setSelected(prev => {
            if (!prev.has(hoseId)) return prev
            wasMine = true
            const next = new Set(prev)
            next.delete(hoseId)
            return next
          })
          if (wasMine) setError('Your selection on a hose was cleared by another officer.')
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId])

  const [clearingId, setClearingId] = useState<string | null>(null)

  async function handleForceRelease(hoseId: string) {
    if (!confirm('Clear this selection? Only do this if the other tester left without finishing it (device died, walked away, etc.).')) return
    setClearingId(hoseId)
    await forceReleaseHoseInApp(hoseId)
    setClearingId(null)
  }

  async function toggleSelected(hoseId: string) {
    setError(null)
    if (selected.has(hoseId)) {
      setSelected(prev => { const next = new Set(prev); next.delete(hoseId); return next })
      releaseHoseInApp(hoseId, sessionToken)
      return
    }
    if (hoseId in lockedByOthers) return
    setClaimingId(hoseId)
    const result = await claimHoseInApp(hoseId, sessionToken, testerName)
    setClaimingId(null)
    if (result?.error) {
      setError(result.error)
      return
    }
    setSelected(prev => new Set(prev).add(hoseId))
  }

  const uniqueSizes = Array.from(new Set(hoses.map(h => h.diameter_in))).sort((a, b) => a - b)
  const filteredHoses = hoses
    .filter(h => sizeFilter === null || h.diameter_in === sizeFilter)
    .filter(h => h.hose_identifier.toLowerCase().includes(search.trim().toLowerCase()))
  const groupedHoses = uniqueSizes
    .filter(size => sizeFilter === null || size === sizeFilter)
    .map(size => ({ size, hoses: filteredHoses.filter(h => h.diameter_in === size) }))
    .filter(g => g.hoses.length > 0)
  const selectedHoses = hoses.filter(h => selected.has(h.id))

  async function handleSelectAllToggle() {
    const filteredIds = filteredHoses.map(h => h.id)
    const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selected.has(id))
    if (allFilteredSelected) {
      await Promise.all(filteredIds.map(id => releaseHoseInApp(id, sessionToken)))
      setSelected(prev => { const next = new Set(prev); filteredIds.forEach(id => next.delete(id)); return next })
    } else {
      const toClaim = filteredIds.filter(id => !selected.has(id) && !(id in lockedByOthers))
      const claimResults = await Promise.all(toClaim.map(id => claimHoseInApp(id, sessionToken, testerName)))
      const succeededIds = toClaim.filter((id, i) => !claimResults[i]?.error)
      setSelected(prev => { const next = new Set(prev); succeededIds.forEach(id => next.add(id)); return next })
    }
  }

  const canContinue = selectedHoses.length > 0 && !!pressurePsi

  function handleContinue() {
    setError(null)
    if (selectedHoses.length === 0) { setError('Select at least one hose to test.'); return }
    if (!pressurePsi) { setError('Pressure is required.'); return }
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

  async function handleCancelMarking() {
    await Promise.all(selectedHoses.map(h => releaseHoseInApp(h.id, sessionToken)))
    setSelected(new Set())
    setResults({})
    setStep('select')
  }

  async function handleSubmit() {
    if (!pressurePsi || !testDate) { setError('Date and pressure are required.'); return }
    if (!allMarked) { setError('Mark every selected hose pass or fail before submitting.'); return }
    setError(null)
    setLoading(true)

    const payload = selectedHoses.map(h => ({
      hose_id: h.id,
      passed: results[h.id]!.passed!,
      failure_reason: results[h.id]!.failure_reason || null,
    }))

    const result = await submitHoseTestSession(testDate, parseInt(pressurePsi), parseInt(durationMin) || 5, payload)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.push('/iso/hoses')
    router.refresh()
  }

  if (hoses.length === 0) {
    return (
      <div className="max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <Link href="/iso/hoses" className="text-sm text-zinc-500 hover:text-red-700">← Hoses</Link>
        </div>
        <h1 className="text-xl font-bold text-zinc-900 mb-4">Hose Test Session</h1>
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          No in-service hoses found. Add hoses before running a test session.
        </div>
      </div>
    )
  }

  if (step === 'select') {
    return (
      <div className="max-w-2xl">
        <div className="mb-4 flex items-center gap-3">
          <Link href="/iso/hoses" className="text-sm text-zinc-500 hover:text-red-700">← Hoses</Link>
        </div>
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">Hose Test Session</h1>
            <p className="text-sm text-zinc-500 mt-0.5">NFPA 1962 · Tester: {testerName}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Test Parameters — set before selecting, carried into marking */}
        <div className="rounded-xl bg-white border border-zinc-200 p-5 mb-5">
          <h2 className="text-sm font-semibold text-zinc-700 mb-3">Test Parameters</h2>
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

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-700">
            Select Hoses to Test — {selected.size}/{hoses.length} selected
          </h2>
          <button onClick={handleSelectAllToggle} className="text-xs font-semibold text-red-700 hover:text-red-900">
            {filteredHoses.length > 0 && filteredHoses.every(h => selected.has(h.id)) ? 'Select None' : 'Select All'}
          </button>
        </div>

        <div className="relative mb-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search hose ID..."
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-400 hover:text-zinc-700">
              Clear
            </button>
          )}
        </div>

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

        {selected.size > 0 && (
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

        {groupedHoses.length === 0 ? (
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
                    hose.id in lockedByOthers ? (
                      <div key={hose.id} className="flex items-center gap-3 px-4 py-3 bg-zinc-50">
                        <input type="checkbox" checked={false} disabled className="w-4 h-4 rounded border-zinc-300" />
                        <div className="min-w-0 flex-1">
                          <span className="font-mono font-semibold text-zinc-400">{hose.hose_identifier}</span>
                          <span className="text-xs text-zinc-400 ml-2">{hose.length_ft} ft · {hose.hose_type}</span>
                        </div>
                        <span className="shrink-0 text-xs font-medium text-amber-600">
                          🔒 In progress{lockedByOthers[hose.id] ? ` — ${lockedByOthers[hose.id]}` : ''}
                        </span>
                        <button
                          onClick={() => handleForceRelease(hose.id)}
                          disabled={clearingId === hose.id}
                          className="shrink-0 text-xs font-semibold text-zinc-400 hover:text-red-700 disabled:opacity-50"
                        >
                          {clearingId === hose.id ? 'Clearing...' : 'Clear'}
                        </button>
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

        <button
          onClick={handleContinue}
          disabled={!canContinue}
          className="w-full rounded-lg bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
        >
          Continue with {selected.size} Hose{selected.size !== 1 ? 's' : ''} →
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={handleCancelMarking} className="text-sm text-zinc-500 hover:text-red-700">← Back to selection</button>
      </div>
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Hose Test Session</h1>
          <p className="text-sm text-zinc-500 mt-0.5">NFPA 1962 · Tester: {testerName}</p>
        </div>
        <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
          {markedCount}/{selectedHoses.length} marked
        </span>
      </div>

      {/* Hose List */}
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
                <input
                  type="text"
                  value={result.failure_reason}
                  onChange={e => setFailureReason(hose.id, e.target.value)}
                  placeholder="Failure reason (optional)"
                  className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-zinc-700 focus:border-red-400 focus:outline-none"
                />
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={loading || !allMarked || !pressurePsi}
          className="flex-1 rounded-lg bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Saving...' : `Submit ${selectedHoses.length} Test${selectedHoses.length !== 1 ? 's' : ''}`}
        </button>
        <button
          onClick={handleCancelMarking}
          className="rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
