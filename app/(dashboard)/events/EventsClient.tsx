'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { logAttendance, verifyAttendance, cancelEventInstance } from '@/app/actions/attendance'

interface AttendanceRecord {
  id: string
  instance_id: string
  status: string
  submitted_at: string
}

interface Event {
  id: string
  series_id: string
  title: string
  event_type: string
  description: string | null
  recurrence_type: string
  event_date: string
  start_time: string | null
  location: string | null
  status: string
  notes: string | null
  requires_verification: boolean
  my_attendance: AttendanceRecord | null
  pending_count: number
}

interface Personnel {
  id: string
  name: string
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  training: 'bg-blue-100 text-blue-700',
  meeting: 'bg-purple-100 text-purple-700',
  incident: 'bg-red-100 text-red-700',
  special: 'bg-green-100 text-green-700',
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  training: 'Training',
  meeting: 'Meeting',
  incident: 'Incident',
  special: 'Special Event',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  verified: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  excused: 'bg-zinc-100 text-zinc-500',
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(timeStr: string | null) {
  if (!timeStr) return null
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${m} ${ampm}`
}

function isWindowOpen(event_date: string, start_time: string | null): boolean {
  const eventDateTime = new Date(`${event_date}T${start_time || '00:00'}`)
  const windowClose = new Date(eventDateTime.getTime() + 12 * 60 * 60 * 1000)
  return new Date() <= windowClose
}

function isPast(event_date: string): boolean {
  return new Date(event_date + 'T23:59:59') < new Date()
}

export default function EventsClient({
  events, personnelList, myPersonnelId, myName, isOfficerOrAbove, isAdmin,
}: {
  events: Event[]
  personnelList: Personnel[]
  myPersonnelId: string
  myName: string
  isOfficerOrAbove: boolean
  isAdmin: boolean
}) {
  const router = useRouter()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  function reset() { setError(null); setSuccess(null) }

  // Split events
  const today = new Date().toISOString().split('T')[0]
  const filteredEvents = events.filter(e => {
    if (typeFilter !== 'all' && e.event_type !== typeFilter) return false
    if (filter === 'upcoming') return e.event_date >= today
    if (filter === 'past') return e.event_date < today
    return true
  })

  async function handleSelfLog(event: Event) {
    reset()
    setLoading(true)
    const result = await logAttendance(event.id, [myPersonnelId])
    if (result?.error) setError(result.error)
    else { setSuccess('Attendance logged.'); router.refresh() }
    setLoading(false)
  }

  async function handleBulkLog(event: Event) {
    if (bulkSelected.size === 0) { setError('Select at least one person.'); return }
    reset()
    setLoading(true)
    const result = await logAttendance(event.id, Array.from(bulkSelected))
    if (result?.error) setError(result.error)
    else { setSuccess(`Logged attendance for ${bulkSelected.size} members.`); setBulkSelected(new Set()); router.refresh() }
    setLoading(false)
  }

  async function handleCancel(instance_id: string) {
    if (!confirm('Cancel this event?')) return
    reset()
    setLoading(true)
    const result = await cancelEventInstance(instance_id)
    if (result?.error) setError(result.error)
    else { setSuccess('Event cancelled.'); router.refresh() }
    setLoading(false)
  }

  function toggleBulk(id: string) {
    setBulkSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllBulk(ids: string[]) {
    if (bulkSelected.size === ids.length) setBulkSelected(new Set())
    else setBulkSelected(new Set(ids))
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Events</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Training, meetings, and department events</p>
        </div>
        {isOfficerOrAbove && (
          <button
            onClick={() => router.push('/events/new')}
            className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
            + New Event
          </button>
        )}
      </div>

      {success && <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-200">{success}</div>}
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        <div className="flex gap-1 bg-white rounded-xl border border-zinc-200 p-1">
          {(['upcoming', 'past', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors capitalize ${filter === f ? 'bg-red-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-white rounded-xl border border-zinc-200 p-1">
          {(['all', 'training', 'meeting', 'incident', 'special'] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors capitalize ${typeFilter === t ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>
              {t === 'all' ? 'All Types' : EVENT_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Event List */}
      {filteredEvents.length === 0 ? (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          No events found.
          {isOfficerOrAbove && <span> <button onClick={() => router.push('/events/new')} className="text-red-600 font-semibold hover:underline">Create one?</button></span>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredEvents.map(event => {
            const isExpanded = expandedId === event.id
            const past = isPast(event.event_date)
            const windowOpen = isWindowOpen(event.event_date, event.start_time)
            const canSelfLog = !past || windowOpen
            const cancelled = event.status === 'cancelled'
            const allIds = personnelList.map(p => p.id)

            return (
              <div key={event.id} className={`rounded-xl bg-white shadow-sm border overflow-hidden ${cancelled ? 'border-zinc-100 opacity-60' : 'border-zinc-200'}`}>
                {/* Event Row */}
                <div className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    {/* Date block */}
                    <div className="shrink-0 text-center w-12">
                      <p className="text-xs font-semibold text-zinc-400 uppercase">
                        {new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                      </p>
                      <p className="text-2xl font-bold text-zinc-900 leading-none">
                        {new Date(event.event_date + 'T00:00:00').getDate()}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                      </p>
                    </div>

                    {/* Event info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-zinc-900">{event.title}</p>
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${EVENT_TYPE_COLORS[event.event_type]}`}>
                          {EVENT_TYPE_LABELS[event.event_type]}
                        </span>
                        {cancelled && <span className="text-xs rounded-full bg-zinc-100 text-zinc-400 px-2 py-0.5">Cancelled</span>}
                        {event.requires_verification && !cancelled && (
                          <span className="text-xs text-zinc-400">Requires verification</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                        {event.start_time && <span>🕐 {formatTime(event.start_time)}</span>}
                        {event.location && <span>📍 {event.location}</span>}
                        {isOfficerOrAbove && event.pending_count > 0 && (
                          <span className="text-yellow-600 font-semibold">⏳ {event.pending_count} pending</span>
                        )}
                      </div>
                      {event.description && <p className="text-xs text-zinc-400 mt-1">{event.description}</p>}
                    </div>

                    {/* Right side actions */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {/* My attendance status */}
                      {event.my_attendance && (
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[event.my_attendance.status]}`}>
                          {event.my_attendance.status.charAt(0).toUpperCase() + event.my_attendance.status.slice(1)}
                        </span>
                      )}

                      {/* Self-log button */}
                      {!cancelled && !event.my_attendance && canSelfLog && (
                        <button
                          onClick={() => handleSelfLog(event)}
                          disabled={loading}
                          className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                          Log Attendance
                        </button>
                      )}

                      {/* Past + window closed for members */}
                      {!cancelled && !event.my_attendance && past && !windowOpen && !isOfficerOrAbove && (
                        <span className="text-xs text-zinc-400">Window closed</span>
                      )}

                      {/* Expand for officers */}
                      {!cancelled && (
                        <button
                          onClick={() => { setExpandedId(isExpanded ? null : event.id); setBulkSelected(new Set()); reset() }}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                          {isExpanded ? 'Hide' : isOfficerOrAbove ? 'Manage' : 'Details'}
                        </button>
                      )}

                      {/* Cancel */}
                      {isOfficerOrAbove && !cancelled && (
                        <button onClick={() => handleCancel(event.id)} className="text-xs text-zinc-400 hover:text-red-600">
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Panel */}
                {isExpanded && (
                  <div className="border-t border-zinc-100 bg-zinc-50 px-5 py-4">

                    {/* Past event warning */}
                    {past && (
                      <div className="mb-3 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-2 text-xs text-yellow-700">
                        ⚠️ This event occurred on {formatDate(event.event_date)}.
                        {event.pending_count > 0 && ` Attendance has already been logged for ${event.pending_count} members.`}
                        {' '}You are modifying an existing record.
                      </div>
                    )}

                    {isOfficerOrAbove ? (
                      <div>
                        {/* Bulk attendance logging */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">Log Attendance</p>
                            <button
                              onClick={() => toggleAllBulk(allIds)}
                              className="text-xs text-blue-600 font-semibold hover:text-blue-800">
                              {bulkSelected.size === allIds.length ? 'Deselect All' : 'Select All'}
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto mb-3">
                            {personnelList.map(p => (
                              <label key={p.id} className="flex items-center gap-2 rounded-lg bg-white border border-zinc-200 px-3 py-2 cursor-pointer hover:bg-zinc-50">
                                <input
                                  type="checkbox"
                                  checked={bulkSelected.has(p.id)}
                                  onChange={() => toggleBulk(p.id)}
                                  className="rounded border-zinc-300 text-red-600 focus:ring-red-500"
                                />
                                <span className="text-xs text-zinc-800">{p.name}</span>
                              </label>
                            ))}
                          </div>
                          <button
                            onClick={() => handleBulkLog(event)}
                            disabled={loading || bulkSelected.size === 0}
                            className="w-full rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                            {loading ? 'Logging...' : `Log ${bulkSelected.size > 0 ? bulkSelected.size : ''} ${bulkSelected.size === 1 ? 'Member' : 'Members'}`}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {event.notes && <p className="text-sm text-zinc-600">{event.notes}</p>}
                        {!event.notes && <p className="text-xs text-zinc-400">No additional details.</p>}
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
  )
}
