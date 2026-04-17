'use client'

import { useState } from 'react'
import { createExcuseType, saveParticipationRequirement } from '@/app/actions/attendance'
import { useRouter } from 'next/navigation'

interface ExcuseType { id: string; excuse_name: string; active: boolean }
interface Requirement { id: string; event_type: string; minimum_percentage: number; period: string; active: boolean }

const inputCls = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"

const EVENT_TYPES = [
  { value: 'training', label: 'Training' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'incident', label: 'Incident' },
  { value: 'special', label: 'Special Event' },
]

export default function AttendanceSettingsClient({
  excuseTypes, requirements, departmentId,
}: {
  excuseTypes: ExcuseType[]
  requirements: Record<string, Requirement>
  departmentId: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showExcuseForm, setShowExcuseForm] = useState(false)

  function reset() { setError(null); setSuccess(null) }

  async function handleAddExcuse(formData: FormData) {
    reset(); setLoading(true)
    const result = await createExcuseType(formData)
    if (result?.error) setError(result.error)
    else { setSuccess('Excuse type added.'); setShowExcuseForm(false); router.refresh() }
    setLoading(false)
  }

  async function handleSaveRequirement(formData: FormData) {
    reset(); setLoading(true)
    const result = await saveParticipationRequirement(formData)
    if (result?.error) setError(result.error)
    else { setSuccess('Participation requirement saved.'); router.refresh() }
    setLoading(false)
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Attendance Settings</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Configure excuse types and participation requirements</p>
      </div>

      {success && <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-200">{success}</div>}
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}

      {/* Excuse Types */}
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden mb-5">
        <div className="px-5 py-4 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-900">Excuse Types</p>
            <p className="text-xs text-zinc-400">Valid reasons members can submit for missing an event</p>
          </div>
          <button
            onClick={() => { setShowExcuseForm(!showExcuseForm); reset() }}
            className="text-xs font-semibold text-red-600 hover:text-red-800">
            {showExcuseForm ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {showExcuseForm && (
          <div className="px-5 py-4 border-b border-zinc-100">
            <form action={handleAddExcuse} className="flex gap-3">
              <input
                name="excuse_name"
                type="text"
                required
                placeholder="e.g. Family Emergency"
                className={`flex-1 ${inputCls}`}
              />
              <button type="submit" disabled={loading}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 shrink-0">
                {loading ? '...' : 'Add'}
              </button>
            </form>
          </div>
        )}

        {excuseTypes.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-zinc-400">
            No excuse types defined yet. Add one above.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {excuseTypes.map(et => (
              <div key={et.id} className="flex items-center px-5 py-3">
                <p className="flex-1 text-sm text-zinc-800">{et.excuse_name}</p>
                {!et.active && <span className="text-xs text-zinc-400">Inactive</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Participation Requirements */}
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
        <div className="px-5 py-4 bg-zinc-50 border-b border-zinc-200">
          <p className="text-sm font-semibold text-zinc-900">Participation Requirements</p>
          <p className="text-xs text-zinc-400">Minimum attendance thresholds per event type. For reporting only — not enforced.</p>
        </div>

        <div className="divide-y divide-zinc-100">
          {EVENT_TYPES.map(et => {
            const req = requirements[et.value]
            return (
              <div key={et.value} className="px-5 py-4">
                <p className="text-sm font-semibold text-zinc-800 mb-3">{et.label}</p>
                <form action={handleSaveRequirement} className="flex gap-3 items-end">
                  <input type="hidden" name="event_type" value={et.value} />
                  <div className="w-28">
                    <label className="mb-1 block text-xs font-medium text-zinc-500">Min %</label>
                    <div className="relative">
                      <input
                        name="minimum_percentage"
                        type="number"
                        min="0"
                        max="100"
                        defaultValue={req?.minimum_percentage ?? 0}
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-zinc-500">Period</label>
                    <select name="period" defaultValue={req?.period ?? 'monthly'} className={inputCls}>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="annual">Annual</option>
                    </select>
                  </div>
                  <button type="submit" disabled={loading}
                    className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 shrink-0">
                    {loading ? '...' : 'Save'}
                  </button>
                </form>
                {req && (
                  <p className="text-xs text-zinc-400 mt-2">
                    Current: {req.minimum_percentage}% per {req.period}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
