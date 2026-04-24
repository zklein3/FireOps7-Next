'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitInspection } from '@/app/actions/inspections'

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

const inputCls = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"

// Full asset inspection only when requires_inspection=true AND templates exist
function hasInspection(item: ChecklistItem): boolean {
  return item.requires_inspection && item.templates.length > 0
}

export default function InspectionRunClient({
  apparatus, compartment, compartmentId, checklistItems, inspectorName, personnelId, departmentId, presenceOnly,
}: {
  apparatus: { id: string; unit_number: string; apparatus_name: string | null }
  compartment: { code: string; name: string | null }
  compartmentId: string
  checklistItems: ChecklistItem[]
  inspectorName: string
  personnelId: string
  departmentId: string
  presenceOnly: boolean
}) {
  const router = useRouter()

  const [presenceResponses, setPresenceResponses] = useState<Record<string, PresenceResponse>>({})
  const [selectedAssets, setSelectedAssets] = useState<Record<string, string[]>>({})
  const [selectedTemplates, setSelectedTemplates] = useState<Record<string, string>>({})
  const [stepResponses, setStepResponses] = useState<Record<string, Record<string, StepResponse>>>({})

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setPresence(location_standard_id: string, item_id: string, field: keyof PresenceResponse, value: unknown) {
    setPresenceResponses(prev => ({
      ...prev,
      [location_standard_id]: { ...prev[location_standard_id], location_standard_id, item_id, [field]: value },
    }))
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

  function isComplete(): boolean {
    for (const item of checklistItems) {
      if (presenceOnly || !hasInspection(item)) {
        const resp = presenceResponses[item.location_standard_id]
        if (resp?.present === undefined) return false
      } else {
        for (let i = 0; i < item.expected_quantity; i++) {
          const asset = getAssetForSlot(item, i)
          if (!asset) return false
          const template = getTemplate(item, asset.id)
          if (!template) continue
          for (const step of template.steps) {
            if (!step.required) continue
            const resp = stepResponses[asset.id]?.[step.id]
            if (!resp) return false
            if (step.step_type === 'BOOLEAN' && resp.boolean_value === undefined) return false
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
            const asset = getAssetForSlot(item, i)
            if (!asset) continue
            const template = getTemplate(item, asset.id)
            if (!template) continue
            const responses = Object.values(stepResponses[asset.id] ?? {})
            assetInspections.push({ asset_id: asset.id, template_id: template.id, responses })
          }
        }
      }
    }

    try {
      const result = await submitInspection({
        apparatus_id: apparatus.id,
        compartment_id: compartmentId,
        personnel_id: personnelId,
        department_id: departmentId,
        inspector_name: inspectorName,
        asset_inspections: assetInspections,
        presence_checks: presenceChecks,
      })
      if (result?.error) setError(result.error)
      else setSubmitted(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed.')
    }
    setSubmitting(false)
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
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm text-zinc-500 hover:text-zinc-700">← Back</button>
        <div>
          <h1 className="text-xl font-bold text-zinc-900">
            Unit {apparatus.unit_number} — {compartment.code}
            {compartment.name ? ` · ${compartment.name}` : ''}
          </h1>
          <p className="text-sm text-zinc-500">Inspector: {inspectorName}</p>
          {presenceOnly && (
            <span className="inline-block mt-1 text-xs rounded-full bg-blue-100 text-blue-700 px-2 py-0.5">Daily Check — Presence Only</span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>
      )}

      <div className="flex flex-col gap-4">
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

                    return (
                      <div key={slotIndex} className={slotIndex > 0 ? 'border-t border-zinc-100 pt-5' : ''}>

                        {item.expected_quantity > 1 && (
                          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-3">
                            Asset {slotIndex + 1} of {item.expected_quantity}
                          </p>
                        )}

                        {/* Asset selector */}
                        <div className="mb-4">
                          <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                            Which {item.item_name} is present?
                          </label>
                          {availableAssets.length === 0 ? (
                            <p className="text-sm text-zinc-400">No assets found. Add assets in Dept Admin → Items.</p>
                          ) : (
                            <select
                              value={selectedAssets[item.location_standard_id]?.[slotIndex] ?? ''}
                              onChange={e => setAssetForSlot(item.location_standard_id, slotIndex, e.target.value)}
                              className={inputCls}>
                              <option value="">Select asset...</option>
                              {availableAssets.map(a => (
                                <option key={a.id} value={a.id}>
                                  {a.asset_tag}{a.serial_number ? ` — S/N: ${a.serial_number}` : ''}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* Template selector (if multiple) */}
                        {asset && item.templates.length > 1 && (
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
                                    <div className="flex gap-3 ml-7">
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
    </div>
  )
}
