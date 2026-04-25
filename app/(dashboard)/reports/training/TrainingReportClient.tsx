'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { CertRow, EnrollmentRow, TrainingAttendanceRow } from './page'

type PersonnelOption = { id: string; name: string }
type CertTypeOption = { id: string; name: string }

function formatDate(val: string | null) {
  if (!val) return '—'
  return new Date(val + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

type ExpiryStatus = 'none' | 'ok' | 'expiring_soon' | 'expired'

function getExpiryStatus(cert: CertRow, expiryDays: number): ExpiryStatus {
  if (!cert.does_expire) return 'none'
  if (!cert.expiration_date) return 'none'
  const now = new Date()
  const expDate = new Date(cert.expiration_date + 'T00:00:00')
  if (expDate < now) return 'expired'
  const threshold = new Date(now)
  threshold.setDate(threshold.getDate() + expiryDays)
  if (expDate <= threshold) return 'expiring_soon'
  return 'ok'
}

function ExpiryBadge({ status, expirationDate }: { status: ExpiryStatus; expirationDate: string | null }) {
  if (status === 'none') return <span className="text-xs text-zinc-400">No Expiration</span>
  if (status === 'expired') return (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">
      Expired {expirationDate ? formatDate(expirationDate) : ''}
    </span>
  )
  if (status === 'expiring_soon') return (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-yellow-100 text-yellow-800">
      Exp. {formatDate(expirationDate)}
    </span>
  )
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">
      {formatDate(expirationDate)}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase()
  if (normalized === 'verified' || normalized === 'completed') {
    return <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">{status}</span>
  }
  if (normalized === 'pending') {
    return <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-yellow-100 text-yellow-800">{status}</span>
  }
  if (normalized === 'active') {
    return <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">{status}</span>
  }
  return <span className="text-xs text-zinc-500">{status}</span>
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-4 text-center">
      <div className={`text-2xl font-bold ${color ?? 'text-zinc-800'}`}>{value}</div>
      <div className="text-xs text-zinc-400 mt-0.5">{label}</div>
    </div>
  )
}

export default function TrainingReportClient({
  certs,
  enrollments,
  trainingAttendance,
  personnelList,
  certTypeList,
  dateFrom,
  dateTo,
  selectedPersonnelId,
  selectedCertTypeId,
  expiryDays: initialExpiryDays,
}: {
  certs: CertRow[]
  enrollments: EnrollmentRow[]
  trainingAttendance: TrainingAttendanceRow[]
  personnelList: PersonnelOption[]
  certTypeList: CertTypeOption[]
  dateFrom: string
  dateTo: string
  selectedPersonnelId: string | null
  selectedCertTypeId: string | null
  expiryDays: number
}) {
  const router = useRouter()
  const pathname = usePathname()

  const [fromVal, setFromVal] = useState(dateFrom)
  const [toVal, setToVal] = useState(dateTo)
  const [personnelVal, setPersonnelVal] = useState(selectedPersonnelId ?? '')
  const [certTypeVal, setCertTypeVal] = useState(selectedCertTypeId ?? '')
  const [expiryDaysVal, setExpiryDaysVal] = useState(String(initialExpiryDays))

  function applyFilters() {
    const params = new URLSearchParams()
    if (fromVal) params.set('from', fromVal)
    if (toVal) params.set('to', toVal)
    if (personnelVal) params.set('personnelId', personnelVal)
    if (certTypeVal) params.set('certTypeId', certTypeVal)
    if (expiryDaysVal && expiryDaysVal !== '90') params.set('expiryDays', expiryDaysVal)
    router.push(`${pathname}?${params.toString()}`)
  }

  function handlePrint() {
    window.print()
  }

  const expiryDays = parseInt(expiryDaysVal, 10) || 90

  // Compute expiry stats
  const certStatuses = certs.map(c => getExpiryStatus(c, expiryDays))
  const expiringSoonCount = certStatuses.filter(s => s === 'expiring_soon').length
  const expiredCount = certStatuses.filter(s => s === 'expired').length
  const trainingHours = trainingAttendance
    .filter(a => a.status === 'verified' || a.status === 'pending')
    .reduce((sum, a) => sum + (a.hours ?? 0), 0)

  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Training &amp; Certification Report</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{dateFrom} — {dateTo}</p>
        </div>
        <button
          onClick={handlePrint}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors shrink-0"
        >
          Print
        </button>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-xl font-bold">Training &amp; Certification Report</h1>
        <p className="text-sm text-zinc-500">Period: {dateFrom} — {dateTo}</p>
        {selectedPersonnelId && personnelList.find(p => p.id === selectedPersonnelId) && (
          <p className="text-sm text-zinc-500">Member: {personnelList.find(p => p.id === selectedPersonnelId)!.name}</p>
        )}
        {selectedCertTypeId && certTypeList.find(c => c.id === selectedCertTypeId) && (
          <p className="text-sm text-zinc-500">Cert Type: {certTypeList.find(c => c.id === selectedCertTypeId)!.name}</p>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-zinc-200 p-4 mb-6 print:hidden">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">From</label>
            <input
              type="date"
              value={fromVal}
              onChange={e => setFromVal(e.target.value)}
              className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">To</label>
            <input
              type="date"
              value={toVal}
              onChange={e => setToVal(e.target.value)}
              className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Member</label>
            <select
              value={personnelVal}
              onChange={e => setPersonnelVal(e.target.value)}
              className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
            >
              <option value="">All Members</option>
              {personnelList.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Cert Type</label>
            <select
              value={certTypeVal}
              onChange={e => setCertTypeVal(e.target.value)}
              className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
            >
              <option value="">All Types</option>
              {certTypeList.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Flag Expiring Within</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={730}
                value={expiryDaysVal}
                onChange={e => setExpiryDaysVal(e.target.value)}
                className="w-20 rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
              <span className="text-xs text-zinc-500">days</span>
            </div>
          </div>
          <div>
            <button
              onClick={applyFilters}
              className="w-full rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Certifications" value={certs.length} />
        <StatCard label={`Expiring (${expiryDays}d)`} value={expiringSoonCount} color={expiringSoonCount > 0 ? 'text-yellow-700' : 'text-zinc-800'} />
        <StatCard label="Expired" value={expiredCount} color={expiredCount > 0 ? 'text-red-700' : 'text-zinc-800'} />
        <StatCard label="Training Hours" value={Math.round(trainingHours * 10) / 10} />
      </div>

      {/* ── Certifications ─────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-zinc-800 mb-3">
          Certifications
          <span className="ml-2 text-sm font-normal text-zinc-400">({certs.length})</span>
        </h2>
        {certs.length === 0 ? (
          <p className="text-sm text-zinc-500 py-6 text-center bg-white rounded-lg border border-zinc-200">No certifications match the current filters.</p>
        ) : (
          <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left">
                  <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs">Member</th>
                  <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs">Certification</th>
                  <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs hidden sm:table-cell">Issuing Body</th>
                  <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs hidden md:table-cell">Cert #</th>
                  <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs">Issued</th>
                  <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs">Expiration</th>
                  <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs hidden sm:table-cell">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {certs.map(cert => {
                  const status = getExpiryStatus(cert, expiryDays)
                  return (
                    <tr
                      key={cert.id}
                      className={status === 'expiring_soon' ? 'bg-yellow-50' : status === 'expired' ? 'bg-red-50' : ''}
                    >
                      <td className="px-4 py-2.5 font-medium text-zinc-800">{cert.member_name}</td>
                      <td className="px-4 py-2.5 text-zinc-700">{cert.cert_name}</td>
                      <td className="px-4 py-2.5 text-zinc-500 hidden sm:table-cell">{cert.issuing_body ?? '—'}</td>
                      <td className="px-4 py-2.5 text-zinc-500 font-mono text-xs hidden md:table-cell">{cert.cert_number ?? '—'}</td>
                      <td className="px-4 py-2.5 text-zinc-600 whitespace-nowrap">{formatDate(cert.issued_date)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <ExpiryBadge status={status} expirationDate={cert.expiration_date} />
                      </td>
                      <td className="px-4 py-2.5 text-zinc-400 text-xs capitalize hidden sm:table-cell">
                        {cert.source.replace('_', ' ')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Course Enrollments ──────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-zinc-800 mb-3">
          Course Enrollments
          <span className="ml-2 text-sm font-normal text-zinc-400">({enrollments.length})</span>
        </h2>
        {enrollments.length === 0 ? (
          <p className="text-sm text-zinc-500 py-6 text-center bg-white rounded-lg border border-zinc-200">No enrollments match the current filters.</p>
        ) : (
          <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left">
                  <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs">Member</th>
                  <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs">Course</th>
                  <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs hidden sm:table-cell">Enrolled</th>
                  <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs">Status</th>
                  <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {enrollments.map(enroll => (
                  <tr key={enroll.id}>
                    <td className="px-4 py-2.5 font-medium text-zinc-800">{enroll.member_name}</td>
                    <td className="px-4 py-2.5 text-zinc-700">{enroll.cert_name}</td>
                    <td className="px-4 py-2.5 text-zinc-500 hidden sm:table-cell">{formatDate(enroll.enrolled_at)}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={enroll.enrollment_status} />
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">
                      {enroll.units_total > 0 ? (
                        <span>
                          <span className="font-medium">{enroll.units_verified}</span>
                          <span className="text-zinc-400">/{enroll.units_total}</span>
                          {enroll.units_completed > enroll.units_verified && (
                            <span className="ml-1 text-xs text-yellow-600">
                              ({enroll.units_completed - enroll.units_verified} pending)
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-zinc-400 text-xs">No units</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Training Event Attendance ───────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-zinc-800 mb-3">
          Training Events
          <span className="ml-2 text-sm font-normal text-zinc-400">({trainingAttendance.length} records)</span>
        </h2>
        {trainingAttendance.length === 0 ? (
          <p className="text-sm text-zinc-500 py-6 text-center bg-white rounded-lg border border-zinc-200">No training attendance records in this period.</p>
        ) : (
          <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left">
                  <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs">Date</th>
                  <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs">Topic</th>
                  <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs hidden sm:table-cell">Hours</th>
                  <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs hidden md:table-cell">Location</th>
                  <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs">Member</th>
                  <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {trainingAttendance.map(att => (
                  <tr key={att.id}>
                    <td className="px-4 py-2.5 text-zinc-600 whitespace-nowrap">{formatDate(att.event_date)}</td>
                    <td className="px-4 py-2.5 text-zinc-700">{att.topic}</td>
                    <td className="px-4 py-2.5 text-zinc-500 hidden sm:table-cell">
                      {att.hours != null ? att.hours : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500 hidden md:table-cell">{att.location ?? '—'}</td>
                    <td className="px-4 py-2.5 font-medium text-zinc-800">{att.member_name}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={att.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
