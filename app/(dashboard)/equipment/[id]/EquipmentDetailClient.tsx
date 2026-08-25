'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { assignItemToCompartment, removeItemFromCompartment, moveItemToCompartment, moveQuantityToStorage, updateItemQuantity } from '@/app/actions/equipment'
import { assignMedicalSupplyToCompartment } from '@/app/actions/medical'
import { MEDICAL_STATUS_COLORS, MEDICAL_STATUS_LABELS, type MedicalSupplyStatus } from '@/lib/medical-status'
import HelpText from '@/components/HelpText'

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

interface MedicalSupplyType {
  id: string
  name: string
  category: string
  unit_of_measure: string
}

interface CompartmentMedication {
  storeroom_inventory_id: string
  supply_type_id: string
  supply_name: string
  unit_of_measure: string
  par_level: number
  current_quantity: number
  status: MedicalSupplyStatus
}

interface ApparatusOption {
  id: string
  unit_number: string
  apparatus_name: string | null
  compartments: {
    id: string
    compartment_code: string
    compartment_name: string | null
    sort_order: number
  }[]
}

interface MoveTarget {
  locationId: string
  itemName: string
  sourceCompartmentId: string
  expectedQuantity: number
  canMoveToStorage: boolean
}

export default function EquipmentDetailClient({
  apparatus,
  compartments,
  allItems,
  allCategories,
  allApparatus,
  isAdmin,
  isOfficerOrAbove,
  backHref,
  medicalSupplyTypes,
  medicationsByCompartment,
}: {
  apparatus: Apparatus
  compartments: Compartment[]
  allItems: Item[]
  allCategories: Category[]
  allApparatus: ApparatusOption[]
  isAdmin: boolean
  isOfficerOrAbove: boolean
  backHref?: string
  medicalSupplyTypes: MedicalSupplyType[]
  medicationsByCompartment: Record<string, CompartmentMedication[]>
}) {
  const router = useRouter()
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [assigningTo, setAssigningTo] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [minQty, setMinQty] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Edit quantity state
  const [editingQty, setEditingQty] = useState<string | null>(null)
  const [qtyDraft, setQtyDraft] = useState('')
  const [minDraft, setMinDraft] = useState('')

  // Move modal state
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null)
  const [moveApparatusId, setMoveApparatusId] = useState('')
  const [moveCompartmentId, setMoveCompartmentId] = useState('')
  const [moveStorageQty, setMoveStorageQty] = useState('1')
  const [moveError, setMoveError] = useState<string | null>(null)
  const [moveLoading, setMoveLoading] = useState(false)

  const stationLabel = apparatus.station
    ? `Station ${apparatus.station.station_number} — ${apparatus.station.station_name}`
    : 'No station assigned'

  const totalItems = compartments.reduce((sum, c) => sum + c.items.length, 0)

  async function handleAssign(compartmentId: string) {
    if (!selectedItem || !quantity) return
    setError(null)
    setLoading(true)

    const isMedication = selectedItem.startsWith('med:')
    const rawId = selectedItem.slice(selectedItem.indexOf(':') + 1)

    let result: { error?: string } | undefined
    if (isMedication) {
      const formData = new FormData()
      formData.set('apparatus_compartment_id', compartmentId)
      formData.set('supply_type_id', rawId)
      formData.set('par_level', quantity)
      result = await assignMedicalSupplyToCompartment(formData)
    } else {
      const formData = new FormData()
      formData.set('apparatus_compartment_id', compartmentId)
      formData.set('item_id', rawId)
      formData.set('expected_quantity', quantity)
      if (minQty) formData.set('minimum_quantity', minQty)
      result = await assignItemToCompartment(formData)
    }

    if (result?.error) setError(result.error)
    else {
      setAssigningTo(null)
      setSelectedItem('')
      setQuantity('1')
      router.refresh()
    }
    setLoading(false)
  }

  async function handleUpdateQty(locationId: string) {
    const qty = parseInt(qtyDraft)
    if (!qty || qty < 1) return
    setError(null)
    setLoading(true)
    const min = minDraft !== '' ? parseInt(minDraft) : undefined
    const result = await updateItemQuantity(locationId, qty, min)
    if (result?.error) setError(result.error)
    else { setEditingQty(null); router.refresh() }
    setLoading(false)
  }

  async function handleRemove(locationId: string) {
    setError(null)
    setLoading(true)
    const result = await removeItemFromCompartment(locationId)
    if (result?.error) setError(result.error)
    else router.refresh()
    setLoading(false)
  }

  function openMoveModal(item: CompartmentItem, sourceCompartmentId: string) {
    setMoveTarget({
      locationId: item.id,
      itemName: item.item_name,
      sourceCompartmentId,
      expectedQuantity: item.expected_quantity,
      canMoveToStorage: !item.requires_inspection,
    })
    setMoveApparatusId(apparatus.id)
    setMoveCompartmentId('')
    setMoveStorageQty(String(item.expected_quantity))
    setMoveError(null)
  }

  async function handleMove() {
    if (!moveTarget || !moveCompartmentId) return
    setMoveError(null)
    setMoveLoading(true)
    const result = await moveItemToCompartment(moveTarget.locationId, moveCompartmentId)
    if (result?.error) setMoveError(result.error)
    else {
      setMoveTarget(null)
      router.refresh()
    }
    setMoveLoading(false)
  }

  async function handleMoveToStorage() {
    if (!moveTarget) return
    const qty = parseInt(moveStorageQty)
    if (!qty || qty < 1 || qty > moveTarget.expectedQuantity) return
    setMoveError(null)
    setMoveLoading(true)
    const result = await moveQuantityToStorage(moveTarget.locationId, qty)
    if (result?.error) setMoveError(result.error)
    else {
      setMoveTarget(null)
      router.refresh()
    }
    setMoveLoading(false)
  }

  // Group items by category for dropdown
  const itemsByCategory = allCategories.map(cat => ({
    ...cat,
    items: allItems.filter(i => i.category_id === cat.id),
  })).filter(cat => cat.items.length > 0)

  // Compartments available for the selected move-target apparatus
  const moveApparatusObj = allApparatus.find(a => a.id === moveApparatusId)
  const moveApparatusCompartments = moveApparatusObj?.compartments ?? []
  const moveApparatusUnitNumber = moveApparatusObj?.unit_number ?? ''

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">
            Unit {apparatus.unit_number}{apparatus.apparatus_name ? ` — ${apparatus.apparatus_name}` : ''}
          </h1>
          <p className="text-sm text-zinc-500">{apparatus.type_name ?? '—'} · {stationLabel}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold text-zinc-900">{totalItems}</p>
          <p className="text-xs text-zinc-400">item types</p>
        </div>
      </div>

      <HelpText className="mb-4">
        This is a read-only view of what's assigned to this apparatus, by compartment. To actually inspect the
        items or move them around, use "Inspect Inventory" — this page won't record anything on its own.
      </HelpText>

      {/* Action row */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => backHref ? router.push(backHref) : router.back()}
          className="rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-sm"
        >
          ← Back
        </button>
        <Link
          href={`/inspections/apparatus/${apparatus.id}`}
          className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors shadow-sm"
        >
          Inspect Inventory →
        </Link>
        <Link
          href={`/equipment/${apparatus.id}/fuel`}
          className="rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-sm"
        >
          Fuel Log →
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>
      )}

      {isOfficerOrAbove && compartments.length > 0 && (
        <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-700 leading-relaxed">
          <span className="font-semibold">Managing equipment:</span> Tap <span className="font-semibold">+ Add Item</span> on a compartment to assign an item type — each type can only be added once per compartment. To adjust the expected count of an item already assigned, tap the quantity number to edit it inline.
        </div>
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
                    {apparatus.unit_number} - {c.compartment_code}
                  </span>
                  {c.compartment_name && (
                    <span className="text-sm text-zinc-600">{c.compartment_name}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/equipment/${apparatus.id}/${c.id}`}
                    className="text-xs font-semibold text-zinc-500 hover:text-red-700"
                  >
                    View →
                  </Link>
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
              </div>

              {/* Add Item Form */}
              {assigningTo === c.id && isOfficerOrAbove && (
                <div className="px-5 py-4 border-b border-zinc-100 bg-red-50">
                  <div className="flex flex-col gap-2">
                    <select
                      value={selectedItem}
                      onChange={e => setSelectedItem(e.target.value)}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                    >
                      <option value="">Select item...</option>
                      {itemsByCategory.map(cat => (
                        <optgroup key={cat.id} label={cat.category_name}>
                          {cat.items
                            .filter(item => !c.items.some(ci => ci.item_id === item.id))
                            .map(item => (
                              <option key={item.id} value={`item:${item.id}`}>{item.item_name}</option>
                            ))}
                        </optgroup>
                      ))}
                      {medicalSupplyTypes.length > 0 && (
                        <optgroup label="Medications">
                          {medicalSupplyTypes
                            .filter(med => !(medicationsByCompartment[c.id] ?? []).some(cm => cm.supply_type_id === med.id))
                            .map(med => (
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
                        <input
                          type="number"
                          min="1"
                          value={quantity}
                          onChange={e => setQuantity(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-center focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                          placeholder="1"
                        />
                      </div>
                      <button
                        onClick={() => handleAssign(c.id)}
                        disabled={!selectedItem || loading}
                        className="self-end rounded-lg bg-red-700 px-5 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                      >
                        {loading ? '...' : 'Add'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Item List */}
              {c.items.length === 0 && (medicationsByCompartment[c.id] ?? []).length === 0 ? (
                <div className="px-5 py-4 text-sm text-zinc-400">No items assigned to this compartment.</div>
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
                          {item.minimum_quantity != null && item.expected_quantity < item.minimum_quantity && (
                            <span className="text-xs rounded-full bg-red-100 text-red-700 px-2 py-0.5">⚠ Below Min</span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400">{item.category_name}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        {isOfficerOrAbove && editingQty === item.id ? (
                          <div className="flex items-center gap-2">
                            <div className="flex flex-col gap-1">
                              <input
                                type="number"
                                min="1"
                                value={qtyDraft}
                                onChange={e => setQtyDraft(e.target.value)}
                                className="w-16 rounded-lg border border-zinc-300 px-2 py-1 text-sm text-center focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                                placeholder="Qty"
                                autoFocus
                              />
                              <input
                                type="number"
                                min="0"
                                value={minDraft}
                                onChange={e => setMinDraft(e.target.value)}
                                className="w-16 rounded-lg border border-zinc-300 px-2 py-1 text-sm text-center focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                placeholder="Min"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => handleUpdateQty(item.id)}
                                disabled={loading || !qtyDraft || parseInt(qtyDraft) < 1}
                                className="text-xs font-semibold text-green-700 hover:text-green-900 disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingQty(null)}
                                className="text-xs text-zinc-400 hover:text-zinc-600"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`text-center ${isOfficerOrAbove ? 'cursor-pointer hover:opacity-70' : ''}`}
                            onClick={() => {
                              if (!isOfficerOrAbove) return
                              setEditingQty(item.id)
                              setQtyDraft(String(item.expected_quantity))
                              setMinDraft(item.minimum_quantity != null ? String(item.minimum_quantity) : '')
                            }}
                            title={isOfficerOrAbove ? 'Click to edit' : undefined}
                          >
                            <p className="text-lg font-bold text-zinc-900">{item.expected_quantity}</p>
                            <p className="text-xs text-zinc-400">{item.requires_inspection ? 'assets' : 'expected'}</p>
                            {item.minimum_quantity != null && (
                              <p className="text-xs text-zinc-400">min {item.minimum_quantity}</p>
                            )}
                          </div>
                        )}
                        {editingQty !== item.id && (
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => openMoveModal(item, c.id)}
                              disabled={loading}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                            >
                              Move
                            </button>
                            {isOfficerOrAbove && (
                              confirmRemoveId === item.id ? (
                                <>
                                  <button
                                    onClick={() => { handleRemove(item.id); setConfirmRemoveId(null) }}
                                    disabled={loading}
                                    className="text-xs text-red-600 hover:text-red-800 font-semibold disabled:opacity-50"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setConfirmRemoveId(null)}
                                    className="text-xs text-zinc-400 hover:text-zinc-600"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => setConfirmRemoveId(item.id)}
                                  disabled={loading}
                                  className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                                >
                                  Remove
                                </button>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {(medicationsByCompartment[c.id] ?? []).map(med => (
                    <div key={med.storeroom_inventory_id} className="flex items-center px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-zinc-900">{med.supply_name}</p>
                          <span className="text-xs rounded-full bg-purple-100 text-purple-700 px-2 py-0.5">💊 Medical</span>
                          <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${MEDICAL_STATUS_COLORS[med.status]}`}>
                            {MEDICAL_STATUS_LABELS[med.status]}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400">PAR {med.par_level} {med.unit_of_measure}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-zinc-900">{med.current_quantity}</p>
                        <p className="text-xs text-zinc-400">on hand</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Move Modal */}
      {moveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6">
            <h2 className="text-base font-bold text-zinc-900 mb-1">Move Item</h2>
            <p className="text-sm text-zinc-500 mb-5">
              Moving <span className="font-semibold text-zinc-800">{moveTarget.itemName}</span> to a new compartment.
            </p>

            {moveError && (
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{moveError}</div>
            )}

            {moveTarget.canMoveToStorage && (
              <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-3">
                <p className="text-xs font-semibold text-blue-800 mb-2">Move to Storage</p>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-blue-700 mb-1">
                      Quantity (max {moveTarget.expectedQuantity})
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={moveTarget.expectedQuantity}
                      value={moveStorageQty}
                      onChange={e => setMoveStorageQty(e.target.value)}
                      className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={handleMoveToStorage}
                    disabled={moveLoading || !moveStorageQty || parseInt(moveStorageQty) < 1 || parseInt(moveStorageQty) > moveTarget.expectedQuantity}
                    className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    Move to Storage
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 mb-1">Apparatus</label>
                <select
                  value={moveApparatusId}
                  onChange={e => { setMoveApparatusId(e.target.value); setMoveCompartmentId('') }}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  {allApparatus.map(a => (
                    <option key={a.id} value={a.id}>
                      Unit {a.unit_number}{a.apparatus_name ? ` — ${a.apparatus_name}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 mb-1">Compartment</label>
                <select
                  value={moveCompartmentId}
                  onChange={e => setMoveCompartmentId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  disabled={!moveApparatusId}
                >
                  <option value="">Select compartment...</option>
                  {moveApparatusCompartments
                    .filter(c => c.id !== moveTarget.sourceCompartmentId || moveApparatusId !== apparatus.id)
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {moveApparatusUnitNumber} - {c.compartment_code}{c.compartment_name ? ` — ${c.compartment_name}` : ''}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setMoveTarget(null)}
                className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={handleMove}
                disabled={!moveCompartmentId || moveLoading}
                className="flex-1 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {moveLoading ? 'Moving...' : 'Move Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
