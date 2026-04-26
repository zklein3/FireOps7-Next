'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { assignAssetApparatus } from '@/app/actions/equipment'

type AssetRow = {
  id: string
  asset_tag: string
  item_name: string
  item_id: string
  category_name: string
  serial_number: string | null
  status: string
  active: boolean
  in_service_date: string | null
  out_of_service_date: string | null
  notes: string | null
  apparatus_id: string | null
  apparatus_label: string | null
}

type ItemOption = { id: string; item_name: string }
type ApparatusOption = { id: string; label: string }

const STATUS_FILTERS = [
  { key: 'ALL', label: 'All', color: 'border-zinc-200' },
  { key: 'IN SERVICE', label: 'In Service', color: 'border-green-200' },
  { key: 'OUT OF SERVICE', label: 'Out of Service', color: 'border-yellow-200' },
  { key: 'RETIRED', label: 'Retired', color: 'border-zinc-300' },
]

function statusBadge(status: string) {
  const s = status?.toUpperCase()
  if (s === 'IN SERVICE') return { cls: 'bg-green-100 text-green-700', label: 'In Service' }
  if (s === 'OUT OF SERVICE') return { cls: 'bg-yellow-100 text-yellow-700', label: 'Out of Service' }
  return { cls: 'bg-zinc-100 text-zinc-500', label: 'Retired' }
}

function fmt(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString()
}

