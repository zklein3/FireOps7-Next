'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createCompartmentName,
  updateCompartmentName,
  bulkSetCompartmentApparatus,
} from '@/app/actions/compartments'
import HelpPrompt from './HelpPrompt'

interface Compartment {
  id: string
  compartment_code: string
  compartment_name: string | null
  sort_order: number | null
  active: boolean
}

interface Apparatus {
  id: string
  unit_number: string
  apparatus_name: string | null
}

export default function CompartmentsStep({
  compartments,
  usageMap,
  assignmentMap,
  apparatus,
  departmentId,
  showHelp,
  helpResetKey,
}: {
  compartments: Compartment[]
  usageMap: Record<string, number>
  assignmentMap: Record<string, string[]>
  apparatus: Apparatus[]
  departmentId: string
  showHelp: boolean
  helpResetKey: number
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assignChecked, setAssignChecked] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const q = search.toLowerCase()
  const visibleCompartments = showAll ? compartments : compartments.filter(c => c.active)
  const filteredCompartments = q ? visibleCompartments.filter(c =>
    c.compartment_code.toLowerCase().includes(q) ||
    (c.compartment_name ?? '').toLowerCase().includes(q)
  ) : visibleCompartments

  async function handleCreate(formData: FormData) {
    setError(null); setSuccess(null); setLoading(true)
    formData.append('department_id', departmentId)
    const result = await createCompartmentName(formData)
    if (result?.error) setError(result.error)
    else { setSuccess('Compartment template added.'); setShowForm(false); router.refresh() }
    setLoading(false)
  }

  async function handleUpdate(formData: FormData) {
    setError(null); setSuccess(null); setLoading(true)
    const result = await updateCompartmentName(formData)
    if (result?.error) setError(result.error)
    else { setSuccess('Compartment updated.'); setEditingId(null); router.refresh() }
    setLoading(false)
  }

  function openAssign(compartmentId: string) {
    setAssigningId(compartmentId)
    setAssignChecked(new Set(assignmentMap[compartmentId] ?? []))
    setEditingId(null)
    setError(null)
    setSuccess(null)
  }

  async function handleSaveAssignment() {
    if (!assigningId) return
    setError(null); setLoading(true)
    const result = await bulkSetCompartmentApparatus(assigningId, Array.from(assignChecked))
    if (result?.error) setError(result.error)
    else { setSuccess('Apparatus assignment saved.'); setAssigningId(null); router.refresh() }
    setLoading(false)
  }

  function toggleApparatus(id: string) {
    setAssignChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">Compartments</h2>
          <p className="text-sm text-zinc-500">{compartments.filter(c => c.active).length} active</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-zinc-200 overflow-hidden text-xs font-medium">
            <button
              onClick={() => setShowAll(false)}
              className={`px-3 py-1.5 transition-colors ${!showAll ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
            >
              Active
            </button>
            <button
              onClick={() => setShowAll(true)}
              className={`px-3 py-1.5 transition-colors ${showAll ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
            >
              All
            </button>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setEditingId(null); setAssigningId(null); setError(null); setSuccess(null) }}
            className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
          >
            {showForm ? 'Cancel' : '+ Add Compartment'}
          </button>
        </div>
      </div>

      <HelpPrompt id="compartments" showHelp={showHelp} helpResetKey={helpResetKey}>
        Compartment templates define named storage locations (D1, Officer Side, Hose Bay). Create the templates first, then assign them to each apparatus using the Assign button.
      </HelpPrompt>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}
      {success && <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-200">{success}</div>}

      {/* Add form */}
      {showForm && (
        <div className="mb-4 rounded-xl bg-white p-5 shadow-sm border border-zinc-200">
          <p className="text-sm font-semibold text-zinc-900 mb-4">New Compartment Template</p>
          <form action={handleCreate} className="flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="w-32">
                <label className="mb-1 block text-xs font-medium text-zinc-600">Code <span className="text-red-500">*</span></label>
                <input
                  name="compartment_code"
                  type="text"
                  required
                  placeholder="D1"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono uppercase focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  onInput={(e) => { (e.target as HTMLInputElement).value = (e.target as HTMLInputElement).value.toUpperCase() }}
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-zinc-600">Name</label>
                <input name="compartment_name" type="text" placeholder="Driver Side"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="w-24">
                <label className="mb-1 block text-xs font-medium text-zinc-600">Sort Order</label>
                <input name="sort_order" type="number" min="0" placeholder="0"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
              {loading ? 'Adding...' : 'Add Compartment'}
            </button>
          </form>
        </div>
      )}

      {compartments.length > 0 && (
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search compartments..."
          className="w-full mb-4 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
      )}

      {/* Cards */}
      {compartments.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-400">
          No compartment templates yet — add your first above.
        </div>
      ) : filteredCompartments.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-400">
          {q ? `No compartments match "${search}".` : 'No active compartments — switch to All to see inactive ones.'}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredCompartments.map(c => {
            const assignedCount = usageMap[c.id] ?? 0

            return (
              <div key={c.id} className={`rounded-xl bg-white border shadow-sm ${
                c.active ? 'border-zinc-200' : 'border-zinc-100 opacity-60'
              }`}>
                {editingId === c.id ? (
                  <div className="p-5">
                    <p className="text-sm font-semibold text-zinc-900 mb-4">Edit Compartment</p>
                    <form action={handleUpdate} className="flex flex-col gap-3">
                      <input type="hidden" name="id" value={c.id} />
                      <div className="flex gap-3">
                        <div className="w-32">
                          <label className="mb-1 block text-xs font-medium text-zinc-600">Code <span className="text-red-500">*</span></label>
                          <input
                            name="compartment_code"
                            type="text"
                            required
                            defaultValue={c.compartment_code}
                            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono uppercase focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                            onInput={(e) => { (e.target as HTMLInputElement).value = (e.target as HTMLInputElement).value.toUpperCase() }}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-medium text-zinc-600">Name</label>
                          <input name="compartment_name" type="text" defaultValue={c.compartment_name ?? ''}
                            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                        </div>
                        <div className="w-24">
                          <label className="mb-1 block text-xs font-medium text-zinc-600">Sort Order</label>
                          <input name="sort_order" type="number" min="0" defaultValue={c.sort_order ?? ''}
                            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-zinc-600">Status</span>
                        <select name="active" defaultValue={c.active ? 'true' : 'false'}
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                          <option value="true">Active</option>
                          <option value="false">Inactive</option>
                        </select>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button type="submit" disabled={loading}
                          className="flex-1 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
                          {loading ? 'Saving...' : 'Save Changes'}
                        </button>
                        <button type="button" onClick={() => setEditingId(null)}
                          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors">
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                ) : assigningId === c.id ? (
                  <div className="p-5">
                    <p className="text-sm font-semibold text-zinc-900 mb-1">Assign Apparatus</p>
                    <p className="text-xs text-zinc-500 mb-4">
                      Select which apparatus will have a <span className="font-mono font-semibold">{c.compartment_code}</span> compartment.
                    </p>
                    {apparatus.length === 0 ? (
                      <p className="text-sm text-zinc-400 mb-4">No apparatus yet — add apparatus first.</p>
                    ) : (
                      <div className="flex flex-col gap-2 mb-4">
                        {apparatus.map(app => (
                          <label key={app.id} className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 cursor-pointer hover:bg-zinc-50 transition-colors">
                            <input
                              type="checkbox"
                              checked={assignChecked.has(app.id)}
                              onChange={() => toggleApparatus(app.id)}
                              className="rounded border-zinc-300 text-red-600 focus:ring-red-500"
                            />
                            <span className="text-sm font-medium text-zinc-900">
                              {app.unit_number}{app.apparatus_name ? ` — ${app.apparatus_name}` : ''}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSaveAssignment}
                        disabled={loading}
                        className="flex-1 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
                      >
                        {loading ? 'Saving...' : 'Save Assignment'}
                      </button>
                      <button type="button" onClick={() => setAssigningId(null)}
                        className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-zinc-900">{c.compartment_code}</span>
                        {c.compartment_name && (
                          <span className="text-sm text-zinc-600">— {c.compartment_name}</span>
                        )}
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.active ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
                        }`}>
                          {c.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      {assignedCount > 0 ? (
                        <p className="text-xs text-zinc-500">
                          Assigned to {assignedCount} apparatus
                        </p>
                      ) : (
                        <p className="text-xs text-yellow-600 font-medium">Not assigned to any apparatus</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => openAssign(c.id)}
                        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
                      >
                        Assign
                      </button>
                      <button
                        onClick={() => { setEditingId(c.id); setAssigningId(null); setShowForm(false); setError(null) }}
                        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
