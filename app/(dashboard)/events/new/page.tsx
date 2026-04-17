'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createEventSeries } from '@/app/actions/attendance'

const inputCls = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
const checkCls = "rounded border-zinc-300 text-red-600 focus:ring-red-500"

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKS = ['First', 'Second', 'Third', 'Fourth']

export default function NewEventPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recurrenceType, setRecurrenceType] = useState('one_time')
  const [requiresVerification, setRequiresVerification] = useState(true)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setLoading(true)
    formData.set('requires_verification', requiresVerification ? 'true' : 'false')
    const result = await createEventSeries(formData)
    if (result?.error) { setError(result.error); setLoading(false); return }
    router.push('/events')
  }

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm text-zinc-500 hover:text-zinc-700">← Back</button>
        <div>
          <h1 className="text-xl font-bold text-zinc-900">New Event</h1>
          <p className="text-sm text-zinc-500">Create a one-time or recurring event</p>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}

      <form action={handleSubmit} className="flex flex-col gap-5">
        {/* Basic Info */}
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-zinc-700">Event Details</h2>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Title <span className="text-red-500">*</span></label>
            <input name="title" type="text" required placeholder="Monthly Department Meeting" className={inputCls} />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Event Type <span className="text-red-500">*</span></label>
              <select name="event_type" required className={inputCls}>
                <option value="meeting">Meeting</option>
                <option value="training">Training</option>
                <option value="special">Special Event</option>
                <option value="incident">Incident</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Location</label>
              <input name="location" type="text" placeholder="Station 1" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Description</label>
            <input name="description" type="text" placeholder="Optional notes about this event" className={inputCls} />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Start Time</label>
              <input name="start_time" type="time" className={inputCls} />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Duration (minutes)</label>
              <input name="duration_minutes" type="number" min="15" step="15" placeholder="60" className={inputCls} />
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
              <option value="weekly">Weekly</option>
              <option value="monthly_by_dow">Monthly — Day of Week (e.g. 2nd Monday)</option>
              <option value="monthly_by_date">Monthly — Date (e.g. 15th)</option>
            </select>
          </div>

          {/* One time — specific date */}
          {recurrenceType === 'one_time' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Event Date <span className="text-red-500">*</span></label>
              <input name="event_date" type="date" required className={inputCls} />
            </div>
          )}

          {/* Weekly — pick day of week */}
          {recurrenceType === 'weekly' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Day of Week <span className="text-red-500">*</span></label>
              <select name="recurrence_day_of_week" required className={inputCls}>
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
          )}

          {/* Monthly by DOW — pick week + day */}
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

          {/* Monthly by date */}
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
        </div>

        {/* Verification */}
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5">
          <h2 className="text-sm font-semibold text-zinc-700 mb-3">Attendance Settings</h2>
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
                When checked, member self-reported attendance must be approved by an officer or admin before it counts.
                Uncheck to allow attendance to auto-approve on submission.
              </p>
            </div>
          </label>
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
