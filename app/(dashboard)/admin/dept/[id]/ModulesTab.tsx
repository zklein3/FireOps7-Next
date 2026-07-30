'use client'

import { useState } from 'react'
import { updateDepartmentModules, saveNerisEntityId } from '@/app/actions/departments'

interface Bundle {
  key: 'module_operations' | 'module_iso' | 'module_neris' | 'module_medical' | 'module_fuel_storage' | 'module_ics' | 'public_site_enabled'
  label: string
  description: string
  features: string[]
  enabled: boolean
}

export default function ModulesTab({
  departmentId,
  moduleOperations,
  moduleIso,
  moduleNeris,
  moduleMedical,
  moduleMedicalControlled,
  moduleFuelStorage,
  moduleIcs,
  publicSiteEnabled,
  nerisEntityId,
}: {
  departmentId: string
  moduleOperations: boolean
  moduleIso: boolean
  moduleNeris: boolean
  moduleMedical: boolean
  moduleMedicalControlled: boolean
  moduleFuelStorage: boolean
  moduleIcs: boolean
  publicSiteEnabled: boolean
  nerisEntityId: string | null
}) {
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState({
    module_operations: moduleOperations,
    module_iso: moduleIso,
    module_neris: moduleNeris,
    module_medical: moduleMedical,
    module_medical_controlled: moduleMedicalControlled,
    module_fuel_storage: moduleFuelStorage,
    module_ics: moduleIcs,
    public_site_enabled: publicSiteEnabled,
  })
  const [entityId, setEntityId] = useState(nerisEntityId ?? '')
  const [savingEntityId, setSavingEntityId] = useState(false)
  const [entityIdSaved, setEntityIdSaved] = useState(false)

  async function handleToggle(key: keyof typeof state) {
    setSaving(key)
    setError(null)
    const newValue = !state[key]
    const result = await updateDepartmentModules(departmentId, { [key]: newValue })
    if (result?.error) {
      setError(result.error)
    } else {
      setState(prev => ({ ...prev, [key]: newValue }))
    }
    setSaving(null)
  }

  async function handleSaveEntityId() {
    setSavingEntityId(true)
    setError(null)
    setEntityIdSaved(false)
    const result = await saveNerisEntityId(departmentId, entityId.trim())
    if (result?.error) {
      setError(result.error)
    } else {
      setEntityIdSaved(true)
      setTimeout(() => setEntityIdSaved(false), 2500)
    }
    setSavingEntityId(false)
  }

  const bundles: Bundle[] = [
    {
      key: 'module_operations',
      label: 'Bundle A — Operations',
      description: 'Incident reporting, run sheet PDF import, and NERIS API submission.',
      features: ['Incident log & reporting', 'Run sheet PDF import (AI-parsed)', 'Incident-level apparatus & personnel tracking'],
      enabled: state.module_operations,
    },
    {
      key: 'module_neris',
      label: 'NERIS Reporting',
      description: 'NERIS compliance API submission. Requires Bundle A and a valid NERIS Entity ID.',
      features: ['NERIS incident submission', 'Pre-submission validation', 'Submission status tracking'],
      enabled: state.module_neris,
    },
    {
      key: 'module_iso',
      label: 'Bundle B — ISO / Compliance',
      description: 'ISO grading tools including hose inventory, hydrant tracking, and the ISO report.',
      features: ['Hose inventory & testing records', 'Hydrant tracking', 'ISO audit report'],
      enabled: state.module_iso,
    },
    {
      key: 'module_medical',
      label: 'Bundle D — Medical Supplies',
      description: 'Medical storeroom inventory, controlled substance tracking, and supply alerts.',
      features: ['Medical storeroom inventory & PAR levels', 'Receive, dispense, waste, and transfer stock', 'Controlled substance dual-signature log', 'Apparatus bag tracking', 'Daily low-stock & expiry email alerts'],
      enabled: state.module_medical,
    },
    {
      key: 'public_site_enabled',
      label: 'Bundle C — Public Engagement',
      description: 'Public-facing website, burn permits, records requests, and public inbox.',
      features: ['Public department website', 'Online burn permit requests', 'Public records requests', 'Public inbox (officer-managed)'],
      enabled: state.public_site_enabled,
    },
    {
      key: 'module_fuel_storage',
      label: 'Fuel Storage Tracking',
      description: 'Fuel tank inventory and fill-up logging. Dept admins can also self-enable this from Dept Admin.',
      features: ['Fuel tank inventory', 'Apparatus fuel log', 'Fuel usage & cost report'],
      enabled: state.module_fuel_storage,
    },
    {
      key: 'module_ics',
      label: 'ICS — Incident Command System',
      description: 'Cross-department ICS packets (201/202/203/204/205/206/207/211/214). Available to fire, police, and EM departments alike.',
      features: ['Operational-period ICS packets, snapshotted from the accountability board', 'Cross-department interoperability (agency grants, jurisdiction)', 'ICS 211 check-in list & 214 activity log'],
      enabled: state.module_ics,
    },
  ]

  const baseFeatures = [
    'Personnel & roster management',
    'Apparatus & station management',
    'Equipment & inventory',
    'Inspections',
    'Events, attendance & training certifications',
    'Announcements',
    'Basic reports',
  ]

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Base */}
      <div className="rounded-xl bg-white border border-zinc-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Base — Always Included</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Core features enabled for all departments.</p>
          </div>
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Active</span>
        </div>
        <ul className="space-y-1">
          {baseFeatures.map(f => (
            <li key={f} className="flex items-center gap-2 text-sm text-zinc-600">
              <span className="text-green-500">✓</span> {f}
            </li>
          ))}
        </ul>
      </div>

      {/* Bundles */}
      {bundles.map(bundle => (
        <div key={bundle.key} className="rounded-xl bg-white border border-zinc-200 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-zinc-900">{bundle.label}</h3>
              <p className="text-xs text-zinc-500 mt-0.5">{bundle.description}</p>
              <ul className="mt-3 space-y-1">
                {bundle.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-zinc-600">
                    <span className={bundle.enabled ? 'text-green-500' : 'text-zinc-300'}>✓</span>
                    <span className={bundle.enabled ? '' : 'text-zinc-400'}>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                bundle.enabled ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
              }`}>
                {bundle.enabled ? 'Enabled' : 'Disabled'}
              </span>
              <button
                onClick={() => handleToggle(bundle.key)}
                disabled={saving === bundle.key}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  bundle.enabled
                    ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                    : 'bg-red-700 text-white hover:bg-red-800'
                }`}
              >
                {saving === bundle.key ? 'Saving…' : bundle.enabled ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
          {bundle.key === 'module_neris' && (
            <div className="mt-4 pt-4 border-t border-zinc-100">
              <label className="block text-xs font-medium text-zinc-600 mb-1">NERIS Entity ID (FDID)</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={entityId}
                  onChange={e => setEntityId(e.target.value)}
                  placeholder="e.g. FD12345678"
                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                <button
                  onClick={handleSaveEntityId}
                  disabled={savingEntityId}
                  className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 transition-colors"
                >
                  {savingEntityId ? 'Saving…' : 'Save'}
                </button>
                {entityIdSaved && <span className="text-xs font-medium text-green-600">✓ Saved</span>}
              </div>
              <p className="text-xs text-zinc-400 mt-1">Required before this department can submit to NERIS.</p>
            </div>
          )}
          {bundle.key === 'module_medical' && bundle.enabled && (
            <div className="mt-4 pt-4 border-t border-zinc-100 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-zinc-800">Controlled Substance Tracking</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Lets this department mark a supply type "Controlled" — enforces dual signature capture on receive/dispense/waste. Off by default; enable per department for testing or rollout.
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  state.module_medical_controlled ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
                }`}>
                  {state.module_medical_controlled ? 'Enabled' : 'Disabled'}
                </span>
                <button
                  onClick={() => handleToggle('module_medical_controlled')}
                  disabled={saving === 'module_medical_controlled'}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                    state.module_medical_controlled
                      ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                      : 'bg-red-700 text-white hover:bg-red-800'
                  }`}
                >
                  {saving === 'module_medical_controlled' ? 'Saving…' : state.module_medical_controlled ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
