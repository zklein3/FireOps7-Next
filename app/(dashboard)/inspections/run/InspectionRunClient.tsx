'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitInspection } from '@/app/actions/inspections'
import { moveAssetToApparatus } from '@/app/actions/equipment'
import QRScanner from '@/components/QRScanner'
import HelpText from '@/components/HelpText'

function parseAssetCode(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (url.searchParams.get('type') === 'asset') return url.searchParams.get('code')
  } catch {}
  return raw.trim() || null
}

interface Step {
  id: string
  step_text: string
  step_type: string
  required: boolean
  fail_if_negative: boolean
}

interface Template {
  id: string
  template_name: string
  steps: Step[]
}

interface Asset {
  id: string
  asset_tag: string
  serial_number: string | null
  status: string
  apparatus_id: string | null
}

interface ChecklistItem {
  location_standard_id: string
  item_id: string
  item_name: string
  requires_inspection: boolean
  tracks_assets: boolean
  requires_presence_check: boolean
  expected_quantity: number
  assets: Asset[]
  templates: Template[]
}

type StepResponse = {
  step_id: string
  boolean_value?: boolean
  numeric_value?: number
  text_value?: string
}

type PresenceResponse = {
  location_standard_id: string
  item_id: string
  present: boolean
  actual_quantity?: number
  notes?: string
}

interface MedicationItem {
  storeroom_id: string
  storeroom_inventory_id: string
  supply_type_id: string
  supply_name: string
  unit_of_measure: string
  par_level: number
  tracks_expiration: boolean
  current_quantity: number
  lots: { id: string; lot_number: string | null; expiration_date: string | null; quantity_remaining: number }[]
  status: string
}

type ExpirationStatus = 'confirmed' | 'expiring_soon' | 'expired' | 'not_applicable'

type MedicationResponse = {
  storeroom_inventory_id: string
  present?: boolean
  actual_quantity?: number
  expiration_status?: ExpirationStatus
  notes?: string
}

function lotIsExpiringOrExpired(lot: { expiration_date: string | null }): boolean {
  if (!lot.expiration_date) return false
  const now = new Date()
  const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  return new Date(lot.expiration_date + 'T00:00:00') <= soon
}

const inputCls = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"

// Full asset inspection only when requires_inspection=true AND templates exist
function hasInspection(item: ChecklistItem): boolean {
  return item.requires_inspection && item.templates.length > 0
}

