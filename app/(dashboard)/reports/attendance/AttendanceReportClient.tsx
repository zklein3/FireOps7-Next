'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { MemberSummaryRow, AttendanceDetailRow, RequirementRow, EventTypeOption } from './page'

type PersonnelOption = { id: string; name: string }

function formatDate(val: string | null) {
  if (!val) return '—'
  return new Date(val + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function RateBadge({ rate, threshold }: { rate: number; threshold?: number }) {
  const below = threshold != null && rate < threshold
  if (below) {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">
        {rate}%
      </span>
    )
  }
  if (rate >= 90) {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">
        {rate}%
      </span>
    )
  }
  if (rate >= 70) {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-yellow-100 text-yellow-800">
        {rate}%
      </span>
    )
  }
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">
      {rate}%
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    present: 'bg-green-100 text-green-800',
    excused: 'bg-blue-100 text-blue-800',
    absent: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${map[status] ?? 'bg-zinc-100 text-zinc-600'}`}>
      {status}
    </span>
  )
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-4 text-center">
      <div className={`text-2xl font-bold ${color ?? 'text-zinc-800'}`}>{value}</div>
      {sub && <div className="text-sm text-zinc-500">{sub}</div>}
      <div className="text-xs text-zinc-400 mt-0.5">{label}</div>
    </div>
  )
}

type ViewMode = 'summary' | 'detail'

export default function AttendanceReportClient({
  memberSummaries,
  detailRows,
  requirements,
  personnelList,
  eventTypes,
  dateFrom,
  dateTo,
  selectedPersonnelId,
  selectedEventType,
  totalEventsInRange,
}: {
  memberSummaries: MemberSummaryRow[]
  detailRows: AttendanceDetailRow[]
  requirements: RequirementRow[]
  personnelList: PersonnelOption[]
  eventTypes: EventTypeOption[]
  dateFrom: string
  dateTo: string
  selectedPersonnelId: string | null
  selectedEventType: string | null
  totalEventsInRange: number
}) {
  const router = useRouter()
  const pathname = usePathname()

  const [fromVal, setFromVal] = useState(dateFrom)
  const [toVal, setToVal] = useState(dateTo)
  const [personnelVal, setPersonnelVal] = useState(selectedPersonnelId ?? '')
  const [eventTypeVal, setEventTypeVal] = useState(selectedEventType ?? '')
  const [view, setView] = useState<ViewMode>('summary')

  function applyFilters() {
    const params = new URLSearchParams()
    if (fromVal) params.set('from', fromVal)
    if (toVal) params.set('to', toVal)
    if (personnelVal) params.set('personnelId', personnelVal)
    if (eventTypeVal) params.set('eventType', eventTypeVal)
    router.push(`${pathname}?${params.toString()}`)
  }

  // Threshold for the selected event type (if any)
  const activeThreshold = selectedEventType
    ? requirements.find(r => r.event_type === selectedEventType)?.minimum_percentage
    : undefined

  // Aggregate stats
  const totalPresent = memberSummaries.reduce((s, m) => s + m.present, 0)
  const totalExcused = memberSummaries.reduce((s, m) => s + m.excused, 0)
  const totalAbsent = memberSummaries.reduce((s, m) => s + m.absent, 0)
  const memberCount = memberSummaries.length
  const avgRate = memberCount > 0
    ? Math.round(memberSummaries.reduce((s, m) => s + m.rate, 0) / memberCount)
    : 0
  const belowThreshold = activeThreshold != null
    ? memberSummaries.filter(m => m.rate < activeThreshold).length
    : 0

  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Attendance Report</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{dateFrom} — {dateTo}</p>
        </div>
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors shrink-0"
        >
          Print
        </button>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-xl font-bold">Attendance Report</h1>
        <p className="text-sm text-zinc-500">Period: {dateFrom} — {dateTo}</p>
        {selectedEventType && <p className="text-sm text-zinc-500">Event Type: {selectedEventType}</p>}
        {selectedPersonnelId && personnelList.find(p => p.id === selectedPersonnelId) && (
          <p className="text-sm text-zinc-500">Member: {personnelList.find(p => p.id === selectedPersonnelId)!.name}</p>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-zinc-200 p-4 mb-6 print:hidden">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
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
            <label className="block text-xs font-medium text-zinc-600 mb-1">Event Type</label>
            <select
              value={eventTypeVal}
              onChange={e => setEventTypeVal(e.target.value)}
              className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
            >
              <option value="">All Types</option>
              {eventTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
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

      {/* Participation requirement notice */}
      {activeThreshold != null && (
        <div className={`rounded-lg border px-4 py-2.5 mb-4 text-sm print:hidden ${belowThreshold > 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
          {selectedEventType} requirement: <strong>{activeThreshold}%</strong> participation
          {belowThreshold > 0
            ? ` — ${belowThreshold} member${belowThreshold > 1 ? 's' : ''} below threshold`
            : ' — all members meeting requirement'}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Events in Range" value={totalEventsInRange} />
        <StatCard label="Avg Participation" value={`${avgRate}%`} color={avgRate >= 80 ? 'text-green-700' : avgRate >= 60 ? 'text-yellow-700' : 'text-red-700'} />
        <StatCard label="Present Records" value={totalPresent} />
        <StatCard label="Excused Records" value={totalExcused} />
      </div>

      {/* View toggle */}
      <div className="flex gap-2 mb-4 print:hidden">
        <button
          onClick={() => setView('summary')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'summary' ? 'bg-red-700 text-white' : 'bg-white border border-zinc-300 text-zinc-600 hover:bg-zinc-50'}`}
        >
          Member Summary
        </button>
        <button
          onClick={() => setView('detail')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'detail' ? 'bg-red-700 text-white' : 'bg-white border border-zinc-300 text-zinc-600 hover:bg-zinc-50'}`}
        >
          Event Detail
        </button>
      </div>

      {/* ── Member Summary ──────────────────────────────────────────── */}
      {(view === 'summary' || true) && (
        <section className={`mb-8 ${view !== 'summary' ? 'hidden print:block' : ''}`}>
          <h2 className="text-base font-semibold text-zinc-800 mb-3 print:block hidden">Member Summary</h2>
          {memberSummaries.length === 0 ? (
            <p className="text-sm text-zinc-500 py-6 text-center bg-white rounded-lg border border-zinc-200">No attendance data for this period.</p>
          ) : (
            <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-left">
                    <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs">Member</th>
                    <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs text-center">Events</th>
                    <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs text-center">Present</th>
                    <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs text-center hidden sm:table-cell">Excused</th>
                    <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs text-center hidden sm:table-cell">Absent</th>
                    <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs text-center hidden md:table-cell">Not Logged</th>
                    <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs text-center">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {memberSummaries.map(m => {
                    const below = activeThreshold != null && m.rate < activeThreshold
                    return (
                      <tr key={m.personnel_id} className={below ? 'bg-red-50' : ''}>
                        <td className="px-4 py-2.5 font-medium text-zinc-800">{m.member_name}</td>
                        <td className="px-4 py-2.5 text-zinc-500 text-center">{m.total_events}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="font-medium text-green-700">{m.present}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center hidden sm:table-cell">
                          <span className="text-blue-700">{m.excused}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center hidden sm:table-cell">
                          <span className={m.absent > 0 ? 'text-red-700 font-medium' : 'text-zinc-400'}>{m.absent}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center text-zinc-400 hidden md:table-cell">{m.not_logged}</td>
                        <td className="px-4 py-2.5 text-center">
                          <RateBadge rate={m.rate} threshold={activeThreshold} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {activeThreshold != null && (
                <div className="px-4 py-2 border-t border-zinc-100 text-xs text-zinc-400">
                  Rate = (Present + Excused) ÷ Total Events. Threshold: {activeThreshold}%.
                </div>
              )}
              {activeThreshold == null && (
                <div className="px-4 py-2 border-t border-zinc-100 text-xs text-zinc-400">
                  Rate = (Present + Excused) ÷ Total Events in range.
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Event Detail ────────────────────────────────────────────── */}
      {(view === 'detail' || true) && (
        <section className={`mb-8 ${view !== 'detail' ? 'hidden print:block' : ''}`}>
          <h2 className="text-base font-semibold text-zinc-800 mb-3 print:block hidden">Event Detail</h2>
          {detailRows.length === 0 ? (
            <p className="text-sm text-zinc-500 py-6 text-center bg-white rounded-lg border border-zinc-200">No attendance records in this period.</p>
          ) : (
            <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-left">
                    <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs">Date</th>
                    <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs">Event</th>
                    <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs hidden sm:table-cell">Type</th>
                    <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs">Member</th>
                    <th className="px-4 py-2.5 font-medium text-zinc-600 text-xs">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {detailRows.map(row => (
                    <tr key={row.attendance_id ?? `${row.instance_id}-${row.personnel_id}`}>
                      <td className="px-4 py-2.5 text-zinc-600 whitespace-nowrap">{formatDate(row.event_date)}</td>
                      <td className="px-4 py-2.5 text-zinc-700">{row.event_title}</td>
                      <td className="px-4 py-2.5 text-zinc-500 capitalize hidden sm:table-cell">{row.event_type}</td>
                      <td className="px-4 py-2.5 font-medium text-zinc-800">{row.member_name}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
