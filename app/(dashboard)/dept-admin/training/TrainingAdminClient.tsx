'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createCertificationType, updateCertificationType,
  createCourseUnit, updateCourseUnit,
  enrollMember, enrollAllMembers, updateEnrollmentStatus, deleteEnrollment,
  verifyProgress, verifyTrainingAttendance,
  verifyEnrollmentSession,
  createTrainingEvent, logTrainingAttendance,
  createDirectCertification, updateMemberCertification,
  cancelTrainingEvent,
  reviewTrainingSubmission,
} from '@/app/actions/training'
import { formatLocalDateTime } from '@/lib/format-datetime'
import HelpText from '@/components/HelpText'

const inputCls = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
const checkCls = "rounded border-zinc-300 text-red-600 focus:ring-red-500"

type Tab = 'certs' | 'enrollments' | 'pending' | 'events' | 'member_certs'

interface CertType { id: string; cert_name: string; issuing_body: string | null; does_expire: boolean; expiration_interval_months: number | null; is_structured_course: boolean; show_on_run_report: boolean; active: boolean }
interface Unit { id: string; certification_type_id: string; unit_title: string; unit_description: string | null; required_hours: number | null; sort_order: number; active: boolean }
interface Enrollment { id: string; personnel_id: string; certification_type_id: string; status: string; enrolled_at: string; name: string }
interface PendingProgress { id: string; enrollment_id: string; unit_id: string; personnel_id: string; hours_submitted: number | null; completed_date: string | null; notes: string | null; status: string; submitted_at: string; name: string }
interface PendingSession { id: string; personnel_id: string; certification_type_id: string; training_date: string | null; session_logged_at: string | null; name: string }
interface Personnel { id: string; name: string }
interface PendingAttendance { id: string; personnel_id: string; name: string; submitted_at: string }
interface MemberCert { id: string; personnel_id: string; name: string; cert_name: string; issuing_body: string | null; cert_number: string | null; issued_date: string | null; expiration_date: string | null; source: string | null; notes: string | null; active: boolean }
interface TrainingSubmission {
  id: string; personnel_id: string; member_name: string; topic: string; course_date: string
  hours: number; provider: string | null; location: string | null; notes: string | null
  document_url: string | null; purpose: string | null; nremt_category: string | null
  status: string; submitted_at: string; reviewer_notes: string | null
}

interface TrainingEvent {
  id: string; event_date: string; start_time: string | null; topic: string
  hours: number | null; location: string | null; description: string | null; instructor: string | null
  requires_verification: boolean; verified_count: number; signed_count: number
  event_instance_id: string | null
  pending_attendance: PendingAttendance[]
  all_attendance: { id: string; personnel_id: string; name: string; status: string; signed_at: string | null }[]
}

