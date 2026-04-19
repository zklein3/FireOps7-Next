'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateIncident, setIncidentStatus,
  addIncidentApparatus, updateIncidentApparatus, removeIncidentApparatus,
  addIncidentPersonnel, verifyIncidentPersonnel, removeIncidentPersonnel,
} from '@/app/actions/incidents'

const inputCls = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
const labelCls = "block text-sm font-medium text-zinc-700 mb-1"

const TYPE_LABELS: Record<string, string> = {
  fire: 'Fire', rescue: 'Rescue', standby: 'Standby',
  mutual_aid: 'Mutual Aid', special: 'Special', other: 'Other',
}
const FIRE_SUBTYPES = [
  { value: 'structure', label: 'Structure Fire' },
  { value: 'vehicle', label: 'Vehicle Fire' },
  { value: 'grass', label: 'Grass Fire' },
  { value: 'wildland', label: 'Wildland Fire' },
  { value: 'other_fire', label: 'Other Fire' },
]
const FIRE_SUBTYPE_LABELS: Record<string, string> = Object.fromEntries(FIRE_SUBTYPES.map(s => [s.value, s.label]))
const ROLE_LABELS: Record<string, string> = { ic: 'IC', driver: 'Driver', officer: 'Officer', crew: 'Crew', ems: 'EMS', other: 'Other' }
const APPARATUS_ROLE_LABELS: Record<string, string> = { primary: 'Primary', support: 'Support', staging: 'Staging' }

function formatDT(dt: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
}
function toDatetimeLocal(dt: string | null) {
  if (!dt) return ''
  return new Date(dt).toISOString().slice(0, 16)
}

type ApparatusRow = { id: string; apparatus_id: string; unit_number: string; role: string; paged_at: string | null; enroute_at: string | null; on_scene_at: string | null; leaving_scene_at: string | null; available_at: string | null }
type PersonnelRow = { id: string; personnel_id: string; apparatus_id: string | null; role: string; status: string; rejection_reason: string | null; name: string; apparatus_unit: string | null; submitted_by_name: string | null }

