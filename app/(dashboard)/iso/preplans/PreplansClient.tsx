'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { savePreplan, deletePreplan, getPreplanDocUrl } from '@/app/actions/iso'
import HelpText from '@/components/HelpText'

type Preplan = {
  id: string
  location_name: string
  address: string | null
  surveyed_date: string | null
  document_path: string | null
  notes: string | null
  updated_at: string
}

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PreplansClient({
  preplans,
  isOfficerOrAbove,
}: {
  preplans: Preplan[]
  isOfficerOrAbove: boolean
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  function openAdd() {
    setEditingId(null)
    setError(null)
    setShowForm(true)
  }

  function openEdit(p: Preplan) {
    setEditingId(p.id)
    setError(null)
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    if (editingId) formData.set('id', editingId)
    const result = await savePreplan(formData)
    if (result?.error) { setError(result.error); setLoading(false); return }
    setShowForm(false)
    setEditingId(null)
    router.refresh()
    setLoading(false)
  }

  async function handleDelete(id: string) {
    setLoading(true)
    await deletePreplan(id)
    setConfirmDeleteId(null)
    router.refresh()
    setLoading(false)
  }

  async function handleViewDoc(path: string) {
    const url = await getPreplanDocUrl(path)
    if (url) window.open(url, '_blank')
  }

  const editing = editingId ? preplans.find(p => p.id === editingId) : null

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Pre-Fire Plans</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{preplans.length} location{preplans.length !== 1 ? 's' : ''} on file</p>
        </div>
        {isOfficerOrAbove && !showForm && (
          <button onClick={openAdd}
            className="shrink-0 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors">
            + Add Pre-Plan
          </button>
        )}
      </div>

      <HelpText className="mb-4">
        Attach a document (floor plan, hazard notes, hydrant locations) to each location so it's on hand before a
        crew arrives, not just an address on file.
      </HelpText>

      {/* Form */}
      {showForm && isOfficerOrAbove && (
        <form onSubmit={handleSubmit} className="rounded-xl bg-white border border-zinc-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-zinc-900 mb-4">{editingId ? 'Edit Pre-Plan' : 'New Pre-Plan'}</h2>
          {error && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-zinc-600 mb-1">Location Name</label>
                <input name="location_name" type="text" required
                  defaultValue={editing?.location_name ?? ''}
                  placeholder="e.g. Winslow Grain Elevator"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-zinc-600 mb-1">Address</label>
                <input name="address" type="text"
                  defaultValue={editing?.address ?? ''}
                  placeholder="Street address"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="sm:w-44">
                <label className="block text-xs font-medium text-zinc-600 mb-1">Date Surveyed</label>
                <input name="surveyed_date" type="date"
                  defaultValue={editing?.surveyed_date ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-zinc-600 mb-1">Notes</label>
                <input name="notes" type="text"
                  defaultValue={editing?.notes ?? ''}
                  placeholder="Any notes"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                Pre-Plan Document (PDF or image){editing?.document_path ? ' — upload to replace' : ''}
              </label>
              <input name="document" type="file" accept=".pdf,.jpg,.jpeg,.png"
                className="w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-red-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-red-700 hover:file:bg-red-100" />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={loading}
                className="flex-1 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
                {loading ? 'Saving...' : editingId ? 'Save Changes' : 'Add Pre-Plan'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null) }}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* List */}
      {preplans.length === 0 && !showForm ? (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          No pre-fire plans on file.
        </div>
      ) : (
        <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden divide-y divide-zinc-100">
          {preplans.map(p => (
            <div key={p.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900">{p.location_name}</p>
                  {p.address && <p className="text-xs text-zinc-400 mt-0.5">{p.address}</p>}
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400 flex-wrap">
                    {p.surveyed_date && <span>Surveyed {fmt(p.surveyed_date)}</span>}
                    {p.notes && <span>· {p.notes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.document_path && (
                    <button onClick={() => handleViewDoc(p.document_path!)}
                      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors">
                      View Doc
                    </button>
                  )}
                  {isOfficerOrAbove && (
                    <>
                      <button onClick={() => openEdit(p)}
                        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors">
                        Edit
                      </button>
                      {confirmDeleteId === p.id ? (
                        <div className="flex gap-1.5">
                          <button onClick={() => handleDelete(p.id)} disabled={loading}
                            className="rounded px-2 py-1 text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                            Confirm
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)}
                            className="rounded px-2 py-1 text-xs font-semibold border border-zinc-200 text-zinc-600 hover:bg-zinc-50">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(p.id)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors">
                          Delete
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
