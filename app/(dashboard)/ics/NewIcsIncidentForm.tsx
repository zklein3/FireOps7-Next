'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createIcsIncident } from '@/app/actions/ics'

export default function NewIcsIncidentForm({ boards }: { boards: { id: string; title: string; board_date: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [boardId, setBoardId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!title.trim()) { setError('Title is required.'); return }
    setSaving(true)
    setError(null)
    const result = await createIcsIncident(title.trim(), null, boardId || null)
    setSaving(false)
    if (result?.error) { setError(result.error); return }
    if (result?.id) router.push(`/ics/${result.id}`)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
      >
        + Open ICS Incident
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div>
        <label className="block text-xs font-medium text-zinc-600 mb-1">Title</label>
        <input
          type="text" value={title} onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Structure Fire — 412 Elm St"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-600 mb-1">Link to an accountability board (optional)</label>
        <select
          value={boardId} onChange={e => setBoardId(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        >
          <option value="">None</option>
          {boards.map(b => <option key={b.id} value={b.id}>{b.title} — {b.board_date}</option>)}
        </select>
        <p className="text-xs text-zinc-400 mt-1">Linking a board lets operational periods snapshot its current roster, objectives, and activity log.</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleCreate} disabled={saving}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Creating…' : 'Create'}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-200 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}
