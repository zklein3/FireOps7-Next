'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createDeptMember } from '@/app/actions/users'
import { createStation } from '@/app/actions/stations'
import { createApparatus } from '@/app/actions/apparatus'
import { createCompartmentName, updateCompartmentName } from '@/app/actions/compartments'

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  temp_password: 'bg-yellow-100 text-yellow-700',
  profile_setup: 'bg-blue-100 text-blue-700',
  awaiting_approval: 'bg-orange-100 text-orange-700',
  denied: 'bg-red-100 text-red-700',
}
const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  temp_password: 'Temp Password',
  profile_setup: 'Profile Setup',
  awaiting_approval: 'Pending',
  denied: 'Denied',
}

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

type Tab = 'personnel' | 'stations' | 'apparatus' | 'compartments'

interface Dept { id: string; name: string; code: string | null; active: boolean }
interface PersonnelRecord {
  id: string; system_role: string; signup_status: string; active: boolean
  employee_number: string | null; role_name: string | null
  personnel: { id: string; first_name: string; last_name: string; email: string; signup_status: string } | null
}
interface Station { id: string; station_number: string | null; station_name: string; address_line_1: string | null; city: string | null; state: string | null; active: boolean }
interface Apparatus { id: string; unit_number: string; apparatus_name: string | null; active: boolean; type_name: string | null; station_name: string | null; station_number: string | null }
interface Role { id: string; name: string; is_officer: boolean; sort_order: number }
interface CompartmentName { id: string; compartment_code: string; compartment_name: string | null; sort_order: number | null; active: boolean }

