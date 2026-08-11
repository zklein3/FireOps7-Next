'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createMutualAidAgreement,
  updateMutualAidAgreement,
  toggleMutualAidAgreement,
} from '@/app/actions/iso'
import HelpText from '@/components/HelpText'

const AGREEMENT_TYPES = [
  { value: 'mutual_aid', label: 'Mutual Aid' },
  { value: 'automatic_aid', label: 'Automatic Aid' },
  { value: 'other', label: 'Other' },
]

const HOSE_SIZES = [1, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6]

type HoseLoad = { diameter_in: number; length_ft: number }

type Apparatus = {
  identifier: string
  pump_gpm: number | null
  tank_gal: number | null
  hose_loads: HoseLoad[]
}

type Agreement = {
  id: string
  partner_department: string
  agreement_type: string
  effective_date: string | null
  expiration_date: string | null
  active: boolean
  notes: string | null
  apparatus: Apparatus[]
}

function blankApparatus(): Apparatus {
  return { identifier: '', pump_gpm: null, tank_gal: null, hose_loads: [] }
}

function blankForm() {
  return {
    partner_department: '',
    agreement_type: 'mutual_aid',
    effective_date: '',
    expiration_date: '',
    notes: '',
    apparatus: [] as Apparatus[],
  }
}

function isExpiringSoon(expiration_date: string | null): boolean {
  if (!expiration_date) return false
  const exp = new Date(expiration_date + 'T00:00:00')
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + 90)
  return exp <= cutoff
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function typeBadge(type: string) {
  if (type === 'automatic_aid') return 'bg-blue-100 text-blue-700'
  if (type === 'mutual_aid') return 'bg-zinc-100 text-zinc-600'
  return 'bg-purple-100 text-purple-700'
}

function typeLabel(type: string) {
  return AGREEMENT_TYPES.find(t => t.value === type)?.label ?? type
}

