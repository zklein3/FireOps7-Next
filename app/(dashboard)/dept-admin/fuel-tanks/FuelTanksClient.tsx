'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createFuelTank,
  updateFuelTank,
  deactivateFuelTank,
  reactivateFuelTank,
} from '@/app/actions/fuel-tanks'
import ReceiveDeliveryForm from './ReceiveDeliveryForm'
import HelpText from '@/components/HelpText'

type Delivery = {
  id: string
  delivery_date: string
  gallons: number
  cost_per_gallon: number | null
  total_cost: number | null
  vendor: string | null
}

type Tank = {
  id: string
  name: string
  fuel_type: 'diesel' | 'gasoline' | 'other'
  capacity_gallons: number
  low_level_threshold_gallons: number
  current_gallons: number
  active: boolean
  notes: string | null
}

const FUEL_LABELS: Record<string, string> = { diesel: 'Diesel', gasoline: 'Gasoline', other: 'Other' }
const FUEL_COLORS: Record<string, string> = {
  diesel: 'bg-blue-100 text-blue-700',
  gasoline: 'bg-amber-100 text-amber-700',
  other: 'bg-zinc-100 text-zinc-600',
}

export default function FuelTanksClient({
  tanks: initialTanks,
  deliveryHistory,
  departmentId,
}: {
  tanks: Tank[]
  deliveryHistory: Record<string, Delivery[]>
  departmentId: string
}) {
  const router = useRouter()
  const [showAll, setShowAll] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [receivingTankId, setReceivingTankId] = useState<string | null>(null)
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formName, setFormName] = useState('')
  const [formFuelType, setFormFuelType] = useState<'diesel' | 'gasoline' | 'other'>('diesel')
  const [formCapacity, setFormCapacity] = useState('')
  const [formThreshold, setFormThreshold] = useState('50')
  const [formNotes, setFormNotes] = useState('')

  function openAdd() {
    setEditingId(null)
    setFormName('')
    setFormFuelType('diesel')
    setFormCapacity('')
    setFormThreshold('50')
    setFormNotes('')
    setError(null)
    setShowForm(true)
    setReceivingTankId(null)
  }

  function openEdit(tank: Tank) {
    setEditingId(tank.id)
    setFormName(tank.name)
    setFormFuelType(tank.fuel_type)
    setFormCapacity(String(tank.capacity_gallons))
    setFormThreshold(String(tank.low_level_threshold_gallons))
    setFormNotes(tank.notes ?? '')
    setError(null)
    setShowForm(true)
    setReceivingTankId(null)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setError(null)
  }

  async function handleSubmit() {
    if (!formName.trim()) { setError('Tank name is required.'); return }
    const cap = parseFloat(formCapacity)
    if (isNaN(cap) || cap <= 0) { setError('Capacity must be greater than 0.'); return }
    const thresh = parseFloat(formThreshold)
    if (isNaN(thresh) || thresh < 0) { setError('Threshold must be 0 or greater.'); return }

    setSaving(true)
    setError(null)
    const fd = new FormData()
    fd.set('name', formName.trim())
    fd.set('fuel_type', formFuelType)
    fd.set('capacity_gallons', String(cap))
    fd.set('low_level_threshold_gallons', String(thresh))
    fd.set('notes', formNotes.trim())

    const res = editingId
      ? await updateFuelTank(editingId, fd)
      : await createFuelTank(fd)

    setSaving(false)
    if (res?.error) { setError(res.error); return }
    closeForm()
    router.refresh()
  }

  async function handleToggleActive(tank: Tank) {
    setSaving(true)
    const res = tank.active
      ? await deactivateFuelTank(tank.id)
      : await reactivateFuelTank(tank.id)
    setSaving(false)
    if (res?.error) { setError(res.error); return }
    router.refresh()
  }

  const displayed = showAll ? initialTanks : initialTanks.filter(t => t.active)
  const inactiveCount = initialTanks.filter(t => !t.active).length

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Fuel Tanks</h1>
          <p className="text-sm text-zinc-500 mt-1">Manage on-site fuel storage tanks for your department.</p>
        </div>
        <button
          onClick={openAdd}
          className="shrink-0 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
        >
          + Add Tank
        </button>
      </div>

      <HelpText className="mb-4">
        Once a tank is set up, gallons automatically deduct here whenever an apparatus fills up on-site through the
        Fuel Log — logging a delivery is the only manual entry needed.
      </HelpText>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Add/Edit tank form */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900 mb-4">
            {editingId ? 'Edit Tank' : 'Add Tank'}
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Tank Name *</label>
              <input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Main Diesel Tank"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Fuel Type *</label>
              <select
                value={formFuelType}
                onChange={e => setFormFuelType(e.target.value as 'diesel' | 'gasoline' | 'other')}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                <option value="diesel">Diesel</option>
                <option value="gasoline">Gasoline</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Capacity (gal) *</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={formCapacity}
                  onChange={e => setFormCapacity(e.target.value)}
                  placeholder="500"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Low Level Alert (gal)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formThreshold}
                  onChange={e => setFormThreshold(e.target.value)}
                  placeholder="50"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Notes</label>
              <textarea
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes about this tank"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm resize-none"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Tank'}
            </button>
            <button
              onClick={closeForm}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tank list */}
      {displayed.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
          <p className="text-sm text-zinc-500">No tanks configured yet. Add your first storage tank above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayed.map(tank => {
            const levelPct = tank.capacity_gallons > 0
              ? Math.min(100, (tank.current_gallons / tank.capacity_gallons) * 100)
              : 0
            const threshPct = tank.capacity_gallons > 0
              ? Math.min(100, (tank.low_level_threshold_gallons / tank.capacity_gallons) * 100)
              : 0
            const isEmpty = tank.current_gallons <= 0
            const isLow = !isEmpty && tank.current_gallons <= tank.low_level_threshold_gallons
            const barColor = isEmpty ? 'bg-red-400' : isLow ? 'bg-amber-400' : 'bg-green-500'
            const borderColor = (isEmpty || isLow) && tank.active ? 'border-amber-200' : 'border-zinc-200'
            const history = deliveryHistory[tank.id] ?? []
            const isReceiving = receivingTankId === tank.id
            const showHistory = showHistoryFor === tank.id

            return (
              <div
                key={tank.id}
                className={`rounded-xl border bg-white p-5 ${borderColor} ${!tank.active ? 'opacity-60' : ''}`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-900">{tank.name}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${FUEL_COLORS[tank.fuel_type]}`}>
                      {FUEL_LABELS[tank.fuel_type]}
                    </span>
                    {!tank.active && (
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">Inactive</span>
                    )}
                    {tank.active && isEmpty && (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Empty</span>
                    )}
                    {tank.active && isLow && (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Low Fuel</span>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {tank.active && (
                      <button
                        onClick={() => {
                          setReceivingTankId(isReceiving ? null : tank.id)
                          setShowForm(false)
                        }}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                          isReceiving
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                      >
                        {isReceiving ? 'Cancel' : '+ Receive'}
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(tank)}
                      className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleActive(tank)}
                      disabled={saving}
                      className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 transition-colors disabled:opacity-50"
                    >
                      {tank.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </div>

                {/* Level bar */}
                <div className="relative mb-2">
                  <div className="h-3 rounded-full bg-zinc-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${levelPct}%` }}
                    />
                  </div>
                  {tank.low_level_threshold_gallons > 0 && (
                    <div
                      className="absolute top-0 h-3 w-0.5 bg-zinc-400 rounded"
                      style={{ left: `${threshPct}%` }}
                      title={`Alert threshold: ${tank.low_level_threshold_gallons} gal`}
                    />
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    <span className={`font-semibold ${isEmpty ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-zinc-900'}`}>
                      {tank.current_gallons.toFixed(1)} gal
                    </span>
                    {' '}/ {tank.capacity_gallons.toLocaleString()} gal capacity
                  </span>
                  <span>Alert below {tank.low_level_threshold_gallons} gal</span>
                </div>

                {tank.notes && (
                  <p className="mt-2 text-xs text-zinc-400">{tank.notes}</p>
                )}

                {/* Receive delivery form */}
                {isReceiving && (
                  <ReceiveDeliveryForm
                    tankId={tank.id}
                    tankName={tank.name}
                    fuelType={tank.fuel_type}
                    onClose={() => setReceivingTankId(null)}
                    onSuccess={() => {
                      setReceivingTankId(null)
                      router.refresh()
                    }}
                  />
                )}

                {/* Delivery history */}
                {history.length > 0 && (
                  <div className="mt-4 border-t border-zinc-100 pt-3">
                    <button
                      onClick={() => setShowHistoryFor(showHistory ? null : tank.id)}
                      className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
                    >
                      {showHistory ? '▲ Hide' : '▼ Show'} delivery history ({history.length} recent)
                    </button>
                    {showHistory && (
                      <div className="mt-2 space-y-1">
                        {history.map(d => (
                          <div key={d.id} className="flex items-center justify-between text-xs text-zinc-600 py-1 border-b border-zinc-50 last:border-0">
                            <span className="text-zinc-400">{d.delivery_date}</span>
                            <span className="font-medium">{d.gallons.toFixed(1)} gal</span>
                            {d.cost_per_gallon != null && (
                              <span>${d.cost_per_gallon.toFixed(3)}/gal</span>
                            )}
                            {d.total_cost != null && (
                              <span className="text-zinc-900 font-semibold">${d.total_cost.toFixed(2)}</span>
                            )}
                            <span className="text-zinc-400 truncate max-w-[80px]">{d.vendor ?? '—'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {inactiveCount > 0 && (
        <button
          onClick={() => setShowAll(prev => !prev)}
          className="mt-4 text-xs text-zinc-400 hover:text-zinc-600 underline underline-offset-2"
        >
          {showAll
            ? 'Hide inactive tanks'
            : `Show ${inactiveCount} inactive tank${inactiveCount !== 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  )
}
