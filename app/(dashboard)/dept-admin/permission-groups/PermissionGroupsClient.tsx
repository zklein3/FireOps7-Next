'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PermissionChecklist from '@/components/PermissionChecklist'
import {
  createPermissionGroup,
  updatePermissionGroupMeta,
  savePermissionGroup,
  togglePermissionGroup,
  resetPermissionGroupToTemplate,
} from '@/app/actions/permissions'

interface PermissionGroup {
  id: string
  name: string
  description: string | null
  permissions: Record<string, boolean>
  source_template_key: string | null
  sort_order: number
  active: boolean
}

export default function PermissionGroupsClient({
  departmentId,
  initialGroups,
}: {
  departmentId: string
  initialGroups: PermissionGroup[]
}) {
  const router = useRouter()
  const [groups, setGroups] = useState<PermissionGroup[]>(initialGroups)
  const [selectedId, setSelectedId] = useState<string | null>(initialGroups[0]?.id ?? null)
  const [draft, setDraft] = useState<Record<string, boolean>>(initialGroups[0]?.permissions ?? {})
  const [dirty, setDirty] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [duplicateFromId, setDuplicateFromId] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const selected = groups.find(g => g.id === selectedId) ?? null

  function selectGroup(group: PermissionGroup) {
    setSelectedId(group.id)
    setDraft({ ...group.permissions })
    setDirty(false)
    setRenaming(false)
    setConfirmReset(false)
    setError(null)
    setSuccess(null)
  }

  function handleToggleKey(key: string, value: boolean) {
    setDraft(prev => ({ ...prev, [key]: value }))
    setDirty(true)
    setSuccess(null)
  }

  async function handleSave() {
    if (!selected) return
    setLoading(true); setError(null); setSuccess(null)
    const res = await savePermissionGroup(selected.id, draft)
    if (res.error) { setError(res.error) } else {
      setGroups(prev => prev.map(g => g.id === selected.id ? { ...g, permissions: draft } : g))
      setDirty(false)
      setSuccess('Saved.')
    }
    setLoading(false)
  }

  async function handleRename() {
    if (!selected || !nameDraft.trim()) return
    setLoading(true); setError(null)
    const res = await updatePermissionGroupMeta(selected.id, nameDraft.trim(), selected.description)
    if (res.error) { setError(res.error) } else {
      setGroups(prev => prev.map(g => g.id === selected.id ? { ...g, name: nameDraft.trim() } : g))
      setRenaming(false)
      router.refresh()
    }
    setLoading(false)
  }

  async function handleAddGroup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const res = await createPermissionGroup(departmentId, newGroupName, duplicateFromId || undefined)
    if (res.error) { setError(res.error) } else {
      setShowAdd(false)
      setNewGroupName('')
      setDuplicateFromId('')
      router.refresh()
    }
    setLoading(false)
  }

  async function handleToggleActive() {
    if (!selected) return
    setLoading(true); setError(null)
    const res = await togglePermissionGroup(selected.id, !selected.active)
    if (res.error) { setError(res.error) } else {
      setGroups(prev => prev.map(g => g.id === selected.id ? { ...g, active: !selected.active } : g))
      router.refresh()
    }
    setLoading(false)
  }

  async function handleReset() {
    if (!selected) return
    setLoading(true); setError(null)
    const res = await resetPermissionGroupToTemplate(selected.id)
    if (res.error) { setError(res.error) } else {
      router.refresh()
    }
    setConfirmReset(false)
    setLoading(false)
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      {/* Left rail — groups */}
      <div className="sm:w-56 shrink-0">
        <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
          <div className="divide-y divide-zinc-100">
            {groups.map(group => (
              <button
                key={group.id}
                onClick={() => selectGroup(group)}
                className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                  group.id === selectedId ? 'bg-red-50 text-red-700 font-semibold' : 'text-zinc-700 hover:bg-zinc-50'
                } ${!group.active ? 'opacity-50' : ''}`}
              >
                {group.name}
                {!group.active && <span className="ml-2 text-xs text-zinc-400">(inactive)</span>}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => { setShowAdd(v => !v); setError(null) }}
          className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          {showAdd ? 'Cancel' : '+ New Group'}
        </button>

        {showAdd && (
          <form onSubmit={handleAddGroup} className="mt-2 rounded-xl bg-white border border-zinc-200 p-3 flex flex-col gap-2">
            <input
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              placeholder="Group name"
              required
              className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            <select
              value={duplicateFromId}
              onChange={e => setDuplicateFromId(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm bg-white focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              <option value="">Start blank</option>
              {groups.map(g => <option key={g.id} value={g.id}>Duplicate "{g.name}"</option>)}
            </select>
            <button type="submit" disabled={loading} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">
              {loading ? 'Adding…' : 'Add Group'}
            </button>
          </form>
        )}
      </div>

      {/* Right pane — selected group's checklist */}
      <div className="flex-1 min-w-0">
        {!selected ? (
          <p className="text-sm text-zinc-500">No permission groups yet.</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex-1 min-w-0">
                {renaming ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={nameDraft}
                      onChange={e => setNameDraft(e.target.value)}
                      autoFocus
                      className="rounded-lg border border-zinc-300 px-2 py-1 text-lg font-semibold text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                    <button onClick={handleRename} disabled={loading} className="text-xs font-semibold text-red-700 hover:text-red-800">Save</button>
                    <button onClick={() => setRenaming(false)} className="text-xs text-zinc-400 hover:text-zinc-700">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-zinc-900">{selected.name}</h2>
                    <button
                      onClick={() => { setRenaming(true); setNameDraft(selected.name) }}
                      className="text-xs text-zinc-400 hover:text-zinc-700"
                    >
                      Rename
                    </button>
                  </div>
                )}
                {selected.description && <p className="text-sm text-zinc-500 mt-0.5">{selected.description}</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                {selected.source_template_key && (
                  <button
                    onClick={() => setConfirmReset(true)}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    Reset to default
                  </button>
                )}
                <button
                  onClick={handleToggleActive}
                  disabled={loading}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    selected.active ? 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200' : 'bg-green-50 text-green-700 hover:bg-green-100'
                  }`}
                >
                  {selected.active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading || !dirty}
                  className="rounded-lg bg-red-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                >
                  {loading ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>

            {error && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
            {success && <div className="mb-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">{success}</div>}

            {confirmReset && (
              <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900">Reset "{selected.name}" to the default template?</p>
                  <p className="text-xs text-amber-700 mt-0.5">This will discard your customizations for this group.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmReset(false)} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-700">Cancel</button>
                  <button onClick={handleReset} disabled={loading} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">Confirm Reset</button>
                </div>
              </div>
            )}

            <PermissionChecklist permissions={draft} onChange={handleToggleKey} />
          </>
        )}
      </div>
    </div>
  )
}
