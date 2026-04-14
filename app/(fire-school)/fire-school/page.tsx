'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkBottle, logFill } from '@/app/actions/fire-school'

const CYLINDER_TYPE_LABELS: Record<string, string> = {
  composite_15: 'Composite (15yr)',
  composite_30: 'Composite (30yr)',
  steel: 'Steel',
  aluminum: 'Aluminum',
}

interface Bottle {
  bottle_id: string
  department_name: string | null
  psi: number | null
  cylinder_type: string | null
  manufacture_date: string | null
  last_requal_date: string | null
  requal_interval_years: number | null
  service_life_years: number | null
  requires_service_life: boolean | null
  active: boolean
}

export default function FillStationPage() {
  const router = useRouter()
  const [bottleInput, setBottleInput] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<{
    found: boolean
    bottle?: Bottle
    fillable?: boolean
    reason?: string | null
  } | null>(null)
  const [logging, setLogging] = useState(false)
  const [logged, setLogged] = useState(false)
  const [notes, setNotes] = useState('')

  async function handleCheck() {
    if (!bottleInput.trim()) return
    setChecking(true)
    setResult(null)
    setLogged(false)
    const res = await checkBottle(bottleInput.trim())
    setResult(res)
    setChecking(false)
  }

  async function handleLogFill() {
    if (!result?.bottle) return
    setLogging(true)
    const res = await logFill(result.bottle.bottle_id, notes)
    if (res.success) {
      setLogged(true)
      setNotes('')
    }
    setLogging(false)
  }

  function handleReset() {
    setBottleInput('')
    setResult(null)
    setLogged(false)
    setNotes('')
  }

  const getRequalExpiry = (bottle: Bottle) => {
    if (!bottle.last_requal_date || !bottle.requal_interval_years) return null
    const d = new Date(bottle.last_requal_date)
    d.setFullYear(d.getFullYear() + bottle.requal_interval_years)
    return d
  }

  const getServiceLifeExpiry = (bottle: Bottle) => {
    if (!bottle.requires_service_life || !bottle.manufacture_date || !bottle.service_life_years) return null
    const d = new Date(bottle.manufacture_date)
    d.setFullYear(d.getFullYear() + bottle.service_life_years)
    return d
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-zinc-900">SCBA Fill Station</h1>
        <p className="text-sm text-zinc-500 mt-1">Enter a bottle ID to check status and log a fill</p>
      </div>

      {/* Bottle Entry */}
      {!result && (
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-6">
          <label className="mb-2 block text-sm font-medium text-zinc-700">Bottle ID</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={bottleInput}
              onChange={e => setBottleInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCheck()}
              placeholder="B-0001"
              className="flex-1 rounded-lg border border-zinc-300 px-4 py-3 text-lg font-mono font-bold text-zinc-900 uppercase placeholder-zinc-300 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              autoFocus
            />
            <button
              onClick={handleCheck}
              disabled={checking || !bottleInput.trim()}
              className="rounded-lg bg-orange-600 px-6 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {checking ? 'Checking...' : 'Check'}
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-400">Press Enter or tap Check to look up the bottle</p>
        </div>
      )}

      {/* Result */}
      {result && !logged && (
        <div className="flex flex-col gap-4">
          {!result.found && (
            <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-6 text-center">
              <div className="text-4xl mb-3">🔍</div>
              <h2 className="text-lg font-bold text-zinc-900 mb-1">Bottle Not Found</h2>
              <p className="text-sm text-zinc-500 mb-6">
                <span className="font-mono font-bold">{bottleInput.toUpperCase()}</span> is not in the system.
              </p>
              <div className="flex gap-3">
                <button onClick={handleReset}
                  className="flex-1 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                  Try Again
                </button>
                <button
                  onClick={() => router.push(`/fire-school/bottles?add=${bottleInput.toUpperCase()}`)}
                  className="flex-1 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700">
                  Add Bottle
                </button>
              </div>
            </div>
          )}

          {result.found && result.bottle && (
            <>
              <div className={`rounded-xl shadow-sm border p-5 ${
                result.fillable ? 'bg-white border-zinc-200' : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <span className="text-3xl font-bold font-mono text-zinc-900">{result.bottle.bottle_id}</span>
                    {result.bottle.department_name && (
                      <p className="text-sm text-zinc-500 mt-0.5">{result.bottle.department_name}</p>
                    )}
                  </div>
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${
                    result.fillable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {result.fillable ? '✓ OK to Fill' : '✗ Do Not Fill'}
                  </span>
                </div>

                {!result.fillable && result.reason && (
                  <div className="mb-4 rounded-lg bg-red-100 border border-red-200 px-4 py-3 text-sm font-medium text-red-800">
                    ⚠️ {result.reason}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <DetailField label="PSI" value={result.bottle.psi ? `${result.bottle.psi} PSI` : null} />
                  <DetailField label="Type" value={result.bottle.cylinder_type ? CYLINDER_TYPE_LABELS[result.bottle.cylinder_type] ?? result.bottle.cylinder_type : null} />
                  <DetailField label="Manufacture Date" value={result.bottle.manufacture_date ? new Date(result.bottle.manufacture_date).toLocaleDateString() : null} />
                  <DetailField label="Last Requal" value={result.bottle.last_requal_date ? new Date(result.bottle.last_requal_date).toLocaleDateString() : null} />
                  <DetailField label="Requal Expiry" value={getRequalExpiry(result.bottle)?.toLocaleDateString() ?? null} />
                  {result.bottle.requires_service_life && (
                    <DetailField label="Service Life Ends" value={getServiceLifeExpiry(result.bottle)?.toLocaleDateString() ?? null} />
                  )}
                </div>
              </div>

              {result.fillable && (
                <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5">
                  <h3 className="text-base font-semibold text-zinc-900 mb-3">Log Fill</h3>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Notes (optional)"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm mb-3 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
                  />
                  <button
                    onClick={handleLogFill}
                    disabled={logging}
                    className="w-full rounded-lg bg-green-600 px-4 py-3 text-base font-bold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {logging ? 'Logging Fill...' : '✓ Log Fill'}
                  </button>
                </div>
              )}

              <button onClick={handleReset}
                className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                ← Check Another Bottle
              </button>
            </>
          )}
        </div>
      )}

      {/* Success */}
      {logged && (
        <div className="rounded-xl bg-white shadow-sm border border-green-200 p-8 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-zinc-900 mb-1">Fill Logged!</h2>
          <p className="text-sm text-zinc-500 mb-6">
            Fill recorded for <span className="font-mono font-bold">{result?.bottle?.bottle_id}</span>
          </p>
          <button onClick={handleReset}
            className="w-full rounded-lg bg-orange-600 px-4 py-3 text-base font-bold text-white hover:bg-orange-700">
            Fill Another Bottle
          </button>
        </div>
      )}
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-zinc-900">{value || '—'}</p>
    </div>
  )
}
