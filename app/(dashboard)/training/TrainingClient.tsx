'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitUnitProgress, selfReportTrainingAttendance, logCertSession, saveCertSignature } from '@/app/actions/training'
import { generateCheckinToken } from '@/app/actions/checkin'
import SignaturePadModal from '@/components/SignaturePadModal'
import CertSignaturePadModal from '@/components/CertSignaturePadModal'
import LogOutsideTrainingModal from '@/components/LogOutsideTrainingModal'
import HelpText from '@/components/HelpText'

const inputCls = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  verified: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

interface Enrollment {
  id: string; certification_type_id: string; status: string; enrolled_at: string
  training_date: string | null; session_logged_at: string | null; session_status: string | null
}
interface CertType { id: string; cert_name: string; issuing_body: string | null; does_expire: boolean; expiration_interval_months: number | null; is_structured_course: boolean }
interface Unit { id: string; certification_type_id: string; unit_title: string; unit_description: string | null; required_hours: number | null; sort_order: number; active: boolean }
interface Progress { id: string; enrollment_id: string; unit_id: string; status: string; hours_submitted: number | null; completed_date: string | null; submitted_at: string }
interface Certification { id: string; cert_name: string; issuing_body: string | null; cert_number: string | null; issued_date: string | null; expiration_date: string | null; source: string; active: boolean; signature_url: string | null; signed_at: string | null }
interface TrainingEvent {
  id: string; event_date: string; start_time: string | null; topic: string
  hours: number | null; location: string | null; description: string | null
  requires_verification: boolean; certification_type_id: string | null
  event_instance_id: string | null
  my_attendance: { id: string; event_id: string; status: string; submitted_at: string; signed_at: string | null; signature_url: string | null } | null
}
interface AttendanceRecord {
  id: string; event_id: string; personnel_id: string; status: string
  signed_at: string | null; signature_url: string | null; member_name: string
}
interface MySubmission {
  id: string; topic: string; course_date: string; hours: number
  provider: string | null; location: string | null; status: string
  purpose: string | null; nremt_category: string | null
  approved_purpose: string | null; approved_nremt_category: string | null
  reviewer_notes: string | null; submitted_at: string
}

const NREMT_LABELS: Record<string, string> = {
  AIRWAY: 'Airway, Respiration & Ventilation',
  CARDIOLOGY: 'Cardiology & Resuscitation',
  TRAUMA: 'Trauma',
  MEDICAL: 'Medical; Obstetrics & Gynecology',
  OPERATIONS: 'EMS Operations',
}
const PURPOSE_LABELS: Record<string, string> = {
  recert: 'Recertification',
  initial_cert: 'Initial Certification',
  continuing_ed: 'Continuing Education',
  other: 'Other',
}

