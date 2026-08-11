'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { logAttendance, requestExcuse, logExcusedAttendance } from '@/app/actions/attendance'
import EventAttendanceSignaturePadModal from '@/app/(dashboard)/signatures/EventAttendanceSignaturePadModal'
import HelpText from '@/components/HelpText'

interface AttendanceRecord {
  id: string
  instance_id: string
  status: string
  submitted_at: string
}

interface ExcuseType {
  id: string
  name: string
}

interface Event {
  id: string
  series_id: string
  title: string
  event_type: string
  description: string | null
  event_date: string
  start_time: string | null
  duration_minutes: number | null
  location: string | null
  status: string
  notes: string | null
  requires_verification: boolean
  is_training: boolean
  training_hours: number | null
  pending_sig_id: string | null
  my_attendance: AttendanceRecord | null
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
  excused_pending: 'bg-blue-50 text-blue-600',
  present: 'bg-green-100 text-green-700',
  absent: 'bg-red-100 text-red-700',
  excused: 'bg-blue-100 text-blue-700',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  excused_pending: 'Excuse Requested',
  present: 'Present',
  absent: 'Absent',
  excused: 'Excused',
}

function formatTime(timeStr: string | null) {
  if (!timeStr) return null
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${m} ${ampm}`
}

function formatEndTime(startTime: string | null, durationMinutes: number | null): string | null {
  if (!startTime || !durationMinutes) return null
  const [h, m] = startTime.split(':').map(Number)
  const total = h * 60 + m + durationMinutes
  const endH = Math.floor(total / 60) % 24
  const endM = total % 60
  const ampm = endH >= 12 ? 'PM' : 'AM'
  const hour12 = endH % 12 || 12
  return `${hour12}:${String(endM).padStart(2, '0')} ${ampm}`
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function isPast(date: string) {
  return new Date(date + 'T23:59:59') < new Date()
}

function isWindowOpen(event_date: string, start_time: string | null) {
  const eventDateTime = new Date(`${event_date}T${start_time || '00:00'}`)
  return new Date() <= new Date(eventDateTime.getTime() + 12 * 60 * 60 * 1000)
}

function isExcuseWindowOpen(event_date: string) {
  return new Date() <= new Date(new Date(event_date + 'T23:59:59').getTime() + 7 * 24 * 60 * 60 * 1000)
}

export default function EventsClient({
  events, excuseTypes, myPersonnelId, myName, isOfficerOrAbove,
}: {
  events: Event[]
  excuseTypes: ExcuseType[]
  myPersonnelId: string
  myName: string
  isOfficerOrAbove: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [confirmingLogId, setConfirmingLogId] = useState<string | null>(null)
  const [excuseOpenId, setExcuseOpenId] = useState<string | null>(null)
  const [selectedExcuseType, setSelectedExcuseType] = useState('')
  const [excuseNotes, setExcuseNotes] = useState('')
  const [activeSig, setActiveSig] = useState<{ sig_id: string; eventLabel: string } | null>(null)

  function reset() { setError(null); setSuccess(null) }

  async function handleSelfLog(instance_id: string) {
    reset(); setLoading(true)
    const result = await logAttendance(instance_id, [myPersonnelId])
    if (result?.error) setError(result.error)
    else { setSuccess('Attendance logged.'); setConfirmingLogId(null); router.refresh() }
    setLoading(false)
  }

  async function handleRequestExcuse(instance_id: string) {
    if (!selectedExcuseType) { setError('Please select an excuse type.'); return }
    reset(); setLoading(true)
    const result = isOfficerOrAbove
      ? await logExcusedAttendance(instance_id, selectedExcuseType, excuseNotes || undefined)
      : await requestExcuse(instance_id, selectedExcuseType, excuseNotes || undefined)
    if (result?.error) setError(result.error)
    else {
      setSuccess(isOfficerOrAbove ? 'Logged as excused.' : 'Excuse request submitted.')
      setExcuseOpenId(null); setSelectedExcuseType(''); setExcuseNotes(''); router.refresh()
    }
    setLoading(false)
  }

  const today = new Date().toISOString().split('T')[0]
  const filteredEvents = events.filter(e => {
    if (e.status === 'cancelled') return false
    if (typeFilter !== 'all' && e.event_type !== typeFilter) return false
    if (filter === 'upcoming') return e.event_date >= today
    if (filter === 'past') return e.event_date < today
    return true
  })

  return (
    <div className="max-w-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Events</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Upcoming meetings, drills, and training</p>
        </div>
        {isOfficerOrAbove && (
          <a href="/dept-admin/events"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors shadow-sm">
            Manage Events →
          </a>
        )}
      </div>

      <HelpText className="mb-4">
        This page shows meetings, drills, and training you're eligible to attend. Log your own attendance within the
        self-log window (usually 12 hours around the event), or request an excuse if you can't make it.
      </HelpText>

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
          {(['all', 'training', 'meeting', 'special'] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${typeFilter === t ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>
              {t === 'all' ? 'All Types' : EVENT_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
      <HelpText className="-mt-3 mb-5">
        "Upcoming" and "Past" filter by today's date. Switch to "All" if you're looking for something further back —
        past events stay visible so you can still request an excuse within the 7-day window after the event date.
      </HelpText>

      {/* Event List */}
      {filteredEvents.length === 0 ? (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          No {filter === 'upcoming' ? 'upcoming ' : filter === 'past' ? 'past ' : ''}events.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredEvents.map(event => {
            const past = isPast(event.event_date)
            const windowOpen = isWindowOpen(event.event_date, event.start_time)
            const completed = event.status === 'completed'
            const attended = !!event.my_attendance
            const noRecordOrAbsent = !event.my_attendance || event.my_attendance.status === 'absent'
            const canSelfLog = !attended && (!past || windowOpen)
            const canRequestExcuse = noRecordOrAbsent && (!past || (!windowOpen && isExcuseWindowOpen(event.event_date)))
            const excuseOpen = excuseOpenId === event.id

            return (
              <div key={event.id} className={`rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden ${completed ? 'opacity-75' : ''}`}>
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
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${EVENT_TYPE_COLORS[event.event_type] ?? 'bg-zinc-100 text-zinc-600'}`}>
                          {EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}
                        </span>
                        {event.is_training && (
                          <span className="text-xs rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 font-medium">
                            Training{event.training_hours ? ` · ${event.training_hours}h` : ''}
                          </span>
                        )}
                        {completed && <span className="text-xs rounded-full bg-green-50 text-green-600 px-2 py-0.5">Closed</span>}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                        {event.start_time && (
                          <span>
                            🕐 {formatTime(event.start_time)}
                            {formatEndTime(event.start_time, event.duration_minutes)
                              ? ` – ${formatEndTime(event.start_time, event.duration_minutes)}`
                              : ''}
                          </span>
                        )}
                        {event.location && <span>📍 {event.location}</span>}
                      </div>
                      {event.description && <p className="text-xs text-zinc-400 mt-1">{event.description}</p>}
                    </div>

                    {/* Right side actions */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {/* Attendance status */}
                      {attended && (
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[event.my_attendance!.status] ?? 'bg-zinc-100 text-zinc-600'}`}>
                          {STATUS_LABELS[event.my_attendance!.status] ?? event.my_attendance!.status}
                        </span>
                      )}

                      {/* Sign Required */}
                      {event.pending_sig_id && (
                        <button
                          onClick={() => setActiveSig({ sig_id: event.pending_sig_id!, eventLabel: `${event.title} — ${formatDate(event.event_date)}` })}
                          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600">
                          ✍ Sign Required
                        </button>
                      )}

                      {/* Log Attendance — two-step confirm */}
                      {canSelfLog && (
                        confirmingLogId === event.id ? (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleSelfLog(event.id)}
                              disabled={loading}
                              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmingLogId(null)}
                              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmingLogId(event.id)}
                            disabled={loading}
                            className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                            Log Attendance
                          </button>
                        )
                      )}

                      {/* Can't attend / Request excuse */}
                      {canRequestExcuse && !past && (
                        <button
                          onClick={() => setExcuseOpenId(excuseOpen ? null : event.id)}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                          Can&apos;t attend?
                        </button>
                      )}
                      {canRequestExcuse && past && !windowOpen && (
                        <button
                          onClick={() => setExcuseOpenId(excuseOpen ? null : event.id)}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                          Request Excuse
                        </button>
                      )}

                      {/* Window closed */}
                      {!attended && past && !windowOpen && !isExcuseWindowOpen(event.event_date) && (
                        <span className="text-xs text-zinc-400">Window closed</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Excuse Request Form */}
                {excuseOpen && (
                  <div className="border-t border-zinc-100 bg-zinc-50 px-5 py-4">
                    <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-3">
                      {isOfficerOrAbove ? 'Log Excused Absence' : !past ? 'Notify of Absence' : 'Request an Excuse'}
                    </p>
                    {!isOfficerOrAbove && (
                      <HelpText className="mb-3">
                        {!past
                          ? "Submitting this now lets your officer know ahead of time — it still needs their approval, it isn't automatic."
                          : "This goes to an officer for review. If approved, your attendance status changes from Absent to Excused."}
                      </HelpText>
                    )}
                    {excuseTypes.length === 0 ? (
                      <p className="text-xs text-zinc-400">No excuse types configured. Contact your officer.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <select value={selectedExcuseType} onChange={e => setSelectedExcuseType(e.target.value)}
                          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                          <option value="">Select excuse type...</option>
                          {excuseTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <textarea value={excuseNotes} onChange={e => setExcuseNotes(e.target.value)}
                          placeholder="Additional notes (optional)" rows={2}
                          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
                        <div className="flex gap-2">
                          <button onClick={() => handleRequestExcuse(event.id)} disabled={loading || !selectedExcuseType}
                            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                            {loading ? 'Submitting...' : 'Submit'}
                          </button>
                          <button onClick={() => { setExcuseOpenId(null); setSelectedExcuseType(''); setExcuseNotes('') }}
                            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50">
                            Cancel
                          </button>
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

      {activeSig && (
        <EventAttendanceSignaturePadModal
          sig_id={activeSig.sig_id}
          memberName={myName}
          eventLabel={activeSig.eventLabel}
          onClose={() => setActiveSig(null)}
          onSigned={() => { setActiveSig(null); router.refresh() }}
        />
      )}
    </div>
  )
}
