'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  updateIncident, setIncidentStatus,
  addIncidentApparatus, updateIncidentApparatus, removeIncidentApparatus,
  addIncidentPersonnel, updateIncidentPersonnel, logIncidentAttendance, verifyIncidentPersonnel, removeIncidentPersonnel,
} from '@/app/actions/incidents'
import { lookupZip } from '@/lib/zip-lookup'
import { generateCheckinToken } from '@/app/actions/checkin'
import { addMutualAid, removeMutualAid, updateMutualAid } from '@/app/actions/iso'
import { parseRunSheet, type ParsedRunSheet } from '@/app/actions/parse-run-sheet'

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
const ROLE_LABELS: Record<string, string> = { ic: 'IC', driver: 'Driver', officer: 'Officer', crew: 'Crew', ems: 'EMS', standby: 'Standby', other: 'Other' }
const APPARATUS_ROLE_LABELS: Record<string, string> = { primary: 'Primary', support: 'Support', staging: 'Staging' }

function formatDT(dt: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
}
function toDatetimeLocal(dt: string | null) {
  if (!dt) return ''
  return new Date(dt).toISOString().slice(0, 16)
}

function AddressFields({ address, city, state, zip }: { address: string; city: string; state: string; zip: string }) {
  const [addressVal, setAddressVal] = useState(address)
  const [cityVal, setCityVal] = useState(city)
  const [stateVal, setStateVal] = useState(state)
  const [zipVal, setZipVal] = useState(zip)

  async function handleZipBlur() {
    if (cityVal || stateVal) return
    const result = await lookupZip(zipVal)
    if (result) {
      setCityVal(result.city)
      setStateVal(result.state)
    }
  }

  return (
    <>
      <div>
        <label className={labelCls}>Street Address</label>
        <input name="address" type="text" value={addressVal} onChange={e => setAddressVal(e.target.value)} className={inputCls} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1">
          <label className={labelCls}>City</label>
          <input name="city" type="text" value={cityVal} onChange={e => setCityVal(e.target.value)} placeholder="Winslow" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>State</label>
          <input name="state" type="text" value={stateVal} onChange={e => setStateVal(e.target.value.toUpperCase())} placeholder="AZ" maxLength={2} className={`${inputCls} uppercase`} />
        </div>
        <div>
          <label className={labelCls}>Zip</label>
          <input name="zip" type="text" value={zipVal} onChange={e => setZipVal(e.target.value)} onBlur={handleZipBlur} placeholder="86047" maxLength={5} className={inputCls} />
        </div>
      </div>
    </>
  )
}

