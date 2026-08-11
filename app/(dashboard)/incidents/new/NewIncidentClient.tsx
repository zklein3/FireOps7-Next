'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createIncident } from '@/app/actions/incidents'
import { addMutualAid } from '@/app/actions/iso'
import { parseRunSheet } from '@/app/actions/parse-run-sheet'
import type { ParsedRunSheet } from '@/app/actions/parse-run-sheet'
import { lookupZip } from '@/lib/zip-lookup'
import HelpText from '@/components/HelpText'

const inputCls = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
const labelCls = "block text-sm font-medium text-zinc-700 mb-1"

const FIRE_SUBTYPES = [
  { value: 'structure', label: 'Structure Fire' },
  { value: 'vehicle', label: 'Vehicle Fire' },
  { value: 'grass', label: 'Grass Fire' },
  { value: 'wildland', label: 'Wildland Fire' },
  { value: 'other_fire', label: 'Other Fire' },
]

type Apparatus = { id: string; unit_number: string }
type Personnel = { id: string; name: string }

type ApparatusEntry = {
  apparatus_id: string
  role: string
  paged_at: string
  enroute_at: string
  on_scene_at: string
  leaving_scene_at: string
  available_at: string
}

type PersonnelEntry = {
  personnel_id: string
  apparatus_id: string
  role: string
}

type MutualAidEntry = {
  external_department_name: string
  role: string
  apparatus_description: string
  personnel_count: string
  arrival_time: string
  departure_time: string
}

