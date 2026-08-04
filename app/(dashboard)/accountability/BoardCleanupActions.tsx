'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { archiveBoard, unarchiveBoard, deleteBoard } from '@/app/actions/accountability'

// Sits in a closed or archived board's row on the /accountability list — Archive/Restore is a
// single click (fully reversible), Delete is a real confirm step since it's permanent (DB
// cascades entries/resources/lanes/par_checks/activity_log, and is blocked server-side if an
// ICS incident is still linked to this board).
export default function BoardCleanupActions({
  boardId,
  mode,
  canDelete,
  redirectAfterDelete,
}: {
  boardId: string
  mode: 'closed' | 'archived'
  canDelete: boolean
  // The list page just wants a refresh (the row moves between sections in place). The board's
  // own detail page needs to actually navigate away once deleted — there's nothing left to render.
  redirectAfterDelete?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleArchiveToggle(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    setBusy(true); setError(null)
    const result = mode === 'closed' ? await archiveBoard(boardId) : await unarchiveBoard(boardId)
    setBusy(false)
    if (result?.error) { setError(result.error); return }
    router.refresh()
  }

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    setBusy(true); setError(null)
    const result = await deleteBoard(boardId)
    setBusy(false)
    if (result?.error) { setError(result.error); setConfirming(false); return }
    if (redirectAfterDelete) router.push(redirectAfterDelete)
    else router.refresh()
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
        <span className="text-xs text-red-600 font-medium">Delete for good?</span>
        <button type="button" disabled={busy} onClick={handleDelete}
          className="rounded-lg bg-red-700 px-2 py-1 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">
          {busy ? '...' : 'Yes'}
        </button>
        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirming(false) }}
          className="rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50">
          No
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button type="button" disabled={busy} onClick={handleArchiveToggle}
        className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
        {busy ? '...' : mode === 'closed' ? 'Archive' : 'Restore'}
      </button>
      {canDelete && (
        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirming(true) }}
          className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100">
          Delete
        </button>
      )}
    </div>
  )
}
