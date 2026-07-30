'use client'

import { useState } from 'react'
import { addLaneTemplate, updateLaneTemplate, toggleLaneTemplate, reorderLaneTemplates } from '@/app/actions/accountability'

interface Lane {
  id: string
  name: string
  sort_order: number
  active: boolean
}

type ProfileKey = 'default' | 'ics' | 'active_violence'

interface ProfileData {
  profile: ProfileKey
  label: string
  description: string
  lanes: Lane[]
  builtInPreset: string[] | null
}

export default function AccountabilitySettingsClient({
  departmentId,
  profiles,
}: {
  departmentId: string
  profiles: ProfileData[]
}) {
  const [activeProfile, setActiveProfile] = useState<ProfileKey>('default')
  const [allLanes, setAllLanes] = useState<Record<ProfileKey, Lane[]>>(
    Object.fromEntries(profiles.map(p => [p.profile, p.lanes])) as Record<ProfileKey, Lane[]>
  )
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const current = profiles.find(p => p.profile === activeProfile)!
  const lanes = allLanes[activeProfile]

  function setLanesFor(profile: ProfileKey, updater: (lanes: Lane[]) => Lane[]) {
    setAllLanes(prev => ({ ...prev, [profile]: updater(prev[profile]) }))
  }

  async function handleAdd() {
    if (!newName.trim()) return
    setAdding(true)
    setError(null)
    const res = await addLaneTemplate(departmentId, newName.trim(), activeProfile)
    setAdding(false)
    if (res?.error) { setError(res.error); return }
    setLanesFor(activeProfile, prev => [...prev, {
      id: crypto.randomUUID(),
      name: newName.trim(),
      sort_order: prev.length,
      active: true,
    }])
    setNewName('')
  }

  async function handleRename(id: string) {
    if (!editName.trim()) return
    setSaving(true)
    setError(null)
    const res = await updateLaneTemplate(id, editName.trim())
    setSaving(false)
    if (res?.error) { setError(res.error); return }
    setLanesFor(activeProfile, prev => prev.map(l => l.id === id ? { ...l, name: editName.trim() } : l))
    setEditingId(null)
  }

  async function handleToggle(id: string, active: boolean) {
    const res = await toggleLaneTemplate(id, active)
    if (res?.error) { setError(res.error); return }
    setLanesFor(activeProfile, prev => prev.map(l => l.id === id ? { ...l, active } : l))
  }

  async function handleMove(id: string, direction: 'up' | 'down') {
    const idx = lanes.findIndex(l => l.id === id)
    if (idx === -1) return
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === lanes.length - 1) return
    const next = [...lanes]
    const swap = direction === 'up' ? idx - 1 : idx + 1
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    const reordered = next.map((l, i) => ({ ...l, sort_order: i }))
    setLanesFor(activeProfile, () => reordered)
    await reorderLaneTemplates(departmentId, reordered.map(l => l.id))
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-zinc-900">Accountability Lanes</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Built-in presets are used until you set your own — customize any profile below.</p>
      </div>

      <div className="flex gap-1 mb-4 border-b border-zinc-200">
        {profiles.map(p => (
          <button key={p.profile} type="button" onClick={() => { setActiveProfile(p.profile); setEditingId(null); setError(null) }}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeProfile === p.profile ? 'border-red-700 text-red-700' : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}>
            {p.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-zinc-500 mb-4">{current.description}</p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {current.builtInPreset && lanes.length === 0 && (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          Using the built-in preset — no custom lanes set for this profile yet: <strong>{current.builtInPreset.join(', ')}</strong>.
          Add a lane below to start customizing; once you do, your list replaces the preset for this profile.
        </div>
      )}

      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 divide-y divide-zinc-100 mb-4">
        {lanes.length === 0 && !current.builtInPreset && (
          <p className="px-4 py-6 text-sm text-zinc-400 text-center">No lanes yet.</p>
        )}
        {lanes.map((lane, idx) => (
          <div key={lane.id} className={`flex items-center gap-3 px-4 py-3 ${!lane.active ? 'opacity-50' : ''}`}>
            {/* Reorder */}
            <div className="flex flex-col gap-0.5 shrink-0">
              <button type="button" onClick={() => handleMove(lane.id, 'up')} disabled={idx === 0}
                className="text-zinc-300 hover:text-zinc-600 disabled:opacity-20 leading-none text-xs">▲</button>
              <button type="button" onClick={() => handleMove(lane.id, 'down')} disabled={idx === lanes.length - 1}
                className="text-zinc-300 hover:text-zinc-600 disabled:opacity-20 leading-none text-xs">▼</button>
            </div>

            {/* Name / edit */}
            <div className="flex-1 min-w-0">
              {editingId === lane.id ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRename(lane.id); if (e.key === 'Escape') setEditingId(null) }}
                    className="flex-1 rounded-lg border border-zinc-300 px-2 py-1 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                  <button type="button" disabled={saving} onClick={() => handleRename(lane.id)}
                    className="rounded-lg bg-red-700 px-3 py-1 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                    {saving ? '...' : 'Save'}
                  </button>
                  <button type="button" onClick={() => setEditingId(null)}
                    className="rounded-lg border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50">
                    Cancel
                  </button>
                </div>
              ) : (
                <span className="text-sm font-medium text-zinc-900">{lane.name}</span>
              )}
            </div>

            {/* Actions */}
            {editingId !== lane.id && (
              <div className="flex items-center gap-3 shrink-0">
                <button type="button" onClick={() => { setEditingId(lane.id); setEditName(lane.name) }}
                  className="text-xs text-zinc-400 hover:text-zinc-700">Rename</button>
                <button type="button" onClick={() => handleToggle(lane.id, !lane.active)}
                  className={`text-xs ${lane.active ? 'text-zinc-400 hover:text-red-600' : 'text-zinc-400 hover:text-green-600'}`}>
                  {lane.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new lane */}
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          placeholder="New lane name..."
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        />
        <button type="button" disabled={adding || !newName.trim()} onClick={handleAdd}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
          {adding ? 'Adding...' : 'Add Lane'}
        </button>
      </div>
      <p className="mt-2 text-xs text-zinc-400">These lanes are the starting template. Officers can add or adjust lanes during an active incident.</p>
    </div>
  )
}