type ApparatusRow = { id: string; apparatus_id: string; unit_number: string; role: string; paged_at: string | null; enroute_at: string | null; on_scene_at: string | null; leaving_scene_at: string | null; available_at: string | null }
type PersonnelRow = { id: string; personnel_id: string; apparatus_id: string | null; role: string; status: string; rejection_reason: string | null; name: string; apparatus_unit: string | null; submitted_by_name: string | null }
type MutualAidRow = { id: string; external_department_name: string; role: string; apparatus_description: string | null; personnel_count: number | null; arrival_time: string | null; departure_time: string | null; notes: string | null }

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
  mutualAid,
  nerisRecord,
  moduleNeris,
  signatureRoster,
  departmentName,
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
  mutualAid: MutualAidRow[]
  nerisRecord: { id: string; neris_status: string; completed_at: string | null; neris_submission_id: string | null } | null
  moduleNeris: boolean
  signatureRoster: { sig_id: string; personnel_id: string; signed_at: string | null; has_signature: boolean; name: string }[]
  departmentName: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [incidentType, setIncidentType] = useState(incident.incident_type)
  const [nerisReported, setNerisReported] = useState(incident.neris_reported)

  // Run sheet re-import
  const [isParsing, setIsParsing] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)
  const [importedData, setImportedData] = useState<ParsedRunSheet | null>(null)
  const [formKey, setFormKey] = useState(0)

  // Apparatus editing
  const [showAddApparatus, setShowAddApparatus] = useState(false)
  const [editingApparatusId, setEditingApparatusId] = useState<string | null>(null)
  const [newApparatus, setNewApparatus] = useState({ apparatus_id: '', role: 'primary', paged_at: '', enroute_at: '', on_scene_at: '', leaving_scene_at: '', available_at: '' })

  // Personnel — officer add
  const [showAddPersonnel, setShowAddPersonnel] = useState(false)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [newPersonnel, setNewPersonnel] = useState({ personnel_id: '', apparatus_id: '', role: 'crew' })
  const [editingPersonnelId, setEditingPersonnelId] = useState<string | null>(null)
  const [editingPersonnel, setEditingPersonnel] = useState({ apparatus_id: '', role: 'crew' })
  const [personnelEditError, setPersonnelEditError] = useState<string | null>(null)
  // Member self-log
  const [confirmingLog, setConfirmingLog] = useState(false)
  const [selfLogRole, setSelfLogRole] = useState('crew')
  const [selfLogError, setSelfLogError] = useState<string | null>(null)

  // Mutual aid
  const [showAddMutualAid, setShowAddMutualAid] = useState(false)
  const [mutualAidError, setMutualAidError] = useState<string | null>(null)
  const [editingMutualAidId, setEditingMutualAidId] = useState<string | null>(null)
  const [addArrivalTime, setAddArrivalTime] = useState('')
  const [addDepartureTime, setAddDepartureTime] = useState('')

  const toLocal = (iso: string | null) => iso ? iso.slice(0, 16) : ''
  const incidentTimes = [
    { label: 'Call', value: toLocal(incident.call_time) },
    { label: 'On Scene', value: toLocal(incident.first_on_scene_at) },
    { label: 'Leaving', value: toLocal(incident.last_leaving_scene_at) },
    { label: 'In Service', value: toLocal(incident.in_service_at) },
  ].filter(t => t.value)

  const isFinalized = incident.status === 'finalized'
  const canEdit = !isFinalized || isOfficerOrAbove
  const alreadyOnIncident = incidentPersonnel.some(p => p.personnel_id === myPersonnelId)
  const pendingPersonnel = incidentPersonnel.filter(p => p.status === 'pending')

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setIsParsing(true)
    setImportError(null)
    setImportSuccess(false)

    const fd = new FormData()
    fd.set('pdf', file)
    fd.set('apparatus_units', JSON.stringify(deptApparatus.map(a => a.unit_number)))
    fd.set('department_name', departmentName)
    const result = await parseRunSheet(fd)

    if (result.error) { setImportError(result.error); setIsParsing(false); return }
    const d = result.data!

    // Build FormData for updateIncident, merging parsed values over existing
    const ifd = new FormData()
    ifd.set('incident_number',        d.incident_number        ?? incident.incident_number        ?? '')
    ifd.set('cad_number',             d.cad_number             ?? incident.cad_number             ?? '')
    ifd.set('incident_date',          d.incident_date          ?? incident.incident_date)
    ifd.set('incident_type',          d.incident_type          ?? incident.incident_type)
    ifd.set('address',                d.address                ?? incident.address                ?? '')
    ifd.set('city',                   d.city                   ?? incident.city                   ?? '')
    ifd.set('state',                  d.state                  ?? incident.state                  ?? '')
    ifd.set('zip',                    d.zip                    ?? incident.zip                    ?? '')
    ifd.set('disposition',            d.disposition            ?? incident.disposition            ?? '')
    ifd.set('narrative',              d.narrative              ?? incident.narrative              ?? '')
    ifd.set('call_time',              d.call_time              ?? incident.call_time              ?? '')
    ifd.set('paged_at',               d.paged_at               ?? incident.paged_at               ?? '')
    ifd.set('first_on_scene_at',      d.first_on_scene_at      ?? incident.first_on_scene_at      ?? '')
    ifd.set('last_leaving_scene_at',  d.last_leaving_scene_at  ?? incident.last_leaving_scene_at  ?? '')
    ifd.set('in_service_at',          d.in_service_at          ?? incident.in_service_at          ?? '')
    ifd.set('fire_subtype',           incident.fire_subtype    ?? '')
    ifd.set('mutual_aid_direction',   incident.mutual_aid_direction ?? '')
    ifd.set('mutual_aid_department',  incident.mutual_aid_department ?? '')
    ifd.set('neris_reported',         incident.neris_reported ? 'true' : 'false')
    await updateIncident(incident.id, ifd)

    if (d.incident_type) setIncidentType(d.incident_type)

    // Write apparatus — update existing rows, add new ones
    for (const unit of d.apparatus ?? []) {
      // Guard against false-positive matches (e.g. a unit merely listed/paged but never
      // actually enroute) — require an actual response timestamp before treating it as on the run.
      if (!unit.enroute_at && !unit.on_scene_at) continue
      const numericSuffix = unit.unit_number.replace(/^[A-Za-z]+/, '')
      const deptMatch = deptApparatus.find(a =>
        a.unit_number.toUpperCase() === unit.unit_number.toUpperCase() ||
        (numericSuffix && a.unit_number === numericSuffix)
      )
      if (!deptMatch) continue
      const afd = new FormData()
      afd.set('apparatus_id', deptMatch.id)
      afd.set('role',              unit.role             || 'primary')
      afd.set('paged_at',          d.paged_at            || '')
      afd.set('enroute_at',        unit.enroute_at       || '')
      afd.set('on_scene_at',       unit.on_scene_at      || '')
      afd.set('leaving_scene_at',  unit.leaving_scene_at || '')
      afd.set('available_at',      unit.available_at     || '')
      const existing = incidentApparatus.find(r => r.apparatus_id === deptMatch.id)
      if (existing) {
        await updateIncidentApparatus(existing.id, incident.id, afd)
      } else {
        await addIncidentApparatus(incident.id, afd)
      }
    }

    // Write mutual aid — add outside-agency units, skip ones already recorded by department name
    for (const ma of d.mutual_aid ?? []) {
      if (!ma.department_name) continue
      const already = mutualAid.some(m => m.external_department_name.toLowerCase() === ma.department_name.toLowerCase())
      if (already) continue
      const mfd = new FormData()
      mfd.set('incident_id', incident.id)
      mfd.set('external_department_name', ma.department_name)
      mfd.set('role', 'received_aid')
      mfd.set('apparatus_description', ma.apparatus_description || '')
      mfd.set('personnel_count', ma.personnel_count ? String(ma.personnel_count) : '')
      mfd.set('arrival_time', ma.arrival_time || '')
      mfd.set('departure_time', ma.departure_time || '')
      mfd.set('notes', '')
      await addMutualAid(mfd)
    }

    setImportSuccess(true)
    setIsParsing(false)
    router.refresh()
  }

  async function handleEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setEditError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('neris_reported', nerisReported ? 'true' : 'false')
    startTransition(async () => {
      const result = await updateIncident(incident.id, fd)
      if (result?.error) { setEditError(result.error); return }
      setEditing(false)
      setImportedData(null)
      setImportSuccess(false)
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

  async function handleSelfLog() {
    setSelfLogError(null)
    startTransition(async () => {
      const result = await logIncidentAttendance(incident.id, selfLogRole)
      if (result?.error) { setSelfLogError(result.error); return }
      setConfirmingLog(false)
      router.refresh()
    })
  }

  async function handleGenerateCheckinQr() {
    const result = await generateCheckinToken('incident', incident.id)
    if (result.error || !result.token) { setSelfLogError(result.error ?? 'Failed to generate check-in QR.'); return }
    const params = new URLSearchParams({ type: 'checkin', code: result.token, title: `Incident ${incident.incident_number ?? ''}`.trim() })
    window.open(`/print/qr?${params.toString()}`, '_blank')
  }

  async function handleVerifyPersonnel(logId: string, status: 'present' | 'absent') {
    startTransition(async () => {
      await verifyIncidentPersonnel(logId, incident.id, status, status === 'absent' ? rejectReason : undefined)
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

  function startPersonnelEdit(personnel: PersonnelRow) {
    setPersonnelEditError(null)
    setEditingPersonnelId(personnel.id)
    setEditingPersonnel({
      apparatus_id: personnel.apparatus_id ?? '',
      role: personnel.role || 'crew',
    })
  }

  async function handleUpdatePersonnel(logId: string) {
    const fd = new FormData()
    fd.set('apparatus_id', editingPersonnel.apparatus_id)
    fd.set('role', editingPersonnel.role)
    startTransition(async () => {
      const result = await updateIncidentPersonnel(logId, incident.id, fd)
      if (result?.error) {
        setPersonnelEditError(result.error)
        return
      }
      setEditingPersonnelId(null)
      setPersonnelEditError(null)
      router.refresh()
    })
  }

  async function handleAddMutualAid(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMutualAidError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('incident_id', incident.id)
    startTransition(async () => {
      const result = await addMutualAid(fd)
      if (result?.error) { setMutualAidError(result.error); return }
      setShowAddMutualAid(false)
      router.refresh()
    })
  }

  async function handleRemoveMutualAid(mutualAidId: string) {
    startTransition(async () => {
      await removeMutualAid(mutualAidId, incident.id)
      router.refresh()
    })
  }

  const alreadyAddedApparatusIds = new Set(incidentApparatus.map(a => a.apparatus_id))
  const alreadyAddedPersonnelIds = new Set(incidentPersonnel.map(p => p.personnel_id))
  const currentEditingPersonnel = incidentPersonnel.find(p => p.id === editingPersonnelId)

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-zinc-900">
              {incident.incident_number || incident.cad_number || 'Incident Report'}
            </h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isFinalized ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {isFinalized ? 'Finalized' : 'Pending Review'}
            </span>
          </div>
          <p className="text-sm text-zinc-500 mt-0.5">{formatDate(incident.incident_date)}</p>
        </div>
        <div className="flex gap-2 shrink-0">
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
      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={() => router.push('/incidents')} className="rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-sm">← Back</button>
        <Link href={`/incidents/${incident.id}/accountability`} className="rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-sm">
          Accountability
        </Link>
        <a href={`/print/run-sheet?id=${incident.id}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-sm">
          Print Run Sheet
        </a>
        {canEdit && (
          <label className={`relative cursor-pointer rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium transition-colors shadow-sm ${isParsing ? 'text-zinc-400 cursor-not-allowed' : 'text-zinc-700 hover:bg-zinc-50 cursor-pointer'}`}>
            {isParsing ? 'Reading PDF…' : 'Import Run Sheet'}
            <input type="file" accept=".pdf,application/pdf" className="sr-only" onChange={handleImport} disabled={isParsing} />
          </label>
        )}
        {importSuccess && <span className="self-center text-xs font-medium text-green-700">✓ Run sheet applied</span>}
        {importError && <span className="self-center text-xs text-red-600">{importError}</span>}
        {isOfficerOrAbove && moduleNeris && (
          <Link
            href={`/incidents/${incident.id}/neris`}
            className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors shadow-sm inline-flex items-center gap-2"
          >
            <span>NERIS Report</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              nerisRecord?.neris_status === 'submitted' ? 'bg-green-100 text-green-700' :
              nerisRecord?.completed_at ? 'bg-blue-200 text-blue-800' :
              nerisRecord ? 'bg-amber-100 text-amber-700' :
              'bg-zinc-200 text-zinc-500'
            }`}>
              {nerisRecord?.neris_status === 'submitted' ? '✓ Submitted' :
               nerisRecord?.completed_at ? 'Complete' :
               nerisRecord ? 'In Progress' :
               'Not Started'}
            </span>
            <span>→</span>
          </Link>
        )}
      </div>

      {/* Edit form */}
      {editing ? (
        <form key={formKey} onSubmit={handleEditSubmit} className="space-y-6">
          {editError && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{editError}</div>}

          {/* Run sheet re-import */}
          <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-700">Re-import from Run Sheet</p>
              <p className="text-xs text-zinc-400">Upload an updated CFS PDF to overwrite form fields</p>
            </div>
            <label className={`relative cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors shrink-0 ${isParsing ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed' : 'bg-red-700 text-white hover:bg-red-800'}`}>
              {isParsing ? 'Reading PDF…' : 'Upload PDF'}
              <input type="file" accept=".pdf,application/pdf" className="sr-only" onChange={handleImport} disabled={isParsing} />
            </label>
            {importSuccess && <p className="w-full text-xs text-green-700 font-medium">Form updated from run sheet — review and save</p>}
            {importError && <p className="w-full text-xs text-red-600">{importError}</p>}
          </div>

          <section className="rounded-xl bg-white border border-zinc-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-900">Incident Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Incident #</label>
                <input name="incident_number" type="text" defaultValue={importedData?.incident_number ?? incident.incident_number ?? ''} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>CAD #</label>
                <input name="cad_number" type="text" defaultValue={importedData?.cad_number ?? incident.cad_number ?? ''} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Date <span className="text-red-600">*</span></label>
                <input name="incident_date" type="date" required defaultValue={importedData?.incident_date ?? incident.incident_date} className={inputCls} />
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
            <AddressFields
              address={importedData?.address ?? incident.address ?? ''}
              city={importedData?.city ?? incident.city ?? ''}
              state={importedData?.state ?? incident.state ?? ''}
              zip={importedData?.zip ?? incident.zip ?? ''}
            />
            <div>
              <label className={labelCls}>Disposition</label>
              <input name="disposition" type="text" defaultValue={importedData?.disposition ?? incident.disposition ?? ''} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Narrative</label>
              <textarea name="narrative" rows={3} defaultValue={importedData?.narrative ?? incident.narrative ?? ''} className={inputCls} />
            </div>
            {!moduleNeris && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="edit_neris" checked={nerisReported} onChange={e => setNerisReported(e.target.checked)} className="rounded border-zinc-300 text-red-600 focus:ring-red-500" />
                <label htmlFor="edit_neris" className="text-sm text-zinc-700">Reported to NERIS</label>
              </div>
            )}
          </section>

          <section className="rounded-xl bg-white border border-zinc-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-900">Incident Times</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[
                { name: 'call_time', label: 'Call Time', val: importedData?.call_time ?? incident.call_time },
                { name: 'paged_at', label: 'Paged', val: importedData?.paged_at ?? incident.paged_at },
                { name: 'first_on_scene_at', label: 'First On Scene', val: importedData?.first_on_scene_at ?? incident.first_on_scene_at },
                { name: 'last_leaving_scene_at', label: 'Last Leaving Scene', val: importedData?.last_leaving_scene_at ?? incident.last_leaving_scene_at },
                { name: 'in_service_at', label: 'In Service', val: importedData?.in_service_at ?? incident.in_service_at },
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
            <button type="button" onClick={() => { setEditing(false); setEditError(null); setImportedData(null); setImportSuccess(false); setImportError(null) }} className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100">
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
              {(incident.address || incident.city) && (
                <div className="col-span-2">
                  <p className="text-zinc-400 text-xs">Address</p>
                  <p className="text-zinc-800 font-medium">
                    {[incident.address, incident.city, incident.state && incident.zip ? `${incident.state} ${incident.zip}` : (incident.state || incident.zip)].filter(Boolean).join(', ')}
                  </p>
                </div>
              )}
              {incident.mutual_aid_direction && <div><p className="text-zinc-400 text-xs">Mutual Aid</p><p className="text-zinc-800 font-medium capitalize">{incident.mutual_aid_direction} — {incident.mutual_aid_department}</p></div>}
              {incident.disposition && <div className="col-span-2"><p className="text-zinc-400 text-xs">Disposition</p><p className="text-zinc-800 font-medium">{incident.disposition}</p></div>}
              {incident.narrative && <div className="col-span-2"><p className="text-zinc-400 text-xs">Narrative</p><p className="text-zinc-700">{incident.narrative}</p></div>}
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
                { label: 'First Enroute', val: incidentApparatus.map(a => a.enroute_at).filter(Boolean).sort()[0] ?? incident.first_enroute_at },
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
            <button onClick={() => {
              setNewApparatus({
                apparatus_id: '',
                role: 'primary',
                paged_at: toDatetimeLocal(incident.paged_at),
                enroute_at: '',
                on_scene_at: toDatetimeLocal(incident.first_on_scene_at),
                leaving_scene_at: toDatetimeLocal(incident.last_leaving_scene_at),
                available_at: toDatetimeLocal(incident.in_service_at),
              })
              setShowAddApparatus(true)
            }} className="text-xs font-semibold text-red-700 hover:underline">+ Add</button>
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

      {/* Mutual Aid section */}
      {isOfficerOrAbove && (
        <section className="rounded-xl bg-white border border-zinc-200 p-5 mt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-900">Mutual Aid</h2>
            {canEdit && (
              <button onClick={() => { setShowAddMutualAid(true); setMutualAidError(null) }} className="text-xs font-semibold text-red-700 hover:underline">+ Add</button>
            )}
          </div>

          {mutualAid.length === 0 && !showAddMutualAid && (
            <p className="text-sm text-zinc-400">No mutual aid logged.</p>
          )}

          <div className="space-y-2 mb-2">
            {mutualAid.map(m => (
              <div key={m.id} className="rounded-lg border border-zinc-200 bg-zinc-50 text-sm">
                {editingMutualAidId === m.id ? (
                  <form
                    onSubmit={async e => {
                      e.preventDefault()
                      const fd = new FormData(e.currentTarget)
                      fd.set('incident_id', incident.id)
                      const result = await updateMutualAid(m.id, fd)
                      if (result?.error) setMutualAidError(result.error)
                      else setEditingMutualAidId(null)
                    }}
                    className="p-4 space-y-3"
                  >
                    {mutualAidError && <p className="text-xs text-red-600">{mutualAidError}</p>}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Department Name <span className="text-red-600">*</span></label>
                        <input name="external_department_name" required defaultValue={m.external_department_name} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Role <span className="text-red-600">*</span></label>
                        <select name="role" defaultValue={m.role} className={inputCls}>
                          <option value="gave_aid">We Gave Aid</option>
                          <option value="received_aid">We Received Aid</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Apparatus</label>
                        <input name="apparatus_description" defaultValue={m.apparatus_description ?? ''} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Personnel Count</label>
                        <input name="personnel_count" type="number" min="0" defaultValue={m.personnel_count ?? ''} className={inputCls} />
                      </div>
                    </div>
                    {incidentTimes.length > 0 && (
                      <div className="rounded-lg bg-white border border-zinc-200 px-3 py-2">
                        <p className="text-xs text-zinc-400 mb-1.5">Fill from incident times:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {incidentTimes.map(t => (
                            <div key={t.label} className="flex items-center gap-1">
                              <span className="text-xs text-zinc-500">{t.label}</span>
                              <button type="button" onClick={() => { const el = (document.querySelector(`[data-edit-arrival="${m.id}"]`) as HTMLInputElement); if (el) el.value = t.value }} className="text-xs text-red-700 hover:underline">→ Arrival</button>
                              <button type="button" onClick={() => { const el = (document.querySelector(`[data-edit-departure="${m.id}"]`) as HTMLInputElement); if (el) el.value = t.value }} className="text-xs text-zinc-500 hover:underline">→ Departure</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Arrival Time</label>
                        <input name="arrival_time" type="datetime-local" data-edit-arrival={m.id} defaultValue={m.arrival_time ? m.arrival_time.slice(0, 16) : ''} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Departure Time</label>
                        <input name="departure_time" type="datetime-local" data-edit-departure={m.id} defaultValue={m.departure_time ? m.departure_time.slice(0, 16) : ''} className={inputCls} />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Notes</label>
                      <input name="notes" defaultValue={m.notes ?? ''} className={inputCls} />
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" disabled={isPending} className="rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">Save</button>
                      <button type="button" onClick={() => setEditingMutualAidId(null)} className="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${m.role === 'gave_aid' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {m.role === 'gave_aid' ? 'Gave Aid' : 'Received Aid'}
                        </span>
                        <span className="font-medium text-zinc-800">{m.external_department_name}</span>
                      </div>
                      {canEdit && (
                        <div className="flex gap-3">
                          <button onClick={() => { setEditingMutualAidId(m.id); setMutualAidError(null) }} className="text-xs text-zinc-500 hover:text-zinc-800">Edit</button>
                          <button onClick={() => handleRemoveMutualAid(m.id)} disabled={isPending} className="text-xs text-red-600 hover:underline disabled:opacity-50">Remove</button>
                        </div>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                      {m.apparatus_description && <span>Apparatus: {m.apparatus_description}</span>}
                      {m.personnel_count != null && <span>Personnel: {m.personnel_count}</span>}
                      {m.arrival_time && <span>Arrived: {formatDT(m.arrival_time)}</span>}
                      {m.departure_time && <span>Departed: {formatDT(m.departure_time)}</span>}
                      {m.notes && <span className="col-span-2">{m.notes}</span>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {showAddMutualAid && canEdit && (
            <form onSubmit={handleAddMutualAid} className="rounded-lg border border-zinc-200 p-4 space-y-3 bg-zinc-50">
              {mutualAidError && <p className="text-xs text-red-600">{mutualAidError}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Department Name <span className="text-red-600">*</span></label>
                  <input name="external_department_name" required placeholder="e.g. Flagstaff Fire" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Role <span className="text-red-600">*</span></label>
                  <select name="role" className={inputCls}>
                    <option value="gave_aid">We Gave Aid</option>
                    <option value="received_aid">We Received Aid</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Apparatus Sent/Received</label>
                  <input name="apparatus_description" placeholder="e.g. Engine 1, Tanker 2" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Personnel Count</label>
                  <input name="personnel_count" type="number" min="0" className={inputCls} />
                </div>
              </div>
              {incidentTimes.length > 0 && (
                <div className="rounded-lg bg-white border border-zinc-200 px-3 py-2">
                  <p className="text-xs text-zinc-400 mb-1.5">Fill from incident times:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {incidentTimes.map(t => (
                      <div key={t.label} className="flex items-center gap-1">
                        <span className="text-xs text-zinc-500">{t.label}</span>
                        <button type="button" onClick={() => setAddArrivalTime(t.value)} className="text-xs text-red-700 hover:underline">→ Arrival</button>
                        <button type="button" onClick={() => setAddDepartureTime(t.value)} className="text-xs text-zinc-500 hover:underline">→ Departure</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Arrival Time</label>
                  <input name="arrival_time" type="datetime-local" value={addArrivalTime} onChange={e => setAddArrivalTime(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Departure Time</label>
                  <input name="departure_time" type="datetime-local" value={addDepartureTime} onChange={e => setAddDepartureTime(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <input name="notes" className={inputCls} />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={isPending} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">Add</button>
                <button type="button" onClick={() => { setShowAddMutualAid(false); setAddArrivalTime(''); setAddDepartureTime('') }} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100">Cancel</button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Personnel section */}
      <section className="rounded-xl bg-white border border-zinc-200 p-5 mt-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-900">Personnel on Scene</h2>
          <div className="flex items-center gap-3">
            {isOfficerOrAbove && (
              <button onClick={handleGenerateCheckinQr} className="text-xs font-semibold text-blue-600 hover:text-blue-800">Check-In QR</button>
            )}
            {isOfficerOrAbove && canEdit && (
              <button onClick={() => setShowAddPersonnel(true)} className="text-xs font-semibold text-red-700 hover:underline">+ Add member</button>
            )}
          </div>
        </div>

        {/* Self-log */}
        {!alreadyOnIncident && (
          <div className="mb-4">
            {alreadyOnIncident ? (
              <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-2.5 text-sm text-zinc-600">
                Your attendance: <span className={`font-semibold ml-1 ${
                  incidentPersonnel.find(p => p.personnel_id === myPersonnelId)?.status === 'present' ? 'text-green-700' :
                  incidentPersonnel.find(p => p.personnel_id === myPersonnelId)?.status === 'absent' ? 'text-red-700' :
                  'text-yellow-700'}`}>
                  {incidentPersonnel.find(p => p.personnel_id === myPersonnelId)?.status === 'present' ? 'Present' :
                   incidentPersonnel.find(p => p.personnel_id === myPersonnelId)?.status === 'absent' ? 'Absent' : 'Pending verification'}
                </span>
              </div>
            ) : confirmingLog ? (
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 flex flex-wrap items-center gap-3">
                <span className="text-sm text-blue-800 font-medium">Log your attendance as:</span>
                <select
                  value={selfLogRole}
                  onChange={e => setSelfLogRole(e.target.value)}
                  className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900">
                  <option value="crew">Crew</option>
                  <option value="driver">Driver</option>
                  <option value="officer">Officer</option>
                  <option value="ems">EMS</option>
                  <option value="standby">Standby at Station</option>
                  <option value="other">Other</option>
                </select>
                <button onClick={handleSelfLog} disabled={isPending} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">Confirm</button>
                <button onClick={() => { setConfirmingLog(false); setSelfLogError(null) }} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">Cancel</button>
                {selfLogError && <p className="w-full text-xs text-red-600">{selfLogError}</p>}
              </div>
            ) : (
              <button
                onClick={() => setConfirmingLog(true)}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">
                Log Attendance
              </button>
            )}
          </div>
        )}

        {/* Officer verification queue */}
        {isOfficerOrAbove && pendingPersonnel.length > 0 && (
          <div className="mb-4 rounded-lg bg-yellow-50 border border-yellow-200 p-4">
            <p className="text-xs font-semibold text-yellow-800 mb-3">{pendingPersonnel.length} pending verification</p>
            {pendingPersonnel.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-yellow-100 last:border-0">
                <div>
                  <p className="text-sm font-semibold text-zinc-800">{p.name}</p>
                  <p className="text-xs text-zinc-500 uppercase">{ROLE_LABELS[p.role]}{p.apparatus_unit ? ` · ${p.apparatus_unit}` : p.role === 'standby' ? ' · Station' : ' · POV'}</p>
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
                      <button onClick={() => handleVerifyPersonnel(p.id, 'absent')} className="text-xs font-semibold text-red-700 hover:underline">Confirm Reject</button>
                      <button onClick={() => { setRejectingId(null); setRejectReason('') }} className="text-xs text-zinc-500 hover:text-zinc-700">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button onClick={() => handleVerifyPersonnel(p.id, 'present')} disabled={isPending} className="text-xs font-semibold text-green-700 hover:underline disabled:opacity-50">Approve</button>
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

        {currentEditingPersonnel && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3 mb-3">
            <div>
              <p className="text-sm font-semibold text-zinc-800">Edit {currentEditingPersonnel.name}</p>
              <p className="text-xs text-zinc-500">Change role or move this member between POV and an assigned unit.</p>
            </div>
            {personnelEditError && <p className="text-xs text-red-600">{personnelEditError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Role</label>
                <select value={editingPersonnel.role} onChange={e => setEditingPersonnel(prev => ({ ...prev, role: e.target.value }))} className={inputCls}>
                  <option value="ic">IC</option>
                  <option value="driver">Driver</option>
                  <option value="officer">Officer</option>
                  <option value="crew">Crew</option>
                  <option value="ems">EMS</option>
                  <option value="standby">Standby at Station</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Apparatus</label>
                <select value={editingPersonnel.apparatus_id} onChange={e => setEditingPersonnel(prev => ({ ...prev, apparatus_id: e.target.value }))} className={inputCls}>
                  <option value="">POV / Not on apparatus</option>
                  {incidentApparatus.map(a => (
                    <option key={a.apparatus_id} value={a.apparatus_id}>{a.unit_number}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => handleUpdatePersonnel(currentEditingPersonnel.id)} disabled={isPending} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">Save</button>
              <button type="button" onClick={() => { setEditingPersonnelId(null); setPersonnelEditError(null) }} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100">Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {incidentPersonnel.filter(p => p.status !== 'pending').map(p => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 bg-zinc-50">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-zinc-800">{p.name}</p>
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${p.status === 'present' ? 'bg-green-100 text-green-700' : p.status === 'absent' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {p.status === 'present' ? 'Present' : p.status === 'absent' ? 'Absent' : 'Pending'}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 uppercase">{ROLE_LABELS[p.role]}{p.apparatus_unit ? ` · ${p.apparatus_unit}` : p.role === 'standby' ? ' · Station' : ' · POV'}</p>
                {p.rejection_reason && <p className="text-xs text-red-600 mt-0.5">Reason: {p.rejection_reason}</p>}
              </div>
              {isOfficerOrAbove && canEdit && (
                <div className="flex gap-3">
                  <button onClick={() => startPersonnelEdit(p)} disabled={isPending} className="text-xs text-zinc-500 hover:text-zinc-700 disabled:opacity-50">Edit</button>
                  <button onClick={() => handleRemovePersonnel(p.id)} disabled={isPending} className="text-xs text-red-600 hover:underline disabled:opacity-50">Remove</button>
                </div>
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
                  <option value="standby">Standby at Station</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Apparatus <span className="text-zinc-400 font-normal">(leave blank = POV or station staging)</span></label>
              <select value={newPersonnel.apparatus_id} onChange={e => setNewPersonnel(p => ({ ...p, apparatus_id: e.target.value }))} className={inputCls}>
                <option value="">POV / Station (no apparatus)</option>
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

      {/* Signatures — officer/admin view */}
      {isOfficerOrAbove && signatureRoster.length > 0 && (
        <section className="mt-6 rounded-xl bg-white border border-zinc-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-900">Run Signatures</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {signatureRoster.filter(s => s.signed_at).length} of {signatureRoster.length} signed
              </p>
            </div>
            {signatureRoster.some(s => !s.signed_at) && (
              <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs font-medium">
                {signatureRoster.filter(s => !s.signed_at).length} pending
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {signatureRoster.map(s => (
              <div key={s.sig_id} className="flex items-center justify-between gap-3 py-2 border-b border-zinc-100 last:border-0">
                <p className="text-sm font-medium text-zinc-800">{s.name}</p>
                {s.signed_at ? (
                  <div className="text-right shrink-0">
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium">
                      ✓ Signed
                    </span>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {new Date(s.signed_at).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                ) : (
                  <span className="shrink-0 rounded-full bg-zinc-100 text-zinc-500 px-2 py-0.5 text-xs font-medium">
                    Pending
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
