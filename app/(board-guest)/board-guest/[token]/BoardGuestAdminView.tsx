'use client'

import { useRef, useState, useTransition } from 'react'
import {
  addBoardLane, renameLane, movePersonToLane, moveResourceToLane, checkInPerson,
  releaseAccountabilityEntry, releaseResource, logBoardStamp, addActivityLogEntry,
} from '@/app/actions/accountability'
import { parseSalamanderCard, isFireOps7Card, hashRaw } from '@/lib/salamander'
import QRScanner from '@/components/QRScanner'

type Lane = { id: string; name: string; sort_order: number; profile?: 'default' | 'ics' | 'active_violence' | null }
type Entry = { id: string; lane_id: string | null; raw_name: string | null; display_name: string; status: string; released_at: string | null; resource_id: string | null; tag_ref?: string | null }
type Resource = { id: string; lane_id: string | null; display_desc: string; status: string; released_at: string | null }
type ActivityLogEntry = { id: string; entry_time: string; note: string; author_name: string | null; lane_id: string | null }

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
    activityLog: ActivityLogEntry[]
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

  // Tap-name-then-modal, same interaction as the officer board — replaces the old inline
  // per-row lane dropdown so both surfaces work identically.
  const [movingEntryId, setMovingEntryId] = useState<string | null>(null)
  const [movingResourceId, setMovingResourceId] = useState<string | null>(null)

  const [stampSaving, setStampSaving] = useState(false)
  const [noteInput, setNoteInput] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)

  const { board, label, lanes, entries, resources, activityLog } = state
  const movingEntry = movingEntryId ? entries.find(e => e.id === movingEntryId) : null
  const movingResource = movingResourceId ? resources.find(r => r.id === movingResourceId) : null

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

    // Check for "already on this board" first, regardless of card type — a card recognized here
    // once (Salamander named, or a blank/rapid tag) carries the same tag_ref every time it's
    // rescanned. Opens the manage modal to pick a lane, same as the officer board, instead of
    // silently dumping them in Staging or creating a duplicate check-in.
    const ref = hashRaw(raw)
    const existing = entries.find(e => e.tag_ref === ref && !e.released_at)
    if (existing) { setMovingEntryId(existing.id); return }

    // A Salamander card the guest has no personnel roster to match against — but if it's a
    // real card, the name/department are printed right on it, so check in with that directly.
    const card = parseSalamanderCard(raw)
    if (card) {
      const name = `${card.firstName} ${card.lastName}`
      startTransition(async () => {
        const result = await checkInPerson(board.id, stagingLaneId, null, name, card.department, ref, null, null, token)
        if (result?.error) { setError(result.error); return }
        onChange()
      })
      return
    }

    // A FireOps7 personal card encodes a real personnel_id this guest has no visibility into —
    // if it's not already on this board (checked above), there's nothing safe to show or check
    // in without exposing department roster data.
    if (isFireOps7Card(raw)) {
      setError('This is a department member\'s personal card — ask an officer to check them in.')
      return
    }

    // Blank/rapid tag, never seen before — no name encoded, prompt for one.
    pendingTagRawRef.current = raw
    setTagName('')
    setTagDept('')
    setTagAccessTier('')
    setNameTagOpen(true)
  }

  function handleMoveEntry(entryId: string, laneId: string) {
    setMovingEntryId(null)
    startTransition(async () => {
      const result = await movePersonToLane(entryId, laneId, token)
      if (result?.error) { setError(result.error); return }
      onChange()
    })
  }

  function handleReleaseEntry(entryId: string) {
    setMovingEntryId(null)
    startTransition(async () => {
      const result = await releaseAccountabilityEntry(entryId, token)
      if (result?.error) { setError(result.error); return }
      onChange()
    })
  }

  function handleMoveResource(resourceId: string, laneId: string) {
    setMovingResourceId(null)
    startTransition(async () => {
      const result = await moveResourceToLane(resourceId, laneId, token)
      if (result?.error) { setError(result.error); return }
      onChange()
    })
  }

  function handleReleaseResource(resourceId: string) {
    setMovingResourceId(null)
    startTransition(async () => {
      const result = await releaseResource(resourceId, token)
      if (result?.error) { setError(result.error); return }
      onChange()
    })
  }

  async function handleLogStamp() {
    setStampSaving(true)
    setError(null)
    const result = await logBoardStamp(board.id, undefined, undefined, token)
    setStampSaving(false)
    if (result?.error) { setError(result.error); return }
    onChange()
  }

  async function handleAddNote() {
    if (!noteInput.trim()) return
    setNoteSaving(true)
    setError(null)
    const result = await addActivityLogEntry(board.id, noteInput.trim(), token)
    setNoteSaving(false)
    if (result?.error) { setError(result.error); return }
    setNoteInput('')
    onChange()
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
                <button
                  key={resource.id}
                  type="button"
                  onClick={() => setMovingResourceId(resource.id)}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 mb-2 text-left hover:bg-zinc-100 transition-colors"
                >
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-800">{resource.display_desc}</p>
                  {crew.length > 0 && (
                    <p className="text-xs text-zinc-500 mt-1">{crew.map(c => c.display_name).join(', ')}</p>
                  )}
                </button>
              )
            })}

            {laneEntries.map(e => (
              <button
                key={e.id}
                type="button"
                onClick={() => setMovingEntryId(e.id)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 mb-2 text-left text-sm text-zinc-800 hover:bg-zinc-50 transition-colors"
              >
                {e.display_name}
              </button>
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

      <div className="rounded-xl border border-zinc-200 bg-white p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Activity Log</p>
          <button type="button" disabled={stampSaving} onClick={handleLogStamp}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors">
            {stampSaving ? 'Logging…' : 'Log 214'}
          </button>
        </div>
        <div className="flex gap-2 mb-3">
          <input value={noteInput} onChange={e => setNoteInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddNote() }}
            placeholder="Add a timestamped note..."
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
          <button type="button" disabled={noteSaving || !noteInput.trim()} onClick={handleAddNote}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
            {noteSaving ? '...' : 'Add'}
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto space-y-2">
          {activityLog.length === 0 && <p className="text-xs text-zinc-400">No entries yet.</p>}
          {activityLog.map(a => (
            <div key={a.id} className="text-xs border-b border-zinc-100 pb-2">
              <p className="text-zinc-400">
                {new Date(a.entry_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                {a.author_name && ` — ${a.author_name}`}
              </p>
              <p className="text-zinc-700 mt-0.5">{a.note}</p>
            </div>
          ))}
        </div>
      </div>

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

      {movingEntry && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <p className="font-semibold text-zinc-900 mb-1">{movingEntry.display_name}</p>
            <p className="text-sm text-zinc-500 mb-4">Move to which lane?</p>
            <div className="flex flex-col gap-2 mb-3">
              {lanes.map(l => (
                <button key={l.id} type="button" onClick={() => handleMoveEntry(movingEntry.id, l.id)}
                  className={`w-full rounded-lg border px-4 py-2.5 text-sm font-medium text-left transition-colors ${
                    movingEntry.lane_id === l.id
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-zinc-200 hover:bg-zinc-50 text-zinc-700'
                  }`}>
                  {l.name}{movingEntry.lane_id === l.id ? ' ✓' : ''}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => handleReleaseEntry(movingEntry.id)}
              className="w-full mb-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors">
              Release (Left Scene)
            </button>
            <button type="button" onClick={() => setMovingEntryId(null)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {movingResource && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <p className="font-semibold text-zinc-900 mb-1">{movingResource.display_desc}</p>
            <p className="text-sm text-zinc-500 mb-4">Move to which lane? (Moves its crew too.)</p>
            <div className="flex flex-col gap-2 mb-3">
              {lanes.map(l => (
                <button key={l.id} type="button" onClick={() => handleMoveResource(movingResource.id, l.id)}
                  className={`w-full rounded-lg border px-4 py-2.5 text-sm font-medium text-left transition-colors ${
                    movingResource.lane_id === l.id
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-zinc-200 hover:bg-zinc-50 text-zinc-700'
                  }`}>
                  {l.name}{movingResource.lane_id === l.id ? ' ✓' : ''}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => handleReleaseResource(movingResource.id)}
              className="w-full mb-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors">
              Release
            </button>
            <button type="button" onClick={() => setMovingResourceId(null)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
