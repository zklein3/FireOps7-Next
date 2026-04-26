'use client'

import { useState } from 'react'
import Link from 'next/link'

type Incident = {
  id: string
  incident_number: string | null
  cad_number: string | null
  incident_date: string
  incident_type: string
  fire_subtype: string | null
  address: string | null
  status: string
  neris_reported: boolean
  created_by: string | null
  created_at: string
  creator_name: string
}

const TYPE_LABELS: Record<string, string> = {
  fire: 'Fire', rescue: 'Rescue', standby: 'Standby',
  mutual_aid: 'Mutual Aid', special: 'Special', other: 'Other',
}
const TYPE_COLORS: Record<string, string> = {
  fire: 'bg-red-100 text-red-700',
  rescue: 'bg-orange-100 text-orange-700',
  standby: 'bg-yellow-100 text-yellow-700',
  mutual_aid: 'bg-blue-100 text-blue-700',
  special: 'bg-purple-100 text-purple-700',
  other: 'bg-zinc-100 text-zinc-600',
}
const FIRE_SUBTYPE_LABELS: Record<string, string> = {
  structure: 'Structure', vehicle: 'Vehicle', grass: 'Grass', wildland: 'Wildland', other_fire: 'Other Fire',
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const ATTENDANCE_BADGE: Record<string, string> = {
  present: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  absent: 'bg-red-100 text-red-700',
}
const ATTENDANCE_LABEL: Record<string, string> = {
  present: 'Present',
  pending: 'Pending',
  absent: 'Absent',
}

function withinLogWindow(incident_date: string) {
  const windowClose = new Date(new Date(incident_date + 'T23:59:59').getTime() + 7 * 24 * 60 * 60 * 1000)
  return new Date() <= windowClose
}

export default function IncidentsClient({
  incidents,
  isOfficerOrAbove,
  myAttendanceMap = {},
}: {
  incidents: Incident[]
  isOfficerOrAbove: boolean
  myPersonnelId: string
  myAttendanceMap?: Record<string, string>
}) {
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = incidents.filter(i => {
    if (typeFilter !== 'all' && i.incident_type !== typeFilter) return false
    if (statusFilter !== 'all' && i.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !i.incident_number?.toLowerCase().includes(q) &&
        !i.cad_number?.toLowerCase().includes(q) &&
        !i.address?.toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  const pendingCount = incidents.filter(i => i.status === 'pending').length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Incidents</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Last 6 months</p>
        </div>
        <Link href="/incidents/new" className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors">
          + New Incident
        </Link>
      </div>

      {isOfficerOrAbove && pendingCount > 0 && (
        <div className="mb-5 rounded-xl bg-yellow-50 border border-yellow-200 px-5 py-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-yellow-800">
            {pendingCount} incident{pendingCount !== 1 ? 's' : ''} pending review
          </p>
          <button
            onClick={() => setStatusFilter('pending')}
            className="text-xs font-semibold text-yellow-800 hover:underline"
          >
            Show pending →
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search by number or address…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 w-64"
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        >
          <option value="all">All Types</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="finalized">Finalized</option>
        </select>
        {(typeFilter !== 'all' || statusFilter !== 'all' || search) && (
          <button onClick={() => { setTypeFilter('all'); setStatusFilter('all'); setSearch('') }} className="text-sm text-zinc-500 hover:text-zinc-700">
            Clear
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center">
          <p className="text-zinc-400 text-sm">No incidents found.</p>
          <Link href="/incidents/new" className="mt-3 inline-block text-sm font-semibold text-red-700 hover:underline">
            Log the first one →
          </Link>
        </div>
      ) : (
        <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="text-left px-5 py-3 font-semibold text-zinc-500 text-xs uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-zinc-500 text-xs uppercase tracking-wide">Number</th>
                  <th className="text-left px-4 py-3 font-semibold text-zinc-500 text-xs uppercase tracking-wide">Type</th>
                  <th className="text-left px-4 py-3 font-semibold text-zinc-500 text-xs uppercase tracking-wide">Address</th>
                  <th className="text-left px-4 py-3 font-semibold text-zinc-500 text-xs uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-zinc-500 text-xs uppercase tracking-wide">NERIS</th>
                  {!isOfficerOrAbove && <th className="text-left px-4 py-3 font-semibold text-zinc-500 text-xs uppercase tracking-wide">My Attendance</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map(i => (
                  <tr key={i.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-5 py-3 text-zinc-700 whitespace-nowrap">{formatDate(i.incident_date)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/incidents/${i.id}`} className="font-semibold text-red-700 hover:underline">
                        {i.incident_number || i.cad_number || 'Untitled'}
                      </Link>
                      {i.cad_number && i.incident_number && (
                        <p className="text-xs text-zinc-400">CAD: {i.cad_number}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[i.incident_type]}`}>
                        {i.fire_subtype ? FIRE_SUBTYPE_LABELS[i.fire_subtype] ?? TYPE_LABELS[i.incident_type] : TYPE_LABELS[i.incident_type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 max-w-[200px] truncate">{i.address || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${i.status === 'finalized' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {i.status === 'finalized' ? 'Finalized' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {i.neris_reported
                        ? <span className="text-green-600 text-xs font-medium">✓ Reported</span>
                        : <span className="text-zinc-400 text-xs">—</span>
                      }
                    </td>
                    {!isOfficerOrAbove && (
                      <td className="px-4 py-3">
                        {myAttendanceMap[i.id] ? (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ATTENDANCE_BADGE[myAttendanceMap[i.id]] ?? 'bg-zinc-100 text-zinc-600'}`}>
                            {ATTENDANCE_LABEL[myAttendanceMap[i.id]] ?? myAttendanceMap[i.id]}
                          </span>
                        ) : i.status !== 'finalized' && withinLogWindow(i.incident_date) ? (
                          <Link href={`/incidents/${i.id}`} className="text-xs font-semibold text-red-700 hover:underline">
                            Log →
                          </Link>
                        ) : (
                          <span className="text-zinc-400 text-xs">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