export default function SysAdminDeptClient({
  dept, personnel, stations, apparatus, roles, compartmentNames, departmentId,
}: {
  dept: Dept; personnel: PersonnelRecord[]; stations: Station[]
  apparatus: Apparatus[]; roles: Role[]; compartmentNames: CompartmentName[]; departmentId: string
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('personnel')
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [editingCompartmentId, setEditingCompartmentId] = useState<string | null>(null)

  function resetForm() { setShowForm(false); setError(null); setSuccess(null) }

  async function handleAddPersonnel(formData: FormData) {
    setError(null); setSuccess(null); setLoading(true)
    const result = await createDeptMember(formData)
    if (result?.error) setError(result.error)
    else { setSuccess('Personnel added successfully.'); setShowForm(false) }
    setLoading(false)
  }

  async function handleAddStation(formData: FormData) {
    setError(null); setSuccess(null); setLoading(true)
    const result = await createStation(formData)
    if (result?.error) setError(result.error)
    else { setSuccess('Station added successfully.'); setShowForm(false) }
    setLoading(false)
  }

  async function handleAddApparatus(formData: FormData) {
    setError(null); setSuccess(null); setLoading(true)
    const result = await createApparatus(formData)
    if (result?.error) setError(result.error)
    else { setSuccess('Apparatus added successfully.'); setShowForm(false) }
    setLoading(false)
  }

  async function handleAddCompartment(formData: FormData) {
    setError(null); setSuccess(null); setLoading(true)
    const result = await createCompartmentName(formData)
    if (result?.error) setError(result.error)
    else { setSuccess('Compartment added.'); setShowForm(false) }
    setLoading(false)
  }

  async function handleUpdateCompartment(formData: FormData) {
    setError(null); setSuccess(null); setLoading(true)
    const result = await updateCompartmentName(formData)
    if (result?.error) setError(result.error)
    else { setSuccess('Compartment updated.'); setEditingCompartmentId(null) }
    setLoading(false)
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'personnel', label: 'Personnel', count: personnel.length },
    { key: 'stations', label: 'Stations', count: stations.length },
    { key: 'apparatus', label: 'Apparatus', count: apparatus.length },
    { key: 'compartments', label: 'Compartments', count: compartmentNames.length },
  ]

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm text-zinc-500 hover:text-zinc-700">← Back</button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">{dept.name}</h1>
            {dept.code && <span className="text-sm font-mono text-zinc-400">{dept.code}</span>}
          </div>
          <p className="text-sm text-zinc-500">System Admin — Department Management</p>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
          dept.active ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
        }`}>
          {dept.active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white rounded-xl border border-zinc-200 p-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); resetForm() }}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-red-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'
            }`}>
            {t.label}
            <span className={`ml-1.5 text-xs ${tab === t.key ? 'text-red-200' : 'text-zinc-400'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Alerts */}
      {success && <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-200">{success}</div>}
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}

      {/* ── PERSONNEL TAB ─────────────────────────────────────────────── */}
      {tab === 'personnel' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setShowForm(!showForm); setError(null) }}
              className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
              {showForm ? 'Cancel' : '+ Add Personnel'}
            </button>
          </div>

          {showForm && (
            <div className="mb-6 rounded-xl bg-white p-5 shadow-sm border border-zinc-200">
              <h2 className="text-base font-semibold text-zinc-900 mb-4">Add Personnel</h2>
              <form action={handleAddPersonnel} className="flex flex-col gap-4">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Email <span className="text-red-500">*</span></label>
                    <input name="email" type="email" required placeholder="member@dept.com"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                  <div className="w-36">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Access Level <span className="text-red-500">*</span></label>
                    <select name="system_role" required defaultValue="member"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                      <option value="admin">Admin</option>
                      <option value="officer">Officer</option>
                      <option value="member">Member</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Title / Rank</label>
                    <select name="role_id"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                      <option value="">Select title...</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div className="w-36">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Employee #</label>
                    <input name="employee_number" type="text"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                  <div className="w-40">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Hire Date</label>
                    <input name="hire_date" type="date"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                  {loading ? 'Adding...' : 'Add Personnel'}
                </button>
              </form>
            </div>
          )}

          <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-x-auto">
            {personnel.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-zinc-400">No personnel yet.</div>
            ) : (
              <table className="w-full text-sm min-w-[600px]">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-zinc-600">Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-zinc-600">Email</th>
                    <th className="px-4 py-3 text-left font-semibold text-zinc-600">Role</th>
                    <th className="px-4 py-3 text-left font-semibold text-zinc-600">Access</th>
                    <th className="px-4 py-3 text-left font-semibold text-zinc-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {personnel.map(p => {
                    const name = [p.personnel?.first_name, p.personnel?.last_name].filter(Boolean).join(' ') || '—'
                    const status = p.personnel?.signup_status ?? p.signup_status
                    return (
                      <tr key={p.id} className="hover:bg-zinc-50">
                        <td className="px-4 py-3 font-medium text-zinc-900 whitespace-nowrap">{name}</td>
                        <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">{p.personnel?.email ?? '—'}</td>
                        <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">{p.role_name ?? '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            p.system_role === 'admin' ? 'bg-red-100 text-red-700' :
                            p.system_role === 'officer' ? 'bg-blue-100 text-blue-700' :
                            'bg-zinc-100 text-zinc-600'
                          }`}>
                            {p.system_role}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                            {STATUS_LABELS[status] ?? status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── STATIONS TAB ──────────────────────────────────────────────── */}
      {tab === 'stations' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setShowForm(!showForm); setError(null) }}
              className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
              {showForm ? 'Cancel' : '+ Add Station'}
            </button>
          </div>

          {showForm && (
            <div className="mb-6 rounded-xl bg-white p-5 shadow-sm border border-zinc-200">
              <h2 className="text-base font-semibold text-zinc-900 mb-4">Add Station</h2>
              <form action={handleAddStation} className="flex flex-col gap-4">
                <div className="flex gap-3">
                  <div className="w-28">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Station #</label>
                    <input name="station_number" type="text" placeholder="2"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Station Name <span className="text-red-500">*</span></label>
                    <input name="station_name" type="text" required placeholder="Headquarters"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Address</label>
                  <input name="address_line_1" type="text" placeholder="123 Main St"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">City</label>
                    <input name="city" type="text"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                  <div className="w-24">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">State</label>
                    <select name="state"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                      <option value="">—</option>
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="w-28">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">ZIP</label>
                    <input name="postal_code" type="text"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                  {loading ? 'Adding...' : 'Add Station'}
                </button>
              </form>
            </div>
          )}

          <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
            {stations.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-zinc-400">No stations yet.</div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {stations.map(s => (
                  <div key={s.id} className="flex items-center px-5 py-4 hover:bg-zinc-50">
                    <div className="flex-1">
                      <p className="text-xs text-red-600 font-medium">Station {s.station_number ?? '—'}</p>
                      <p className="text-sm font-semibold text-zinc-900">{s.station_name}</p>
                      {(s.address_line_1 || s.city) && (
                        <p className="text-xs text-zinc-400">{[s.address_line_1, s.city, s.state].filter(Boolean).join(', ')}</p>
                      )}
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.active ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
                    }`}>
                      {s.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── APPARATUS TAB ─────────────────────────────────────────────── */}
      {tab === 'apparatus' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setShowForm(!showForm); setError(null) }}
              className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
              {showForm ? 'Cancel' : '+ Add Apparatus'}
            </button>
          </div>

          {showForm && (
            <div className="mb-6 rounded-xl bg-white p-5 shadow-sm border border-zinc-200">
              <h2 className="text-base font-semibold text-zinc-900 mb-4">Add Apparatus</h2>
              <form action={handleAddApparatus} className="flex flex-col gap-4">
                <div className="flex gap-3">
                  <div className="w-28">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Unit # <span className="text-red-500">*</span></label>
                    <input name="unit_number" type="text" required placeholder="32"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Apparatus Name</label>
                    <input name="apparatus_name" type="text" placeholder="Engine 32"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Make</label>
                    <input name="make" type="text"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Model</label>
                    <input name="model" type="text"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                  <div className="w-24">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Year</label>
                    <input name="model_year" type="number"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Station</label>
                    <select name="station_id"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                      <option value="">No station</option>
                      {stations.filter(s => s.active).map(s => (
                        <option key={s.id} value={s.id}>Station {s.station_number} — {s.station_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-36">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">In Service Date</label>
                    <input name="in_service_date" type="date"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                  {loading ? 'Adding...' : 'Add Apparatus'}
                </button>
              </form>
            </div>
          )}

          <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-x-auto">
            {apparatus.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-zinc-400">No apparatus yet.</div>
            ) : (
              <table className="w-full text-sm min-w-[500px]">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-zinc-600">Unit</th>
                    <th className="px-4 py-3 text-left font-semibold text-zinc-600">Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-zinc-600">Type</th>
                    <th className="px-4 py-3 text-left font-semibold text-zinc-600">Station</th>
                    <th className="px-4 py-3 text-left font-semibold text-zinc-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {apparatus.map(a => (
                    <tr key={a.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-bold text-zinc-900">{a.unit_number}</td>
                      <td className="px-4 py-3 text-zinc-600">{a.apparatus_name ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-500">{a.type_name ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-500">
                        {a.station_name ? `Station ${a.station_number} — ${a.station_name}` : <span className="text-yellow-600">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          a.active ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
                        }`}>
                          {a.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── COMPARTMENTS TAB ──────────────────────────────────────────── */}
      {tab === 'compartments' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setShowForm(!showForm); setError(null) }}
              className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
              {showForm ? 'Cancel' : '+ Add Compartment'}
            </button>
          </div>

          {showForm && (
            <div className="mb-6 rounded-xl bg-white p-5 shadow-sm border border-zinc-200">
              <h2 className="text-base font-semibold text-zinc-900 mb-4">Add Compartment</h2>
              <form action={handleAddCompartment} className="flex flex-col gap-4">
                <div className="flex gap-3">
                  <div className="w-32">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Code <span className="text-red-500">*</span></label>
                    <input name="compartment_code" type="text" required placeholder="D1"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono uppercase focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Name / Description</label>
                    <input name="compartment_name" type="text" placeholder="Driver Side 1"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                  <div className="w-24">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Sort</label>
                    <input name="sort_order" type="number" min="1"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                  {loading ? 'Adding...' : 'Add Compartment'}
                </button>
              </form>
            </div>
          )}

          <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
            {compartmentNames.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-zinc-400">No compartments defined yet.</div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {[...compartmentNames]
                  .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
                  .map(c => (
                    <div key={c.id}>
                      {editingCompartmentId === c.id ? (
                        <div className="p-4">
                          <form action={handleUpdateCompartment} className="flex flex-col gap-3">
                            <input type="hidden" name="id" value={c.id} />
                            <div className="flex gap-3">
                              <div className="w-32">
                                <input name="compartment_code" type="text" required defaultValue={c.compartment_code}
                                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono uppercase focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                              </div>
                              <div className="flex-1">
                                <input name="compartment_name" type="text" defaultValue={c.compartment_name ?? ''}
                                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                              </div>
                              <div className="w-24">
                                <input name="sort_order" type="number" defaultValue={c.sort_order ?? ''}
                                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                              </div>
                              <div className="w-28">
                                <select name="active" defaultValue={c.active ? 'true' : 'false'}
                                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                                  <option value="true">Active</option>
                                  <option value="false">Inactive</option>
                                </select>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button type="submit" disabled={loading}
                                className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                                {loading ? 'Saving...' : 'Save'}
                              </button>
                              <button type="button" onClick={() => setEditingCompartmentId(null)}
                                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
                                Cancel
                              </button>
                            </div>
                          </form>
                        </div>
                      ) : (
                        <div className="flex items-center px-5 py-4 hover:bg-zinc-50">
                          <div className="flex-1 flex items-center gap-3">
                            <span className="inline-flex items-center rounded-lg bg-red-50 border border-red-100 px-2.5 py-1 text-sm font-mono font-bold text-red-700">
                              {c.compartment_code}
                            </span>
                            {c.compartment_name && <span className="text-sm text-zinc-600">{c.compartment_name}</span>}
                            {!c.active && <span className="text-xs rounded-full bg-zinc-100 text-zinc-400 px-2 py-0.5">Inactive</span>}
                          </div>
                          <button onClick={() => { setEditingCompartmentId(c.id); setError(null) }}
                            className="text-xs font-semibold text-red-600 hover:text-red-800">
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
