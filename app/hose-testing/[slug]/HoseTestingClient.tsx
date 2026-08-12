'use client'

import { useEffect, useState } from 'react'
import { addPublicHose, submitPublicHoseTestSession } from '@/app/actions/hose-testing'

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

  const [step, setStep] = useState<'select' | 'mark'>('select')
  const [hoses, setHoses] = useState(initialHoses)
  const [selected, setSelected] = useState<Set<string>>(new Set(initialHoses.map(h => h.id)))

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

  useEffect(() => {
    const stored = localStorage.getItem(TESTER_NAME_KEY)
    if (stored) setTesterName(stored)
  }, [])

  function saveTesterName(name: string) {
    setTesterName(name)
    localStorage.setItem(TESTER_NAME_KEY, name)
  }

  function toggleSelected(hoseId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(hoseId)) next.delete(hoseId)
      else next.add(hoseId)
      return next
    })
  }

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

    setSuccess(`Saved ${result.count} test result${result.count !== 1 ? 's' : ''}.`)
    setResults({})
    setSelected(new Set())
    setStep('select')
    setLoading(false)
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

      {step === 'select' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-700">
              Select Hoses to Test{hoses.length > 0 ? ` — ${selected.size}/${hoses.length} selected` : ''}
            </h2>
            <div className="flex gap-2">
              {hoses.length > 0 && (
                <button
                  onClick={() => setSelected(selected.size === hoses.length ? new Set() : new Set(hoses.map(h => h.id)))}
                  className="text-xs font-semibold text-red-700 hover:text-red-900"
                >
                  {selected.size === hoses.length ? 'Select None' : 'Select All'}
                </button>
              )}
              <button onClick={() => setShowAddHose(v => !v)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
                {showAddHose ? 'Cancel' : '+ Add Hose'}
              </button>
            </div>
          </div>

          {showAddHose && (
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
          ) : (
            <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden divide-y divide-zinc-100 mb-5">
              {hoses.map(hose => (
                <label key={hose.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-50">
                  <input
                    type="checkbox"
                    checked={selected.has(hose.id)}
                    onChange={() => toggleSelected(hose.id)}
                    className="w-4 h-4 rounded border-zinc-300 text-red-600 focus:ring-red-500"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="font-mono font-semibold text-zinc-900">{hose.hose_identifier}</span>
                    <span className="text-xs text-zinc-400 ml-2">{hose.diameter_in}&quot; · {hose.length_ft} ft · {hose.hose_type}</span>
                  </div>
                </label>
              ))}
            </div>
          )}

          {hoses.length > 0 && (
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
            <button onClick={() => setStep('select')} className="text-xs font-semibold text-zinc-500 hover:text-zinc-800">
              ← Change Selection
            </button>
          </div>

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
