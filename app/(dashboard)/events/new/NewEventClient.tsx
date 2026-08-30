'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createEventSeries } from '@/app/actions/attendance'
import { parseRunSheet } from '@/app/actions/parse-run-sheet'
import { cadToEventFields } from '@/lib/cad-to-event'
import { durationFromTimes } from '@/lib/event-times'
import HelpText from '@/components/HelpText'

const inputCls = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
const checkCls = "rounded border-zinc-300 text-red-600 focus:ring-red-500"

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKS = ['First', 'Second', 'Third', 'Fourth']

export default function NewEventClient({ certTypes }: { certTypes: { id: string; cert_name: string }[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recurrenceType, setRecurrenceType] = useState('one_time')
  const [requiresVerification, setRequiresVerification] = useState(true)
  const [requiresSignature, setRequiresSignature] = useState(false)
  const [isTraining, setIsTraining] = useState(false)
  const [customDates, setCustomDates] = useState<string[]>([])
  const [dateToAdd, setDateToAdd] = useState('')

  function addCustomDate() {
    if (!dateToAdd) return
    setCustomDates(prev => prev.includes(dateToAdd) ? prev : [...prev, dateToAdd].sort())
    setDateToAdd('')
  }

  // CAD-sheet import. The form fields stay uncontrolled — importing swaps in new
  // defaults and remounts the form via formKey rather than making every field stateful.
  const [isParsing, setIsParsing] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [prefill, setPrefill] = useState({
    title: '', event_type: 'meeting', location: '', description: '',
    start_time: '', end_time: '', event_date: '',
  })
  const formRef = useRef<HTMLFormElement>(null)

  async function handleCadImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setIsParsing(true); setImportError(null); setImportSuccess(null)

    const fd = new FormData()
    fd.append('pdf', file)
    const result = await parseRunSheet(fd)
    if (result.error) { setImportError(result.error); setIsParsing(false); return }

    const f = cadToEventFields(result.data!)

    // Importing remounts the form, so carry over anything already typed — a title
    // entered before uploading must not be wiped by the import.
    const current = formRef.current ? new FormData(formRef.current) : null
    const typed = (name: string) => ((current?.get(name) as string) ?? '').trim()

    setPrefill(prev => ({
      title: typed('title') || prev.title,
      event_type: f.event_type,
      location: f.location || typed('location') || prev.location,
      description: f.description || typed('description') || prev.description,
      start_time: f.start_time || typed('start_time') || prev.start_time,
      end_time: f.end_time || typed('end_time') || prev.end_time,
      event_date: f.event_date || typed('event_date') || prev.event_date,
    }))

    // A CAD sheet documents one occurrence. In multiple-dates mode that means adding
    // its date to the list; otherwise it fills the one-time date field.
    if (f.event_date && recurrenceType === 'custom_dates') {
      setCustomDates(prev => prev.includes(f.event_date) ? prev : [...prev, f.event_date].sort())
    }

    setFormKey(k => k + 1)
    const filled = [
      f.event_date && 'date', f.start_time && 'time',
      f.end_time && 'end time', f.location && 'location',
      f.description && 'description',
    ].filter(Boolean)
    setImportSuccess(
      filled.length
        ? `Filled ${filled.join(', ')}. Add a title, then review below.`
        : 'Nothing could be read from that PDF — enter the details manually.'
    )
    setIsParsing(false)
  }

  async function handleSubmit(formData: FormData) {
    setError(null)
    setLoading(true)
    formData.set('requires_verification', requiresVerification ? 'true' : 'false')
    formData.set('requires_signature', requiresSignature ? 'true' : 'false')
    formData.set('is_training', isTraining ? 'true' : 'false')

    // The column stores minutes; the form asks for an end time.
    const startVal = (formData.get('start_time') as string) || ''
    const endVal = (formData.get('end_time') as string) || ''
    formData.delete('end_time')
    if (startVal && endVal) {
      const mins = durationFromTimes(startVal, endVal)
      if (mins === null) { setError('End time must be different from the start time.'); setLoading(false); return }
      formData.set('duration_minutes', String(mins))
    }
    if (recurrenceType === 'custom_dates') {
      if (customDates.length === 0) { setError('Add at least one date.'); setLoading(false); return }
      formData.set('custom_dates', customDates.join(','))
    }
    const result = await createEventSeries(formData)
    if (result?.error) { setError(result.error); setLoading(false); return }
    router.push('/events')
  }

  return (
    <div className="max-w-lg">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-zinc-900">New Event</h1>
        <p className="text-sm text-zinc-500">Create a one-time or recurring event</p>
      </div>
      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={() => router.back()} className="rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-sm">← Back</button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}

      {/* CAD Sheet Import */}
      <div className="mb-4 rounded-xl bg-zinc-50 border border-zinc-200 p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-700">Import from CAD Sheet</p>
          <p className="text-xs text-zinc-400">
            Reads a Central Square CFS PDF to fill the date, time, duration, location, and
            description. Saves typing only — nothing from the sheet is stored on the event.
          </p>
        </div>
        <label className={`relative cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors shrink-0 ${isParsing ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed' : 'bg-red-700 text-white hover:bg-red-800'}`}>
          {isParsing ? 'Reading PDF…' : 'Upload PDF'}
          <input type="file" accept=".pdf,application/pdf" className="sr-only" onChange={handleCadImport} disabled={isParsing} />
        </label>
        {importSuccess && <p className="w-full text-xs text-green-700 font-medium">{importSuccess}</p>}
        {importError && <p className="w-full text-xs text-red-600">{importError}</p>}
      </div>

      <HelpText className="mb-4">
        This creates an event <em>series</em>. A one-time event makes a single occurrence; a recurring schedule
        (weekly, monthly) generates individual occurrences a year out, each with its own attendance tracking.
      </HelpText>

      <form key={formKey} ref={formRef} action={handleSubmit} className="flex flex-col gap-5">
        {/* Basic Info */}
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-zinc-700">Event Details</h2>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Title <span className="text-red-500">*</span></label>
            <input name="title" type="text" required defaultValue={prefill.title} placeholder="Monthly Department Meeting" className={inputCls} />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Event Type <span className="text-red-500">*</span></label>
              <select name="event_type" required defaultValue={prefill.event_type} className={inputCls}>
                <option value="meeting">Meeting</option>
                <option value="training">Training</option>
                <option value="special">Special Event</option>
                <option value="incident">Incident</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Location</label>
              <input name="location" type="text" defaultValue={prefill.location} placeholder="Station 1" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Description</label>
            <input name="description" type="text" defaultValue={prefill.description} placeholder="Optional notes about this event" className={inputCls} />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Start Time</label>
              <input name="start_time" type="time" step="60" defaultValue={prefill.start_time} className={inputCls} />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-zinc-700">End Time</label>
              <input name="end_time" type="time" step="60" defaultValue={prefill.end_time} className={inputCls} />
            </div>
          </div>
        </div>

        {/* Recurrence */}
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-zinc-700">Schedule</h2>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Recurrence <span className="text-red-500">*</span></label>
            <select name="recurrence_type" required value={recurrenceType} onChange={e => setRecurrenceType(e.target.value)} className={inputCls}>
              <option value="one_time">One Time</option>
              <option value="custom_dates">Multiple Dates — Pick Each One</option>
              <option value="weekly">Weekly</option>
              <option value="monthly_by_dow">Monthly — Day of Week (e.g. 2nd Monday)</option>
              <option value="monthly_by_date">Monthly — Date (e.g. 15th)</option>
            </select>
          </div>

          {recurrenceType === 'one_time' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Event Date <span className="text-red-500">*</span></label>
              <input name="event_date" type="date" required defaultValue={prefill.event_date} className={inputCls} />
            </div>
          )}

          {recurrenceType === 'custom_dates' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Dates <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-zinc-400 mb-2">
                For schedules that don&apos;t follow a pattern — game-day standbys, parades, fair details.
                Add each date; they all share this event&apos;s title, time, location, and attendance settings.
              </p>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateToAdd}
                  onChange={e => setDateToAdd(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomDate() } }}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={addCustomDate}
                  disabled={!dateToAdd}
                  className="shrink-0 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-40">
                  Add
                </button>
              </div>
              {customDates.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {customDates.map(d => (
                    <span key={d} className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 border border-zinc-200 pl-3 pr-1.5 py-1 text-xs font-medium text-zinc-700">
                      {new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      <button
                        type="button"
                        onClick={() => setCustomDates(prev => prev.filter(x => x !== d))}
                        aria-label={`Remove ${d}`}
                        className="rounded-full h-4 w-4 leading-none text-zinc-400 hover:bg-zinc-300 hover:text-zinc-800">
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-zinc-400">No dates added yet.</p>
              )}
              {customDates.length > 0 && (
                <p className="mt-2 text-xs text-zinc-500">
                  {customDates.length} occurrence{customDates.length === 1 ? '' : 's'} will be created. You can add more dates later from Event Management.
                </p>
              )}
            </div>
          )}

          {recurrenceType === 'weekly' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Day of Week <span className="text-red-500">*</span></label>
              <select name="recurrence_day_of_week" required className={inputCls}>
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
          )}

          {recurrenceType === 'monthly_by_dow' && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Week <span className="text-red-500">*</span></label>
                <select name="recurrence_week_of_month" required className={inputCls}>
                  {WEEKS.map((w, i) => <option key={i+1} value={i+1}>{w}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Day <span className="text-red-500">*</span></label>
                <select name="recurrence_day_of_week" required className={inputCls}>
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            </div>
          )}

          {recurrenceType === 'monthly_by_date' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Day of Month <span className="text-red-500">*</span></label>
              <select name="recurrence_date" required className={inputCls}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <p className="text-xs text-zinc-400 mt-1">Max 28 to ensure it occurs every month.</p>
            </div>
          )}

          {recurrenceType !== 'one_time' && recurrenceType !== 'custom_dates' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Series Ends On <span className="text-zinc-400 font-normal">(optional — defaults to 1 year out)</span>
              </label>
              <input
                name="generate_through_date"
                type="date"
                min={new Date().toISOString().split('T')[0]}
                className={inputCls}
              />
            </div>
          )}
        </div>

        {/* Attendance Settings */}
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-zinc-700">Attendance Settings</h2>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={requiresVerification}
              onChange={e => setRequiresVerification(e.target.checked)}
              className={`mt-0.5 ${checkCls}`}
            />
            <div>
              <p className="text-sm font-medium text-zinc-800">Require attendance verification</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Member self-reported attendance must be approved by an officer before it counts.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={requiresSignature}
              onChange={e => setRequiresSignature(e.target.checked)}
              className={`mt-0.5 ${checkCls}`}
            />
            <div>
              <p className="text-sm font-medium text-zinc-800">Require member signature</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Members must sign via the app after their attendance is confirmed. Appears in their inbox until signed.
              </p>
            </div>
          </label>
        </div>

        {/* Training */}
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-zinc-700">Training</h2>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isTraining}
              onChange={e => setIsTraining(e.target.checked)}
              className={`mt-0.5 ${checkCls}`}
            />
            <div>
              <p className="text-sm font-medium text-zinc-800">This is a training event</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Tracks training hours and shows on the Training page. Optionally auto-issues a certification when attendance is verified.
                Uses the Description field above as the training record&apos;s course description.
              </p>
            </div>
          </label>
          {isTraining && (
            <>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Training Hours</label>
                  <input name="training_hours" type="number" min="0" step="0.5" placeholder="2" className={inputCls} />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Instructor</label>
                  <input name="training_instructor" type="text" placeholder="Name" className={inputCls} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Issues Certification (optional)</label>
                <select name="training_cert_type_id" className={inputCls}>
                  <option value="">None — attendance only</option>
                  {certTypes.map(c => <option key={c.id} value={c.id}>{c.cert_name}</option>)}
                </select>
                <p className="text-xs text-zinc-400 mt-1">When set, verified attendance automatically issues this cert to each member.</p>
              </div>
            </>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-red-700 px-4 py-3 text-base font-bold text-white hover:bg-red-800 disabled:opacity-50">
          {loading ? 'Creating...' : 'Create Event'}
        </button>
      </form>
    </div>
  )
}