export default function MutualAidClient({
  agreements,
  isOfficerOrAbove,
}: {
  agreements: Agreement[]
  isOfficerOrAbove: boolean
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(blankForm())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openAdd() {
    setForm(blankForm())
    setEditingId(null)
    setError(null)
    setShowForm(true)
  }

  function openEdit(a: Agreement) {
    setForm({
      partner_department: a.partner_department,
      agreement_type: a.agreement_type,
      effective_date: a.effective_date ?? '',
      expiration_date: a.expiration_date ?? '',
      notes: a.notes ?? '',
      apparatus: a.apparatus ?? [],
    })
    setEditingId(a.id)
    setError(null)
    setShowForm(true)
  }

  function addApparatus() {
    setForm(f => ({ ...f, apparatus: [...f.apparatus, blankApparatus()] }))
  }

  function removeApparatus(i: number) {
    setForm(f => ({ ...f, apparatus: f.apparatus.filter((_, j) => j !== i) }))
  }

  function updateApparatus(i: number, field: keyof Apparatus, value: unknown) {
    setForm(f => ({
      ...f,
      apparatus: f.apparatus.map((a, j) => j === i ? { ...a, [field]: value } : a),
    }))
  }

  function addHoseLoad(appIdx: number) {
    setForm(f => ({
      ...f,
      apparatus: f.apparatus.map((a, j) => j === appIdx
        ? { ...a, hose_loads: [...a.hose_loads, { diameter_in: 1.75, length_ft: 0 }] }
        : a
      ),
    }))
  }

  function removeHoseLoad(appIdx: number, hoseIdx: number) {
    setForm(f => ({
      ...f,
      apparatus: f.apparatus.map((a, j) => j === appIdx
        ? { ...a, hose_loads: a.hose_loads.filter((_, k) => k !== hoseIdx) }
        : a
      ),
    }))
  }

  function updateHoseLoad(appIdx: number, hoseIdx: number, field: keyof HoseLoad, value: number) {
    setForm(f => ({
      ...f,
      apparatus: f.apparatus.map((a, j) => j === appIdx
        ? { ...a, hose_loads: a.hose_loads.map((h, k) => k === hoseIdx ? { ...h, [field]: value } : h) }
        : a
      ),
    }))
  }

  async function handleSubmit() {
    if (!form.partner_department.trim()) { setError('Partner department name is required.'); return }
    setError(null)
    setLoading(true)

    const payload = {
      partner_department: form.partner_department.trim(),
      agreement_type: form.agreement_type,
      effective_date: form.effective_date || null,
      expiration_date: form.expiration_date || null,
      notes: form.notes.trim() || null,
      apparatus: form.apparatus.map(a => ({
        ...a,
        pump_gpm: a.pump_gpm || null,
        tank_gal: a.tank_gal || null,
      })),
    }

    const result = editingId
      ? await updateMutualAidAgreement(editingId, payload)
      : await createMutualAidAgreement(payload)

    if (result?.error) { setError(result.error); setLoading(false); return }
    setShowForm(false)
    setEditingId(null)
    router.refresh()
    setLoading(false)
  }

  async function handleToggle(id: string, active: boolean) {
    await toggleMutualAidAgreement(id, active)
    router.refresh()
  }

  const active = agreements.filter(a => a.active)
  const inactive = agreements.filter(a => !a.active)

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Mutual Aid Agreements</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{active.length} active agreement{active.length !== 1 ? 's' : ''}</p>
        </div>
        {isOfficerOrAbove && !showForm && (
          <button onClick={openAdd}
            className="shrink-0 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors">
            + Add Agreement
          </button>
        )}
      </div>

      <HelpText className="mb-4">
        Enter the partner department's apparatus specs manually for now — data is entered once and stays until you
        update it, not pulled live from the partner's own records.
      </HelpText>

      {/* Add / Edit Form */}
      {showForm && isOfficerOrAbove && (
        <div className="rounded-xl bg-white border border-zinc-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-zinc-900 mb-4">{editingId ? 'Edit Agreement' : 'New Agreement'}</h2>
          {error && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div className="flex flex-col gap-3 mb-5">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-zinc-600 mb-1">Partner Department</label>
                <input type="text" value={form.partner_department} onChange={e => setForm(f => ({ ...f, partner_department: e.target.value }))}
                  placeholder="e.g. Fremont Fire Department"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="sm:w-44">
                <label className="block text-xs font-medium text-zinc-600 mb-1">Agreement Type</label>
                <select value={form.agreement_type} onChange={e => setForm(f => ({ ...f, agreement_type: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                  {AGREEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-zinc-600 mb-1">Effective Date</label>
                <input type="date" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-zinc-600 mb-1">Expiration Date</label>
                <input type="date" value={form.expiration_date} onChange={e => setForm(f => ({ ...f, expiration_date: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Notes</label>
              <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any notes about this agreement"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
            </div>
          </div>

          {/* Apparatus Section */}
          <div className="border-t border-zinc-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-zinc-700">Apparatus</p>
              <button type="button" onClick={addApparatus}
                className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors">
                + Add Apparatus
              </button>
            </div>
            {form.apparatus.length === 0 && (
              <p className="text-xs text-zinc-400 mb-3">No apparatus added yet.</p>
            )}
            {form.apparatus.map((app, i) => (
              <div key={i} className="mb-4 rounded-lg border border-zinc-200 p-4 bg-zinc-50">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-zinc-600">Apparatus {i + 1}</p>
                  <button type="button" onClick={() => removeApparatus(i)}
                    className="text-zinc-400 hover:text-red-600 text-xl leading-none px-1 transition-colors">×</button>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 mb-2">
                  <div className="flex-1">
                    <label className="block text-xs text-zinc-500 mb-0.5">Identifier</label>
                    <input type="text" value={app.identifier}
                      onChange={e => updateApparatus(i, 'identifier', e.target.value)}
                      placeholder="e.g. Engine 1"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-zinc-500 mb-0.5">Pump (GPM)</label>
                    <input type="number" min="0" value={app.pump_gpm ?? ''}
                      onChange={e => updateApparatus(i, 'pump_gpm', e.target.value ? parseInt(e.target.value) : null)}
                      placeholder="e.g. 1250"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-zinc-500 mb-0.5">Tank (gal)</label>
                    <input type="number" min="0" value={app.tank_gal ?? ''}
                      onChange={e => updateApparatus(i, 'tank_gal', e.target.value ? parseInt(e.target.value) : null)}
                      placeholder="e.g. 1000"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                </div>
                {/* Hose Loads */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-zinc-500">Hose Loads</label>
                    <button type="button" onClick={() => addHoseLoad(i)}
                      className="text-xs text-red-700 hover:underline font-medium">+ Add Load</button>
                  </div>
                  {app.hose_loads.length === 0 && <p className="text-xs text-zinc-400">No hose loads.</p>}
                  {app.hose_loads.map((hl, k) => (
                    <div key={k} className="flex items-center gap-2 mb-1.5">
                      <select value={hl.diameter_in}
                        onChange={e => updateHoseLoad(i, k, 'diameter_in', parseFloat(e.target.value))}
                        className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                        {HOSE_SIZES.map(d => <option key={d} value={d}>{d}&quot;</option>)}
                      </select>
                      <input type="number" min="0" value={hl.length_ft || ''}
                        onChange={e => updateHoseLoad(i, k, 'length_ft', parseInt(e.target.value) || 0)}
                        placeholder="Length (ft)"
                        className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                      <button type="button" onClick={() => removeHoseLoad(i, k)}
                        className="text-zinc-400 hover:text-red-600 text-xl leading-none px-1 transition-colors">×</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={handleSubmit} disabled={loading}
              className="flex-1 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
              {loading ? 'Saving...' : editingId ? 'Save Changes' : 'Add Agreement'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null) }}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Active Agreements */}
      {active.length === 0 && !showForm && (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400 mb-4">
          No mutual aid agreements on file.
        </div>
      )}

      {active.map(a => (
        <AgreementCard key={a.id} agreement={a} isOfficerOrAbove={isOfficerOrAbove}
          onEdit={() => openEdit(a)} onToggle={active => handleToggle(a.id, active)} />
      ))}

      {/* Inactive */}
      {inactive.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Inactive</p>
          {inactive.map(a => (
            <AgreementCard key={a.id} agreement={a} isOfficerOrAbove={isOfficerOrAbove}
              onEdit={() => openEdit(a)} onToggle={active => handleToggle(a.id, active)} />
          ))}
        </div>
      )}
    </div>
  )
}

function AgreementCard({ agreement: a, isOfficerOrAbove, onEdit, onToggle }: {
  agreement: Agreement
  isOfficerOrAbove: boolean
  onEdit: () => void
  onToggle: (active: boolean) => void
}) {
  const expiring = a.active && isExpiringSoon(a.expiration_date)

  return (
    <div className={`rounded-xl bg-white border mb-4 overflow-hidden ${expiring ? 'border-amber-300' : 'border-zinc-200'} ${!a.active ? 'opacity-60' : ''}`}>
      {expiring && <div className="h-1 bg-amber-400 w-full" />}
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-zinc-900">{a.partner_department}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge(a.agreement_type)}`}>
              {typeLabel(a.agreement_type)}
            </span>
            {!a.active && <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-400">Inactive</span>}
            {expiring && <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">Expiring Soon</span>}
          </div>
          {isOfficerOrAbove && (
            <div className="flex gap-2 shrink-0">
              <button onClick={onEdit} className="text-xs text-zinc-500 hover:text-zinc-800 font-medium">Edit</button>
              <button onClick={() => onToggle(!a.active)} className="text-xs text-zinc-500 hover:text-zinc-800 font-medium">
                {a.active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-4 text-xs text-zinc-400 mb-3">
          {a.effective_date && <span>Effective: {formatDate(a.effective_date)}</span>}
          {a.expiration_date && <span className={expiring ? 'text-amber-600 font-medium' : ''}>Expires: {formatDate(a.expiration_date)}</span>}
        </div>
        {a.notes && <p className="text-xs text-zinc-500 mb-3">{a.notes}</p>}

        {(a.apparatus ?? []).length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-400 border-b border-zinc-100">
                  <th className="pb-1.5 font-medium pr-4">Apparatus</th>
                  <th className="pb-1.5 font-medium pr-4">Pump (GPM)</th>
                  <th className="pb-1.5 font-medium pr-4">Tank (gal)</th>
                  <th className="pb-1.5 font-medium">Hose Loads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {a.apparatus.map((app, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-4 font-medium text-zinc-800">{app.identifier || '—'}</td>
                    <td className="py-1.5 pr-4 text-zinc-600">{app.pump_gpm ?? '—'}</td>
                    <td className="py-1.5 pr-4 text-zinc-600">{app.tank_gal ?? '—'}</td>
                    <td className="py-1.5 text-zinc-500">
                      {(app.hose_loads ?? []).length === 0 ? '—' :
                        app.hose_loads.map(h => `${h.length_ft}ft ${h.diameter_in}"`).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
