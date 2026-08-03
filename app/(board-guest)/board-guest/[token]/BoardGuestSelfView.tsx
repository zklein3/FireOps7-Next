'use client'

import { useState, useTransition } from 'react'
import { movePersonToLane, moveResourceToLane, releaseAccountabilityEntry } from '@/app/actions/accountability'

type Lane = { id: string; name: string; sort_order: number; profile?: 'default' | 'ics' | 'active_violence' | null }
type Entry = { id: string; lane_id: string | null; raw_name: string | null; status: string; released_at: string | null; resource_id: string | null }
type Resource = { id: string; lane_id: string | null; raw_description: string | null; kind: string | null; status: string } | null

export default function BoardGuestSelfView({
  token,
  state,
  onChange,
}: {
  token: string
  state: {
    board: { title: string; departmentName: string | null; nimsMode: boolean; isActiveViolence: boolean }
    label: string
    entry: Entry
    resource: Resource
    lanes: Lane[]
  }
  onChange: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const { board, label, entry, resource, lanes } = state

  const currentLaneName = lanes.find(l => l.id === entry.lane_id)?.name ?? 'Unassigned'
  const checkedOut = entry.status === 'released' || !!entry.released_at

  // Same mode rule as the officer/admin board — the lane they're currently in always stays
  // offered even if it's technically off-mode, so they're never stuck with no way back to it.
  const visibleLanes = lanes.filter(lane => {
    if (lane.id === entry.lane_id) return true
    if (lane.profile === 'default') return !board.nimsMode && !board.isActiveViolence
    if (lane.profile === 'ics') return board.nimsMode
    if (lane.profile === 'active_violence') return board.isActiveViolence
    return true
  })

  function handleMove(laneId: string) {
    setError(null)
    startTransition(async () => {
      const result = resource
        ? await moveResourceToLane(resource.id, laneId, token)
        : await movePersonToLane(entry.id, laneId, token)
      if (result?.error) { setError(result.error); return }
      onChange()
    })
  }

  function handleCheckOut() {
    setError(null)
    startTransition(async () => {
      const result = await releaseAccountabilityEntry(entry.id, token)
      if (result?.error) { setError(result.error); return }
      onChange()
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5">
        <p className="text-xs text-zinc-400">{board.departmentName ?? 'Incident'} — {board.title}</p>
        <h2 className="text-lg font-bold text-zinc-900 mt-1">{label}</h2>
        {resource && (
          <p className="text-sm text-zinc-500 mt-1">
            Resource: {resource.raw_description ?? resource.kind ?? '—'} (moving this moves your crew with it)
          </p>
        )}
        <p className="text-sm text-zinc-600 mt-3">
          Current assignment: <span className="font-semibold">{checkedOut ? 'Checked out' : currentLaneName}</span>
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}

      {!checkedOut && (
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5">
          <h3 className="text-sm font-semibold text-zinc-900 mb-3">Move to a different lane</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {visibleLanes.map(lane => (
              <button
                key={lane.id}
                onClick={() => handleMove(lane.id)}
                disabled={isPending || lane.id === entry.lane_id}
                className={`w-full break-words rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 ${
                  lane.id === entry.lane_id
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                {lane.name}
              </button>
            ))}
          </div>

          <button
            onClick={handleCheckOut}
            disabled={isPending}
            className="mt-4 w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          >
            Check Out
          </button>
          <p className="mt-2 text-center text-xs text-zinc-400">
            Only tap Check Out if you're actually leaving the incident — closing this tab or browser is safe otherwise, you'll stay checked in.
          </p>
        </div>
      )}

      {checkedOut && (
        <p className="text-sm text-zinc-500 text-center">You've checked out of this board.</p>
      )}
    </div>
  )
}
