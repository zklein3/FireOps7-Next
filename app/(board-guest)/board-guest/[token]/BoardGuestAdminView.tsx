'use client'

import { useState, useTransition } from 'react'
import { addBoardLane, renameLane, movePersonToLane, moveResourceToLane } from '@/app/actions/accountability'

type Lane = { id: string; name: string; sort_order: number; profile?: 'default' | 'ics' | 'active_violence' | null }
type Entry = { id: string; lane_id: string | null; raw_name: string | null; display_name: string; status: string; released_at: string | null; resource_id: string | null }
type Resource = { id: string; lane_id: string | null; display_desc: string; status: string; released_at: string | null }

export default function BoardGuestAdminView({
  token,
  state,
  onChange,
}: {
  token: string
  state: {
    board: { id: string; title: string; departmentName: string | null; nimsMode: boolean; isActiveViolence: boolean }
    label: string
    lanes: Lane[]
    entries: Entry[]
    resources: Resource[]
  }
  onChange: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [addingLane, setAddingLane] = useState(false)
  const [newLaneName, setNewLaneName] = useState('')
  const [editingLaneId, setEditingLaneId] = useState<string | null>(null)
  const [editLaneName, setEditLaneName] = useState('')

  const { board, label, lanes, entries, resources } = state

  const activeEntries = entries.filter(e => !e.released_at)
  const activeResources = resources.filter(r => !r.released_at)
  const unattachedEntries = activeEntries.filter(e => !e.resource_id)

  // Same rule as the officer board: a lane never disappears if anyone's actually checked into
  // it — only empty lanes get hidden/shown based on which mode (default/NIMS/Active Violence)
  // is currently active. The move-to dropdown still lists every lane, same as the officer view.
  const visibleLanes = lanes.filter(lane => {
    if (activeEntries.some(e => e.lane_id === lane.id)) return true
    if (lane.profile === 'default') return !board.nimsMode && !board.isActiveViolence
    if (lane.profile === 'ics') return board.nimsMode
    if (lane.profile === 'active_violence') return board.isActiveViolence
    return true
  })

  const lanesWithUnassigned = [...lanes, { id: '__unassigned__', name: 'Unassigned', sort_order: 999999 }]

  function run(fn: () => Promise<{ error?: string } | undefined>) {
    setError(null)
    startTransition(async () => {
      const result = await fn()
      if (result?.error) { setError(result.error); return }
      onChange()
    })
  }

  function handleAddLane() {
    if (!newLaneName.trim()) return
    run(async () => {
      const result = await addBoardLane(board.id, newLaneName.trim(), token)
      if (!result.error) { setNewLaneName(''); setAddingLane(false) }
      return result
    })
  }

  function handleRenameLane(laneId: string) {
    if (!editLaneName.trim()) return
    run(async () => {
      const result = await renameLane(laneId, editLaneName.trim(), token)
      if (!result.error) setEditingLaneId(null)
      return result
    })
  }

  function laneSelect(currentLaneId: string | null, onMove: (laneId: string) => void) {
    return (
      <select
        value={currentLaneId ?? '__unassigned__'}
        disabled={isPending}
        onChange={e => { if (e.target.value !== '__unassigned__') onMove(e.target.value) }}
        className="max-w-[45%] shrink-0 rounded-lg border border-zinc-300 px-2 py-1 text-xs text-zinc-700 disabled:opacity-50 sm:max-w-none"
      >
        {lanesWithUnassigned.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5">
        <p className="text-xs text-zinc-400">{board.departmentName ?? 'Incident'}</p>
        <h2 className="text-lg font-bold text-zinc-900 mt-1">{board.title}</h2>
        <p className="text-sm text-zinc-500 mt-1">Signed in as guest: {label}</p>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}

      {visibleLanes.map(lane => {
        const laneResources = activeResources.filter(r => r.lane_id === lane.id)
        const laneCrewIds = new Set(entries.filter(e => e.resource_id && laneResources.some(r => r.id === e.resource_id)).map(e => e.id))
        const laneEntries = unattachedEntries.filter(e => e.lane_id === lane.id)

        return (
          <div key={lane.id} className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              {editingLaneId === lane.id ? (
                <div className="flex flex-wrap gap-2 flex-1 min-w-0">
                  <input
                    value={editLaneName}
                    onChange={e => setEditLaneName(e.target.value)}
                    className="flex-1 min-w-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
                    autoFocus
                  />
                  <button onClick={() => handleRenameLane(lane.id)} disabled={isPending} className="shrink-0 text-xs font-semibold text-red-700 hover:underline">Save</button>
                  <button onClick={() => setEditingLaneId(null)} className="shrink-0 text-xs text-zinc-500 hover:underline">Cancel</button>
                </div>
              ) : (
                <>
                  <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-zinc-900">{lane.name}</h3>
                  <button
                    onClick={() => { setEditingLaneId(lane.id); setEditLaneName(lane.name) }}
                    className="shrink-0 text-xs text-zinc-400 hover:text-zinc-700"
                  >
                    Rename
                  </button>
                </>
              )}
            </div>

            {laneResources.length === 0 && laneEntries.length === 0 && (
              <p className="text-xs text-zinc-400">Nobody assigned.</p>
            )}

            {laneResources.map(resource => {
              const crew = entries.filter(e => e.resource_id === resource.id && !e.released_at)
              return (
                <div key={resource.id} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 mb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-800">{resource.display_desc}</p>
                    {laneSelect(resource.lane_id, laneId => run(() => moveResourceToLane(resource.id, laneId, token)))}
                  </div>
                  {crew.length > 0 && (
                    <p className="text-xs text-zinc-500 mt-1">{crew.map(c => c.display_name).join(', ')}</p>
                  )}
                </div>
              )
            })}

            {laneEntries.map(e => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 mb-2">
                <p className="min-w-0 flex-1 truncate text-sm text-zinc-800">{e.display_name}</p>
                {laneSelect(e.lane_id, laneId => run(() => movePersonToLane(e.id, laneId, token)))}
              </div>
            ))}
          </div>
        )
      })}

      {addingLane ? (
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-4 flex gap-2">
          <input
            value={newLaneName}
            onChange={e => setNewLaneName(e.target.value)}
            placeholder="Lane name"
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            autoFocus
          />
          <button onClick={handleAddLane} disabled={isPending} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">Add</button>
          <button onClick={() => setAddingLane(false)} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50">Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => setAddingLane(true)}
          className="w-full rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-500 hover:bg-zinc-50"
        >
          + Add Lane
        </button>
      )}

      <p className="text-center text-xs text-zinc-400">
        You can close this tab anytime — it doesn't end the board or check anyone out.
      </p>
    </div>
  )
}