export default function TrainingAdminClient({
  certTypes, units, enrollments, pendingProgress, pendingSessions, allPersonnel, trainingEvents, linkedEventTitles = {}, memberCerts, submissions = [], isAdmin, departmentId, departmentTimezone,
}: {
  certTypes: CertType[]; units: Unit[]; enrollments: Enrollment[]
  pendingProgress: PendingProgress[]; pendingSessions: PendingSession[]
  allPersonnel: Personnel[]
  trainingEvents: TrainingEvent[]
  linkedEventTitles?: Record<string, string>
  memberCerts: MemberCert[]
  submissions?: TrainingSubmission[]
  isAdmin: boolean
  departmentId: string
  departmentTimezone: string
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(isAdmin ? 'certs' : 'member_certs')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Cert type state
  const [showCertForm, setShowCertForm] = useState(false)
  const [editingCertId, setEditingCertId] = useState<string | null>(null)
  const [expandedCertId, setExpandedCertId] = useState<string | null>(null)
  const [addingUnitToCertId, setAddingUnitToCertId] = useState<string | null>(null)
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null)
  const [newCertExpires, setNewCertExpires] = useState(false)
  const [newCertCourse, setNewCertCourse] = useState(false)

  // Enrollment state
  const [showEnrollForm, setShowEnrollForm] = useState(false)
  const [enrollMode, setEnrollMode] = useState<'course' | 'direct'>('course')
  const [enrollAll, setEnrollAll] = useState(false)
  const [directCertExpires, setDirectCertExpires] = useState(false)

  // Enrollment filter
  const [showActiveEnrollmentsOnly, setShowActiveEnrollmentsOnly] = useState(true)

  // Member cert edit state
  const [editingMemberCertId, setEditingMemberCertId] = useState<string | null>(null)

  // Reject state — course progress
  const [rejectingProgressId, setRejectingProgressId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Reject state — training attendance
  const [rejectingAttendanceId, setRejectingAttendanceId] = useState<string | null>(null)
  const [rejectAttendanceReason, setRejectAttendanceReason] = useState('')

  // Training events state
  const [showEventForm, setShowEventForm] = useState(false)
  const [requiresVerification, setRequiresVerification] = useState(true)
  const [logAttendanceEventId, setLogAttendanceEventId] = useState<string | null>(null)
  const [attendanceSelected, setAttendanceSelected] = useState<Set<string>>(new Set())

  // Submission review state
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null)

  function reset() { setError(null); setSuccess(null) }

  async function wrap(fn: () => Promise<any>) {
    reset(); setLoading(true)
    const r = await fn()
    if (r?.error) setError(r.error)
    else if (r?.success) router.refresh()
    setLoading(false)
    return r
  }

  const unitsByCert = units.reduce<Record<string, Unit[]>>((acc, u) => {
    if (!acc[u.certification_type_id]) acc[u.certification_type_id] = []
    acc[u.certification_type_id].push(u)
    return acc
  }, {})

  const pendingByCert = pendingProgress.reduce<Record<string, PendingProgress[]>>((acc, p) => {
    const enrollment = enrollments.find(e => e.id === p.enrollment_id)
    if (!enrollment) return acc
    if (!acc[enrollment.certification_type_id]) acc[enrollment.certification_type_id] = []
    acc[enrollment.certification_type_id].push(p)
    return acc
  }, {})

  const totalPending = pendingProgress.length + pendingSessions.length
  const totalPendingAttendance = trainingEvents.reduce((sum, e) => sum + e.pending_attendance.length, 0)

  const pendingSubmissions = submissions.filter(s => s.status === 'pending').length
  const totalPendingAll = totalPending + pendingSubmissions
  const ALL_TABS: { key: Tab; label: string; adminOnly?: boolean }[] = [
    { key: 'member_certs', label: 'Member Certs' },
    { key: 'certs',        label: 'Cert Types',   adminOnly: true },
    { key: 'enrollments',  label: 'Enrollments',  adminOnly: true },
    { key: 'pending',      label: totalPendingAll > 0 ? `Pending (${totalPendingAll})` : 'Pending', adminOnly: true },
    { key: 'events',       label: totalPendingAttendance > 0 ? `Events (${totalPendingAttendance})` : 'Events', adminOnly: true },
  ]
  const TABS = ALL_TABS.filter(t => !t.adminOnly || isAdmin)

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Training</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{departmentId && 'Cert types, enrollments, and training events'}</p>
      </div>

      <HelpText className="mb-4">
        Create cert types here, then assign them to members (individually or dept-wide) to enroll them. Outside
        training submissions from members show under the Submissions tab, pending your approval.
      </HelpText>

      {success && <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-200">{success}</div>}
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}

      {/* Mobile tabs */}
      <div className="md:hidden flex gap-2 overflow-x-auto pb-2 mb-4">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); reset() }}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-red-700 text-white' : 'bg-white border border-zinc-200 text-zinc-600 hover:border-red-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-6 items-start">
        {/* Left tab rail — desktop */}
        <div className="hidden md:flex flex-col w-44 shrink-0 gap-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); reset() }}
              className={`rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-red-700 text-white' : 'text-zinc-600 hover:bg-zinc-100'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-w-0">

      {/* ── MEMBER CERTS ────────────────────────────────────────────────────── */}
      {tab === 'member_certs' && (
        <div>
          <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
            {memberCerts.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-zinc-400">No certifications on record.</div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {memberCerts.map(cert => (
                  <div key={cert.id}>
                    {isAdmin && editingMemberCertId === cert.id ? (
                      <div className="p-4">
                        <form action={async (fd) => { const r = await wrap(() => updateMemberCertification(fd)); if (!r?.error) setEditingMemberCertId(null) }} className="flex flex-col gap-3">
                          <input type="hidden" name="id" value={cert.id} />
                          <div className="text-xs font-semibold text-zinc-500">{cert.name}</div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-600">Cert Name *</label>
                            <input name="cert_name" required defaultValue={cert.cert_name} className={inputCls} />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-600">Issuing Body</label>
                            <input name="issuing_body" defaultValue={cert.issuing_body ?? ''} className={inputCls} />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-600">Cert Number</label>
                            <input name="cert_number" defaultValue={cert.cert_number ?? ''} className={inputCls} />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-600">Issued Date</label>
                            <input name="issued_date" type="date" defaultValue={cert.issued_date ?? ''} className={inputCls} />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-600">Expiration Date</label>
                            <input name="expiration_date" type="date" defaultValue={cert.expiration_date ?? ''} className={inputCls} />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-600">Notes</label>
                            <input name="notes" defaultValue={cert.notes ?? ''} placeholder="Optional" className={inputCls} />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-600">Status</label>
                            <select name="active" defaultValue={cert.active ? 'true' : 'false'} className={inputCls}>
                              <option value="true">Active</option>
                              <option value="false">Inactive</option>
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{loading ? '...' : 'Save'}</button>
                            <button type="button" onClick={() => setEditingMemberCertId(null)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">Cancel</button>
                          </div>
                        </form>
                      </div>
                    ) : (
                      <div className="flex items-center px-5 py-4 gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-zinc-900">{cert.name}</p>
                          <p className="text-sm text-zinc-700">{cert.cert_name}</p>
                          <div className="flex gap-3 text-xs text-zinc-400 mt-0.5 flex-wrap">
                            {cert.issuing_body && <span>{cert.issuing_body}</span>}
                            {cert.cert_number && <span>#{cert.cert_number}</span>}
                            {cert.issued_date && <span>Issued: {new Date(cert.issued_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                            {cert.expiration_date && <span>Exp: {new Date(cert.expiration_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                            {cert.source && <span className="capitalize">{cert.source.replace('_', ' ')}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {!cert.active && <span className="text-xs text-zinc-300">Inactive</span>}
                          {isAdmin && (
                            <button onClick={() => { setEditingMemberCertId(cert.id); reset() }} className="text-xs font-semibold text-red-600 hover:text-red-800">Edit</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CERT TYPES ─────────────────────────────────────────────────────── */}
      {tab === 'certs' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setShowCertForm(!showCertForm); reset() }}
              className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
              {showCertForm ? 'Cancel' : '+ Add Cert Type'}
            </button>
          </div>

          {showCertForm && (
            <div className="mb-5 rounded-xl bg-white p-5 shadow-sm border border-zinc-200">
              <h2 className="text-sm font-semibold text-zinc-700 mb-4">Add Certification Type</h2>
              <form action={async (fd) => { const r = await wrap(() => createCertificationType(fd)); if (!r?.error) setShowCertForm(false) }} className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <div className="flex-1"><label className="mb-1 block text-xs font-medium text-zinc-600">Cert Name *</label><input name="cert_name" required className={inputCls} placeholder="FF1" /></div>
                  <div className="flex-1"><label className="mb-1 block text-xs font-medium text-zinc-600">Issuing Body</label><input name="issuing_body" className={inputCls} placeholder="NE State Fire Marshal" /></div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className={checkCls} checked={newCertExpires} onChange={e => setNewCertExpires(e.target.checked)} />
                    <span className="text-sm text-zinc-700">Does this certification expire?</span>
                  </label>
                  {newCertExpires && (
                    <div className="ml-6">
                      <label className="mb-1 block text-xs font-medium text-zinc-600">Expiration interval (months)</label>
                      <input name="expiration_interval_months" type="number" min="1" className="w-32 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none" placeholder="24" />
                    </div>
                  )}
                  <input type="hidden" name="does_expire" value={newCertExpires ? 'true' : 'false'} />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className={checkCls} checked={newCertCourse} onChange={e => setNewCertCourse(e.target.checked)} />
                    <span className="text-sm text-zinc-700">Structured course with chapters/units?</span>
                  </label>
                  <input type="hidden" name="is_structured_course" value={newCertCourse ? 'true' : 'false'} />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="show_on_run_report" value="true" className={checkCls} />
                    <span className="text-sm text-zinc-700">Show on run report</span>
                    <span className="text-xs text-zinc-400">— displays this cert next to the member&apos;s name on incident run sheets</span>
                  </label>
                </div>
                <button type="submit" disabled={loading} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{loading ? '...' : 'Add'}</button>
              </form>
            </div>
          )}

          <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
            {certTypes.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-zinc-400">No certification types yet.</div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {certTypes.map(cert => {
                  const certUnits = unitsByCert[cert.id] ?? []
                  const isExpanded = expandedCertId === cert.id
                  return (
                    <div key={cert.id}>
                      {editingCertId === cert.id ? (
                        <div className="p-4">
                          <form action={async (fd) => { const r = await wrap(() => updateCertificationType(fd)); if (!r?.error) setEditingCertId(null) }} className="flex flex-col gap-3">
                            <input type="hidden" name="id" value={cert.id} />
                            <div className="flex gap-3">
                              <div className="flex-1"><input name="cert_name" required defaultValue={cert.cert_name} className={inputCls} /></div>
                              <div className="flex-1"><input name="issuing_body" defaultValue={cert.issuing_body ?? ''} className={inputCls} placeholder="Issuing body" /></div>
                            </div>
                            <div className="flex gap-4 flex-wrap">
                              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="does_expire" value="true" defaultChecked={cert.does_expire} className={checkCls} /><span className="text-sm text-zinc-700">Expires</span></label>
                              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="is_structured_course" value="true" defaultChecked={cert.is_structured_course} className={checkCls} /><span className="text-sm text-zinc-700">Structured course</span></label>
                              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="show_on_run_report" value="true" defaultChecked={cert.show_on_run_report} className={checkCls} /><span className="text-sm text-zinc-700">Show on run report</span></label>
                            </div>
                            {cert.does_expire && <input name="expiration_interval_months" type="number" defaultValue={cert.expiration_interval_months ?? ''} className="w-32 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none" placeholder="Months" />}
                            <select name="active" defaultValue={cert.active ? 'true' : 'false'} className={inputCls}><option value="true">Active</option><option value="false">Inactive</option></select>
                            <div className="flex gap-2">
                              <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{loading ? '...' : 'Save'}</button>
                              <button type="button" onClick={() => setEditingCertId(null)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">Cancel</button>
                            </div>
                          </form>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center px-5 py-4">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-zinc-900">{cert.cert_name}</p>
                              <div className="flex gap-2 text-xs text-zinc-400 mt-0.5 flex-wrap">
                                {cert.issuing_body && <span>{cert.issuing_body}</span>}
                                {cert.does_expire && <span>Expires: {cert.expiration_interval_months}mo</span>}
                                {cert.is_structured_course && <span className="text-blue-500">Structured course</span>}
                                {!cert.active && <span className="text-zinc-300">Inactive</span>}
                              </div>
                            </div>
                            <div className="flex gap-3 items-center">
                              {cert.is_structured_course && <span className="text-xs text-zinc-400">{certUnits.filter(u => u.active).length} units</span>}
                              {cert.is_structured_course && (
                                <button onClick={() => setExpandedCertId(isExpanded ? null : cert.id)} className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                                  {isExpanded ? 'Hide' : 'Units'}
                                </button>
                              )}
                              <button onClick={() => { setEditingCertId(cert.id); reset() }} className="text-xs font-semibold text-red-600 hover:text-red-800">Edit</button>
                            </div>
                          </div>

                          {isExpanded && cert.is_structured_course && (
                            <div className="border-t border-zinc-100 bg-zinc-50 px-5 py-4">
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">Course Units</p>
                                <button onClick={() => setAddingUnitToCertId(addingUnitToCertId === cert.id ? null : cert.id)} className="text-xs font-semibold text-red-600 hover:text-red-800">
                                  {addingUnitToCertId === cert.id ? 'Cancel' : '+ Add Unit'}
                                </button>
                              </div>
                              {addingUnitToCertId === cert.id && (
                                <form action={async (fd) => { const r = await wrap(() => createCourseUnit(fd)); if (!r?.error) setAddingUnitToCertId(null) }} className="mb-3 flex flex-col gap-2 bg-white rounded-lg border border-zinc-200 p-3">
                                  <input type="hidden" name="certification_type_id" value={cert.id} />
                                  <input name="unit_title" required placeholder="Chapter title *" className={inputCls} />
                                  <input name="unit_description" placeholder="Description (optional)" className={inputCls} />
                                  <div className="flex gap-2 items-center">
                                    <input name="required_hours" type="number" step="0.5" min="0" placeholder="Hours" className="w-24 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none" />
                                    <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{loading ? '...' : 'Add Unit'}</button>
                                  </div>
                                </form>
                              )}
                              {certUnits.length === 0 ? <p className="text-xs text-zinc-400">No units yet.</p> : (
                                <div className="flex flex-col gap-2">
                                  {[...certUnits].sort((a, b) => a.sort_order - b.sort_order).map((unit, idx) => (
                                    <div key={unit.id}>
                                      {editingUnitId === unit.id ? (
                                        <form action={async (fd) => { const r = await wrap(() => updateCourseUnit(fd)); if (!r?.error) setEditingUnitId(null) }} className="bg-white rounded-lg border border-zinc-200 p-3 flex flex-col gap-2">
                                          <input type="hidden" name="id" value={unit.id} />
                                          <input name="unit_title" required defaultValue={unit.unit_title} className={inputCls} />
                                          <input name="unit_description" defaultValue={unit.unit_description ?? ''} placeholder="Description" className={inputCls} />
                                          <div className="flex gap-2">
                                            <input name="required_hours" type="number" step="0.5" defaultValue={unit.required_hours ?? ''} placeholder="Hours" className="w-24 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none" />
                                            <select name="active" defaultValue={unit.active ? 'true' : 'false'} className={inputCls}><option value="true">Active</option><option value="false">Inactive</option></select>
                                          </div>
                                          <div className="flex gap-2">
                                            <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">{loading ? '...' : 'Save'}</button>
                                            <button type="button" onClick={() => setEditingUnitId(null)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50">Cancel</button>
                                          </div>
                                        </form>
                                      ) : (
                                        <div className="flex items-center bg-white rounded-lg border border-zinc-200 px-4 py-3 gap-3">
                                          <span className="text-xs font-mono text-zinc-400 w-5 shrink-0">{idx + 1}.</span>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm text-zinc-900">{unit.unit_title}</p>
                                            {unit.required_hours && <p className="text-xs text-zinc-400">{unit.required_hours}h required</p>}
                                          </div>
                                          {!unit.active && <span className="text-xs text-zinc-300">Inactive</span>}
                                          <button onClick={() => { setEditingUnitId(unit.id); reset() }} className="text-xs font-semibold text-red-600 hover:text-red-800 shrink-0">Edit</button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ENROLLMENTS ─────────────────────────────────────────────────────── */}
      {tab === 'enrollments' && (
        <div>
          <div className="flex justify-end gap-2 mb-4">
            <button onClick={() => { setShowEnrollForm(!showEnrollForm); setEnrollMode('course'); setDirectCertExpires(false); reset() }}
              className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
              {showEnrollForm ? 'Cancel' : '+ Assign Training'}
            </button>
          </div>

          {showEnrollForm && (
            <div className="mb-5 rounded-xl bg-white p-5 shadow-sm border border-zinc-200">
              {/* Mode toggle */}
              <div className="flex gap-1 mb-5 bg-zinc-100 rounded-lg p-1">
                <button type="button" onClick={() => setEnrollMode('course')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${enrollMode === 'course' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>
                  Enroll in Course
                </button>
                <button type="button" onClick={() => setEnrollMode('direct')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${enrollMode === 'direct' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>
                  Enter Certification Directly
                </button>
              </div>

              {enrollMode === 'course' && (
                <>
                  <p className="text-xs text-zinc-400 mb-3">Enroll member(s) in a structured course with units to complete.</p>

                  {/* Dept-wide toggle */}
                  <label className="flex items-center gap-2 cursor-pointer mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                    <input type="checkbox" checked={enrollAll} onChange={e => setEnrollAll(e.target.checked)} className={checkCls} />
                    <div>
                      <p className="text-sm font-medium text-zinc-800">Assign to all active members</p>
                      <p className="text-xs text-zinc-400">Creates an enrollment for every active member in the department ({allPersonnel.length} members).</p>
                    </div>
                  </label>

                  <form
                    action={async (fd) => {
                      const r = await wrap(() => enrollAll ? enrollAllMembers(fd) : enrollMember(fd))
                      if (!r?.error) { setShowEnrollForm(false); setEnrollAll(false) }
                    }}
                    className="flex flex-col gap-3"
                  >
                    {!enrollAll && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-600">Member *</label>
                        <select name="personnel_id" required={!enrollAll} className={inputCls}>
                          <option value="">Select member...</option>
                          {allPersonnel.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-600">Course *</label>
                      <select name="certification_type_id" required className={inputCls}>
                        <option value="">Select course...</option>
                        {certTypes.filter(c => c.active && c.is_structured_course).map(c => <option key={c.id} value={c.id}>{c.cert_name}</option>)}
                      </select>
                      {certTypes.filter(c => c.active && c.is_structured_course).length === 0 && (
                        <p className="text-xs text-zinc-400 mt-1">No structured courses set up yet. Add one in Cert Types with the "Structured course" option checked.</p>
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-600">Training Date</label>
                      <input name="training_date" type="date" className={inputCls} />
                      <p className="text-xs text-zinc-400 mt-1">Members can log attendance after this date.</p>
                    </div>
                    <button type="submit" disabled={loading} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                      {loading ? '...' : enrollAll ? `Enroll All ${allPersonnel.length} Members` : 'Enroll'}
                    </button>
                  </form>
                </>
              )}

              {enrollMode === 'direct' && (
                <>
                  <p className="text-xs text-zinc-400 mb-3">Record a certification a member already holds — CPR, EMT-B, prior certs, etc.</p>
                  <form action={async (fd) => { const r = await wrap(() => createDirectCertification(fd)); if (!r?.error) { setShowEnrollForm(false); setDirectCertExpires(false) } }} className="flex flex-col gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-600">Member *</label>
                      <select name="personnel_id" required className={inputCls}>
                        <option value="">Select member...</option>
                        {allPersonnel.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-600">Certification *</label>
                      <select name="certification_type_id" className={inputCls}>
                        <option value="">Select from list...</option>
                        {certTypes.filter(c => c.active && !c.is_structured_course).map(c => <option key={c.id} value={c.id}>{c.cert_name}</option>)}
                      </select>
                      <p className="text-xs text-zinc-400 mt-1">Or enter a custom name below if not in the list.</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-600">Cert Name (if not in list) *</label>
                      <input name="cert_name" className={inputCls} placeholder="CPR/AED" />
                      <p className="text-xs text-zinc-400 mt-1">Required — will use this name on the member's record.</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-600">Issuing Body</label>
                      <input name="issuing_body" className={inputCls} placeholder="American Heart Association" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-600">Cert Number</label>
                      <input name="cert_number" className={inputCls} placeholder="Optional" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-600">Issued Date</label>
                      <input name="issued_date" type="date" className={inputCls} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-600">Expiration Date</label>
                      <input name="expiration_date" type="date" className={inputCls} />
                    </div>
                    <input name="notes" className={inputCls} placeholder="Notes (optional)" />
                    <button type="submit" disabled={loading} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{loading ? '...' : 'Save Certification'}</button>
                  </form>
                </>
              )}
            </div>
          )}
          {/* Filter toggle */}
          {enrollments.some(e => e.status !== 'active') && (
            <div className="flex justify-end mb-2">
              <button onClick={() => setShowActiveEnrollmentsOnly(v => !v)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                {showActiveEnrollmentsOnly ? 'Show All' : 'Active Only'}
              </button>
            </div>
          )}

          <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
            {enrollments.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-zinc-400">No enrollments yet.</div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {enrollments
                  .filter(en => showActiveEnrollmentsOnly ? en.status === 'active' : true)
                  .map(en => {
                    const cert = certTypes.find(c => c.id === en.certification_type_id)
                    const certUnits = unitsByCert[en.certification_type_id] ?? []
                    const pending = pendingProgress.filter(p => p.enrollment_id === en.id)
                    return (
                      <div key={en.id} className="flex items-center px-5 py-4 gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-zinc-900">{en.name}</p>
                          <p className="text-xs text-zinc-400">{cert?.cert_name ?? '—'}</p>
                          {certUnits.length > 0 && <p className="text-xs text-zinc-400">{pending.length} pending / {certUnits.filter(u => u.active).length} units</p>}
                        </div>
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium shrink-0 ${en.status === 'active' ? 'bg-green-100 text-green-700' : en.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100 text-zinc-500'}`}>
                          {en.status.charAt(0).toUpperCase() + en.status.slice(1)}
                        </span>
                        {en.status === 'active' && (
                          <button onClick={() => wrap(() => updateEnrollmentStatus(en.id, 'withdrawn'))} className="text-xs text-zinc-400 hover:text-red-600 shrink-0">Withdraw</button>
                        )}
                        {en.status === 'withdrawn' && (
                          <div className="flex gap-3 shrink-0">
                            <button onClick={() => wrap(() => updateEnrollmentStatus(en.id, 'active'))} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Re-enroll</button>
                            <button onClick={() => { if (confirm(`Remove ${en.name}'s enrollment? This cannot be undone.`)) wrap(() => deleteEnrollment(en.id)) }}
                              className="text-xs text-red-500 hover:text-red-700">Remove</button>
                          </div>
                        )}
                        {en.status === 'completed' && isAdmin && (
                          <button onClick={() => { if (confirm(`Remove ${en.name}'s completed enrollment record? The issued cert will not be affected.`)) wrap(() => deleteEnrollment(en.id)) }}
                            className="text-xs text-zinc-400 hover:text-red-600 shrink-0">Remove</button>
                        )}
                      </div>
                    )
                  })}
                {enrollments.filter(en => showActiveEnrollmentsOnly ? en.status === 'active' : true).length === 0 && (
                  <div className="px-6 py-8 text-center text-sm text-zinc-400">No active enrollments.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PENDING COURSE PROGRESS ─────────────────────────────────────────── */}
      {tab === 'pending' && (
        <div className="flex flex-col gap-4">
          {/* Pending simple cert sessions */}
          {pendingSessions.length > 0 && (
            <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
              <div className="px-5 py-3 bg-zinc-50 border-b border-zinc-200">
                <p className="text-sm font-semibold text-zinc-900">Cert Session Attendance</p>
                <p className="text-xs text-zinc-400">{pendingSessions.length} pending</p>
              </div>
              <div className="divide-y divide-zinc-100">
                {pendingSessions.map(s => {
                  const cert = certTypes.find(c => c.id === s.certification_type_id)
                  return (
                    <div key={s.id} className="flex items-center px-5 py-4 gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-900">{s.name}</p>
                        <p className="text-xs text-zinc-500">{cert?.cert_name ?? '—'}</p>
                        {s.session_logged_at && <p className="text-xs text-zinc-400">Logged {formatLocalDateTime(s.session_logged_at, departmentTimezone)}</p>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => wrap(() => verifyEnrollmentSession(s.id, 'verified'))} disabled={loading}
                          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">Approve</button>
                        <button onClick={() => wrap(() => verifyEnrollmentSession(s.id, 'rejected'))} disabled={loading}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">Reject</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Outside training submissions */}
          {pendingSubmissions > 0 && (
            <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
              <div className="px-5 py-3 bg-zinc-50 border-b border-zinc-200">
                <p className="text-sm font-semibold text-zinc-900">Outside Training</p>
                <p className="text-xs text-zinc-400">{pendingSubmissions} pending</p>
              </div>
              <div className="flex flex-col gap-0 divide-y divide-zinc-100">
                {submissions.filter(s => s.status === 'pending').map(sub => {
                  const expanded = expandedSubmissionId === sub.id
                  return (
                    <div key={sub.id} className="overflow-hidden">
                      <button className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-zinc-50 transition-colors"
                        onClick={() => setExpandedSubmissionId(expanded ? null : sub.id)}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-zinc-900 truncate">{sub.topic}</p>
                          <div className="flex gap-3 text-xs text-zinc-400 mt-0.5 flex-wrap">
                            <span>{sub.member_name}</span>
                            <span>{new Date(sub.course_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            <span>{sub.hours}h</span>
                            {sub.provider && <span>{sub.provider}</span>}
                          </div>
                        </div>
                        <span className="text-zinc-400 text-sm shrink-0">{expanded ? '▲' : '▼'}</span>
                      </button>

                      {expanded && (
                        <div className="border-t border-zinc-100 px-5 py-4 flex flex-col gap-4 bg-zinc-50">
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                            {sub.location && <><span className="text-zinc-400">Location</span><span className="text-zinc-700">{sub.location}</span></>}
                            {sub.purpose && <><span className="text-zinc-400">Purpose (member)</span><span className="text-zinc-700 capitalize">{sub.purpose.replace('_', ' ')}</span></>}
                            {sub.nremt_category && <><span className="text-zinc-400">NREMT (member)</span><span className="text-zinc-700">{sub.nremt_category}</span></>}
                            {sub.notes && <><span className="text-zinc-400">Notes</span><span className="text-zinc-700">{sub.notes}</span></>}
                          </div>
                          {sub.document_url && (
                            <a href={`/api/training-doc?path=${encodeURIComponent(sub.document_url)}`} target="_blank" rel="noopener noreferrer"
                              className="text-xs font-semibold text-blue-600 hover:text-blue-800">View Document ↗</a>
                          )}
                          <form action={async (fd: FormData) => {
                            fd.append('id', sub.id)
                            await wrap(() => reviewTrainingSubmission(fd))
                            setExpandedSubmissionId(null)
                          }} className="flex flex-col gap-3 pt-2 border-t border-zinc-200">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-zinc-600 mb-1">Purpose</label>
                                <select name="approved_purpose" defaultValue={sub.purpose ?? ''}
                                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                                  <option value="">— Not classified —</option>
                                  <option value="recert">Recertification</option>
                                  <option value="initial_cert">Initial Certification</option>
                                  <option value="continuing_ed">Continuing Education</option>
                                  <option value="other">Other</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-zinc-600 mb-1">NREMT Category</label>
                                <select name="approved_nremt_category" defaultValue={sub.nremt_category ?? ''}
                                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                                  <option value="">— None —</option>
                                  <option value="AIRWAY">Airway, Respiration &amp; Ventilation</option>
                                  <option value="CARDIOLOGY">Cardiology &amp; Resuscitation</option>
                                  <option value="TRAUMA">Trauma</option>
                                  <option value="MEDICAL">Medical; Obstetrics &amp; Gynecology</option>
                                  <option value="OPERATIONS">EMS Operations</option>
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-zinc-600 mb-1">Link to Cert Type <span className="font-normal text-zinc-400">(issues cert on approval)</span></label>
                              <select name="cert_type_id"
                                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                                <option value="">— Training record only —</option>
                                {certTypes.filter(c => c.active).map(c => (
                                  <option key={c.id} value={c.id}>{c.cert_name}{c.issuing_body ? ` — ${c.issuing_body}` : ''}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-zinc-600 mb-1">Review Note <span className="font-normal text-zinc-400">(optional — visible to member)</span></label>
                              <input name="reviewer_notes" placeholder="e.g. Hours applied to EMT recert"
                                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                            </div>
                            <div className="flex gap-3">
                              <button type="submit" name="action" value="approve" disabled={loading}
                                className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">Approve</button>
                              <button type="submit" name="action" value="reject" disabled={loading}
                                className="flex-1 rounded-lg bg-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-300 disabled:opacity-50">Reject</button>
                            </div>
                          </form>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {pendingProgress.length === 0 && pendingSessions.length === 0 && pendingSubmissions === 0 ? (
            <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">No pending submissions.</div>
          ) : pendingProgress.length > 0 ? (
            <div className="flex flex-col gap-3">
              {Object.entries(pendingByCert).map(([certId, submissions]) => {
                const cert = certTypes.find(c => c.id === certId)
                return (
                  <div key={certId} className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
                    <div className="px-5 py-3 bg-zinc-50 border-b border-zinc-200">
                      <p className="text-sm font-semibold text-zinc-900">{cert?.cert_name ?? '—'}</p>
                      <p className="text-xs text-zinc-400">{submissions.length} pending</p>
                    </div>
                    <div className="divide-y divide-zinc-100">
                      {submissions.map(sub => {
                        const unit = units.find(u => u.id === sub.unit_id)
                        return (
                          <div key={sub.id} className="overflow-hidden">
                            <div className="flex items-start px-5 py-4 gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-zinc-900">{sub.name}</p>
                                <p className="text-xs text-zinc-600 mt-0.5">Unit: {unit?.unit_title ?? '—'}</p>
                                {sub.hours_submitted && <p className="text-xs text-zinc-400">{sub.hours_submitted}h</p>}
                                {sub.completed_date && <p className="text-xs text-zinc-400">Completed: {sub.completed_date}</p>}
                                {sub.notes && <p className="text-xs text-zinc-400 italic">{sub.notes}</p>}
                              </div>
                              <div className="flex gap-2 shrink-0">
                                <button onClick={() => wrap(() => verifyProgress(sub.id, 'verified'))} disabled={loading}
                                  className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">Approve</button>
                                <button onClick={() => { setRejectingProgressId(rejectingProgressId === sub.id ? null : sub.id); setRejectReason('') }} disabled={loading}
                                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">Reject</button>
                              </div>
                            </div>
                            {rejectingProgressId === sub.id && (
                              <div className="px-5 pb-4 flex gap-2 border-t border-zinc-100 pt-3">
                                <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason (optional)" autoFocus
                                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                                <button onClick={() => { wrap(() => verifyProgress(sub.id, 'rejected', rejectReason)); setRejectingProgressId(null) }} disabled={loading}
                                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">Confirm</button>
                                <button onClick={() => setRejectingProgressId(null)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50">Cancel</button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      )}

      {/* ── TRAINING EVENTS ─────────────────────────────────────────────────── */}
      {tab === 'events' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setShowEventForm(!showEventForm); reset() }}
              className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
              {showEventForm ? 'Cancel' : '+ New Training Event'}
            </button>
          </div>

          {showEventForm && (
            <div className="mb-5 rounded-xl bg-white p-5 shadow-sm border border-zinc-200">
              <h2 className="text-sm font-semibold text-zinc-700 mb-4">New Training Event</h2>
              <form action={async (fd) => { fd.set('requires_verification', requiresVerification ? 'true' : 'false'); const r = await wrap(() => createTrainingEvent(fd)); if (!r?.error) setShowEventForm(false) }} className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <div className="flex-1"><label className="mb-1 block text-xs font-medium text-zinc-600">Topic *</label><input name="topic" required className={inputCls} placeholder="Airway Management" /></div>
                  <div className="w-36"><label className="mb-1 block text-xs font-medium text-zinc-600">Date *</label><input name="event_date" type="date" required className={inputCls} /></div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1"><label className="mb-1 block text-xs font-medium text-zinc-600">Location</label><input name="location" className={inputCls} placeholder="Station 1" /></div>
                  <div className="w-28"><label className="mb-1 block text-xs font-medium text-zinc-600">Start Time</label><input name="start_time" type="time" className={inputCls} /></div>
                  <div className="w-20"><label className="mb-1 block text-xs font-medium text-zinc-600">Hours</label><input name="hours" type="number" step="0.5" min="0" className={inputCls} placeholder="2" /></div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1"><label className="mb-1 block text-xs font-medium text-zinc-600">Instructor</label><input name="instructor" className={inputCls} placeholder="Name" /></div>
                  <div className="flex-1"><label className="mb-1 block text-xs font-medium text-zinc-600">Description</label><input name="description" className={inputCls} placeholder="Optional" /></div>
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={requiresVerification} onChange={e => setRequiresVerification(e.target.checked)} className={`mt-0.5 ${checkCls}`} />
                  <div>
                    <p className="text-sm font-medium text-zinc-800">Require attendance verification</p>
                    <p className="text-xs text-zinc-400">When checked, member self-reported attendance must be approved by an officer.</p>
                  </div>
                </label>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Issues Certification (optional)</label>
                  <select name="certification_type_id" className={inputCls}>
                    <option value="">None — attendance only</option>
                    {certTypes.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.cert_name}</option>)}
                  </select>
                  <p className="text-xs text-zinc-400 mt-1">When set, verified attendance automatically issues this cert to each member.</p>
                </div>
                <button type="submit" disabled={loading} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{loading ? '...' : 'Create Event'}</button>
              </form>
            </div>
          )}

          <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
            {trainingEvents.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-zinc-400">No training events in the past 30 days or upcoming 60 days.</div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {trainingEvents.map(evt => {
                  const linkedTitle = evt.event_instance_id ? linkedEventTitles[evt.id] : null
                  return (
                  <div key={evt.id}>
                    <div className="flex items-center px-5 py-4 gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-zinc-900">{evt.topic}</p>
                          {linkedTitle && (
                            <span className="text-xs rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 font-medium">via {linkedTitle}</span>
                          )}
                        </div>
                        <div className="flex gap-3 text-xs text-zinc-400 mt-0.5 flex-wrap">
                          <span>{new Date(evt.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          {evt.location && <span>📍 {evt.location}</span>}
                          {evt.hours && <span>{evt.hours}h</span>}
                          {evt.instructor && <span>Instructor: {evt.instructor}</span>}
                          {!linkedTitle && <span>{evt.verified_count} verified</span>}
                          {!linkedTitle && evt.signed_count > 0 && (
                            <span className="text-green-600 font-semibold">✓ {evt.signed_count} signed</span>
                          )}
                          {!linkedTitle && evt.pending_attendance.length > 0 && (
                            <span className="text-yellow-600 font-semibold">⏳ {evt.pending_attendance.length} pending</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {linkedTitle ? (
                          <a href="/events" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                            Manage on Events →
                          </a>
                        ) : (
                          <>
                            <a
                              href={`/print/training-signin?event_id=${evt.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-red-600 hover:text-red-800 transition-colors"
                            >
                              Print ↗
                            </a>
                            <button onClick={() => { setLogAttendanceEventId(logAttendanceEventId === evt.id ? null : evt.id); setAttendanceSelected(new Set()) }}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                              {logAttendanceEventId === evt.id ? 'Hide' : 'Manage'}
                            </button>
                            <button onClick={() => { if (confirm('Cancel this training event?')) wrap(() => cancelTrainingEvent(evt.id)) }}
                              disabled={loading}
                              className="text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50">
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {logAttendanceEventId === evt.id && !linkedTitle && (
                      <div className="border-t border-zinc-100 bg-zinc-50 px-5 py-4 flex flex-col gap-4">

                        {/* Pending self-reports */}
                        {evt.pending_attendance.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-2">
                              Pending Self-Reports ({evt.pending_attendance.length})
                            </p>
                            <div className="flex flex-col gap-2">
                              {evt.pending_attendance.map(sub => (
                                <div key={sub.id} className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
                                  <div className="flex items-center px-4 py-3 gap-3">
                                    <div className="flex-1">
                                      <p className="text-sm font-semibold text-zinc-900">{sub.name}</p>
                                      <p className="text-xs text-zinc-400">Submitted {formatLocalDateTime(sub.submitted_at, departmentTimezone)}</p>
                                    </div>
                                    <div className="flex gap-2">
                                      <button onClick={() => wrap(() => verifyTrainingAttendance(sub.id, 'verified'))} disabled={loading}
                                        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">Approve</button>
                                      <button onClick={() => { setRejectingAttendanceId(rejectingAttendanceId === sub.id ? null : sub.id); setRejectAttendanceReason('') }} disabled={loading}
                                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">Reject</button>
                                    </div>
                                  </div>
                                  {rejectingAttendanceId === sub.id && (
                                    <div className="px-4 pb-3 border-t border-zinc-100 pt-3 flex gap-2">
                                      <input value={rejectAttendanceReason} onChange={e => setRejectAttendanceReason(e.target.value)} placeholder="Reason (optional)" autoFocus
                                        className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                                      <button onClick={() => { wrap(() => verifyTrainingAttendance(sub.id, 'rejected', rejectAttendanceReason)); setRejectingAttendanceId(null) }} disabled={loading}
                                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">Confirm</button>
                                      <button onClick={() => setRejectingAttendanceId(null)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50">Cancel</button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Bulk log attendance */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">Log Attendance</p>
                            <button onClick={() => setAttendanceSelected(prev => prev.size === allPersonnel.length ? new Set() : new Set(allPersonnel.map(p => p.id)))}
                              className="text-xs text-blue-600 font-semibold hover:text-blue-800">
                              {attendanceSelected.size === allPersonnel.length ? 'Deselect All' : 'Select All'}
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto mb-3">
                            {allPersonnel.map(p => (
                              <label key={p.id} className="flex items-center gap-2 rounded-lg bg-white border border-zinc-200 px-3 py-2 cursor-pointer hover:bg-zinc-50">
                                <input type="checkbox" checked={attendanceSelected.has(p.id)} onChange={() => setAttendanceSelected(prev => { const next = new Set(prev); if (next.has(p.id)) next.delete(p.id); else next.add(p.id); return next })}
                                  className="rounded border-zinc-300 text-red-600 focus:ring-red-500" />
                                <span className="text-xs text-zinc-800">{p.name}</span>
                              </label>
                            ))}
                          </div>
                          <button onClick={() => { if (attendanceSelected.size > 0) wrap(() => logTrainingAttendance(evt.id, Array.from(attendanceSelected))).then(() => setLogAttendanceEventId(null)) }}
                            disabled={loading || attendanceSelected.size === 0}
                            className="w-full rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                            {loading ? 'Logging...' : `Log ${attendanceSelected.size} Members`}
                          </button>
                        </div>

                        {/* Signatures */}
                        {evt.all_attendance.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-2">
                              Signatures ({evt.signed_count}/{evt.all_attendance.length})
                            </p>
                            <div className="flex flex-col gap-1.5">
                              {[...evt.all_attendance].sort((a, b) => a.name.localeCompare(b.name)).map(a => (
                                <div key={a.personnel_id} className="flex items-center justify-between bg-white rounded-lg border border-zinc-200 px-4 py-2.5 gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-zinc-900 truncate">{a.name}</p>
                                    {a.signed_at && (
                                      <p className="text-xs text-zinc-400">{formatLocalDateTime(a.signed_at, departmentTimezone)}</p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    {a.signed_at ? (
                                      <span className="text-xs font-semibold text-green-600">✓ Signed</span>
                                    ) : a.status === 'verified' ? (
                                      <span className="text-xs text-blue-500">Awaiting signature</span>
                                    ) : (
                                      <span className="text-xs text-zinc-400">Pending verification</span>
                                    )}
                                    <a
                                      href={`/print/training-signin?event_id=${evt.id}&personnel_id=${a.personnel_id}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs font-semibold text-red-600 hover:text-red-800 transition-colors"
                                    >
                                      Print ↗
                                    </a>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
        </div>
      </div>

    </div>
  )
}