function isExpiringSoon(d: string | null) {
  if (!d) return false
  const exp = new Date(d); const soon = new Date(); soon.setDate(soon.getDate() + 60)
  return exp <= soon && exp >= new Date()
}
function isExpired(d: string | null) { return d ? new Date(d) < new Date() : false }
function isPast(date: string) { return new Date(date + 'T23:59:59') < new Date() }
function isToday(date: string) {
  const d = new Date(date + 'T00:00:00'); const t = new Date()
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
}
function selfReportWindowOpen(event_date: string, start_time: string | null) {
  const eventDateTime = new Date(`${event_date}T${start_time || '00:00'}`)
  return new Date() <= new Date(eventDateTime.getTime() + 12 * 60 * 60 * 1000)
}
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TrainingClient({
  enrollments, certTypes, units, myProgress, myCerts, trainingEvents,
  linkedEventTitles = {}, myPersonnelId, myName, isOfficerOrAbove, officerAttendance = [], mySubmissions = [],
}: {
  enrollments: Enrollment[]; certTypes: CertType[]; units: Unit[]
  myProgress: Progress[]; myCerts: Certification[]; trainingEvents: TrainingEvent[]
  linkedEventTitles?: Record<string, string>
  myPersonnelId: string; myName: string; isOfficerOrAbove: boolean
  officerAttendance?: AttendanceRecord[]
  mySubmissions?: MySubmission[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submittingUnitId, setSubmittingUnitId] = useState<string | null>(null)
  const [signingEventId, setSigningEventId] = useState<string | null>(null)
  const [sigPadTarget, setSigPadTarget] = useState<{ eventId: string; personnelId: string; memberName: string; eventTopic: string } | null>(null)
  const [certSigTarget, setCertSigTarget] = useState<{ certId: string; certName: string } | null>(null)
  const [showOutsideTraining, setShowOutsideTraining] = useState(false)
  const [localSignatures, setLocalSignatures] = useState<Record<string, string>>({})
  const [localCertSignatures, setLocalCertSignatures] = useState<Record<string, string>>({})

  function reset() { setError(null); setSuccess(null) }

  const certTypeMap = Object.fromEntries(certTypes.map(c => [c.id, c]))
  const unitsByCert = units.reduce<Record<string, Unit[]>>((acc, u) => {
    if (!acc[u.certification_type_id]) acc[u.certification_type_id] = []
    acc[u.certification_type_id].push(u)
    return acc
  }, {})
  const progressByEnrollment = myProgress.reduce<Record<string, Record<string, Progress>>>((acc, p) => {
    if (!acc[p.enrollment_id]) acc[p.enrollment_id] = {}
    acc[p.enrollment_id][p.unit_id] = p
    return acc
  }, {})
  const attendanceByEvent = officerAttendance.reduce<Record<string, AttendanceRecord[]>>((acc, a) => {
    if (!acc[a.event_id]) acc[a.event_id] = []
    acc[a.event_id].push(a)
    return acc
  }, {})

  async function handleSelfReport(event_id: string) {
    reset(); setLoading(true)
    const r = await selfReportTrainingAttendance(event_id)
    if (r?.error) setError(r.error)
    else { setSuccess('Attendance logged.'); router.refresh() }
    setLoading(false)
  }

  async function handleGenerateCheckinQr(event_id: string, topic: string) {
    reset()
    const result = await generateCheckinToken('training_event', event_id)
    if (result.error || !result.token) { setError(result.error ?? 'Failed to generate check-in QR.'); return }
    const params = new URLSearchParams({ type: 'checkin', code: result.token, title: topic })
    window.open(`/print/qr?${params.toString()}`, '_blank')
  }

  async function handleLogSession(enrollment_id: string) {
    reset(); setLoading(true)
    const r = await logCertSession(enrollment_id)
    if (r?.error) setError(r.error)
    else { setSuccess('Session logged — pending verification.'); router.refresh() }
    setLoading(false)
  }

  async function handleSubmitUnit(formData: FormData) {
    reset(); setLoading(true)
    const { submitUnitProgress: action } = await import('@/app/actions/training')
    const r = await action(formData)
    if (r?.error) setError(r.error)
    else { setSuccess('Progress submitted — pending verification.'); setSubmittingUnitId(null); router.refresh() }
    setLoading(false)
  }

  const today = new Date().toISOString().split('T')[0]
  const activeEnrollments = enrollments.filter(e => e.status === 'active' || e.status === 'completed')

  // Build unified training items sorted by date
  type TrainingItem =
    | { kind: 'event'; data: TrainingEvent; sortDate: string }
    | { kind: 'enrollment'; data: Enrollment; sortDate: string }
    | { kind: 'submission'; data: MySubmission; sortDate: string }

  const items: TrainingItem[] = [
    ...trainingEvents.map(e => ({ kind: 'event' as const, data: e, sortDate: e.event_date })),
    ...activeEnrollments.map(e => ({ kind: 'enrollment' as const, data: e, sortDate: e.training_date ?? e.enrolled_at?.split('T')[0] ?? today })),
    ...mySubmissions.map(s => ({ kind: 'submission' as const, data: s, sortDate: s.course_date })),
  ].sort((a, b) => {
    // Upcoming first (ascending), then past descending
    const aDate = new Date(a.sortDate); const bDate = new Date(b.sortDate)
    const now = new Date()
    const aFuture = aDate >= now; const bFuture = bDate >= now
    if (aFuture && bFuture) return aDate.getTime() - bDate.getTime()
    if (!aFuture && !bFuture) return bDate.getTime() - aDate.getTime()
    return aFuture ? -1 : 1
  })

  return (
    <>
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Training</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{myName}</p>
      </div>

      {success && <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-200">{success}</div>}
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}

      {/* ── MY TRAINING ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-zinc-700">My Training</h2>
        <button onClick={() => setShowOutsideTraining(true)}
          className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800">
          + Log Outside Training
        </button>
      </div>
      <HelpText className="mb-3">
        Assigned courses and training events show here automatically. Attended a class outside the department (a
        conference, an outside course)? Use "Log Outside Training" — you can upload a photo of your certificate and
        it'll pre-fill the details. It sits as pending until an officer reviews it.
      </HelpText>

      {items.length === 0 ? (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400 mb-8">
          No training assigned yet.
        </div>
      ) : (
        <div className="flex flex-col gap-3 mb-8">
          {items.map(item => {
            if (item.kind === 'event') {
              const evt = item.data
              const past = isPast(evt.event_date)
              const windowOpen = selfReportWindowOpen(evt.event_date, evt.start_time)
              const attended = !!evt.my_attendance
              const certType = evt.certification_type_id ? certTypeMap[evt.certification_type_id] : null
              const sigKey = `${evt.id}:${myPersonnelId}`
              const isSigned = !!localSignatures[sigKey] || !!evt.my_attendance?.signature_url
              const linkedTitle = evt.event_instance_id ? linkedEventTitles[evt.id] : null

              return (
                <div key={`evt-${evt.id}`} className="rounded-xl bg-white shadow-sm border border-zinc-200 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 text-center w-10">
                      <p className="text-xs font-semibold text-zinc-400 uppercase">
                        {new Date(evt.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                      </p>
                      <p className="text-xl font-bold text-zinc-900 leading-none">
                        {new Date(evt.event_date + 'T00:00:00').getDate()}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-900">{evt.topic}</p>
                      <div className="flex gap-3 text-xs text-zinc-400 mt-0.5 flex-wrap">
                        {evt.location && <span>📍 {evt.location}</span>}
                        {evt.hours && <span>{evt.hours}h</span>}
                        {certType && <span className="text-blue-600 font-medium">Issues: {certType.cert_name}</span>}
                        {linkedTitle && (
                          <span className="text-purple-600 font-medium">via {linkedTitle}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {linkedTitle ? (
                        <a href="/events" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                          Log on Events →
                        </a>
                      ) : (
                        <>
                          {isOfficerOrAbove && (
                            <button onClick={() => handleGenerateCheckinQr(evt.id, evt.topic)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                              Check-In QR
                            </button>
                          )}
                          {attended && evt.my_attendance!.status !== 'verified' && (
                            <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[evt.my_attendance!.status]}`}>
                              {evt.my_attendance!.status.charAt(0).toUpperCase() + evt.my_attendance!.status.slice(1)}
                            </span>
                          )}
                          {attended && evt.my_attendance?.status === 'verified' && !isSigned && (
                            <button onClick={() => setSigPadTarget({ eventId: evt.id, personnelId: myPersonnelId, memberName: myName, eventTopic: evt.topic })}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                              Sign
                            </button>
                          )}
                          {isSigned && <span className="text-xs font-semibold text-green-600">✓ Signed</span>}
                          {!attended && past && windowOpen && (
                            <button onClick={() => handleSelfReport(evt.id)} disabled={loading}
                              className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                              Log Attendance
                            </button>
                          )}
                          {!attended && past && !windowOpen && !isOfficerOrAbove && (
                            <span className="text-xs text-zinc-400">Window closed</span>
                          )}
                          {!attended && past && !windowOpen && isOfficerOrAbove && (
                            <button onClick={() => handleSelfReport(evt.id)} disabled={loading}
                              className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                              Log Attendance
                            </button>
                          )}
                          {!attended && !past && (
                            <span className="text-xs text-zinc-400">{isToday(evt.event_date) ? 'Today' : 'Upcoming'}</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Officer signature status panel */}
                  {isOfficerOrAbove && past && (
                    <div className="mt-3 pt-3 border-t border-zinc-100">
                      {signingEventId !== evt.id ? (
                        <button onClick={() => setSigningEventId(evt.id)} className="text-xs font-semibold text-red-600 hover:text-red-800">
                          Signature Status
                        </button>
                      ) : (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-zinc-700">Signature Status</p>
                            <div className="flex gap-3">
                              <a href={`/print/training-signin?event_id=${evt.id}`} target="_blank" rel="noopener noreferrer"
                                className="text-xs font-semibold text-red-600 hover:text-red-800">Print Sheet ↗</a>
                              <button onClick={() => setSigningEventId(null)} className="text-xs text-zinc-400 hover:text-zinc-600">Done</button>
                            </div>
                          </div>
                          {(attendanceByEvent[evt.id] ?? []).length === 0 ? (
                            <p className="text-xs text-zinc-400">No attendance records.</p>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              {(attendanceByEvent[evt.id] ?? []).map(a => {
                                const sk = `${evt.id}:${a.personnel_id}`
                                const signed = !!localSignatures[sk] || !!a.signed_at
                                return (
                                  <div key={a.personnel_id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 gap-3">
                                    <p className="text-sm font-medium text-zinc-900 truncate">{a.member_name}</p>
                                    {signed ? <span className="text-xs font-semibold text-green-600 shrink-0">✓ Complete</span>
                                      : a.status === 'verified' ? <span className="text-xs text-blue-500 shrink-0">Awaiting signature</span>
                                      : <span className="text-xs text-zinc-400 shrink-0">Pending verification</span>}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            }

            // Submission item
            if (item.kind === 'submission') {
              const sub = item.data
              const cat = sub.approved_nremt_category ?? sub.nremt_category
              const purpose = sub.approved_purpose ?? sub.purpose
              return (
                <div key={`sub-${sub.id}`} className="rounded-xl bg-white shadow-sm border border-zinc-200 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 text-center w-10">
                      <p className="text-xs font-semibold text-zinc-400 uppercase">
                        {new Date(sub.course_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                      </p>
                      <p className="text-xl font-bold text-zinc-900 leading-none">
                        {new Date(sub.course_date + 'T00:00:00').getDate()}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-900">{sub.topic}</p>
                      <div className="flex gap-3 text-xs text-zinc-400 mt-0.5 flex-wrap">
                        {sub.provider && <span>{sub.provider}</span>}
                        {sub.location && <span>📍 {sub.location}</span>}
                        <span>{sub.hours}h</span>
                        {purpose && <span className="text-blue-600 font-medium">{PURPOSE_LABELS[purpose] ?? purpose}</span>}
                        {cat && <span className="text-purple-600 font-medium">{NREMT_LABELS[cat] ?? cat}</span>}
                      </div>
                      {sub.reviewer_notes && (
                        <p className={`text-xs mt-1 ${sub.status === 'rejected' ? 'text-red-600' : 'text-zinc-500'}`}>
                          Note: {sub.reviewer_notes}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">
                      {sub.status === 'pending' && (
                        <span className="rounded-full bg-yellow-100 text-yellow-700 px-2 py-0.5 text-xs font-medium">Pending Review</span>
                      )}
                      {sub.status === 'approved' && (
                        <span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium">✓ Approved</span>
                      )}
                      {sub.status === 'rejected' && (
                        <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">Rejected</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            }

            // Enrollment item
            const en = item.data
            const cert = certTypeMap[en.certification_type_id]
            const certUnits = (unitsByCert[en.certification_type_id] ?? []).filter(u => u.active)
            const enProgress = progressByEnrollment[en.id] ?? {}
            const isStructured = cert?.is_structured_course && certUnits.length > 0
            const trainingDatePassed = !en.training_date || new Date(en.training_date + 'T23:59:59') < new Date()

            return (
              <div key={`en-${en.id}`} className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
                <div className="px-5 py-4 bg-zinc-50 border-b border-zinc-200">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-zinc-900">{cert?.cert_name ?? '—'}</p>
                      {cert?.issuing_body && <p className="text-xs text-zinc-400">{cert.issuing_body}</p>}
                      {en.training_date && (
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {trainingDatePassed ? 'Trained ' : 'Scheduled: '}{fmtDate(en.training_date)}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium shrink-0 ${en.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                      {en.status === 'completed' ? 'Complete' : 'Active'}
                    </span>
                  </div>

                  {isStructured && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                        <span>{Object.values(enProgress).filter(p => p.status === 'verified').length} of {certUnits.length} units verified</span>
                        <span>{certUnits.length > 0 ? Math.round((Object.values(enProgress).filter(p => p.status === 'verified').length / certUnits.length) * 100) : 0}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-200 overflow-hidden">
                        <div className="h-full rounded-full bg-red-600 transition-all"
                          style={{ width: `${certUnits.length > 0 ? Math.round((Object.values(enProgress).filter(p => p.status === 'verified').length / certUnits.length) * 100) : 0}%` }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Structured course — unit list */}
                {isStructured && (
                  <div className="divide-y divide-zinc-100">
                    {[...certUnits].sort((a, b) => a.sort_order - b.sort_order).map((unit, idx) => {
                      const prog = enProgress[unit.id]
                      const isSubmitting = submittingUnitId === `${en.id}-${unit.id}`
                      return (
                        <div key={unit.id}>
                          <div className="flex items-center px-5 py-3 gap-3">
                            <span className="text-xs font-mono text-zinc-400 w-5 shrink-0">{idx + 1}.</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-zinc-900">{unit.unit_title}</p>
                              {unit.required_hours && <p className="text-xs text-zinc-400">{unit.required_hours}h required</p>}
                              {prog && (
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[prog.status]}`}>
                                    {prog.status.charAt(0).toUpperCase() + prog.status.slice(1)}
                                  </span>
                                  {prog.hours_submitted && <span className="text-xs text-zinc-400">{prog.hours_submitted}h</span>}
                                </div>
                              )}
                            </div>
                            <div className="shrink-0">
                              {prog?.status === 'verified' && <span className="text-green-600 text-lg">✓</span>}
                              {(!prog || prog.status === 'rejected') && en.status === 'active' && (
                                <button onClick={() => setSubmittingUnitId(isSubmitting ? null : `${en.id}-${unit.id}`)}
                                  className="text-xs font-semibold text-red-600 hover:text-red-800">
                                  {isSubmitting ? 'Cancel' : prog?.status === 'rejected' ? 'Resubmit' : 'Submit'}
                                </button>
                              )}
                              {prog?.status === 'pending' && <span className="text-xs text-zinc-400">Pending</span>}
                            </div>
                          </div>
                          {isSubmitting && (
                            <div className="px-5 pb-4 border-t border-zinc-100 pt-3">
                              <form action={handleSubmitUnit} className="flex flex-col gap-2">
                                <input type="hidden" name="enrollment_id" value={en.id} />
                                <input type="hidden" name="unit_id" value={unit.id} />
                                <div className="flex gap-2">
                                  <div className="flex-1">
                                    <label className="mb-1 block text-xs font-medium text-zinc-600">Completion Date</label>
                                    <input name="completed_date" type="date" required className={inputCls} />
                                  </div>
                                  <div className="w-24">
                                    <label className="mb-1 block text-xs font-medium text-zinc-600">Hours</label>
                                    <input name="hours_submitted" type="number" step="0.5" min="0" className={inputCls} placeholder="4" />
                                  </div>
                                </div>
                                <input name="notes" placeholder="Notes (optional)" className={inputCls} />
                                <button type="submit" disabled={loading}
                                  className="w-full rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                                  {loading ? 'Submitting...' : 'Submit for Verification'}
                                </button>
                              </form>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Simple cert — session log action */}
                {!isStructured && en.status === 'active' && (
                  <div className="px-5 py-3">
                    {!en.session_logged_at && trainingDatePassed && (
                      <button onClick={() => handleLogSession(en.id)} disabled={loading}
                        className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                        Log Attendance
                      </button>
                    )}
                    {!en.session_logged_at && !trainingDatePassed && (
                      <p className="text-xs text-zinc-400 text-center py-1">Available after {fmtDate(en.training_date!)}</p>
                    )}
                    {en.session_logged_at && en.session_status === 'pending' && (
                      <p className="text-xs text-zinc-500 text-center py-1">✓ Attendance logged — awaiting verification</p>
                    )}
                    {en.session_status === 'verified' && (
                      <p className="text-xs text-green-600 font-semibold text-center py-1">✓ Verified — cert issued to your record</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── MY CERTIFICATIONS ────────────────────────────────────────────────── */}
      <h2 className="text-base font-semibold text-zinc-700 mb-3">My Certifications</h2>
      <HelpText className="mb-3">
        Certs highlighted here are expiring within 60 days or have already expired — everything else is current.
        Certs are issued automatically when a linked training's attendance is verified, or entered directly by an admin.
      </HelpText>

      {myCerts.length === 0 ? (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          No certifications on record yet.
        </div>
      ) : (
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
          <div className="divide-y divide-zinc-100">
            {myCerts.map(cert => {
              const expiring = isExpiringSoon(cert.expiration_date)
              const expired = isExpired(cert.expiration_date)
              const isSigned = !!cert.signature_url || !!localCertSignatures[cert.id]
              return (
                <div key={cert.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-zinc-900">{cert.cert_name}</p>
                      {cert.issuing_body && <p className="text-xs text-zinc-400">{cert.issuing_body}</p>}
                      {cert.cert_number && <p className="text-xs text-zinc-400">#{cert.cert_number}</p>}
                      <div className="flex gap-3 text-xs text-zinc-400 mt-1 flex-wrap">
                        {cert.issued_date && <span>Issued: {cert.issued_date}</span>}
                        {cert.expiration_date && (
                          <span className={expired ? 'text-red-600 font-semibold' : expiring ? 'text-yellow-600 font-semibold' : ''}>
                            Expires: {cert.expiration_date}
                            {expired && ' ⚠ EXPIRED'}
                            {!expired && expiring && ' ⚠ Expiring Soon'}
                          </span>
                        )}
                        {!cert.expiration_date && <span>No expiration</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-xs rounded-full bg-zinc-100 text-zinc-500 px-2 py-0.5">
                        {cert.source === 'course_completion' ? 'Course'
                          : cert.source === 'training_event' ? 'Event'
                          : 'Direct Entry'}
                      </span>
                      {isSigned ? (
                        <span className="text-xs font-semibold text-green-600">✓ Signed</span>
                      ) : (
                        <button onClick={() => setCertSigTarget({ certId: cert.id, certName: cert.cert_name })}
                          className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700">
                          Sign
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>

    {sigPadTarget && (
      <SignaturePadModal
        memberName={sigPadTarget.memberName}
        eventTopic={sigPadTarget.eventTopic}
        eventId={sigPadTarget.eventId}
        personnelId={sigPadTarget.personnelId}
        onClose={() => setSigPadTarget(null)}
        onSaved={(personnelId, signedAt) => {
          setLocalSignatures(prev => ({ ...prev, [`${sigPadTarget.eventId}:${personnelId}`]: signedAt }))
          setSigPadTarget(null)
        }}
      />
    )}

    {showOutsideTraining && (
      <LogOutsideTrainingModal onClose={() => setShowOutsideTraining(false)} />
    )}

    {certSigTarget && (
      <CertSignaturePadModal
        memberName={myName}
        certName={certSigTarget.certName}
        certId={certSigTarget.certId}
        personnelId={myPersonnelId}
        onClose={() => setCertSigTarget(null)}
        onSaved={signedAt => {
          setLocalCertSignatures(prev => ({ ...prev, [certSigTarget.certId]: signedAt }))
          setCertSigTarget(null)
        }}
      />
    )}
    </>
  )
}
