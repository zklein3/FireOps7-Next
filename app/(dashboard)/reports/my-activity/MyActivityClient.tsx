'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type AttendanceRow = {
  id: string
  status: string
  submitted_at: string | null
  event_date: string
  event_title: string
  event_type: string
}

type InspectionRow = {
  id: string
  inspected_at: string
  overall_result: string
  apparatus: string
  compartment: string
  asset_tag: string
  item_name: string
}

type IncidentRow = {
  id: string
  incident_number: string
  incident_date: string
  incident_type: string
  address: string
  role: string
  personnel_status: string
}

type Tab = 'attendance' | 'inspections' | 'incidents'

function formatDate(dateStr: string) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    present: 'bg-green-100 text-green-800',
    excused: 'bg-blue-100 text-blue-800',
    absent: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
    excused_pending: 'bg-blue-50 text-blue-600',
    PASS: 'bg-green-100 text-green-800',
    FAIL: 'bg-red-100 text-red-800',
  }
  const labels: Record<string, string> = {
    excused_pending: 'Excuse Requested',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${map[status] ?? 'bg-zinc-100 text-zinc-600'}`}>
      {labels[status] ?? status.toLowerCase()}
    </span>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
    </div>
  )
}

export default function MyActivityClient({
  myName,
  attendance,
  inspections,
  incidents,
  dateFrom,
  dateTo,
}: {
  myName: string
  attendance: AttendanceRow[]
  inspections: InspectionRow[]
  incidents: IncidentRow[]
  dateFrom: string
  dateTo: string
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('attendance')
  const [from, setFrom] = useState(dateFrom)
  const [to, setTo] = useState(dateTo)

  function applyFilter() {
    router.push(`/reports/my-activity?from=${from}&to=${to}`)
  }

  const attendanceCounts = {
    present: attendance.filter(a => a.status === 'present').length,
    excused: attendance.filter(a => a.status === 'excused').length,
    absent: attendance.filter(a => a.status === 'absent').length,
    pending: attendance.filter(a => a.status === 'pending' || a.status === 'excused_pending').length,
  }

  const inspectionCounts = {
    pass: inspections.filter(i => i.overall_result === 'PASS').length,
    fail: inspections.filter(i => i.overall_result === 'FAIL').length,
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'attendance', label: 'Attendance', count: attendance.length },
    { id: 'inspections', label: 'Inspections', count: inspections.length },
    { id: 'incidents', label: 'Incidents', count: incidents.length },
  ]

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">My Activity</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{myName}</p>
      </div>

      {/* Date filter */}
      <div className="bg-white rounded-lg border border-zinc-200 p-4 mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
          />
        </div>
        <button
          onClick={applyFilter}
          className="rounded-lg bg-red-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-600 transition-colors"
        >
          Apply
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-zinc-200">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-red-700 text-red-700'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-zinc-400">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Attendance tab */}
      {tab === 'attendance' && (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="Present" value={attendanceCounts.present} color="text-green-700" />
            <StatCard label="Excused" value={attendanceCounts.excused} color="text-blue-700" />
            <StatCard label="Absent" value={attendanceCounts.absent} color="text-red-700" />
            <StatCard label="Pending" value={attendanceCounts.pending} color="text-yellow-700" />
          </div>
          {attendance.length === 0 ? (
            <p className="text-sm text-zinc-500 py-8 text-center">No attendance records in this date range.</p>
          ) : (
            <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="px-4 py-3 text-left font-medium text-zinc-600">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-600">Event</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-600">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {attendance.map(a => (
                    <tr key={a.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-2.5 text-zinc-700 whitespace-nowrap">{formatDate(a.event_date)}</td>
                      <td className="px-4 py-2.5 text-zinc-700">{a.event_title}</td>
                      <td className="px-4 py-2.5 text-zinc-500 capitalize">{a.event_type}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Inspections tab */}
      {tab === 'inspections' && (
        <div>
          <div className="grid grid-cols-2 gap-3 mb-6 max-w-xs">
            <StatCard label="Pass" value={inspectionCounts.pass} color="text-green-700" />
            <StatCard label="Fail" value={inspectionCounts.fail} color="text-red-700" />
          </div>
          {inspections.length === 0 ? (
            <p className="text-sm text-zinc-500 py-8 text-center">No inspections in this date range.</p>
          ) : (
            <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="px-4 py-3 text-left font-medium text-zinc-600">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-600">Apparatus</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-600">Compartment</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-600">Item</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-600">Asset</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-600">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {inspections.map(i => (
                    <tr key={i.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-2.5 text-zinc-700 whitespace-nowrap">{formatDate(i.inspected_at)}</td>
                      <td className="px-4 py-2.5 text-zinc-700">{i.apparatus}</td>
                      <td className="px-4 py-2.5 text-zinc-500">{i.compartment}</td>
                      <td className="px-4 py-2.5 text-zinc-700">{i.item_name}</td>
                      <td className="px-4 py-2.5 text-zinc-500">{i.asset_tag}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={i.overall_result} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Incidents tab */}
      {tab === 'incidents' && (
        <div>
          <div className="mb-6 max-w-xs">
            <StatCard label="Incidents Responded" value={incidents.length} color="text-zinc-800" />
          </div>
          {incidents.length === 0 ? (
            <p className="text-sm text-zinc-500 py-8 text-center">No incidents in this date range.</p>
          ) : (
            <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="px-4 py-3 text-left font-medium text-zinc-600">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-600">Incident #</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-600">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-600">Address</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-600">Role</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {incidents.map(inc => (
                    <tr key={inc.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-2.5 text-zinc-700 whitespace-nowrap">{formatDate(inc.incident_date)}</td>
                      <td className="px-4 py-2.5 text-zinc-700 font-mono">{inc.incident_number}</td>
                      <td className="px-4 py-2.5 text-zinc-700 capitalize">{inc.incident_type}</td>
                      <td className="px-4 py-2.5 text-zinc-500">{inc.address}</td>
                      <td className="px-4 py-2.5 text-zinc-500 capitalize">{inc.role}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={inc.personnel_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
