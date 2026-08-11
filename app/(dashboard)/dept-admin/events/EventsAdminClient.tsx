'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { logAttendance, logAbsentAttendance, verifyAttendance, cancelEventInstance, closeEventInstance, requestExcuse, deleteEventInstance, updateEventInstance, updateEventSeries } from '@/app/actions/attendance'
import { toggleEventSeriesPublic } from '@/app/actions/public-site'
import { generateCheckinToken } from '@/app/actions/checkin'
import EventAttendanceSignaturePadModal from '@/app/(dashboard)/signatures/EventAttendanceSignaturePadModal'
import { formatLocalDateTime } from '@/lib/format-datetime'
import HelpText from '@/components/HelpText'

interface AttendanceRecord {
  id: string
  instance_id: string
  status: string
  submitted_at: string
}

interface PendingSubmission {
  id: string
  personnel_id: string
  name: string
  submitted_at: string
}

interface ExcuseSubmission {
  id: string
  personnel_id: string
  name: string
  submitted_at: string
  excuse_type: string
  notes: string | null
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
  recurrence_type: string
  event_date: string
  start_time: string | null
  duration_minutes: number | null
  location: string | null
  status: string
  notes: string | null
  requires_verification: boolean
  requires_signature: boolean
  is_training: boolean
  training_hours: number | null
  training_cert_type_id: string | null
  training_instructor: string | null
  pending_sig_id: string | null
  is_public: boolean
  my_attendance: AttendanceRecord | null
  pending_count: number
  pending_submissions: PendingSubmission[]
  excuse_submissions: ExcuseSubmission[]
  logged_personnel_ids: string[]
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

function isWindowOpen(event_date: string, start_time: string | null): boolean {
  const eventDateTime = new Date(`${event_date}T${start_time || '00:00'}`)
  const windowClose = new Date(eventDateTime.getTime() + 12 * 60 * 60 * 1000)
  return new Date() <= windowClose
}

function isPast(event_date: string): boolean {
  return new Date(event_date + 'T23:59:59') < new Date()
}

export default function EventsAdminClient({
  events, personnelList, excuseTypes, certTypes, myPersonnelId, myName, isAdmin, publicSiteEnabled, departmentId, departmentTimezone,
}: {
  events: Event[]
  personnelList: Personnel[]
  excuseTypes: ExcuseType[]
  certTypes: { id: string; cert_name: string }[]
  myPersonnelId: string
  myName: string
  isAdmin: boolean
  publicSiteEnabled: boolean
  departmentId: string
  departmentTimezone: string
}) {
  const router = useRouter()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [bulkAbsentExcuseType, setBulkAbsentExcuseType] = useState('')
  const [bulkAbsentNotes, setBulkAbsentNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  const [activeSig, setActiveSig] = useState<{ sig_id: string; eventLabel: string } | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editScope, setEditScope] = useState<'instance' | 'series'>('instance')
  const [editForm, setEditForm] = useState({
    title: '', event_type: 'meeting', description: '', location: '',
    event_date: '', start_time: '', duration_minutes: '', notes: '',
    requires_verification: true, requires_signature: false,
    is_training: false, training_hours: '', training_cert_type_id: '', training_instructor: '',
  })

  const [publicState, setPublicState] = useState<Record<string, boolean>>(
    Object.fromEntries(events.map(e => [e.series_id, e.is_public]))
  )
  const [togglingSeriesId, setTogglingSeriesId] = useState<string | null>(null)

  async function handleTogglePublic(seriesId: string, current: boolean) {
    setTogglingSeriesId(seriesId)
    const next = !current
    const result = await toggleEventSeriesPublic(seriesId, next, departmentId)
    if (!result.error) setPublicState(prev => ({ ...prev, [seriesId]: next }))
    setTogglingSeriesId(null)
  }

  function handleEditStart(event: Event) {
    setEditForm({
      title: event.title,
      event_type: event.event_type,
      description: event.description ?? '',
      location: event.location ?? '',
      event_date: event.event_date,
      start_time: event.start_time ?? '',
      duration_minutes: event.duration_minutes != null ? String(event.duration_minutes) : '',
      notes: event.notes ?? '',
      requires_verification: event.requires_verification,
      requires_signature: event.requires_signature,
      is_training: event.is_training,
      training_hours: event.training_hours != null ? String(event.training_hours) : '',
      training_cert_type_id: event.training_cert_type_id ?? '',
      training_instructor: event.training_instructor ?? '',
    })
    setEditScope('instance')
    setEditingId(event.id)
    setExpandedId(event.id)
  }

  async function handleEditSave(event: Event) {
    reset()
    setLoading(true)
    const fd = new FormData()
    fd.set('requires_verification', editForm.requires_verification ? 'true' : 'false')
    fd.set('requires_signature', editForm.requires_signature ? 'true' : 'false')

    if (editScope === 'series' || event.recurrence_type === 'one_time') {
      fd.set('series_id', event.series_id)
      fd.set('from_date', event.event_date)
      fd.set('title', editForm.title)
      fd.set('description', editForm.description)
      fd.set('location', editForm.location)
      fd.set('start_time', editForm.start_time)
      fd.set('duration_minutes', editForm.duration_minutes)
      fd.set('is_training', editForm.is_training ? 'true' : 'false')
      fd.set('training_hours', editForm.training_hours)
      fd.set('training_cert_type_id', editForm.training_cert_type_id)
      fd.set('training_instructor', editForm.training_instructor)
      if (event.recurrence_type === 'one_time') fd.set('event_date', editForm.event_date)
      const result = await updateEventSeries(fd)
      if (result?.error) { setError(result.error); setLoading(false); return }
    } else {
      fd.set('id', event.id)
      fd.set('title', editForm.title)
      fd.set('description', editForm.description)
      fd.set('location', editForm.location)
      fd.set('start_time', editForm.start_time)
      fd.set('event_date', editForm.event_date)
      fd.set('notes', editForm.notes)
      fd.set('status', event.status)
      const result = await updateEventInstance(fd)
      if (result?.error) { setError(result.error); setLoading(false); return }
    }

    setEditingId(null)
    setSuccess('Event updated.')
    router.refresh()
    setLoading(false)
  }

  function reset() { setError(null); setSuccess(null) }

  const today = new Date().toISOString().split('T')[0]
  const filteredEvents = events.filter(e => {
    if (typeFilter !== 'all' && e.event_type !== typeFilter) return false
    if (filter === 'upcoming') return e.event_date >= today
    if (filter === 'past') return e.event_date < today
    return true
  })

  async function handleSelfLog(event: Event) {
    reset(); setLoading(true)
    const result = await logAttendance(event.id, [myPersonnelId])
    if (result?.error) setError(result.error)
    else { setSuccess('Attendance logged.'); router.refresh() }
    setLoading(false)
  }

  async function handleBulkLog(event: Event) {
    if (bulkSelected.size === 0) { setError('Select at least one person.'); return }
    reset(); setLoading(true)
    const result = await logAttendance(event.id, Array.from(bulkSelected))
    if (result?.error) setError(result.error)
    else { setSuccess(`Logged attendance for ${bulkSelected.size} members.`); setBulkSelected(new Set()); router.refresh() }
    setLoading(false)
  }

  async function handleBulkAbsent(event: Event, excused: boolean) {
    if (bulkSelected.size === 0) { setError('Select at least one person.'); return }
    if (excused && !bulkAbsentExcuseType) { setError('Select an excuse type.'); return }
    reset(); setLoading(true)
    const result = await logAbsentAttendance(event.id, Array.from(bulkSelected), excused, excused ? bulkAbsentExcuseType : undefined, bulkAbsentNotes || undefined)
    if (result?.error) setError(result.error)
    else {
      setSuccess(`Marked ${bulkSelected.size} member(s) ${excused ? 'excused' : 'absent'}.`)
      setBulkSelected(new Set()); setBulkAbsentExcuseType(''); setBulkAbsentNotes('')
      router.refresh()
    }
    setLoading(false)
  }

  async function handleApprove(attendance_id: string) {
    reset(); setLoading(true)
    const result = await verifyAttendance(attendance_id, 'present')
    if (result?.error) setError(result.error)
    else { setSuccess('Attendance approved.'); router.refresh() }
    setLoading(false)
  }

  async function handleReject(attendance_id: string) {
    reset(); setLoading(true)
    const result = await verifyAttendance(attendance_id, 'absent', rejectionReason || undefined)
    if (result?.error) setError(result.error)
    else { setSuccess('Attendance rejected.'); setRejectingId(null); setRejectionReason(''); router.refresh() }
    setLoading(false)
  }

  async function handleApproveAll(submissions: PendingSubmission[]) {
    reset(); setLoading(true)
    for (const s of submissions) await verifyAttendance(s.id, 'present')
    setSuccess(`Approved ${submissions.length} submissions.`)
    router.refresh(); setLoading(false)
  }

  async function handleApproveExcuse(attendance_id: string) {
    reset(); setLoading(true)
    const result = await verifyAttendance(attendance_id, 'excused')
    if (result?.error) setError(result.error)
    else { setSuccess('Excuse approved.'); router.refresh() }
    setLoading(false)
  }

  async function handleDenyExcuse(attendance_id: string) {
    reset(); setLoading(true)
    const result = await verifyAttendance(attendance_id, 'absent')
    if (result?.error) setError(result.error)
    else { setSuccess('Excuse denied.'); router.refresh() }
    setLoading(false)
  }

  async function handleGenerateCheckinQr(event: Event) {
    const result = await generateCheckinToken('event_instance', event.id)
    if (result.error || !result.token) { setError(result.error ?? 'Failed to generate check-in QR.'); return }
    const params = new URLSearchParams({ type: 'checkin', code: result.token, title: event.title })
    window.open(`/print/qr?${params.toString()}`, '_blank')
  }

  async function handleCancel(instance_id: string) {
    if (!confirm('Cancel this event?')) return
    reset(); setLoading(true)
    const result = await cancelEventInstance(instance_id)
    if (result?.error) setError(result.error)
    else { setSuccess('Event cancelled.'); router.refresh() }
    setLoading(false)
  }

  async function handleDelete(instance_id: string) {
    if (!confirm('Permanently delete this event? This cannot be undone and will remove any logged attendance.')) return
    reset(); setLoading(true)
    const result = await deleteEventInstance(instance_id)
    if (result?.error) setError(result.error)
    else { setSuccess('Event deleted.'); router.refresh() }
    setLoading(false)
  }

  async function handleCloseEvent(instance_id: string) {
    if (!confirm('Close this event? All members with no attendance record will be marked absent.')) return
    reset(); setLoading(true)
    const result = await closeEventInstance(instance_id)
    if (result?.error) setError(result.error)
    else { setSuccess(`Event closed. ${(result as any).absent_count} member(s) marked absent.`); router.refresh() }
    setLoading(false)
  }

  function toggleBulk(id: string) {
    setBulkSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  function toggleAllBulk(ids: string[]) {
    if (bulkSelected.size === ids.length) setBulkSelected(new Set())
    else setBulkSelected(new Set(ids))
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Event Management</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Manage attendance, approvals, and event settings</p>
        </div>
        <button
          onClick={() => router.push('/events/new')}
          className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
          + New Event
        </button>
      </div>

      <HelpText className="mb-6">
        Bulk-log attendance for a whole roster at once, approve or deny pending excuse requests, and close an event
        once it's done. Editing an existing event changes that occurrence only, not the whole recurring series.
      </HelpText>

      {success && <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-200">{success}</div>}
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}

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

      {filteredEvents.length === 0 ? (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          No events found.
          <span> <button onClick={() => router.push('/events/new')} className="text-red-600 font-semibold hover:underline">Create one?</button></span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredEvents.map(event => {
            const isExpanded = expandedId === event.id
            const past = isPast(event.event_date)
            const windowOpen = isWindowOpen(event.event_date, event.start_time)
            const canSelfLog = !past || windowOpen
            const cancelled = event.status === 'cancelled'
            const completed = event.status === 'completed'
            const loggablePersonnel = personnelList.filter(p => !event.logged_personnel_ids.includes(p.id))
            const allIds = loggablePersonnel.map(p => p.id)
            const hasPending = event.pending_submissions.length > 0
            const hasExcuseRequests = event.excuse_submissions.length > 0

            return (
              <div key={event.id} className={`rounded-xl bg-white shadow-sm border overflow-hidden ${cancelled ? 'border-zinc-100 opacity-60' : completed ? 'border-zinc-200 opacity-75' : 'border-zinc-200'}`}>
                <div className="px-5 py-4">
                  <div className="flex items-start gap-3">
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

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-zinc-900">{event.title}</p>
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${EVENT_TYPE_COLORS[event.event_type]}`}>
                          {EVENT_TYPE_LABELS[event.event_type]}
                        </span>
                        {event.is_training && (
                          <span className="text-xs rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 font-medium">
                            Training{event.training_hours ? ` · ${event.training_hours}h` : ''}
                          </span>
                        )}
                        {cancelled && <span className="text-xs rounded-full bg-zinc-100 text-zinc-400 px-2 py-0.5">Cancelled</span>}
                        {completed && <span className="text-xs rounded-full bg-green-50 text-green-600 px-2 py-0.5">Closed</span>}
                        {event.requires_verification && !cancelled && (
                          <span className="text-xs text-zinc-400">Requires verification</span>
                        )}
                        {publicSiteEnabled && publicState[event.series_id] && (
                          <span className="text-xs rounded-full bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5">Public</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                        {event.start_time && (
                          <span>🕐 {formatTime(event.start_time)}{formatEndTime(event.start_time, event.duration_minutes) ? ` – ${formatEndTime(event.start_time, event.duration_minutes)}` : ''}</span>
                        )}
                        {event.location && <span>📍 {event.location}</span>}
                        {hasPending && (
                          <span className="text-yellow-600 font-semibold">⏳ {event.pending_count} pending</span>
                        )}
                      </div>
                      {event.description && <p className="text-xs text-zinc-400 mt-1">{event.description}</p>}
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {event.my_attendance && (
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[event.my_attendance.status] ?? 'bg-zinc-100 text-zinc-600'}`}>
                          {STATUS_LABELS[event.my_attendance.status] ?? event.my_attendance.status}
                        </span>
                      )}
                      {event.pending_sig_id && (
                        <button
                          onClick={() => setActiveSig({ sig_id: event.pending_sig_id!, eventLabel: `${event.title} — ${formatDate(event.event_date)}` })}
                          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600">
                          ✍ Sign Required
                        </button>
                      )}
                      {!cancelled && !event.my_attendance && canSelfLog && (
                        <button onClick={() => handleSelfLog(event)} disabled={loading}
                          className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                          Log Attendance
                        </button>
                      )}
                      {!cancelled && !completed && (
                        <button onClick={() => handleGenerateCheckinQr(event)} className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                          Check-In QR
                        </button>
                      )}
                      {!cancelled && (
                        <button
                          onClick={() => { setExpandedId(isExpanded ? null : event.id); setBulkSelected(new Set()); setRejectingId(null); setRejectionReason(''); reset() }}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                          {isExpanded ? 'Hide' : 'Manage'}
                        </button>
                      )}
                      {!cancelled && (
                        <button
                          onClick={() => editingId === event.id ? setEditingId(null) : handleEditStart(event)}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                          {editingId === event.id ? 'Cancel Edit' : 'Edit'}
                        </button>
                      )}
                      <button
                        onClick={() => window.open(`/print/event-run-sheet?id=${event.id}`, '_blank')}
                        className="text-xs text-zinc-400 hover:text-zinc-700">
                        Print Run Sheet
                      </button>
                      {!cancelled && !completed && (
                        <button onClick={() => handleCancel(event.id)} className="text-xs text-zinc-400 hover:text-red-600">
                          Cancel
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => handleDelete(event.id)} className="text-xs text-zinc-400 hover:text-red-600">
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-zinc-100 bg-zinc-50 px-5 py-4 flex flex-col gap-5">
                    {past && (
                      <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-2 text-xs text-yellow-700">
                        ⚠️ This event occurred on {formatDate(event.event_date)}.
                        {hasPending && ` Attendance has been logged for ${event.pending_count} members.`}
                        {' '}You are modifying an existing record.
                      </div>
                    )}

                    {/* ── INLINE EDIT FORM ─────────────────────────── */}
                    {editingId === event.id && (
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
                        <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Edit Event</p>
                        {event.recurrence_type !== 'one_time' && (
                          <div className="flex gap-2">
                            {(['instance', 'series'] as const).map(s => (
                              <button key={s} type="button" onClick={() => setEditScope(s)}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${editScope === s ? 'bg-blue-600 text-white' : 'bg-white border border-zinc-300 text-zinc-600 hover:bg-zinc-50'}`}>
                                {s === 'instance' ? 'This event only' : 'This & all future'}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-zinc-700 mb-1">Title</label>
                            <input type="text" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            {editScope === 'instance' && event.recurrence_type !== 'one_time' && (
                              <p className="text-xs text-zinc-400 mt-1">Renames just this occurrence. Clear the field to revert to the series title.</p>
                            )}
                          </div>
                          {(editScope === 'series' || event.recurrence_type === 'one_time') && (
                            <>
                              <div>
                                <label className="block text-xs font-medium text-zinc-700 mb-1">Type</label>
                                <select value={editForm.event_type} onChange={e => setEditForm(f => ({ ...f, event_type: e.target.value }))}
                                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                                  <option value="meeting">Meeting</option>
                                  <option value="training">Training</option>
                                  <option value="special">Special Event</option>
                                  <option value="incident">Incident</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-zinc-700 mb-1">Duration (min)</label>
                                <input type="number" min="1" value={editForm.duration_minutes} onChange={e => setEditForm(f => ({ ...f, duration_minutes: e.target.value }))}
                                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                              </div>
                            </>
                          )}
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-zinc-700 mb-1">Description</label>
                            <input type="text" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {(editScope === 'instance' || event.recurrence_type === 'one_time') && (
                            <div>
                              <label className="block text-xs font-medium text-zinc-700 mb-1">Date</label>
                              <input type="date" value={editForm.event_date} onChange={e => setEditForm(f => ({ ...f, event_date: e.target.value }))}
                                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            </div>
                          )}
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 mb-1">Start Time</label>
                            <input type="time" step="60" value={editForm.start_time} onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))}
                              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-zinc-700 mb-1">Location</label>
                            <input type="text" value={editForm.location} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))}
                              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          {editScope === 'instance' && event.recurrence_type !== 'one_time' && (
                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-zinc-700 mb-1">Notes</label>
                              <input type="text" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={editForm.requires_verification} onChange={e => setEditForm(f => ({ ...f, requires_verification: e.target.checked }))}
                              className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
                            <span className="text-xs text-zinc-700">Require attendance verification</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={editForm.requires_signature} onChange={e => setEditForm(f => ({ ...f, requires_signature: e.target.checked }))}
                              className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
                            <span className="text-xs text-zinc-700">Require member signature</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={editForm.is_training} onChange={e => setEditForm(f => ({ ...f, is_training: e.target.checked }))}
                              className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
                            <span className="text-xs text-zinc-700">Training event</span>
                          </label>
                          {editForm.is_training && (
                            <div className="flex gap-2 ml-5 mt-1">
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-600 mb-1">Hours</label>
                                <input type="number" min="0" step="0.5" value={editForm.training_hours}
                                  onChange={e => setEditForm(f => ({ ...f, training_hours: e.target.value }))}
                                  placeholder="2"
                                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                              </div>
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-600 mb-1">Instructor</label>
                                <input type="text" value={editForm.training_instructor}
                                  onChange={e => setEditForm(f => ({ ...f, training_instructor: e.target.value }))}
                                  placeholder="Name"
                                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                              </div>
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-600 mb-1">Issues Cert (optional)</label>
                                <select value={editForm.training_cert_type_id} onChange={e => setEditForm(f => ({ ...f, training_cert_type_id: e.target.value }))}
                                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                                  <option value="">None</option>
                                  {certTypes.map(c => <option key={c.id} value={c.id}>{c.cert_name}</option>)}
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => handleEditSave(event)} disabled={loading}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                            {loading ? 'Saving…' : 'Save Changes'}
                          </button>
                          <button onClick={() => setEditingId(null)}
                            className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── PUBLIC SITE TOGGLE ───────────────────────── */}
                    {publicSiteEnabled && (
                      <div className="flex items-center justify-between rounded-lg bg-zinc-50 border border-zinc-100 px-4 py-2.5">
                        <div>
                          <p className="text-xs font-semibold text-zinc-700">Show on Public Site</p>
                          <p className="text-xs text-zinc-400">Visible at fireops7.com/dept/… when on</p>
                        </div>
                        <button type="button" role="switch" aria-checked={publicState[event.series_id] ?? false}
                          disabled={togglingSeriesId === event.series_id}
                          onClick={() => handleTogglePublic(event.series_id, publicState[event.series_id] ?? false)}
                          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 ${publicState[event.series_id] ? 'bg-blue-600' : 'bg-zinc-300'}`}>
                          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${publicState[event.series_id] ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    )}

                    {/* ── PENDING VERIFICATION QUEUE ───────────────── */}
                    {hasPending && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">
                            Pending Verification ({event.pending_submissions.length})
                          </p>
                          <button onClick={() => handleApproveAll(event.pending_submissions)} disabled={loading}
                            className="text-xs font-semibold text-green-600 hover:text-green-800 disabled:opacity-50">
                            Approve All
                          </button>
                        </div>
                        <div className="flex flex-col gap-2">
                          {event.pending_submissions.map(sub => (
                            <div key={sub.id} className="rounded-lg bg-white border border-zinc-200 overflow-hidden">
                              <div className="flex items-center px-4 py-3 gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-zinc-900">{sub.name}</p>
                                  <p className="text-xs text-zinc-400">Submitted {formatLocalDateTime(sub.submitted_at, departmentTimezone)}</p>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                  <button onClick={() => handleApprove(sub.id)} disabled={loading}
                                    className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                                    Approve
                                  </button>
                                  <button onClick={() => { setRejectingId(rejectingId === sub.id ? null : sub.id); setRejectionReason('') }} disabled={loading}
                                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">
                                    Reject
                                  </button>
                                </div>
                              </div>
                              {rejectingId === sub.id && (
                                <div className="px-4 pb-3 border-t border-zinc-100 pt-3 flex gap-2">
                                  <input type="text" value={rejectionReason} onChange={e => setRejectionReason(e.target.value)}
                                    placeholder="Reason (optional)" autoFocus
                                    className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                                  <button onClick={() => handleReject(sub.id)} disabled={loading}
                                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                                    Confirm
                                  </button>
                                  <button onClick={() => { setRejectingId(null); setRejectionReason('') }}
                                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50">
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── EXCUSE REQUESTS ──────────────────────────── */}
                    {hasExcuseRequests && (
                      <div>
                        <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-2">
                          Excuse Requests ({event.excuse_submissions.length})
                        </p>
                        <div className="flex flex-col gap-2">
                          {event.excuse_submissions.map(sub => (
                            <div key={sub.id} className="rounded-lg bg-white border border-zinc-200 px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-zinc-900">{sub.name}</p>
                                  <p className="text-xs text-blue-700 font-medium mt-0.5">{sub.excuse_type}</p>
                                  {sub.notes && <p className="text-xs text-zinc-500 mt-1">{sub.notes}</p>}
                                  <p className="text-xs text-zinc-400 mt-1">Submitted {formatLocalDateTime(sub.submitted_at, departmentTimezone)}</p>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                  <button onClick={() => handleApproveExcuse(sub.id)} disabled={loading}
                                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                                    Approve
                                  </button>
                                  <button onClick={() => handleDenyExcuse(sub.id)} disabled={loading}
                                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
                                    Deny
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── BULK LOG ATTENDANCE ───────────────────────── */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">Log Attendance / Absence</p>
                        <button onClick={() => toggleAllBulk(allIds)}
                          className="text-xs text-blue-600 font-semibold hover:text-blue-800">
                          {bulkSelected.size === allIds.length ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto mb-3">
                        {loggablePersonnel.length === 0 && (
                          <p className="col-span-2 text-xs text-zinc-400 px-1">All members have an attendance record for this event.</p>
                        )}
                        {loggablePersonnel.map(p => (
                          <label key={p.id} className="flex items-center gap-2 rounded-lg bg-white border border-zinc-200 px-3 py-2 cursor-pointer hover:bg-zinc-50">
                            <input type="checkbox" checked={bulkSelected.has(p.id)} onChange={() => toggleBulk(p.id)}
                              className="rounded border-zinc-300 text-red-600 focus:ring-red-500" />
                            <span className="text-xs text-zinc-800">{p.name}</span>
                          </label>
                        ))}
                      </div>
                      <button onClick={() => handleBulkLog(event)} disabled={loading || bulkSelected.size === 0}
                        className="w-full rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                        {loading ? 'Logging...' : `Log ${bulkSelected.size > 0 ? bulkSelected.size : ''} ${bulkSelected.size === 1 ? 'Member' : 'Members'} Present`}
                      </button>

                      <div className="mt-3 pt-3 border-t border-zinc-200">
                        <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-2">Mark Absent</p>
                        <div className="flex flex-col gap-2 mb-2">
                          <select value={bulkAbsentExcuseType} onChange={e => setBulkAbsentExcuseType(e.target.value)}
                            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="">Excuse type (for excused absence)...</option>
                            {excuseTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                          <textarea value={bulkAbsentNotes} onChange={e => setBulkAbsentNotes(e.target.value)}
                            placeholder="Notes (optional)" rows={2}
                            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleBulkAbsent(event, true)} disabled={loading || bulkSelected.size === 0 || !bulkAbsentExcuseType}
                            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                            Excused Absence
                          </button>
                          <button onClick={() => handleBulkAbsent(event, false)} disabled={loading || bulkSelected.size === 0}
                            className="flex-1 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-900 disabled:opacity-50">
                            Unexcused Absence
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* ── CLOSE EVENT ──────────────────────────────── */}
                    {past && !completed && (
                      <div className="border-t border-zinc-200 pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-zinc-700">Close Event</p>
                            <p className="text-xs text-zinc-400 mt-0.5">Marks all members with no record as absent and locks attendance.</p>
                          </div>
                          <button onClick={() => handleCloseEvent(event.id)} disabled={loading}
                            className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-900 disabled:opacity-50 shrink-0 ml-4">
                            Close Event
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