export default function AssetRosterClient({
  assets,
  itemOptions,
  apparatusOptions,
  isAdmin,
}: {
  assets: AssetRow[]
  itemOptions: ItemOption[]
  apparatusOptions: ApparatusOption[]
  isAdmin: boolean
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [itemFilter, setItemFilter] = useState('ALL')

  // Track apparatus assignments locally so saves reflect immediately
  const [assignments, setAssignments] = useState<Record<string, string | null>>(
    () => Object.fromEntries(assets.map(a => [a.id, a.apparatus_id]))
  )
  const [labels, setLabels] = useState<Record<string, string | null>>(
    () => Object.fromEntries(assets.map(a => [a.id, a.apparatus_label]))
  )

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isPending, startTransition] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)

  const apparatusLabelMap = Object.fromEntries(apparatusOptions.map(a => [a.id, a.label]))

  function startEdit(assetId: string) {
    setEditingId(assetId)
    setEditValue(assignments[assetId] ?? '')
    setSaveError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setSaveError(null)
  }

  function handleSave(assetId: string) {
    const newApparatusId = editValue || null
    startTransition(async () => {
      const result = await assignAssetApparatus(assetId, newApparatusId)
      if (result?.error) {
        setSaveError(result.error)
        return
      }
      setAssignments(prev => ({ ...prev, [assetId]: newApparatusId }))
      setLabels(prev => ({ ...prev, [assetId]: newApparatusId ? (apparatusLabelMap[newApparatusId] ?? null) : null }))
      setEditingId(null)
    })
  }

  const statusCounts = useMemo(() => ({
    ALL: assets.length,
    'IN SERVICE': assets.filter(a => a.status === 'IN SERVICE').length,
    'OUT OF SERVICE': assets.filter(a => a.status === 'OUT OF SERVICE').length,
    RETIRED: assets.filter(a => a.status === 'RETIRED').length,
  }), [assets])

  const filtered = useMemo(() => {
    return assets.filter(a => {
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false
      if (itemFilter !== 'ALL' && a.item_id !== itemFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !a.asset_tag.toLowerCase().includes(q) &&
          !(a.serial_number ?? '').toLowerCase().includes(q) &&
          !a.item_name.toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [assets, statusFilter, itemFilter, search])

  function LocationCell({ assetId }: { assetId: string }) {
    const label = labels[assetId]
    if (!isAdmin) return <span className="text-zinc-400 text-xs">{label ?? '—'}</span>

    if (editingId === assetId) {
      return (
        <div className="flex items-center gap-2 min-w-[220px]">
          <select
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            className="flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-red-400"
          >
            <option value="">Unassigned</option>
            {apparatusOptions.map(ap => (
              <option key={ap.id} value={ap.id}>{ap.label}</option>
            ))}
          </select>
          <button
            onClick={() => handleSave(assetId)}
            disabled={isPending}
            className="rounded bg-red-700 px-2 py-1 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50"
          >
            {isPending ? '…' : 'Save'}
          </button>
          <button
            onClick={cancelEdit}
            disabled={isPending}
            className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          >
            ✕
          </button>
        </div>
      )
    }

    return (
      <div className="flex items-center gap-2">
        <span className="text-zinc-500 text-xs">{label ?? <span className="text-zinc-400 italic">Unassigned</span>}</span>
        <button
          onClick={() => startEdit(assetId)}
          className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100 hover:border-red-400 transition-colors"
        >
          Manage
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Asset Roster</h1>
          <p className="text-sm text-zinc-500 mt-0.5">All tracked assets across your department</p>
        </div>
        {isAdmin && (
          <Link
            href="/dept-admin/items?tab=assets"
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 transition-colors"
          >
            Manage Assets
          </Link>
        )}
      </div>

      {saveError && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}

      {/* Status summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {STATUS_FILTERS.map(sf => (
          <button
            key={sf.key}
            onClick={() => setStatusFilter(sf.key)}
            className={`rounded-xl border bg-white px-4 py-3 text-left transition-all ${
              statusFilter === sf.key
                ? 'ring-2 ring-red-500 border-red-300'
                : sf.color + ' hover:border-red-200'
            }`}
          >
            <p className="text-xs text-zinc-500">{sf.label}</p>
            <p className="text-2xl font-bold text-zinc-900">{statusCounts[sf.key as keyof typeof statusCounts]}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Search tag, serial #, or item type..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-400"
        />
        <select
          value={itemFilter}
          onChange={e => setItemFilter(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-red-400"
        >
          <option value="ALL">All Item Types</option>
          {itemOptions.map(i => (
            <option key={i.id} value={i.id}>{i.item_name}</option>
          ))}
        </select>
      </div>

      <p className="text-xs text-zinc-400 mb-3">
        {filtered.length} asset{filtered.length !== 1 ? 's' : ''}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          No assets match the current filters.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block rounded-xl bg-white border border-zinc-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200 text-left">
                  <th className="px-4 py-3 font-semibold text-zinc-700">Asset Tag</th>
                  <th className="px-4 py-3 font-semibold text-zinc-700">Item Type</th>
                  <th className="px-4 py-3 font-semibold text-zinc-700">Category</th>
                  <th className="px-4 py-3 font-semibold text-zinc-700">Serial #</th>
                  <th className="px-4 py-3 font-semibold text-zinc-700">Status</th>
                  <th className="px-4 py-3 font-semibold text-zinc-700">In Service</th>
                  <th className="px-4 py-3 font-semibold text-zinc-700">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map(a => {
                  const badge = statusBadge(a.status)
                  return (
                    <tr key={a.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-zinc-900">{a.asset_tag}</td>
                      <td className="px-4 py-3 text-zinc-700">{a.item_name}</td>
                      <td className="px-4 py-3 text-zinc-500 text-xs">{a.category_name}</td>
                      <td className="px-4 py-3 text-zinc-500 font-mono text-xs">{a.serial_number ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500">{fmt(a.in_service_date)}</td>
                      <td className="px-4 py-3">
                        <LocationCell assetId={a.id} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {filtered.map(a => {
              const badge = statusBadge(a.status)
              const label = labels[a.id]
              return (
                <div key={a.id} className="rounded-xl bg-white border border-zinc-200 p-4">
                  <div className="flex items-start justify-between mb-1">
                    <p className="font-semibold text-zinc-900">{a.asset_tag}</p>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-700">{a.item_name}</p>
                  <p className="text-xs text-zinc-400">{a.category_name}</p>
                  {a.serial_number && (
                    <p className="text-xs text-zinc-400 mt-1 font-mono">S/N: {a.serial_number}</p>
                  )}

                  {/* Mobile location + assign */}
                  <div className="mt-3 pt-3 border-t border-zinc-100">
                    {isAdmin && editingId === a.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          className="flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-red-400"
                        >
                          <option value="">Unassigned</option>
                          {apparatusOptions.map(ap => (
                            <option key={ap.id} value={ap.id}>{ap.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleSave(a.id)}
                          disabled={isPending}
                          className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
                        >
                          {isPending ? '…' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={isPending}
                          className="rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">
                          {label ?? <span className="italic">Unassigned</span>}
                        </span>
                        {isAdmin && (
                          <button
                            onClick={() => startEdit(a.id)}
                            className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100 hover:border-red-400 transition-colors"
                          >
                            Manage
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
