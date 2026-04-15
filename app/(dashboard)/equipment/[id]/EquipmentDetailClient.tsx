'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { assignItemToCompartment, removeItemFromCompartment } from '@/app/actions/equipment'

interface Apparatus {
  id: string
  unit_number: string
  apparatus_name: string | null
  type_name: string | null
  station: { id: string; station_name: string; station_number: string | null } | null
}

interface CompartmentItem {
  id: string
  item_id: string
  item_name: string
  category_name: string
  requires_inspection: boolean
  expected_quantity: number
  minimum_quantity: number | null
  notes: string | null
}

interface Compartment {
  id: string
  compartment_code: string
  compartment_name: string | null
  sort_order: number
  items: CompartmentItem[]
}

interface Item {
  id: string
  item_name: string
  category_id: string
}

interface Category {
  id: string
  category_name: string
  sort_order: number | null
}

export default function EquipmentDetailClient({
  apparatus,
  compartments,
  allItems,
  allCategories,
  isAdmin,
  isOfficerOrAbove,
}: {
  apparatus: Apparatus
  compartments: Compartment[]
  allItems: Item[]
  allCategories: Category[]
  isAdmin: boolean
  isOfficerOrAbove: boolean
}) {
  const router = useRouter()
  const [assigningTo, setAssigningTo] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const stationLabel = apparatus.station
    ? `Station ${apparatus.station.station_number} — ${apparatus.station.station_name}`
    : 'No station assigned'

  const totalItems = compartments.reduce((sum, c) => sum + c.items.length, 0)

  async function handleAssign(compartmentId: string) {
    if (!selectedItem || !quantity) return
    setError(null)
    setLoading(true)
    const formData = new FormData()
    formData.set('apparatus_compartment_id', compartmentId)
    formData.set('item_id', selectedItem)
    formData.set('expected_quantity', quantity)
    const result = await assignItemToCompartment(formData)
    if (result?.error) setError(result.error)
    else {
      setAssigningTo(null)
      setSelectedItem('')
      setQuantity('1')
    }
    setLoading(false)
  }

  async function handleRemove(locationId: string) {
    setError(null)
    setLoading(true)
    const result = await removeItemFromCompartment(locationId)
    if (result?.error) setError(result.error)
    setLoading(false)
  }

  // Group items by category for dropdown
  const itemsByCategory = allCategories.map(cat => ({
    ...cat,
    items: allItems.filter(i => i.category_id === cat.id),
  })).filter(cat => cat.items.length > 0)

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm text-zinc-500 hover:text-zinc-700">← Back</button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">
            Unit {apparatus.unit_number}{apparatus.apparatus_name ? ` — ${apparatus.apparatus_name}` : ''}
          </h1>
          <p className="text-sm text-zinc-500">{apparatus.type_name ?? '—'} · {stationLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-zinc-900">{totalItems}</p>
          <p className="text-xs text-zinc-400">item types</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>
      )}

      {compartments.length === 0 ? (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          No compartments assigned to this apparatus yet.
          {isAdmin && (
            <p className="mt-2">
              <a href={`/apparatus/${apparatus.id}`} className="text-red-600 hover:underline">
                Go to apparatus detail to add compartments →
              </a>
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {compartments.map(c => (
            <div key={c.id} className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
              {/* Compartment Header */}
              <div className="flex items-center justify-between px-5 py-3 bg-zinc-50 border-b border-zinc-200">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center rounded-lg bg-red-50 border border-red-100 px-2.5 py-1 text-sm font-mono font-bold text-red-700">
                    {c.compartment_code}
                  </span>
                  {c.compartment_name && (
                    <span className="text-sm text-zinc-600">{c.compartment_name}</span>
                  )}
                </div>
                {isOfficerOrAbove && (
                  <button
                    onClick={() => {
                      setAssigningTo(assigningTo === c.id ? null : c.id)
                      setSelectedItem('')
                      setQuantity('1')
                      setError(null)
                    }}
                    className="text-xs font-semibold text-red-600 hover:text-red-800"
                  >
                    {assigningTo === c.id ? 'Cancel' : '+ Add Item'}
                  </button>
                )}
              </div>

              {/* Add Item Form */}
              {assigningTo === c.id && isOfficerOrAbove && (
                <div className="px-5 py-4 border-b border-zinc-100 bg-red-50">
                  <div className="flex gap-3">
                    <select
                      value={selectedItem}
                      onChange={e => setSelectedItem(e.target.value)}
                      className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                    >
                      <option value="">Select item...</option>
                      {itemsByCategory.map(cat => (
                        <optgroup key={cat.id} label={cat.category_name}>
                          {cat.items
                            .filter(item => !c.items.some(ci => ci.item_id === item.id))
                            .map(item => (
                              <option key={item.id} value={item.id}>{item.item_name}</option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                    <div className="w-20">
                      <input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={e => setQuantity(e.target.value)}
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-center focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                        placeholder="Qty"
                      />
                    </div>
                    <button
                      onClick={() => handleAssign(c.id)}
                      disabled={!selectedItem || loading}
                      className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                    >
                      {loading ? '...' : 'Add'}
                    </button>
                  </div>
                </div>
              )}

              {/* Item List */}
              {c.items.length === 0 ? (
                <div className="px-5 py-4 text-sm text-zinc-400">No items assigned to this compartment.</div>
              ) : (
                <div className="divide-y divide-zinc-100">
                  {c.items.map(item => (
                    <div key={item.id} className="flex items-center px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-zinc-900">{item.item_name}</p>
                          {item.requires_inspection && (
                            <span className="text-xs rounded-full bg-yellow-100 text-yellow-700 px-2 py-0.5">Inspection</span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400">{item.category_name}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-lg font-bold text-zinc-900">{item.expected_quantity}</p>
                          <p className="text-xs text-zinc-400">expected</p>
                        </div>
                        {isOfficerOrAbove && (
                          <button
                            onClick={() => handleRemove(item.id)}
                            disabled={loading}
                            className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
