'use client'

import { useState } from 'react'
import { addFireSchoolBottle } from '@/app/actions/fire-school'

const CYLINDER_TYPES = [
  { value: 'composite_15', label: 'Composite (15yr service life)' },
  { value: 'composite_30', label: 'Composite (30yr service life)' },
  { value: 'steel', label: 'Steel' },
  { value: 'aluminum', label: 'Aluminum' },
]

const CYLINDER_TYPE_LABELS: Record<string, string> = {
  composite_15: 'Composite (15yr)',
  composite_30: 'Composite (30yr)',
  steel: 'Steel',
  aluminum: 'Aluminum',
}

interface Bottle {
  id: string
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
  status_reason: string | null
}

export default function FireSchoolBottlesClient({
  bottles,
  fillCounts,
  prefillBottleId,
}: {
  bottles: Bottle[]
  fillCounts: Record<string, number>
  prefillBottleId: string | null
}) {
  const [showForm, setShowForm] = useState(!!prefillBottleId)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [requiresServiceLife, setRequiresServiceLife] = useState(true)

  async function handleAdd(formData: FormData) {
    setError(null)
    setSuccess(null)
    setLoading(true)
    const result = await addFireSchoolBottle(formData)
    if (result?.error) {
      setError(result.error)
    } else {
      setSuccess('Bottle added successfully.')
      setShowForm(false)
    }
    setLoading(false)
  }

  const today = new Date()

  function getStatus(bottle: Bottle) {
    if (!bottle.active) return { label: 'Inactive', color: 'bg-zinc-100 text-zinc-500' }

    if (bottle.last_requal_date && bottle.requal_interval_years) {
      const expiry = new Date(bottle.last_requal_date)
      expiry.setFullYear(expiry.getFullYear() + bottle.requal_interval_years)
      if (today > expiry) return { label: 'Requal Expired', color: 'bg-red-100 text-red-700' }
    }

    if (bottle.requires_service_life && bottle.manufacture_date && bottle.service_life_years) {
      const endOfLife = new Date(bottle.manufacture_date)
      endOfLife.setFullYear(endOfLife.getFullYear() + bottle.service_life_years)
      if (today > endOfLife) return { label: 'End of Life', color: 'bg-red-100 text-red-700' }
    }

    return { label: 'OK', color: 'bg-green-100 text-green-700' }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Bottles</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{bottles.length} bottle{bottles.length !== 1 ? 's' : ''} in system</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(null); setSuccess(null) }}
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Bottle'}
        </button>
      </div>

      {success && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-200">{success}</div>
      )}

      {/* Add Bottle Form */}
      {showForm && (
        <div className="mb-6 rounded-xl bg-white p-5 shadow-sm border border-zinc-200">
          <h2 className="text-base font-semibold text-zinc-900 mb-4">Add Bottle</h2>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>
          )}
          <form action={handleAdd} className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="sm:w-36">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Bottle ID <span className="text-red-500">*</span></label>
                <input name="bottle_id" type="text" required
                  defaultValue={prefillBottleId ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono uppercase focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="B-0001" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Department / Owner</label>
                <input name="department_name" type="text"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="Winslow Fire" />
              </div>
              <div className="sm:w-32">
                <label className="mb-1 block text-sm font-medium text-zinc-700">PSI</label>
                <select name="psi" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">
                  <option value="4500">4500</option>
                  <option value="2216">2216</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Cylinder Type</label>
                <select name="cylinder_type"
                  onChange={e => setRequiresServiceLife(e.target.value.startsWith('composite'))}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">
                  {CYLINDER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="sm:w-28">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Requal Interval</label>
                <select name="requal_interval_years" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">
                  <option value="5">5 years</option>
                  <option value="3">3 years</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Manufacture Date</label>
                <input name="manufacture_date" type="date"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Last Requal Date</label>
                <input name="last_requal_date" type="date"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
              </div>
              {requiresServiceLife && (
                <div className="sm:w-32">
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Service Life</label>
                  <select name="service_life_years" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500">
                    <option value="15">15 years</option>
                    <option value="30">30 years</option>
                  </select>
                </div>
              )}
            </div>

            <input type="hidden" name="requires_service_life" value={requiresServiceLife ? 'true' : 'false'} />

            <button type="submit" disabled={loading}
              className="w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50 transition-colors">
              {loading ? 'Adding...' : 'Add Bottle'}
            </button>
          </form>
        </div>
      )}

      {/* Bottles Table */}
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-zinc-50 border-b border-zinc-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-zinc-600">Bottle ID</th>
              <th className="px-4 py-3 text-left font-semibold text-zinc-600">Department</th>
              <th className="px-4 py-3 text-left font-semibold text-zinc-600">Type</th>
              <th className="px-4 py-3 text-left font-semibold text-zinc-600">Last Requal</th>
              <th className="px-4 py-3 text-left font-semibold text-zinc-600">Fills</th>
              <th className="px-4 py-3 text-left font-semibold text-zinc-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {bottles.map(bottle => {
              const status = getStatus(bottle)
              return (
                <tr key={bottle.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-mono font-bold text-zinc-900">{bottle.bottle_id}</td>
                  <td className="px-4 py-3 text-zinc-500">{bottle.department_name ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-500">{bottle.cylinder_type ? CYLINDER_TYPE_LABELS[bottle.cylinder_type] ?? bottle.cylinder_type : '—'}</td>
                  <td className="px-4 py-3 text-zinc-500">{bottle.last_requal_date ? new Date(bottle.last_requal_date).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3 text-zinc-500">{fillCounts[bottle.bottle_id] ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