export default function NewIncidentClient({
  apparatus,
  personnel,
  myPersonnelId,
  myName,
  moduleNeris,
  departmentName,
}: {
  apparatus: Apparatus[]
  personnel: Personnel[]
  myPersonnelId: string
  myName: string
  moduleNeris: boolean
  departmentName: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [incidentType, setIncidentType] = useState('')
  const [mutualAidDir, setMutualAidDir] = useState('')
  const [nerisReported, setNerisReported] = useState(false)

  // Controlled fields (pre-filled by import)
  const [incidentNumber, setIncidentNumber] = useState('')
  const [cadNumber, setCadNumber] = useState('')
  const [incidentDate, setIncidentDate] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [disposition, setDisposition] = useState('')
  const [narrative, setNarrative] = useState('')

  // Import state
  const [isParsing, setIsParsing] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)

  // Incident-level times (controlled so apparatus form can pre-populate from them)
  const [incidentCallTime, setIncidentCallTime] = useState('')
  const [incidentPaged, setIncidentPaged] = useState('')
  const [incidentOnScene, setIncidentOnScene] = useState('')
  const [incidentLeavingScene, setIncidentLeavingScene] = useState('')
  const [incidentInService, setIncidentInService] = useState('')

  // Apparatus rows
  const [apparatusRows, setApparatusRows] = useState<ApparatusEntry[]>([])
  const [showAddApparatus, setShowAddApparatus] = useState(false)
  const [newApparatus, setNewApparatus] = useState<ApparatusEntry>({
    apparatus_id: '', role: 'primary', paged_at: '', enroute_at: '', on_scene_at: '', leaving_scene_at: '', available_at: '',
  })

  // Personnel rows
  const [personnelRows, setPersonnelRows] = useState<PersonnelEntry[]>([])
  const [showAddPersonnel, setShowAddPersonnel] = useState(false)
  const [newPersonnel, setNewPersonnel] = useState<PersonnelEntry>({ personnel_id: myPersonnelId, apparatus_id: '', role: 'crew' })

  // Mutual aid rows (outside agencies — from import or manual add)
  const [mutualAidRows, setMutualAidRows] = useState<MutualAidEntry[]>([])
  const [showAddMutualAid, setShowAddMutualAid] = useState(false)
  const [newMutualAid, setNewMutualAid] = useState<MutualAidEntry>({
    external_department_name: '', role: 'received_aid', apparatus_description: '', personnel_count: '', arrival_time: '', departure_time: '',
  })

  const isFireType = incidentType === 'fire'

  async function handleZipBlur() {
    if (city || state) return
    const result = await lookupZip(zip)
    if (result) {
      setCity(result.city)
      setState(result.state)
    }
  }

  function addApparatusRow() {
    if (!newApparatus.apparatus_id) return
    if (apparatusRows.some(r => r.apparatus_id === newApparatus.apparatus_id)) return
    // Auto-fill incident paged/in-service if not already set
    if (newApparatus.paged_at && !incidentPaged) setIncidentPaged(newApparatus.paged_at)
    if (newApparatus.available_at) {
      if (!incidentInService || newApparatus.available_at > incidentInService) setIncidentInService(newApparatus.available_at)
    }
    setApparatusRows(prev => [...prev, { ...newApparatus }])
    setNewApparatus({ apparatus_id: '', role: 'primary', paged_at: '', enroute_at: '', on_scene_at: '', leaving_scene_at: '', available_at: '' })
    setShowAddApparatus(false)
  }

  function addPersonnelRow() {
    if (!newPersonnel.personnel_id) return
    if (personnelRows.some(r => r.personnel_id === newPersonnel.personnel_id)) return
    setPersonnelRows(prev => [...prev, { ...newPersonnel }])
    setNewPersonnel({ personnel_id: '', apparatus_id: '', role: 'crew' })
    setShowAddPersonnel(false)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setIsParsing(true)
    setImportError(null)
    setImportSuccess(false)

    const fd = new FormData()
    fd.append('pdf', file)
    fd.append('apparatus_units', JSON.stringify(apparatus.map(a => a.unit_number)))
    fd.append('department_name', departmentName)
    const result = await parseRunSheet(fd)

    if (result.error) { setImportError(result.error); setIsParsing(false); return }

    const d = result.data!
    if (d.incident_number)      setIncidentNumber(d.incident_number)
    if (d.cad_number)           setCadNumber(d.cad_number)
    if (d.incident_date)        setIncidentDate(d.incident_date)
    if (d.address)              setAddress(d.address)
    if (d.city)                 setCity(d.city)
    if (d.state)                setState(d.state)
    if (d.zip)                  setZip(d.zip)
    if (d.incident_type)        setIncidentType(d.incident_type)
    if (d.call_time)            setIncidentCallTime(d.call_time)
    if (d.paged_at)             setIncidentPaged(d.paged_at)
    if (d.first_on_scene_at)    setIncidentOnScene(d.first_on_scene_at)
    if (d.last_leaving_scene_at) setIncidentLeavingScene(d.last_leaving_scene_at)
    if (d.in_service_at)        setIncidentInService(d.in_service_at)
    if (d.disposition)          setDisposition(d.disposition)
    if (d.narrative)            setNarrative(d.narrative)

    if (d.apparatus?.length) {
      const matched: ApparatusEntry[] = []
      for (const unit of d.apparatus) {
        // Guard against false-positive matches (e.g. a unit merely listed/paged but never
        // actually enroute) — require an actual response timestamp before treating it as on the run.
        if (!unit.enroute_at && !unit.on_scene_at) continue
        // Strip leading alpha prefix (e.g. "WIN11" → "11") to handle CAD agency prefixes
        const numericSuffix = unit.unit_number.replace(/^[A-Za-z]+/, '')
        const found = apparatus.find(a =>
          a.unit_number.toUpperCase() === unit.unit_number.toUpperCase() ||
          (numericSuffix && a.unit_number === numericSuffix)
        )
        if (found) {
          matched.push({
            apparatus_id: found.id,
            role: unit.role || 'primary',
            paged_at: d.paged_at || '',
            enroute_at: unit.enroute_at || '',
            on_scene_at: unit.on_scene_at || '',
            leaving_scene_at: unit.leaving_scene_at || '',
            available_at: unit.available_at || '',
          })
        }
      }
      if (matched.length > 0) setApparatusRows(matched)
    }

    if (d.mutual_aid?.length) {
      setMutualAidRows(d.mutual_aid.filter(ma => ma.department_name).map(ma => ({
        external_department_name: ma.department_name,
        role: 'received_aid',
        apparatus_description: ma.apparatus_description || '',
        personnel_count: ma.personnel_count ? String(ma.personnel_count) : '',
        arrival_time: ma.arrival_time || '',
        departure_time: ma.departure_time || '',
      })))
    }

    setImportSuccess(true)
    setIsParsing(false)
  }

  function addMutualAidRow() {
    if (!newMutualAid.external_department_name.trim()) return
    setMutualAidRows(prev => [...prev, { ...newMutualAid }])
    setNewMutualAid({ external_department_name: '', role: 'received_aid', apparatus_description: '', personnel_count: '', arrival_time: '', departure_time: '' })
    setShowAddMutualAid(false)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form = e.currentTarget
    const fd = new FormData(form)
    fd.set('neris_reported', nerisReported ? 'true' : 'false')

    const result = await createIncident(fd)
    if (result?.error) { setError(result.error); setLoading(false); return }

    // Log apparatus and personnel via separate actions after creation
    const incidentId = result.id!
    const { addIncidentApparatus, addIncidentPersonnel } = await import('@/app/actions/incidents')

    for (const row of apparatusRows) {
      const afd = new FormData()
      Object.entries(row).forEach(([k, v]) => afd.set(k, v))
      await addIncidentApparatus(incidentId, afd)
    }
    for (const row of personnelRows) {
      const pfd = new FormData()
      Object.entries(row).forEach(([k, v]) => pfd.set(k, v))
      await addIncidentPersonnel(incidentId, pfd)
    }
    for (const row of mutualAidRows) {
      const mfd = new FormData()
      mfd.set('incident_id', incidentId)
      Object.entries(row).forEach(([k, v]) => mfd.set(k, v))
      await addMutualAid(mfd)
    }

    router.push(`/incidents/${incidentId}`)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-zinc-900">New Incident</h1>
        <p className="text-sm text-zinc-500">Log a new incident report</p>
      </div>
      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={() => router.back()} className="rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-sm">← Back</button>
      </div>

      {/* Run Sheet Import */}
      <div className="mb-4 rounded-xl bg-zinc-50 border border-zinc-200 p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-700">Import from Run Sheet</p>
          <p className="text-xs text-zinc-400">Upload a Central Square CFS PDF to auto-fill this form</p>
        </div>
        <label className={`relative cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors shrink-0 ${isParsing ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed' : 'bg-red-700 text-white hover:bg-red-800'}`}>
          {isParsing ? 'Reading PDF…' : 'Upload PDF'}
          <input type="file" accept=".pdf,application/pdf" className="sr-only" onChange={handleImport} disabled={isParsing} />
        </label>
        {importSuccess && <p className="w-full text-xs text-green-700 font-medium">Form pre-filled — review and adjust as needed</p>}
        {importError && <p className="w-full text-xs text-red-600">{importError}</p>}
      </div>

      <HelpText className="mb-4">
        The PDF import is entirely optional — it just saves typing. Times, units, and personnel it pre-fills are
        never final until you review them below; nothing is saved until you submit the form.
      </HelpText>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Core Info */}
        <section className="rounded-xl bg-white border border-zinc-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-900">Incident Details</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Incident # <span className="text-zinc-400 font-normal">(optional)</span></label>
              <input name="incident_number" type="text" placeholder="2026-001" value={incidentNumber} onChange={e => setIncidentNumber(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>CAD # <span className="text-zinc-400 font-normal">(optional)</span></label>
              <input name="cad_number" type="text" placeholder="CAD number" value={cadNumber} onChange={e => setCadNumber(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Date <span className="text-red-600">*</span></label>
              <input name="incident_date" type="date" required value={incidentDate} onChange={e => setIncidentDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Type <span className="text-red-600">*</span></label>
              <select name="incident_type" required value={incidentType} onChange={e => setIncidentType(e.target.value)} className={inputCls}>
                <option value="">Select type…</option>
                <option value="fire">Fire</option>
                <option value="rescue">Rescue</option>
                <option value="standby">Standby</option>
                <option value="mutual_aid">Mutual Aid</option>
                <option value="special">Special</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {isFireType && (
            <div>
              <label className={labelCls}>Fire Type <span className="text-red-600">*</span></label>
              <select name="fire_subtype" required className={inputCls}>
                <option value="">Select fire type…</option>
                {FIRE_SUBTYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          )}

          {incidentType === 'mutual_aid' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Direction</label>
                <select name="mutual_aid_direction" value={mutualAidDir} onChange={e => setMutualAidDir(e.target.value)} className={inputCls}>
                  <option value="">Select…</option>
                  <option value="to">To (we assisted)</option>
                  <option value="from">From (we received)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Other Department</label>
                <input name="mutual_aid_department" type="text" placeholder="Department name" className={inputCls} />
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Street Address</label>
            <input name="address" type="text" placeholder="123 Main St" value={address} onChange={e => setAddress(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className={labelCls}>City</label>
              <input name="city" type="text" placeholder="Winslow" value={city} onChange={e => setCity(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>State</label>
              <input name="state" type="text" placeholder="AZ" maxLength={2} value={state} onChange={e => setState(e.target.value.toUpperCase())} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Zip</label>
              <input name="zip" type="text" placeholder="86047" maxLength={5} value={zip} onChange={e => setZip(e.target.value)} onBlur={handleZipBlur} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Disposition</label>
            <input name="disposition" type="text" placeholder="e.g. Controlled, No fire found, Patient transported" value={disposition} onChange={e => setDisposition(e.target.value)} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Narrative</label>
            <textarea name="narrative" rows={3} placeholder="Brief description of the incident…" value={narrative} onChange={e => setNarrative(e.target.value)} className={inputCls} />
          </div>

          {!moduleNeris && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="neris_reported"
                checked={nerisReported}
                onChange={e => setNerisReported(e.target.checked)}
                className="rounded border-zinc-300 text-red-600 focus:ring-red-500"
              />
              <label htmlFor="neris_reported" className="text-sm text-zinc-700">Reported to NERIS</label>
            </div>
          )}
        </section>

        {/* Incident Times */}
        <section className="rounded-xl bg-white border border-zinc-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-900">Incident Times <span className="text-zinc-400 font-normal text-xs">(overall — paged &amp; in service auto-fill from apparatus)</span></h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Call Time</label>
              <input name="call_time" type="datetime-local" step="60" value={incidentCallTime} onChange={e => setIncidentCallTime(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Paged</label>
              <input name="paged_at" type="datetime-local" step="60" value={incidentPaged} onChange={e => setIncidentPaged(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>First On Scene</label>
              <input name="first_on_scene_at" type="datetime-local" step="60" value={incidentOnScene} onChange={e => setIncidentOnScene(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Last Leaving Scene</label>
              <input name="last_leaving_scene_at" type="datetime-local" step="60" value={incidentLeavingScene} onChange={e => setIncidentLeavingScene(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>In Service</label>
              <input name="in_service_at" type="datetime-local" step="60" value={incidentInService} onChange={e => setIncidentInService(e.target.value)} className={inputCls} />
            </div>
          </div>
        </section>

        {/* Fire Details */}
        {isFireType && (
          <section className="rounded-xl bg-white border border-zinc-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-900">Fire Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Property Type</label>
                <input name="property_type" type="text" placeholder="e.g. Single family residential" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Dollar Loss</label>
                <input name="dollar_loss" type="number" min="0" step="0.01" placeholder="0.00" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Cause of Fire</label>
                <input name="cause_of_fire" type="text" placeholder="e.g. Electrical, Undetermined" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Vehicle Info</label>
                <input name="vehicle_info" type="text" placeholder="Year / Make / Model" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Civilian Injuries</label>
                <input name="injuries_civilian" type="number" min="0" defaultValue="0" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>FF Injuries</label>
                <input name="injuries_firefighter" type="number" min="0" defaultValue="0" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Fatalities</label>
                <input name="fatalities" type="number" min="0" defaultValue="0" className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Insurance Info</label>
              <input name="insurance_info" type="text" placeholder="Insurance company / policy number" className={inputCls} />
            </div>
          </section>
        )}

        {/* Apparatus */}
        <section className="rounded-xl bg-white border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Apparatus</h2>
            <button type="button" onClick={() => {
              setNewApparatus(prev => ({
                ...prev,
                paged_at: incidentPaged || prev.paged_at,
                on_scene_at: incidentOnScene || prev.on_scene_at,
                leaving_scene_at: incidentLeavingScene || prev.leaving_scene_at,
                available_at: incidentInService || prev.available_at,
              }))
              setShowAddApparatus(true)
            }} className="text-xs font-semibold text-red-700 hover:underline">+ Add</button>
          </div>

          {apparatusRows.length === 0 && !showAddApparatus && (
            <p className="text-sm text-zinc-400">No apparatus added yet.</p>
          )}

          {apparatusRows.map((row, idx) => {
            const unit = apparatus.find(a => a.id === row.apparatus_id)
            return (
              <div key={idx} className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 bg-zinc-50">
                <div>
                  <p className="text-sm font-semibold text-zinc-800">{unit?.unit_number ?? row.apparatus_id}</p>
                  <p className="text-xs text-zinc-500 capitalize">{row.role}</p>
                </div>
                <button type="button" onClick={() => setApparatusRows(prev => prev.filter((_, i) => i !== idx))} className="text-xs text-red-600 hover:underline">Remove</button>
              </div>
            )
          })}

          {showAddApparatus && (
            <div className="rounded-lg border border-zinc-200 p-4 space-y-3 bg-zinc-50">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Unit</label>
                  <select value={newApparatus.apparatus_id} onChange={e => setNewApparatus(p => ({ ...p, apparatus_id: e.target.value }))} className={inputCls}>
                    <option value="">Select…</option>
                    {apparatus.filter(a => !apparatusRows.some(r => r.apparatus_id === a.id)).map(a => (
                      <option key={a.id} value={a.id}>{a.unit_number}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Role</label>
                  <select value={newApparatus.role} onChange={e => setNewApparatus(p => ({ ...p, role: e.target.value }))} className={inputCls}>
                    <option value="primary">Primary</option>
                    <option value="support">Support</option>
                    <option value="staging">Staging</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { key: 'paged_at', label: 'Paged' },
                  { key: 'enroute_at', label: 'Enroute' },
                  { key: 'on_scene_at', label: 'On Scene' },
                  { key: 'leaving_scene_at', label: 'Leaving Scene' },
                  { key: 'available_at', label: 'Available' },
                ].map(f => (
                  <div key={f.key}>
                    <label className={labelCls}>{f.label}</label>
                    <input
                      type="datetime-local"
                      value={(newApparatus as any)[f.key]}
                      onChange={e => setNewApparatus(p => ({ ...p, [f.key]: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={addApparatusRow} disabled={!newApparatus.apparatus_id} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">Add Unit</button>
                <button type="button" onClick={() => setShowAddApparatus(false)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100">Cancel</button>
              </div>
            </div>
          )}
        </section>

        {/* Mutual Aid */}
        <section className="rounded-xl bg-white border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Mutual Aid</h2>
            <button type="button" onClick={() => setShowAddMutualAid(true)} className="text-xs font-semibold text-red-700 hover:underline">+ Add</button>
          </div>

          {mutualAidRows.length === 0 && !showAddMutualAid && (
            <p className="text-sm text-zinc-400">No outside agencies added yet.</p>
          )}

          {mutualAidRows.map((row, idx) => (
            <div key={idx} className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 bg-zinc-50">
              <div>
                <p className="text-sm font-semibold text-zinc-800">{row.external_department_name}</p>
                <p className="text-xs text-zinc-500">{row.role === 'gave_aid' ? 'We Gave Aid' : 'We Received Aid'}{row.apparatus_description ? ` · ${row.apparatus_description}` : ''}</p>
              </div>
              <button type="button" onClick={() => setMutualAidRows(prev => prev.filter((_, i) => i !== idx))} className="text-xs text-red-600 hover:underline">Remove</button>
            </div>
          ))}

          {showAddMutualAid && (
            <div className="rounded-lg border border-zinc-200 p-4 space-y-3 bg-zinc-50">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Department Name</label>
                  <input value={newMutualAid.external_department_name} onChange={e => setNewMutualAid(p => ({ ...p, external_department_name: e.target.value }))} placeholder="e.g. Flagstaff Fire" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Role</label>
                  <select value={newMutualAid.role} onChange={e => setNewMutualAid(p => ({ ...p, role: e.target.value }))} className={inputCls}>
                    <option value="gave_aid">We Gave Aid</option>
                    <option value="received_aid">We Received Aid</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Apparatus Sent/Received</label>
                  <input value={newMutualAid.apparatus_description} onChange={e => setNewMutualAid(p => ({ ...p, apparatus_description: e.target.value }))} placeholder="e.g. Engine 1, Tanker 2" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Personnel Count</label>
                  <input type="number" min="0" value={newMutualAid.personnel_count} onChange={e => setNewMutualAid(p => ({ ...p, personnel_count: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Arrival Time</label>
                  <input type="datetime-local" value={newMutualAid.arrival_time} onChange={e => setNewMutualAid(p => ({ ...p, arrival_time: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Departure Time</label>
                  <input type="datetime-local" value={newMutualAid.departure_time} onChange={e => setNewMutualAid(p => ({ ...p, departure_time: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={addMutualAidRow} disabled={!newMutualAid.external_department_name.trim()} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">Add</button>
                <button type="button" onClick={() => setShowAddMutualAid(false)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100">Cancel</button>
              </div>
            </div>
          )}
        </section>

        {/* Personnel */}
        <section className="rounded-xl bg-white border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Personnel on Scene</h2>
            <button type="button" onClick={() => setShowAddPersonnel(true)} className="text-xs font-semibold text-red-700 hover:underline">+ Add</button>
          </div>

          {personnelRows.length === 0 && !showAddPersonnel && (
            <p className="text-sm text-zinc-400">No personnel added yet.</p>
          )}

          {personnelRows.map((row, idx) => {
            const person = personnel.find(p => p.id === row.personnel_id)
            const unit = apparatus.find(a => a.id === row.apparatus_id)
            return (
              <div key={idx} className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 bg-zinc-50">
                <div>
                  <p className="text-sm font-semibold text-zinc-800">{person?.name ?? row.personnel_id}</p>
                  <p className="text-xs text-zinc-500 uppercase">{row.role}{unit ? ` · ${unit.unit_number}` : ' · POV'}</p>
                </div>
                <button type="button" onClick={() => setPersonnelRows(prev => prev.filter((_, i) => i !== idx))} className="text-xs text-red-600 hover:underline">Remove</button>
              </div>
            )
          })}

          {showAddPersonnel && (
            <div className="rounded-lg border border-zinc-200 p-4 space-y-3 bg-zinc-50">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Member</label>
                  <select value={newPersonnel.personnel_id} onChange={e => setNewPersonnel(p => ({ ...p, personnel_id: e.target.value }))} className={inputCls}>
                    <option value="">Select…</option>
                    {personnel.filter(p => !personnelRows.some(r => r.personnel_id === p.id)).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Role</label>
                  <select value={newPersonnel.role} onChange={e => setNewPersonnel(p => ({ ...p, role: e.target.value }))} className={inputCls}>
                    <option value="ic">IC</option>
                    <option value="driver">Driver</option>
                    <option value="officer">Officer</option>
                    <option value="crew">Crew</option>
                    <option value="ems">EMS</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Apparatus <span className="text-zinc-400 font-normal">(leave blank = POV)</span></label>
                <select value={newPersonnel.apparatus_id} onChange={e => setNewPersonnel(p => ({ ...p, apparatus_id: e.target.value }))} className={inputCls}>
                  <option value="">POV / Not on apparatus</option>
                  {apparatusRows.map(r => {
                    const unit = apparatus.find(a => a.id === r.apparatus_id)
                    return <option key={r.apparatus_id} value={r.apparatus_id}>{unit?.unit_number ?? r.apparatus_id}</option>
                  })}
                </select>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={addPersonnelRow} disabled={!newPersonnel.personnel_id} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">Add Member</button>
                <button type="button" onClick={() => setShowAddPersonnel(false)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100">Cancel</button>
              </div>
            </div>
          )}
        </section>

        <div className="flex gap-3 pb-8">
          <button type="submit" disabled={loading} className="rounded-lg bg-red-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
            {loading ? 'Saving…' : 'Submit Incident'}
          </button>
          <button type="button" onClick={() => router.back()} className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
