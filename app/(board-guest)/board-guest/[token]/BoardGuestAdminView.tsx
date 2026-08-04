'use client'

import { useRef, useState, useTransition } from 'react'
import { addBoardLane, renameLane, movePersonToLane, moveResourceToLane, checkInPerson } from '@/app/actions/accountability'
import { parseSalamanderCard, isFireOps7Card, hashRaw } from '@/lib/salamander'
import QRScanner from '@/components/QRScanner'

type Lane = { id: string; name: string; sort_order: number; profile?: 'default' | 'ics' | 'active_violence' | null }
type Entry = { id: string; lane_id: string | null; raw_name: string | null; display_name: string; status: string; released_at: string | null; resource_id: string | null; tag_ref?: string | null }
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

  const [scannerOpen, setScannerOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualDept, setManualDept] = useState('')
  const [manualSaving, setManualSaving] = useState(false)

  // Rapid/blank tags carry no name — prompt for one on the spot, same as the officer board.
  const [nameTagOpen, setNameTagOpen] = useState(false)
  const [tagName, setTagName] = useState('')
  const [tagDept, setTagDept] = useState('')
  const [tagAccessTier, setTagAccessTier] = useState<'' | 'self' | 'admin'>('')
  const [tagSaving, setTagSaving] = useState(false)
  const pendingTagRawRef = useRef<string | null>(null)

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

  const stagingLaneId = lanes[0]?.id ?? null

  async function handleScan(raw: string) {
    setScannerOpen(false)
    setError(null)

    // A Salamander card the guest has no personnel roster to match against — but if it's a
    // real card, the name/department are printed right on it, so check in with that directly.
    const card = parseSalamanderCard(raw)
    if (card) {
      const name = `${card.firstName} ${card.lastName}`
      const cardTagRef = hashRaw(raw)
      startTransition(async () => {
        const result = await checkInPerson(board.id, stagingLaneId, null, name, card.department, cardTagRef, null, null, token)
        if (result?.error) { setError(result.error); return }
        onChange()
      })
      return
    }

    // A FireOps7 personal card encodes a real personnel_id this guest has no visibility into —
    // there's nothing safe to show or check in without exposing department roster data.
    if (isFireOps7Card(raw)) {
      setError('This is a department member\'s personal card — ask an officer to check them in.')
      return
    }

    // Blank/rapid tag — no name encoded. Re-scanning one already checked in on this board just
    // moves it to Staging rather than creating a duplicate entry.
    const ref = hashRaw(raw)
    const existing = entries.find(e => e.tag_ref === ref && !e.released_at)
    if (existing) {
      startTransition(async () => {
        const result = await movePersonToLane(existing.id, stagingLaneId ?? existing.lane_id ?? '', token)
        if (result?.error) { setError(result.error); return }
        onChange()
      })
      return
    }

    pendingTagRawRef.current = raw
    setTagName('')
    setTagDept('')
    setTagAccessTier('')
    setNameTagOpen(true)
  }

  async function handleManualAdd() {
    if (!manualName.trim()) return
    setManualSaving(true)
    const result = await checkInPerson(board.id, stagingLaneId, null, manualName.trim(), manualDept.trim() || null, null, null, null, token)
    setManualSaving(false)
    if (result?.error) { setError(result.error); return }
    setManualName('')
    setManualDept('')
    setManualOpen(false)
    onChange()
  }

  async function handleNameTag() {
    if (!tagName.trim()) return
    setTagSaving(true)
    const tagRef = pendingTagRawRef.current ? hashRaw(pendingTagRawRef.current) : null
    const result = await checkInPerson(board.id, stagingLaneId, null, tagName.trim(), tagDept.trim() || null, tagRef, null, tagAccessTier || null, token)
    setTagSaving(false)
    if (result?.error) { setError(result.error); return }
    pendingTagRawRef.current = null
    setNameTagOpen(false)
    onChange()
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="flex-1 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
        >
          Scan Card
        </button>
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="flex-1 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          Add Manually
        </button>
      </div>

      {scannerOpen && (
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-4">
          <QRScanner onScan={handleScan} onClose={() => setScannerOpen(false)} hint="Scan FireOps7 QR or Salamander card" />
        </div>
      )}

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

      {manualOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <p className="font-semibold text-zinc-900 mb-4">Add Person Manually</p>
            <div className="flex flex-col gap-3 mb-4">
              <input
                autoFocus
                value={manualName}
                onChange={e => setManualName(e.target.value)}
                placeholder="Name"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              <input
                value={manualDept}
                onChange={e => setManualDept(e.target.value)}
                placeholder="Agency / Department (optional)"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={manualSaving || !manualName.trim()} onClick={handleManualAdd}
                className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                {manualSaving ? 'Adding...' : 'Check In'}
              </button>
              <button type="button" onClick={() => { setManualOpen(false); setManualName(''); setManualDept('') }}
                className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {nameTagOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <p className="font-semibold text-zinc-900 mb-1">Name This Tag</p>
            <p className="text-xs text-zinc-500 mb-4">This is a rapid tag — it doesn&apos;t carry a name. Enter who it was handed to.</p>
            <div className="flex flex-col gap-3 mb-4">
              <input autoFocus value={tagName} onChange={e => setTagName(e.target.value)}
                placeholder="Name" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              <input value={tagDept} onChange={e => setTagDept(e.target.value)}
                placeholder="Agency / Department (optional)" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wide">Card Access (optional)</label>
                <select value={tagAccessTier} onChange={e => setTagAccessTier(e.target.value as '' | 'self' | 'admin')}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                  <option value="">Tracking only — no self-access</option>
                  <option value="self">Self-move — they can move only themselves/their resource</option>
                  <option value="admin">Planning / Command — full board control on this device</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={tagSaving || !tagName.trim()} onClick={handleNameTag}
                className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                {tagSaving ? 'Saving...' : 'Check In'}
              </button>
              <button type="button" onClick={() => { setNameTagOpen(false); pendingTagRawRef.current = null; setTagAccessTier('') }}
                className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
