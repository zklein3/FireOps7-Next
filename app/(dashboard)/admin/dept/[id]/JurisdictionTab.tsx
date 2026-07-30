'use client'

import { useState } from 'react'
import { addJurisdiction, removeJurisdiction } from '@/app/actions/departments'

interface Jurisdiction { id: string; department_id: string; department_name: string }

export default function JurisdictionTab({
  departmentId, departmentName, jurisdictions: initialJurisdictions, allDepartments,
}: {
  departmentId: string
  departmentName: string
  jurisdictions: Jurisdiction[]
  allDepartments: { id: string; name: string }[]
}) {
  const [jurisdictions, setJurisdictions] = useState(initialJurisdictions)
  const [addDeptId, setAddDeptId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    if (!addDeptId) return
    setSaving(true); setError(null)
    const res = await addJurisdiction(departmentId, addDeptId)
    setSaving(false)
    if (res?.error) { setError(res.error); return }
    const dept = allDepartments.find(d => d.id === addDeptId)
    setJurisdictions(prev => [...prev, { id: crypto.randomUUID(), department_id: addDeptId, department_name: dept?.name ?? '—' }])
    setAddDeptId('')
  }

  async function handleRemove(id: string) {
    const res = await removeJurisdiction(id, departmentId)
    if (res?.error) { setError(res.error); return }
    setJurisdictions(prev => prev.filter(j => j.id !== id))
  }

  return (
    <div className="max-w-xl">
      <div className="rounded-xl bg-white border border-zinc-200 p-5">
        <h3 className="text-sm font-semibold text-zinc-900 mb-1">Jurisdiction</h3>
        <p className="text-xs text-zinc-500 mb-4">
          A standing relationship, not a per-incident invite — {departmentName} gets read + edit access to ICS incidents,
          mutual aid agreements, LEOP, and shared documents for any department listed below (never their personnel, training,
          or other data). Typically used for an EM department's oversight of fire/police in its area.
        </p>

        {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="divide-y divide-zinc-100 mb-4">
          {jurisdictions.length === 0 && <p className="py-4 text-sm text-zinc-400 text-center">No jurisdiction over any department yet.</p>}
          {jurisdictions.map(j => (
            <div key={j.id} className="flex items-center justify-between py-2.5">
              <span className="text-sm font-medium text-zinc-900">{j.department_name}</span>
              <button type="button" onClick={() => handleRemove(j.id)} className="text-xs text-red-600 hover:underline">Remove</button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select value={addDeptId} onChange={e => setAddDeptId(e.target.value)}
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm">
            <option value="">Add a department under this jurisdiction…</option>
            {allDepartments.filter(d => !jurisdictions.some(j => j.department_id === d.id)).map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <button type="button" disabled={saving || !addDeptId} onClick={handleAdd}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