export default function InspectionRunClient({
  apparatus, compartment, compartmentId, checklistItems, medicationItems, inspectorName, personnelId, departmentId, presenceOnly,
  inspectionSessionId, sessionCompartmentId, initialSubmittedAssets, initialSelectedAssets,
}: {
  apparatus: { id: string; unit_number: string; apparatus_name: string | null }
  compartment: { code: string; name: string | null }
  compartmentId: string
  checklistItems: ChecklistItem[]
  medicationItems?: MedicationItem[]
  inspectorName: string
  personnelId: string
  departmentId: string
  presenceOnly: boolean
  inspectionSessionId?: string
  sessionCompartmentId?: string
  initialSubmittedAssets?: string[]
  initialSelectedAssets?: Record<string, string[]>
}) {
  const router = useRouter()
  const medications = medicationItems ?? []

  const [presenceResponses, setPresenceResponses] = useState<Record<string, PresenceResponse>>({})
  const [medicationResponses, setMedicationResponses] = useState<Record<string, MedicationResponse>>({})
  const [selectedAssets, setSelectedAssets] = useState<Record<string, string[]>>(initialSelectedAssets ?? {})
  const [selectedTemplates, setSelectedTemplates] = useState<Record<string, string>>({})
  const [stepResponses, setStepResponses] = useState<Record<string, Record<string, StepResponse>>>({})

  const [activeScanner, setActiveScanner] = useState<{ locationId: string; slotIndex: number; itemName: string; assets: Asset[] } | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  const [pendingReassign, setPendingReassign] = useState<{ locationId: string; slotIndex: number; assetId: string; assetLabel: string } | null>(null)
  const [confirmedReassigns, setConfirmedReassigns] = useState<string[]>([])
  const [reassigning, setReassigning] = useState(false)

  const [missingSlots, setMissingSlots] = useState<Record<string, boolean[]>>({})
  const [missingNotes, setMissingNotes] = useState<Record<string, string[]>>({})

  const [submittedAssets, setSubmittedAssets] = useState<Set<string>>(new Set(initialSubmittedAssets ?? []))
  const [submittingAsset, setSubmittingAsset] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function isSlotMissing(locationId: string, slotIndex: number) {
    return missingSlots[locationId]?.[slotIndex] ?? false
  }

  function markSlotMissing(locationId: string, slotIndex: number, missing: boolean) {
    setMissingSlots(prev => {
      const current = [...(prev[locationId] ?? [])]
      current[slotIndex] = missing
      return { ...prev, [locationId]: current }
    })
  }

  function setPresence(location_standard_id: string, item_id: string, field: keyof PresenceResponse, value: unknown) {
    setPresenceResponses(prev => ({
      ...prev,
      [location_standard_id]: { ...prev[location_standard_id], location_standard_id, item_id, [field]: value },
    }))
  }

  function setMedication(storeroom_inventory_id: string, field: keyof MedicationResponse, value: unknown) {
    setMedicationResponses(prev => ({
      ...prev,
      [storeroom_inventory_id]: { ...prev[storeroom_inventory_id], storeroom_inventory_id, [field]: value },
    }))
  }

  function isMedicationComplete(med: MedicationItem): boolean {
    const resp = medicationResponses[med.storeroom_inventory_id]
    if (resp?.present === undefined) return false
    if (resp.present === false) return true
    if (resp.actual_quantity === undefined) return false
    if (med.tracks_expiration && med.lots.length > 0 && !resp.expiration_status) return false
    return true
  }

  function setStepResponse(asset_id: string, step_id: string, field: keyof StepResponse, value: unknown) {
    setStepResponses(prev => ({
      ...prev,
      [asset_id]: {
        ...(prev[asset_id] ?? {}),
        [step_id]: { ...(prev[asset_id]?.[step_id] ?? { step_id }), [field]: value },
      },
    }))
  }

  function setAssetForSlot(locationId: string, slotIndex: number, assetId: string) {
    setSelectedAssets(prev => {
      const current = [...(prev[locationId] ?? [])]
      current[slotIndex] = assetId
      return { ...prev, [locationId]: current }
    })
    setStepResponses(prev => ({ ...prev, [assetId]: {} }))
  }

  function getAssetForSlot(item: ChecklistItem, slotIndex: number): Asset | null {
    const assetId = selectedAssets[item.location_standard_id]?.[slotIndex]
    return item.assets.find(a => a.id === assetId) ?? null
  }

  function getTemplate(item: ChecklistItem, assetId: string): Template | null {
    if (item.templates.length === 0) return null
    if (item.templates.length === 1) return item.templates[0]
    const selected = selectedTemplates[assetId]
    return item.templates.find(t => t.id === selected) ?? item.templates[0]
  }

  function isAssetComplete(assetId: string, item: ChecklistItem): boolean {
    const template = getTemplate(item, assetId)
    if (!template) return false
    for (const step of template.steps) {
      if (!step.required) continue
      const resp = stepResponses[assetId]?.[step.id]
      if (!resp) return false
      if (step.step_type === 'BOOLEAN' && resp.boolean_value === undefined) return false
      if (step.step_type === 'BOOLEAN' && resp.boolean_value === false && step.fail_if_negative && !resp.text_value?.trim()) return false
      if (step.step_type === 'NUMERIC' && resp.numeric_value === undefined) return false
    }
    return true
  }

  async function handleSubmitAsset(item: ChecklistItem, slotIndex: number) {
    const asset = getAssetForSlot(item, slotIndex)
    if (!asset) return
    const template = getTemplate(item, asset.id)
    if (!template) return
    setSubmittingAsset(asset.id)
    setError(null)
    const result = await submitInspection({
      apparatus_id: apparatus.id,
      compartment_id: compartmentId,
      personnel_id: personnelId,
      department_id: departmentId,
      inspector_name: inspectorName,
      inspection_session_id: inspectionSessionId,
      session_compartment_id: sessionCompartmentId,
      asset_inspections: [{ asset_id: asset.id, template_id: template.id, responses: Object.values(stepResponses[asset.id] ?? {}) }],
      presence_checks: [],
    })
    setSubmittingAsset(null)
    if (result?.error) {
      setError(result.error)
    } else {
      setSubmittedAssets(prev => new Set([...prev, asset.id]))
    }
  }

  function handleScanResult(raw: string) {
    if (!activeScanner) return
    const code = parseAssetCode(raw)
    if (!code) { setScanError('Could not read QR code. Try again.'); return }

    const asset = activeScanner.assets.find(a => a.asset_tag === code)
    if (!asset) {
      setScanError(`"${code}" is not an expected ${activeScanner.itemName} in this compartment.`)
      return
    }

    const existingSlots = selectedAssets[activeScanner.locationId] ?? []
    if (existingSlots.some((id, i) => id === asset.id && i !== activeScanner.slotIndex)) {
      setScanError(`${code} is already assigned to another slot in this inspection.`)
      return
    }

    setAssetForSlot(activeScanner.locationId, activeScanner.slotIndex, asset.id)

    if (asset.apparatus_id && asset.apparatus_id !== apparatus.id && !confirmedReassigns.includes(asset.id)) {
      const label = asset.asset_tag + (asset.serial_number ? ` — S/N: ${asset.serial_number}` : '')
      setPendingReassign({ locationId: activeScanner.locationId, slotIndex: activeScanner.slotIndex, assetId: asset.id, assetLabel: label })
    } else if (!asset.apparatus_id) {
      moveAssetToApparatus(asset.id, apparatus.id).then(res => {
        if (res?.error) setError(res.error)
      })
    }

    setActiveScanner(null)
    setScanError(null)
  }

  function isComplete(): boolean {
    for (const med of medications) {
      if (!isMedicationComplete(med)) return false
    }
    for (const item of checklistItems) {
      if (presenceOnly || !hasInspection(item)) {
        const resp = presenceResponses[item.location_standard_id]
        if (resp?.present === undefined) return false
      } else {
        for (let i = 0; i < item.expected_quantity; i++) {
          if (isSlotMissing(item.location_standard_id, i)) continue
          const asset = getAssetForSlot(item, i)
          if (!asset) return false
          if (submittedAssets.has(asset.id)) continue
          const template = getTemplate(item, asset.id)
          if (!template) continue
          for (const step of template.steps) {
            if (!step.required) continue
            const resp = stepResponses[asset.id]?.[step.id]
            if (!resp) return false
            if (step.step_type === 'BOOLEAN' && resp.boolean_value === undefined) return false
            if (step.step_type === 'BOOLEAN' && resp.boolean_value === false && step.fail_if_negative && !resp.text_value?.trim()) return false
            if (step.step_type === 'NUMERIC' && resp.numeric_value === undefined) return false
          }
        }
      }
    }
    return true
  }

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)

    const assetInspections: { asset_id: string; template_id: string; responses: StepResponse[] }[] = []
    const presenceChecks: PresenceResponse[] = Object.values(presenceResponses)

    if (!presenceOnly) {
      for (const item of checklistItems) {
        if (hasInspection(item)) {
          for (let i = 0; i < item.expected_quantity; i++) {
            if (isSlotMissing(item.location_standard_id, i)) {
              presenceChecks.push({
                location_standard_id: item.location_standard_id,
                item_id: item.item_id,
                present: false,
                notes: missingNotes[item.location_standard_id]?.[i] || undefined,
              })
              continue
            }
            const asset = getAssetForSlot(item, i)
            if (!asset) continue
            if (submittedAssets.has(asset.id)) continue  // already saved individually
            const template = getTemplate(item, asset.id)
            if (!template) continue
            const responses = Object.values(stepResponses[asset.id] ?? {})
            assetInspections.push({ asset_id: asset.id, template_id: template.id, responses })
          }
        }
      }
    }

    const medicationChecks = medications.map(med => {
      const resp = medicationResponses[med.storeroom_inventory_id]
      return {
        storeroom_id: med.storeroom_id,
        storeroom_inventory_id: med.storeroom_inventory_id,
        supply_type_id: med.supply_type_id,
        supply_type_name: med.supply_name,
        present: resp?.present ?? false,
        actual_quantity: resp?.actual_quantity,
        expiration_status: resp?.expiration_status,
        notes: resp?.notes,
      }
    })

    try {
      const result = await submitInspection({
        apparatus_id: apparatus.id,
        compartment_id: compartmentId,
        personnel_id: personnelId,
        department_id: departmentId,
        inspector_name: inspectorName,
        inspection_session_id: inspectionSessionId,
        session_compartment_id: sessionCompartmentId,
        asset_inspections: assetInspections,
        presence_checks: presenceChecks,
        medication_checks: medicationChecks,
      })
      if (result?.error) {
        setError(result.error)
        setSubmitting(false)
      } else if (inspectionSessionId) {
        router.replace(`/inspections/apparatus/${apparatus.id}`)
      } else {
        setSubmitted(true)
        setSubmitting(false)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed.')
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="rounded-xl bg-white border border-green-200 p-8 text-center shadow-sm">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-zinc-900 mb-1">Inspection Complete!</h2>
          <p className="text-sm text-zinc-500 mb-6">
            Compartment {compartment.code} on Unit {apparatus.unit_number} has been inspected.
          </p>
          <div className="flex gap-3">
            <button onClick={() => router.push('/inspections')}
              className="flex-1 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800">
              Inspect Another
            </button>
            <button onClick={() => router.push('/dashboard')}
              className="flex-1 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
              Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-zinc-900">
          Unit {apparatus.unit_number} — {compartment.code}
          {compartment.name ? ` · ${compartment.name}` : ''}
        </h1>
        <p className="text-sm text-zinc-500">Inspector: {inspectorName}</p>
        {presenceOnly && (
          <span className="inline-block mt-1 text-xs rounded-full bg-blue-100 text-blue-700 px-2 py-0.5">Daily Check — Presence Only</span>
        )}
      </div>
      <HelpText className="mb-4">
        Scan or select each item to check it off. Flag anything missing or damaged as you go — it'll show up on the
        Inspection Report for an officer to follow up on.
      </HelpText>
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => router.push(inspectionSessionId ? `/inspections/apparatus/${apparatus.id}` : '/inspections')}
          className="rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-sm"
        >
          ← Cancel
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>
      )}

      <div className="flex flex-col gap-4">
        {medications.map(med => {
          const resp = medicationResponses[med.storeroom_inventory_id]
          const anyLotWarns = med.lots.some(lotIsExpiringOrExpired)
          return (
            <div key={med.storeroom_inventory_id} className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
              <div className="px-5 py-3 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">💊 {med.supply_name}</p>
                  <p className="text-xs text-zinc-400">
                    On file: {med.current_quantity} {med.unit_of_measure} · PAR {med.par_level}
                  </p>
                </div>
                <span className="text-xs rounded-full bg-purple-100 text-purple-700 px-2 py-0.5">Medical</span>
              </div>

              <div className="px-5 py-4">
                {anyLotWarns && (
                  <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                    ⚠ One or more lots are expiring within 30 days or already expired.
                  </div>
                )}

                <p className="text-sm text-zinc-700 mb-3">Is {med.supply_name} present?</p>
                <div className="flex gap-3 mb-3">
                  <button
                    onClick={() => setMedication(med.storeroom_inventory_id, 'present', true)}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
                      resp?.present === true
                        ? 'bg-green-600 border-green-600 text-white'
                        : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                    }`}>
                    ✓ Present
                  </button>
                  <button
                    onClick={() => setMedication(med.storeroom_inventory_id, 'present', false)}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
                      resp?.present === false
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                    }`}>
                    ✗ Missing
                  </button>
                </div>

                {resp?.present === true && (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-zinc-500">Actual qty:</label>
                      <input
                        type="number" min="0"
                        defaultValue={med.current_quantity}
                        onChange={e => setMedication(med.storeroom_inventory_id, 'actual_quantity', parseInt(e.target.value))}
                        className="w-20 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                      <span className="text-xs text-zinc-500">{med.unit_of_measure}</span>
                    </div>

                    {med.tracks_expiration && med.lots.length > 0 && (
                      <div>
                        <p className="text-xs text-zinc-500 mb-1.5">
                          On-file expiration: {med.lots.map(l => `${l.lot_number ?? 'no lot #'} — ${l.expiration_date ?? 'no date'}`).join(', ')}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setMedication(med.storeroom_inventory_id, 'expiration_status', anyLotWarns ? 'expiring_soon' : 'confirmed')}
                            className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                              resp?.expiration_status === 'confirmed' || resp?.expiration_status === 'expiring_soon'
                                ? 'bg-green-600 border-green-600 text-white'
                                : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                            }`}>
                            Confirm
                          </button>
                          <button
                            onClick={() => setMedication(med.storeroom_inventory_id, 'expiration_status', 'expired')}
                            className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                              resp?.expiration_status === 'expired'
                                ? 'bg-red-600 border-red-600 text-white'
                                : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                            }`}>
                            Flag Issue
                          </button>
                        </div>
                      </div>
                    )}

                    <div>
                      <textarea
                        rows={2}
                        value={resp?.notes ?? ''}
                        onChange={e => setMedication(med.storeroom_inventory_id, 'notes', e.target.value)}
                        placeholder="Notes (optional)..."
                        className={`${inputCls} resize-none`}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {checklistItems.map(item => {
          const isInspection = !presenceOnly && hasInspection(item)
          return (
            <div key={item.location_standard_id} className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">

              {/* Item header */}
              <div className="px-5 py-3 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{item.item_name}</p>
                  <p className="text-xs text-zinc-400">
                    {isInspection
                      ? `Asset inspection · ${item.expected_quantity} expected`
                      : `Presence check · Qty ${item.expected_quantity}`}
                  </p>
                </div>
                {isInspection
                  ? <span className="text-xs rounded-full bg-yellow-100 text-yellow-700 px-2 py-0.5">Inspection</span>
                  : <span className="text-xs rounded-full bg-blue-100 text-blue-700 px-2 py-0.5">Presence</span>
                }
              </div>

              {/* ── PRESENCE CHECK ─────────────────────────────────────── */}
              {!isInspection && (
                <div className="px-5 py-4">
                  <p className="text-sm text-zinc-700 mb-3">
                    Is {item.item_name} present? (Expected: {item.expected_quantity})
                  </p>
                  <div className="flex gap-3 mb-3">
                    <button
                      onClick={() => setPresence(item.location_standard_id, item.item_id, 'present', true)}
                      className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
                        presenceResponses[item.location_standard_id]?.present === true
                          ? 'bg-green-600 border-green-600 text-white'
                          : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                      }`}>
                      ✓ Present
                    </button>
                    <button
                      onClick={() => setPresence(item.location_standard_id, item.item_id, 'present', false)}
                      className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
                        presenceResponses[item.location_standard_id]?.present === false
                          ? 'bg-red-600 border-red-600 text-white'
                          : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                      }`}>
                      ✗ Missing
                    </button>
                  </div>
                  {presenceResponses[item.location_standard_id]?.present === true && (
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-zinc-500">Actual qty:</label>
                      <input
                        type="number" min="0"
                        defaultValue={item.expected_quantity}
                        onChange={e => setPresence(item.location_standard_id, item.item_id, 'actual_quantity', parseInt(e.target.value))}
                        className="w-20 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ── ASSET INSPECTION ───────────────────────────────────── */}
              {isInspection && (
                <div className="px-5 py-4 flex flex-col gap-5">
                  {Array.from({ length: item.expected_quantity }).map((_, slotIndex) => {
                    const asset = getAssetForSlot(item, slotIndex)
                    const template = asset ? getTemplate(item, asset.id) : null
                    const otherSelectedIds = (selectedAssets[item.location_standard_id] ?? [])
                      .filter((_, i) => i !== slotIndex)
                      .filter(Boolean)
                    const availableAssets = item.assets.filter(a => !otherSelectedIds.includes(a.id))
                    const thisAppAssets = availableAssets.filter(a => a.apparatus_id === apparatus.id)
                    const otherAppAssets = availableAssets.filter(a => a.apparatus_id !== null && a.apparatus_id !== apparatus.id)
                    const storageAssets = availableAssets.filter(a => a.apparatus_id === null)
                    const isPending = pendingReassign?.locationId === item.location_standard_id && pendingReassign?.slotIndex === slotIndex

                    return (
                      <div key={slotIndex} className={slotIndex > 0 ? 'border-t border-zinc-100 pt-5' : ''}>

                        {item.expected_quantity > 1 && (
                          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-3">
                            Asset {slotIndex + 1} of {item.expected_quantity}
                          </p>
                        )}

                        {/* Asset selector */}
                        <div className="mb-4">
                          {isSlotMissing(item.location_standard_id, slotIndex) ? (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-semibold text-red-800">⚠ {item.item_name} — Not Present</p>
                                <button
                                  onClick={() => markSlotMissing(item.location_standard_id, slotIndex, false)}
                                  className="text-xs text-zinc-500 hover:text-zinc-700 underline"
                                >
                                  Undo
                                </button>
                              </div>
                              <textarea
                                rows={2}
                                value={missingNotes[item.location_standard_id]?.[slotIndex] ?? ''}
                                onChange={e => setMissingNotes(prev => {
                                  const current = [...(prev[item.location_standard_id] ?? [])]
                                  current[slotIndex] = e.target.value
                                  return { ...prev, [item.location_standard_id]: current }
                                })}
                                placeholder="Notes — where is it, who has it? (optional)"
                                className={`${inputCls} resize-none`}
                              />
                            </div>
                          ) : (
                          <>
                          <div className="flex items-center justify-between mb-1.5 gap-2">
                            <label className="text-sm font-medium text-zinc-700">
                              Which {item.item_name} is present?
                            </label>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => {
                                  setScanError(null)
                                  setActiveScanner({ locationId: item.location_standard_id, slotIndex, itemName: item.item_name, assets: item.assets })
                                }}
                                className="text-xs rounded-lg bg-red-700 px-2.5 py-1 text-white font-semibold hover:bg-red-800 transition-colors"
                              >
                                Scan QR
                              </button>
                              <button
                                onClick={() => markSlotMissing(item.location_standard_id, slotIndex, true)}
                                className="text-xs text-zinc-400 hover:text-red-600 underline transition-colors"
                              >
                                Not present
                              </button>
                            </div>
                          </div>
                          {availableAssets.length === 0 ? (
                            <p className="text-sm text-zinc-400">No assets found. Add assets in Dept Admin → Items.</p>
                          ) : (
                            <select
                              value={selectedAssets[item.location_standard_id]?.[slotIndex] ?? ''}
                              onChange={e => {
                                const assetId = e.target.value
                                if (!assetId) return
                                const picked = item.assets.find(a => a.id === assetId)
                                if (picked?.apparatus_id && picked.apparatus_id !== apparatus.id && !confirmedReassigns.includes(assetId)) {
                                  const label = picked.asset_tag + (picked.serial_number ? ` — S/N: ${picked.serial_number}` : '')
                                  setPendingReassign({ locationId: item.location_standard_id, slotIndex, assetId, assetLabel: label })
                                } else {
                                  setAssetForSlot(item.location_standard_id, slotIndex, assetId)
                                  if (!picked?.apparatus_id) {
                                    moveAssetToApparatus(assetId, apparatus.id).then(res => {
                                      if (res?.error) setError(res.error)
                                    })
                                  }
                                }
                              }}
                              className={inputCls}>
                              <option value="">Select asset...</option>
                              {thisAppAssets.length > 0 && (
                                <optgroup label="On this apparatus">
                                  {thisAppAssets.map(a => (
                                    <option key={a.id} value={a.id}>{a.asset_tag}{a.serial_number ? ` — S/N: ${a.serial_number}` : ''}</option>
                                  ))}
                                </optgroup>
                              )}
                              {otherAppAssets.length > 0 && (
                                <optgroup label="On another apparatus">
                                  {otherAppAssets.map(a => (
                                    <option key={a.id} value={a.id}>{a.asset_tag}{a.serial_number ? ` — S/N: ${a.serial_number}` : ''}</option>
                                  ))}
                                </optgroup>
                              )}
                              {storageAssets.length > 0 && (
                                <optgroup label="Unassigned / storage">
                                  {storageAssets.map(a => (
                                    <option key={a.id} value={a.id}>{a.asset_tag}{a.serial_number ? ` — S/N: ${a.serial_number}` : ''}</option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          )}

                          {isPending && (
                            <div className="mt-2 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3">
                              <p className="text-sm font-medium text-yellow-800 mb-1">
                                <strong>{pendingReassign!.assetLabel}</strong> is assigned to another apparatus.
                              </p>
                              <p className="text-sm text-yellow-700 mb-3">
                                Reassign to Unit {apparatus.unit_number} during this inspection?
                              </p>
                              <div className="flex gap-2">
                                <button
                                  disabled={reassigning}
                                  onClick={async () => {
                                    setReassigning(true)
                                    const res = await moveAssetToApparatus(pendingReassign!.assetId, apparatus.id)
                                    if (res?.error) {
                                      setError(res.error)
                                    } else {
                                      setConfirmedReassigns(prev => [...prev, pendingReassign!.assetId])
                                      setAssetForSlot(pendingReassign!.locationId, pendingReassign!.slotIndex, pendingReassign!.assetId)
                                    }
                                    setPendingReassign(null)
                                    setReassigning(false)
                                  }}
                                  className="rounded-lg bg-yellow-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-yellow-800 disabled:opacity-50">
                                  {reassigning ? 'Reassigning...' : 'Reassign & Select'}
                                </button>
                                <button
                                  disabled={reassigning}
                                  onClick={() => setPendingReassign(null)}
                                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                          </>
                          )}
                        </div>

                        {/* Template selector (if multiple) — only when not yet submitted */}
                        {asset && item.templates.length > 1 && !submittedAssets.has(asset.id) && (
                          <div className="mb-4">
                            <label className="mb-1.5 block text-sm font-medium text-zinc-700">Inspection Type</label>
                            <select
                              value={selectedTemplates[asset.id] ?? item.templates[0].id}
                              onChange={e => setSelectedTemplates(prev => ({ ...prev, [asset.id]: e.target.value }))}
                              className={inputCls}>
                              {item.templates.map(t => <option key={t.id} value={t.id}>{t.template_name}</option>)}
                            </select>
                          </div>
                        )}

                        {/* Checklist steps */}
                        {asset && template && (
                          <div className={submittedAssets.has(asset.id) ? 'pointer-events-none opacity-50' : ''}>
                          <div className="flex flex-col gap-0 border border-zinc-200 rounded-lg overflow-hidden">
                            {template.steps.map((step, stepIdx) => {
                              const resp = stepResponses[asset.id]?.[step.id] ?? {}
                              return (
                                <div key={step.id} className={`px-4 py-4 ${stepIdx > 0 ? 'border-t border-zinc-100' : ''}`}>
                                  <div className="flex items-start gap-2 mb-2">
                                    <span className="text-xs font-mono text-zinc-400 mt-0.5 w-5 shrink-0">{stepIdx + 1}.</span>
                                    <div className="flex-1">
                                      <p className="text-sm text-zinc-800">{step.step_text}</p>
                                      {step.fail_if_negative && (
                                        <p className="text-xs text-red-500 mt-0.5">⚠ Fail if No</p>
                                      )}
                                    </div>
                                  </div>

                                  {step.step_type === 'BOOLEAN' && (
                                    <div className="ml-7">
                                      <div className="flex gap-3">
                                        <button
                                          onClick={() => setStepResponse(asset.id, step.id, 'boolean_value', true)}
                                          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                                            resp.boolean_value === true
                                              ? 'bg-green-600 border-green-600 text-white'
                                              : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                                          }`}>Yes</button>
                                        <button
                                          onClick={() => setStepResponse(asset.id, step.id, 'boolean_value', false)}
                                          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                                            resp.boolean_value === false
                                              ? step.fail_if_negative ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-600 border-zinc-600 text-white'
                                              : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                                          }`}>No</button>
                                      </div>
                                      {resp.boolean_value === false && (
                                        <div className="mt-2">
                                          <textarea
                                            rows={2}
                                            value={resp.text_value ?? ''}
                                            onChange={e => setStepResponse(asset.id, step.id, 'text_value', e.target.value)}
                                            placeholder={step.fail_if_negative ? 'Required — describe the issue...' : 'Notes (optional)...'}
                                            className={`${inputCls} resize-none ${step.fail_if_negative && !resp.text_value?.trim() ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
                                          />
                                          {step.fail_if_negative && !resp.text_value?.trim() && (
                                            <p className="text-xs text-red-500 mt-1">Notes required for failed steps.</p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {step.step_type === 'NUMERIC' && (
                                    <div className="ml-7">
                                      <input
                                        type="number"
                                        value={resp.numeric_value ?? ''}
                                        onChange={e => setStepResponse(asset.id, step.id, 'numeric_value', parseFloat(e.target.value))}
                                        placeholder="Enter value..."
                                        className={inputCls}
                                      />
                                    </div>
                                  )}

                                  {step.step_type === 'TEXT' && (
                                    <div className="ml-7">
                                      <input
                                        type="text"
                                        value={resp.text_value ?? ''}
                                        onChange={e => setStepResponse(asset.id, step.id, 'text_value', e.target.value)}
                                        placeholder="Enter text..."
                                        className={inputCls}
                                      />
                                    </div>
                                  )}

                                  {step.step_type === 'LONG_TEXT' && (
                                    <div className="ml-7">
                                      <textarea
                                        rows={2}
                                        value={resp.text_value ?? ''}
                                        onChange={e => setStepResponse(asset.id, step.id, 'text_value', e.target.value)}
                                        placeholder="Enter notes..."
                                        className={`${inputCls} resize-none`}
                                      />
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                          </div>
                        )}

                        {/* Per-asset save button / saved indicator */}
                        {asset && template && (
                          submittedAssets.has(asset.id) ? (
                            <div className="mt-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3 flex items-center gap-3">
                              <span className="text-green-600 text-xl leading-none">✓</span>
                              <div>
                                <p className="text-sm font-semibold text-green-800">{asset.asset_tag} saved</p>
                                <p className="text-xs text-green-600">Inspection recorded</p>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleSubmitAsset(item, slotIndex)}
                              disabled={submittingAsset === asset.id || !isAssetComplete(asset.id, item)}
                              className="mt-3 w-full rounded-lg bg-green-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-800 disabled:opacity-50 transition-colors"
                            >
                              {submittingAsset === asset.id
                                ? 'Saving…'
                                : isAssetComplete(asset.id, item)
                                  ? `Save ${asset.asset_tag}`
                                  : 'Complete required steps to save'}
                            </button>
                          )
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Submit */}
      <div className="mt-6 pb-8">
        <button
          onClick={handleSubmit}
          disabled={submitting || !isComplete()}
          className="w-full rounded-xl bg-red-700 px-4 py-3 text-base font-bold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
          {submitting ? 'Submitting...' : isComplete() ? 'Submit Inspection' : 'Complete All Required Steps to Submit'}
        </button>
      </div>

      {/* QR Scanner modal */}
      {activeScanner && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col p-4 safe-area-inset">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-white font-bold text-lg">Scan {activeScanner.itemName}</h2>
              <p className="text-zinc-400 text-xs mt-0.5">Point camera at the QR label on the asset</p>
            </div>
            <button
              onClick={() => { setActiveScanner(null); setScanError(null) }}
              className="rounded-full bg-zinc-800 w-9 h-9 flex items-center justify-center text-white text-lg hover:bg-zinc-700"
            >
              ✕
            </button>
          </div>
          {scanError && (
            <div className="mb-3 rounded-lg bg-red-900/80 border border-red-700 px-4 py-3 text-sm text-red-200">
              {scanError}
              <button
                onClick={() => setScanError(null)}
                className="ml-3 text-xs underline text-red-300 hover:text-red-100"
              >
                Try again
              </button>
            </div>
          )}
          <QRScanner
            onScan={handleScanResult}
            onClose={() => { setActiveScanner(null); setScanError(null) }}
            hint={`Scan the QR label on the ${activeScanner.itemName}`}
          />
        </div>
      )}
    </div>
  )
}