export default function IncidentDetailClient({
  incident,
  incidentApparatus,
  incidentPersonnel,
  fireDetails,
  personnelNameMap,
  deptApparatus,
  deptPersonnel,
  isOfficerOrAbove,
  myPersonnelId,
}: {
  incident: any
  incidentApparatus: ApparatusRow[]
  incidentPersonnel: PersonnelRow[]
  fireDetails: any
  personnelNameMap: Record<string, string>
  deptApparatus: { id: string; unit_number: string }[]
  deptPersonnel: { id: string; name: string }[]
  isOfficerOrAbove: boolean
  myPersonnelId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [incidentType, setIncidentType] = useState(incident.incident_type)
  const [nerisReported, setNerisReported] = useState(incident.neris_reported)

  // Apparatus editing
  const [showAddApparatus, setShowAddApparatus] = useState(false)
  const [editingApparatusId, setEditingApparatusId] = useState<string | null>(null)
  const [newApparatus, setNewApparatus] = useState({ apparatus_id: '', role: 'primary', paged_at: '', enroute_at: '', on_scene_at: '', leaving_scene_at: '', available_at: '' })

  // Personnel
  const [showAddPersonnel, setShowAddPersonnel] = useState(false)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [newPersonnel, setNewPersonnel] = useState({ personnel_id: '', apparatus_id: '', role: 'crew' })

  const isFinalized = incident.status === 'finalized'
  const canEdit = !isFinalized || isOfficerOrAbove
  const alreadyOnIncident = incidentPersonnel.some(p => p.personnel_id === myPersonnelId)
  const pendingPersonnel = incidentPersonnel.filter(p => p.status === 'pending')

  async function handleEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setEditError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('neris_reported', nerisReported ? 'true' : 'false')
    startTransition(async () => {
      const result = await updateIncident(incident.id, fd)
      if (result?.error) { setEditError(result.error); return }
      setEditing(false)
      router.refresh()
    })
  }

  async function handleFinalize() {
    startTransition(async () => {
      await setIncidentStatus(incident.id, isFinalized ? 'pending' : 'finalized')
      router.refresh()
    })
  }

  async function handleAddApparatus() {
    if (!newApparatus.apparatus_id) return
    const fd = new FormData()
    Object.entries(newApparatus).forEach(([k, v]) => fd.set(k, v))
    startTransition(async () => {
      await addIncidentApparatus(incident.id, fd)
      setNewApparatus({ apparatus_id: '', role: 'primary', paged_at: '', enroute_at: '', on_scene_at: '', leaving_scene_at: '', available_at: '' })
      setShowAddApparatus(false)
      router.refresh()
    })
  }

  async function handleUpdateApparatus(e: React.FormEvent<HTMLFormElement>, logId: string) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await updateIncidentApparatus(logId, incident.id, fd)
      setEditingApparatusId(null)
      router.refresh()
    })
  }

  async function handleRemoveApparatus(logId: string) {
    startTransition(async () => {
      await removeIncidentApparatus(logId, incident.id)
      router.refresh()
    })
  }

  async function handleAddPersonnel() {
    if (!newPersonnel.personnel_id) return
    const fd = new FormData()
    Object.entries(newPersonnel).forEach(([k, v]) => fd.set(k, v))
    startTransition(async () => {
      await addIncidentPersonnel(incident.id, fd)
      setNewPersonnel({ personnel_id: '', apparatus_id: '', role: 'crew' })
      setShowAddPersonnel(false)
      router.refresh()
    })
  }

  async function handleVerifyPersonnel(logId: string, status: 'verified' | 'rejected') {
    startTransition(async () => {
      await verifyIncidentPersonnel(logId, incident.id, status, status === 'rejected' ? rejectReason : undefined)
      setRejectingId(null)
      setRejectReason('')
      router.refresh()
    })
  }

  async function handleRemovePersonnel(logId: string) {
    startTransition(async () => {
      await removeIncidentPersonnel(logId, incident.id)
      router.refresh()
    })
  }

  const alreadyAddedApparatusIds = new Set(incidentApparatus.map(a => a.apparatus_id))
  const alreadyAddedPersonnelIds = new Set(incidentPersonnel.map(p => p.personnel_id))

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-sm text-zinc-500 hover:text-zinc-700">← Back</button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-zinc-900">
                {incident.incident_number || incident.cad_number || 'Incident Report'}
              </h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isFinalized ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {isFinalized ? 'Finalized' : 'Pending Review'}
              </span>
            </div>
            <p className="text-sm text-zinc-500 mt-0.5">{formatDate(incident.incident_date)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && !editing && (
            <button onClick={() => setEditing(true)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100">
              Edit
            </button>
          )}
          {isOfficerOrAbove && (
            <button
              onClick={handleFinalize}
              disabled={isPending}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${isFinalized ? 'border border-zinc-300 text-zinc-600 hover:bg-zinc-100' : 'bg-green-700 text-white hover:bg-green-800'}`}
            >
              {isFinalized ? 'Reopen' : 'Finalize'}
            </button>
          )}
        </div>
      </div>

      {/* Edit form */}
      {editing ? (
        <form onSubmit={handleEditSubmit} className="space-y-6">
          {editError && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{editError}</div>}

          <section className="rounded-xl bg-white border border-zinc-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-900">Incident Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Incident #</label>
                <input name="incident_number" type="text" defaultValue={incident.incident_number ?? ''} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>CAD #</label>
                <input name="cad_number" type="text" defaultValue={incident.cad_number ?? ''} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Date <span className="text-red-600">*</span></label>
                <input name="incident_date" type="date" required defaultValue={incident.incident_date} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Type <span className="text-red-600">*</span></label>
                <select name="incident_type" required value={incidentType} onChange={e => setIncidentType(e.target.value)} className={inputCls}>
                  <option value="fire">Fire</option>
                  <option value="rescue">Rescue</option>
                  <option value="standby">Standby</option>
                  <option value="mutual_aid">Mutual Aid</option>
                  <option value="special">Special</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            {incidentType === 'fire' && (
              <div>
                <label className={labelCls}>Fire Type</label>
                <select name="fire_subtype" defaultValue={incident.fire_subtype ?? ''} className={inputCls}>
                  <option value="">Select…</option>
                  {FIRE_SUBTYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            )}
            {incidentType === 'mutual_aid' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Direction</label>
                  <select name="mutual_aid_direction" defaultValue={incident.mutual_aid_direction ?? ''} className={inputCls}>
                    <option value="">Select…</option>
                    <option value="to">To (we assisted)</option>
                    <option value="from">From (we received)</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Other Department</label>
                  <input name="mutual_aid_department" type="text" defaultValue={incident.mutual_aid_department ?? ''} className={inputCls} />
                </div>
              </div>
            )}
            <div>
              <label className={labelCls}>Address</label>
              <input name="address" type="text" defaultValue={incident.address ?? ''} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Disposition</label>
              <input name="disposition" type="text" defaultValue={incident.disposition ?? ''} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Narrative</label>
              <textarea name="narrative" rows={3} defaultValue={incident.narrative ?? ''} className={inputCls} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="edit_neris" checked={nerisReported} onChange={e => setNerisReported(e.target.checked)} className="rounded border-zinc-300 text-red-600 focus:ring-red-500" />
              <label htmlFor="edit_neris" className="text-sm text-zinc-700">Reported to NERIS</label>
            </div>
          </section>

          <section className="rounded-xl bg-white border border-zinc-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-900">Incident Times</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[
                { name: 'call_time', label: 'Call Time', val: incident.call_time },
                { name: 'paged_at', label: 'Paged', val: incident.paged_at },
                { name: 'first_enroute_at', label: 'First Enroute', val: incident.first_enroute_at },
                { name: 'first_on_scene_at', label: 'First On Scene', val: incident.first_on_scene_at },
                { name: 'last_leaving_scene_at', label: 'Last Leaving Scene', val: incident.last_leaving_scene_at },
                { name: 'in_service_at', label: 'In Service', val: incident.in_service_at },
              ].map(f => (
                <div key={f.name}>
                  <label className={labelCls}>{f.label}</label>
                  <input name={f.name} type="datetime-local" defaultValue={toDatetimeLocal(f.val)} className={inputCls} />
                </div>
              ))}
            </div>
          </section>

          {incidentType === 'fire' && (
            <section className="rounded-xl bg-white border border-zinc-200 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-zinc-900">Fire Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>Property Type</label><input name="property_type" type="text" defaultValue={fireDetails?.property_type ?? ''} className={inputCls} /></div>
                <div><label className={labelCls}>Dollar Loss</label><input name="dollar_loss" type="number" min="0" step="0.01" defaultValue={fireDetails?.dollar_loss ?? ''} className={inputCls} /></div>
                <div><label className={labelCls}>Cause of Fire</label><input name="cause_of_fire" type="text" defaultValue={fireDetails?.cause_of_fire ?? ''} className={inputCls} /></div>
                <div><label className={labelCls}>Vehicle Info</label><input name="vehicle_info" type="text" defaultValue={fireDetails?.vehicle_info ?? ''} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className={labelCls}>Civilian Injuries</label><input name="injuries_civilian" type="number" min="0" defaultValue={fireDetails?.injuries_civilian ?? 0} className={inputCls} /></div>
                <div><label className={labelCls}>FF Injuries</label><input name="injuries_firefighter" type="number" min="0" defaultValue={fireDetails?.injuries_firefighter ?? 0} className={inputCls} /></div>
                <div><label className={labelCls}>Fatalities</label><input name="fatalities" type="number" min="0" defaultValue={fireDetails?.fatalities ?? 0} className={inputCls} /></div>
              </div>
              <div><label className={labelCls}>Insurance Info</label><input name="insurance_info" type="text" defaultValue={fireDetails?.insurance_info ?? ''} className={inputCls} /></div>
            </section>
          )}

          <div className="flex gap-3 pb-8">
            <button type="submit" disabled={isPending} className="rounded-lg bg-red-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
              {isPending ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={() => { setEditing(false); setEditError(null) }} className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-5">
          {/* View mode — core info */}
          <section className="rounded-xl bg-white border border-zinc-200 p-5">
            <h2 className="text-sm font-semibold text-zinc-900 mb-4">Incident Details</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div><p className="text-zinc-400 text-xs">Type</p><p className="text-zinc-800 font-medium">{incident.fire_subtype ? FIRE_SUBTYPE_LABELS[incident.fire_subtype] : TYPE_LABELS[incident.incident_type]}</p></div>
              <div><p className="text-zinc-400 text-xs">Date</p><p className="text-zinc-800 font-medium">{formatDate(incident.incident_date)}</p></div>
              {incident.incident_number && <div><p className="text-zinc-400 text-xs">Incident #</p><p className="text-zinc-800 font-medium">{incident.incident_number}</p></div>}
              {incident.cad_number && <div><p className="text-zinc-400 text-xs">CAD #</p><p className="text-zinc-800 font-medium">{incident.cad_number}</p></div>}
              {incident.address && <div className="col-span-2"><p className="text-zinc-400 text-xs">Address</p><p className="text-zinc-800 font-medium">{incident.address}</p></div>}
              {incident.mutual_aid_direction && <div><p className="text-zinc-400 text-xs">Mutual Aid</p><p className="text-zinc-800 font-medium capitalize">{incident.mutual_aid_direction} — {incident.mutual_aid_department}</p></div>}
              {incident.disposition && <div className="col-span-2"><p className="text-zinc-400 text-xs">Disposition</p><p className="text-zinc-800 font-medium">{incident.disposition}</p></div>}
              {incident.narrative && <div className="col-span-2"><p className="text-zinc-400 text-xs">Narrative</p><p className="text-zinc-700">{incident.narrative}</p></div>}
              <div><p className="text-zinc-400 text-xs">NERIS</p><p className={`font-medium text-sm ${incident.neris_reported ? 'text-green-700' : 'text-zinc-400'}`}>{incident.neris_reported ? '✓ Reported' : 'Not reported'}</p></div>
              <div><p className="text-zinc-400 text-xs">Logged by</p><p className="text-zinc-800 font-medium">{personnelNameMap[incident.created_by] ?? '—'}</p></div>
              {incident.finalized_by && <div><p className="text-zinc-400 text-xs">Finalized by</p><p className="text-zinc-800 font-medium">{personnelNameMap[incident.finalized_by] ?? '—'}</p></div>}
            </div>
          </section>

          {/* Incident times */}
          <section className="rounded-xl bg-white border border-zinc-200 p-5">
            <h2 className="text-sm font-semibold text-zinc-900 mb-4">Incident Times</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
              {[
                { label: 'Call Time', val: incident.call_time },
                { label: 'Paged', val: incident.paged_at },
                { label: 'First Enroute', val: incident.first_enroute_at },
                { label: 'First On Scene', val: incident.first_on_scene_at },
                { label: 'Last Leaving Scene', val: incident.last_leaving_scene_at },
                { label: 'In Service', val: incident.in_service_at },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-zinc-400 text-xs">{f.label}</p>
                  <p className="text-zinc-800 font-medium">{formatDT(f.val)}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Fire details */}
          {incident.incident_type === 'fire' && fireDetails && (
            <section className="rounded-xl bg-white border border-zinc-200 p-5">
              <h2 className="text-sm font-semibold text-zinc-900 mb-4">Fire Details</h2>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                {fireDetails.property_type && <div><p className="text-zinc-400 text-xs">Property Type</p><p className="text-zinc-800 font-medium">{fireDetails.property_type}</p></div>}
                {fireDetails.dollar_loss != null && <div><p className="text-zinc-400 text-xs">Dollar Loss</p><p className="text-zinc-800 font-medium">${Number(fireDetails.dollar_loss).toLocaleString()}</p></div>}
                {fireDetails.cause_of_fire && <div><p className="text-zinc-400 text-xs">Cause</p><p className="text-zinc-800 font-medium">{fireDetails.cause_of_fire}</p></div>}
                {fireDetails.vehicle_info && <div><p className="text-zinc-400 text-xs">Vehicle Info</p><p className="text-zinc-800 font-medium">{fireDetails.vehicle_info}</p></div>}
                <div><p className="text-zinc-400 text-xs">Civilian Injuries</p><p className="text-zinc-800 font-medium">{fireDetails.injuries_civilian}</p></div>
                <div><p className="text-zinc-400 text-xs">FF Injuries</p><p className="text-zinc-800 font-medium">{fireDetails.injuries_firefighter}</p></div>
                <div><p className="text-zinc-400 text-xs">Fatalities</p><p className="text-zinc-800 font-medium">{fireDetails.fatalities}</p></div>
                {fireDetails.insurance_info && <div className="col-span-2"><p className="text-zinc-400 text-xs">Insurance</p><p className="text-zinc-800 font-medium">{fireDetails.insurance_info}</p></div>}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Apparatus section — always visible */}
      <section className="rounded-xl bg-white border border-zinc-200 p-5 mt-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-900">Apparatus</h2>
          {canEdit && (
            <button onClick={() => setShowAddApparatus(true)} className="text-xs font-semibold text-red-700 hover:underline">+ Add</button>
          )}
        </div>

        {incidentApparatus.length === 0 && !showAddApparatus && (
          <p className="text-sm text-zinc-400">No apparatus logged.</p>
        )}

        {incidentApparatus.map(a => (
          <div key={a.id} className="mb-3">
            {editingApparatusId === a.id ? (
              <form onSubmit={e => handleUpdateApparatus(e, a.id)} className="rounded-lg border border-zinc-200 p-4 space-y-3 bg-zinc-50">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Unit</label>
                    <p className="text-sm font-semibold text-zinc-800 py-2">{a.unit_number}</p>
                  </div>
                  <div>
                    <label className={labelCls}>Role</label>
                    <select name="role" defaultValue={a.role} className={inputCls}>
                      <option value="primary">Primary</option>
                      <option value="support">Support</option>
                      <option value="staging">Staging</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    { name: 'paged_at', label: 'Paged', val: a.paged_at },
                    { name: 'enroute_at', label: 'Enroute', val: a.enroute_at },
                    { name: 'on_scene_at', label: 'On Scene', val: a.on_scene_at },
                    { name: 'leaving_scene_at', label: 'Leaving Scene', val: a.leaving_scene_at },
                    { name: 'available_at', label: 'Available', val: a.available_at },
                  ].map(f => (
                    <div key={f.name}>
                      <label className={labelCls}>{f.label}</label>
                      <input name={f.name} type="datetime-local" defaultValue={toDatetimeLocal(f.val)} className={inputCls} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={isPending} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">Save</button>
                  <button type="button" onClick={() => setEditingApparatusId(null)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100">Cancel</button>
                </div>
              </form>
            ) : (
              <div className="rounded-lg border border-zinc-200 px-4 py-3 bg-zinc-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-800">{a.unit_number}</p>
                    <span className="text-xs text-zinc-500 capitalize">{APPARATUS_ROLE_LABELS[a.role]}</span>
                  </div>
                  {canEdit && (
                    <div className="flex gap-3">
                      <button onClick={() => setEditingApparatusId(a.id)} className="text-xs text-zinc-500 hover:text-zinc-700">Edit</button>
                      <button onClick={() => handleRemoveApparatus(a.id)} className="text-xs text-red-600 hover:underline">Remove</button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                  {[
                    { label: 'Paged', val: a.paged_at },
                    { label: 'Enroute', val: a.enroute_at },
                    { label: 'On Scene', val: a.on_scene_at },
                    { label: 'Leaving', val: a.leaving_scene_at },
                    { label: 'Available', val: a.available_at },
                  ].map(f => (
                    <div key={f.label}>
                      <span className="text-zinc-400">{f.label}: </span>
                      <span className="text-zinc-700">{formatDT(f.val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {showAddApparatus && (
          <div className="rounded-lg border border-zinc-200 p-4 space-y-3 bg-zinc-50 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Unit</label>
                <select value={newApparatus.apparatus_id} onChange={e => setNewApparatus(p => ({ ...p, apparatus_id: e.target.value }))} className={inputCls}>
                  <option value="">Select…</option>
                  {deptApparatus.filter(a => !alreadyAddedApparatusIds.has(a.id)).map(a => (
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
                  <input type="datetime-local" value={(newApparatus as any)[f.key]} onChange={e => setNewApparatus(p => ({ ...p, [f.key]: e.target.value }))} className={inputCls} />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleAddApparatus} disabled={!newApparatus.apparatus_id || isPending} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">Add Unit</button>
              <button type="button" onClick={() => setShowAddApparatus(false)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100">Cancel</button>
            </div>
          </div>
        )}
      </section>

      {/* Personnel section */}
      <section className="rounded-xl bg-white border border-zinc-200 p-5 mt-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-900">Personnel on Scene</h2>
          <div className="flex gap-3">
            {!alreadyOnIncident && (
              <button
                onClick={() => {
                  setNewPersonnel({ personnel_id: myPersonnelId, apparatus_id: '', role: 'crew' })
                  setShowAddPersonnel(true)
                }}
                className="text-xs font-semibold text-red-700 hover:underline"
              >
                Log myself
              </button>
            )}
            {canEdit && (
              <button onClick={() => setShowAddPersonnel(true)} className="text-xs font-semibold text-red-700 hover:underline">+ Add member</button>
            )}
          </div>
        </div>

        {/* Officer verification queue */}
        {isOfficerOrAbove && pendingPersonnel.length > 0 && (
          <div className="mb-4 rounded-lg bg-yellow-50 border border-yellow-200 p-4">
            <p className="text-xs font-semibold text-yellow-800 mb-3">{pendingPersonnel.length} pending verification</p>
            {pendingPersonnel.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-yellow-100 last:border-0">
                <div>
                  <p className="text-sm font-semibold text-zinc-800">{p.name}</p>
                  <p className="text-xs text-zinc-500 uppercase">{ROLE_LABELS[p.role]}{p.apparatus_unit ? ` · ${p.apparatus_unit}` : ' · POV'}</p>
                </div>
                {rejectingId === p.id ? (
                  <div className="flex flex-col gap-2 items-end">
                    <input
                      type="text"
                      placeholder="Reason (optional)"
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      className="rounded-lg border border-zinc-300 px-2 py-1 text-xs text-zinc-900 w-44"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handleVerifyPersonnel(p.id, 'rejected')} className="text-xs font-semibold text-red-700 hover:underline">Confirm Reject</button>
                      <button onClick={() => { setRejectingId(null); setRejectReason('') }} className="text-xs text-zinc-500 hover:text-zinc-700">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button onClick={() => handleVerifyPersonnel(p.id, 'verified')} disabled={isPending} className="text-xs font-semibold text-green-700 hover:underline disabled:opacity-50">Approve</button>
                    <button onClick={() => setRejectingId(p.id)} className="text-xs font-semibold text-red-600 hover:underline">Reject</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {incidentPersonnel.length === 0 && !showAddPersonnel && (
          <p className="text-sm text-zinc-400">No personnel logged.</p>
        )}

        <div className="space-y-2">
          {incidentPersonnel.filter(p => p.status !== 'pending').map(p => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 bg-zinc-50">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-zinc-800">{p.name}</p>
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${p.status === 'verified' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {p.status === 'verified' ? 'Verified' : 'Rejected'}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 uppercase">{ROLE_LABELS[p.role]}{p.apparatus_unit ? ` · ${p.apparatus_unit}` : ' · POV'}</p>
                {p.rejection_reason && <p className="text-xs text-red-600 mt-0.5">Reason: {p.rejection_reason}</p>}
              </div>
              {isOfficerOrAbove && (
                <button onClick={() => handleRemovePersonnel(p.id)} disabled={isPending} className="text-xs text-red-600 hover:underline disabled:opacity-50">Remove</button>
              )}
            </div>
          ))}
        </div>

        {showAddPersonnel && (
          <div className="rounded-lg border border-zinc-200 p-4 space-y-3 bg-zinc-50 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Member</label>
                <select value={newPersonnel.personnel_id} onChange={e => setNewPersonnel(p => ({ ...p, personnel_id: e.target.value }))} className={inputCls}>
                  <option value="">Select…</option>
                  {deptPersonnel.filter(p => !alreadyAddedPersonnelIds.has(p.id)).map(p => (
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
                {incidentApparatus.map(a => (
                  <option key={a.apparatus_id} value={a.apparatus_id}>{a.unit_number}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleAddPersonnel} disabled={!newPersonnel.personnel_id || isPending} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">Add</button>
              <button type="button" onClick={() => setShowAddPersonnel(false)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100">Cancel</button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
