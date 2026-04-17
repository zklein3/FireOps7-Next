'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitUnitProgress } from '@/app/actions/training'

const inputCls = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"

type Tab = 'courses' | 'certifications' | 'history'

interface Enrollment { id: string; certification_type_id: string; status: string; enrolled_at: string }
interface CertType { id: string; cert_name: string; issuing_body: string | null; does_expire: boolean; expiration_interval_months: number | null; is_structured_course: boolean }
interface Unit { id: string; certification_type_id: string; unit_title: string; unit_description: string | null; required_hours: number | null; sort_order: number; active: boolean }
interface Progress { id: string; enrollment_id: string; unit_id: string; status: string; hours_submitted: number | null; completed_date: string | null; submitted_at: string }
interface Certification { id: string; cert_name: string; issuing_body: string | null; cert_number: string | null; issued_date: string | null; expiration_date: string | null; source: string; active: boolean }
interface TrainingEvent { id: string; event_date: string; topic: string; hours: number | null; location: string | null }

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  verified: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

function isExpiringSoon(expiration_date: string | null): boolean {
  if (!expiration_date) return false
  const exp = new Date(expiration_date)
  const soon = new Date()
  soon.setDate(soon.getDate() + 60)
  return exp <= soon && exp >= new Date()
}

function isExpired(expiration_date: string | null): boolean {
  if (!expiration_date) return false
  return new Date(expiration_date) < new Date()
}

export default function TrainingClient({
  enrollments, certTypes, units, myProgress, myCerts, trainingEvents, myName,
}: {
  enrollments: Enrollment[]; certTypes: CertType[]; units: Unit[]
  myProgress: Progress[]; myCerts: Certification[]; trainingEvents: TrainingEvent[]
  myName: string
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('courses')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submittingUnitId, setSubmittingUnitId] = useState<string | null>(null)

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

  async function handleSubmitUnit(formData: FormData) {
    reset(); setLoading(true)
    const result = await submitUnitProgress(formData)
    if (result?.error) setError(result.error)
    else { setSuccess('Progress submitted — pending verification.'); setSubmittingUnitId(null); router.refresh() }
    setLoading(false)
  }

  const activeEnrollments = enrollments.filter(e => e.status === 'active' || e.status === 'completed')

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">My Training</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{myName}</p>
      </div>

      {success && <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-200">{success}</div>}
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white rounded-xl border border-zinc-200 p-1">
        {([
          { key: 'courses', label: 'My Courses' },
          { key: 'certifications', label: 'Certifications' },
          { key: 'history', label: 'Training History' },
        ] as { key: Tab; label: string }[]).map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); reset() }}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${tab === t.key ? 'bg-red-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── MY COURSES ───────────────────────────────────────────────────────── */}
      {tab === 'courses' && (
        <div>
          {activeEnrollments.length === 0 ? (
            <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
              You are not enrolled in any certification courses. Contact your department admin to get enrolled.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {activeEnrollments.map(en => {
                const cert = certTypeMap[en.certification_type_id]
                const certUnits = unitsByCert[en.certification_type_id] ?? []
                const enProgress = progressByEnrollment[en.id] ?? {}
                const verifiedCount = Object.values(enProgress).filter(p => p.status === 'verified').length
                const totalUnits = certUnits.length
                const pct = totalUnits > 0 ? Math.round((verifiedCount / totalUnits) * 100) : 0

                return (
                  <div key={en.id} className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
                    {/* Course header */}
                    <div className="px-5 py-4 bg-zinc-50 border-b border-zinc-200">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-bold text-zinc-900">{cert?.cert_name ?? '—'}</p>
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${en.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                          {en.status === 'completed' ? 'Complete — Eligible to Test' : 'Active'}
                        </span>
                      </div>
                      {cert?.issuing_body && <p className="text-xs text-zinc-400">{cert.issuing_body}</p>}
                      {totalUnits > 0 && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                            <span>{verifiedCount} of {totalUnits} units verified</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-zinc-200 overflow-hidden">
                            <div className="h-full rounded-full bg-red-600 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Units */}
                    {certUnits.length > 0 && (
                      <div className="divide-y divide-zinc-100">
                        {[...certUnits].sort((a, b) => a.sort_order - b.sort_order).map((unit, idx) => {
                          const prog = enProgress[unit.id]
                          const isSubmitting = submittingUnitId === `${en.id}-${unit.id}`

                          return (
                            <div key={unit.id} className="overflow-hidden">
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
                                  {/* Green checkmark if verified */}
                                  {prog?.status === 'verified' && <span className="text-green-600 text-lg">✓</span>}
                                  {/* Submit button if not submitted or rejected */}
                                  {(!prog || prog.status === 'rejected') && en.status === 'active' && (
                                    <button onClick={() => setSubmittingUnitId(isSubmitting ? null : `${en.id}-${unit.id}`)}
                                      className="text-xs font-semibold text-red-600 hover:text-red-800">
                                      {isSubmitting ? 'Cancel' : prog?.status === 'rejected' ? 'Resubmit' : 'Submit'}
                                    </button>
                                  )}
                                  {/* Pending — no action */}
                                  {prog?.status === 'pending' && <span className="text-xs text-zinc-400">Pending</span>}
                                </div>
                              </div>

                              {/* Submit form */}
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
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── CERTIFICATIONS ───────────────────────────────────────────────────── */}
      {tab === 'certifications' && (
        <div>
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
                  return (
                    <div key={cert.id} className="px-5 py-4">
                      <div className="flex items-start justify-between">
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
                        <span className="text-xs rounded-full bg-zinc-100 text-zinc-500 px-2 py-0.5 ml-3 shrink-0">
                          {cert.source === 'course_completion' ? 'Course' : 'Direct Entry'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TRAINING HISTORY ─────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div>
          {trainingEvents.length === 0 ? (
            <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
              No training events on record.
            </div>
          ) : (
            <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
              <div className="divide-y divide-zinc-100">
                {trainingEvents.map(evt => (
                  <div key={evt.id} className="flex items-center px-5 py-4 gap-3">
                    <div className="shrink-0 text-center w-10">
                      <p className="text-xs font-semibold text-zinc-400 uppercase">{new Date(evt.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</p>
                      <p className="text-xl font-bold text-zinc-900 leading-none">{new Date(evt.event_date + 'T00:00:00').getDate()}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-900">{evt.topic}</p>
                      <div className="flex gap-3 text-xs text-zinc-400">
                        {evt.location && <span>📍 {evt.location}</span>}
                        {evt.hours && <span>{evt.hours}h</span>}
                      </div>
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
}
