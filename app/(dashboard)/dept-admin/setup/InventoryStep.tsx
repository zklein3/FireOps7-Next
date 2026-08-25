'use client'

import { useState } from 'react'
import { assignItemToCompartment, removeItemFromCompartment, updateItemQuantity, getApparatusInventory } from '@/app/actions/equipment'
import { assignMedicalSupplyToCompartment } from '@/app/actions/medical'

interface Apparatus { id: string; unit_number: string; apparatus_name: string | null; active: boolean }
interface CompartmentItem { id: string; item_id: string; item_name: string; category_name: string; requires_inspection: boolean; expected_quantity: number; minimum_quantity: number | null }
interface Compartment { id: string; compartment_code: string; compartment_name: string | null; sort_order: number; items: CompartmentItem[] }
interface Item { id: string; item_name: string; category_id: string }
interface Category { id: string; category_name: string; sort_order: number | null }
interface MedicalSupplyType { id: string; name: string; category: string; unit_of_measure: string }

export default function InventoryStep({
  apparatus,
  allItems,
  allCategories,
  medicalSupplyTypes,
}: {
  apparatus: Apparatus[]
  allItems: Item[]
  allCategories: Category[]
  medicalSupplyTypes: MedicalSupplyType[]
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [compartments, setCompartments] = useState<Compartment[]>([])
  const [loadingInventory, setLoadingInventory] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assigningTo, setAssigningTo] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [editingQty, setEditingQty] = useState<string | null>(null)
  const [qtyDraft, setQtyDraft] = useState('')
  const [minDraft, setMinDraft] = useState('')
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  const selectedApparatus = apparatus.find(a => a.id === selectedId)
  const activeApparatus = apparatus.filter(a => a.active)

  async function loadApparatus(id: string) {
    setSelectedId(id)
    setLoadingInventory(true)
    setError(null)
    setAssigningTo(null)
    setEditingQty(null)
    setConfirmRemoveId(null)
    const result = await getApparatusInventory(id)
    if (result.error) setError(result.error)
    else setCompartments(result.compartments ?? [])
    setLoadingInventory(false)
  }

  async function handleAssign(compartmentId: string) {
    if (!selectedItem || !quantity) return
    setError(null); setLoading(true)

    const isMedication = selectedItem.startsWith('med:')
    const rawId = selectedItem.slice(selectedItem.indexOf(':') + 1)

    let result: { error?: string } | undefined
    if (isMedication) {
      const fd = new FormData()
      fd.set('apparatus_compartment_id', compartmentId)
      fd.set('supply_type_id', rawId)
      fd.set('par_level', quantity)
      result = await assignMedicalSupplyToCompartment(fd)
    } else {
      const fd = new FormData()
      fd.set('apparatus_compartment_id', compartmentId)
      fd.set('item_id', rawId)
      fd.set('expected_quantity', quantity)
      result = await assignItemToCompartment(fd)
    }

    if (result?.error) setError(result.error)
    else { setAssigningTo(null); setSelectedItem(''); setQuantity('1'); if (selectedId) await loadApparatus(selectedId) }
    setLoading(false)
  }

  async function handleUpdateQty(locationId: string) {
    const qty = parseInt(qtyDraft)
    if (!qty || qty < 1) return
    setError(null); setLoading(true)
    const min = minDraft !== '' ? parseInt(minDraft) : undefined
    const result = await updateItemQuantity(locationId, qty, min)
    if (result?.error) setError(result.error)
    else { setEditingQty(null); if (selectedId) await loadApparatus(selectedId) }
    setLoading(false)
  }

  async function handleRemove(locationId: string) {
    setError(null); setLoading(true)
    const result = await removeItemFromCompartment(locationId)
    if (result?.error) setError(result.error)
    else { setConfirmRemoveId(null); if (selectedId) await loadApparatus(selectedId) }
    setLoading(false)
  }

  const itemsByCategory = allCategories
    .map(cat => ({ ...cat, items: allItems.filter(i => i.category_id === cat.id) }))
    .filter(cat => cat.items.length > 0)

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900">Inventory Assignment</h2>
        <p className="text-sm text-zinc-500 mt-0.5">Assign item types to apparatus compartments and set expected quantities.</p>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}

      {/* Apparatus selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {activeApparatus.map(a => (
          <button key={a.id} onClick={() => loadApparatus(a.id)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors border ${
              selectedId === a.id
                ? 'bg-red-700 text-white border-red-700'
                : 'bg-white text-zinc-700 border-zinc-200 hover:border-red-300'
            }`}>
            Unit {a.unit_number}{a.apparatus_name ? ` — ${a.apparatus_name}` : ''}
          </button>
        ))}
      </div>

      {!selectedId && (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          Select an apparatus above to manage its inventory.
        </div>
      )}

      {selectedId && loadingInventory && (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-8 text-center text-sm text-zinc-400">Loading...</div>
      )}

      {selectedId && !loadingInventory && (
        <>
          <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-700">
            <span className="font-semibold">Tip:</span> Tap <span className="font-semibold">+ Add Item</span> to assign an item type to a compartment. Tap the quantity number to edit expected / minimum counts.
          </div>

          {compartments.length === 0 ? (
            <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
              No compartments assigned to Unit {selectedApparatus?.unit_number}. Add compartments in the Compartments tab first.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {compartments.map(c => (
                <div key={c.id} className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
                  {/* Compartment header */}
                  <div className="flex items-center justify-between px-5 py-3 bg-zinc-50 border-b border-zinc-200">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center rounded-lg bg-red-50 border border-red-100 px-2.5 py-1 text-sm font-mono font-bold text-red-700">
                        {selectedApparatus?.unit_number} - {c.compartment_code}
                      </span>
                      {c.compartment_name && <span className="text-sm text-zinc-600">{c.compartment_name}</span>}
                    </div>
                    <button
                      onClick={() => { setAssigningTo(assigningTo === c.id ? null : c.id); setSelectedItem(''); setQuantity('1'); setError(null) }}
                      className="text-xs font-semibold text-red-600 hover:text-red-800">
                      {assigningTo === c.id ? 'Cancel' : '+ Add Item'}
                    </button>
                  </div>

                  {/* Add item form */}
                  {assigningTo === c.id && (
                    <div className="px-5 py-4 border-b border-zinc-100 bg-red-50">
                      <div className="flex flex-col gap-2">
                        <select value={selectedItem} onChange={e => setSelectedItem(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                          <option value="">Select item...</option>
                          {itemsByCategory.map(cat => (
                            <optgroup key={cat.id} label={cat.category_name}>
                              {cat.items
                                .filter(item => !c.items.some(ci => ci.item_id === item.id))
                                .map(item => <option key={item.id} value={`item:${item.id}`}>{item.item_name}</option>)}
                            </optgroup>
                          ))}
                          {medicalSupplyTypes.length > 0 && (
                            <optgroup label="Medications">
                              {medicalSupplyTypes.map(med => (
                                <option key={med.id} value={`med:${med.id}`}>💊 {med.name}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="block text-xs text-zinc-500 mb-0.5">
                              {selectedItem.startsWith('med:') ? 'PAR Level' : 'Expected Qty'}
                            </label>
                            <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="1"
                              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-center focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                          </div>
                          <button onClick={() => handleAssign(c.id)} disabled={!selectedItem || loading}
                            className="self-end rounded-lg bg-red-700 px-5 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                            {loading ? '...' : 'Add'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Item list */}
                  {c.items.length === 0 ? (
                    <div className="px-5 py-4 text-sm text-zinc-400">No items assigned.</div>
                  ) : (
                    <div className="divide-y divide-zinc-100">
                      {c.items.map(item => (
                        <div key={item.id} className="flex items-center px-5 py-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-zinc-900">{item.item_name}</p>
                              {item.requires_inspection && (
                                <span className="text-xs rounded-full bg-yellow-100 text-yellow-700 px-2 py-0.5">Inspection</span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-400">{item.category_name}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            {editingQty === item.id ? (
                              <div className="flex items-center gap-2">
                                <div className="flex flex-col gap-1">
                                  <input type="number" min="1" value={qtyDraft} onChange={e => setQtyDraft(e.target.value)} placeholder="Qty" autoFocus
                                    className="w-16 rounded-lg border border-zinc-300 px-2 py-1 text-sm text-center focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                                  <input type="number" min="0" value={minDraft} onChange={e => setMinDraft(e.target.value)} placeholder="Min"
                                    className="w-16 rounded-lg border border-zinc-300 px-2 py-1 text-sm text-center focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500" />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <button onClick={() => handleUpdateQty(item.id)} disabled={loading || !qtyDraft || parseInt(qtyDraft) < 1}
                                    className="text-xs font-semibold text-green-700 hover:text-green-900 disabled:opacity-50">Save</button>
                                  <button onClick={() => setEditingQty(null)} className="text-xs text-zinc-400 hover:text-zinc-600">Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center cursor-pointer hover:opacity-70"
                                onClick={() => { setEditingQty(item.id); setQtyDraft(String(item.expected_quantity)); setMinDraft(item.minimum_quantity != null ? String(item.minimum_quantity) : '') }}
                                title="Click to edit">
                                <p className="text-lg font-bold text-zinc-900">{item.expected_quantity}</p>
                                <p className="text-xs text-zinc-400">{item.requires_inspection ? 'assets' : 'expected'}</p>
                                {item.minimum_quantity != null && <p className="text-xs text-zinc-400">min {item.minimum_quantity}</p>}
                              </div>
                            )}
                            {editingQty !== item.id && (
                              confirmRemoveId === item.id ? (
                                <div className="flex items-center gap-2">
                                  <button onClick={() => handleRemove(item.id)} disabled={loading}
                                    className="text-xs text-red-600 hover:text-red-800 font-semibold disabled:opacity-50">Confirm</button>
                                  <button onClick={() => setConfirmRemoveId(null)} className="text-xs text-zinc-400 hover:text-zinc-600">Cancel</button>
                                </div>
                              ) : (
                                <button onClick={() => setConfirmRemoveId(item.id)} disabled={loading}
                                  className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50">Remove</button>
                              )
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
        </>
      )}
    </div>
  )
}
