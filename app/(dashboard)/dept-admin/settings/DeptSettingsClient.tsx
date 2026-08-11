'use client'

import { useState } from 'react'
import { saveDeptTimezone, saveWeeklyDigestEnabled } from '@/app/actions/departments'
import { TIMEZONES } from '@/lib/format-datetime'
import HelpText from '@/components/HelpText'

export default function DeptSettingsClient({
  departmentId,
  timezone: initial,
  weeklyDigestEnabled: initialDigestEnabled,
}: {
  departmentId: string
  timezone: string
  weeklyDigestEnabled: boolean
}) {
  const [timezone, setTimezone] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [digestEnabled, setDigestEnabled] = useState(initialDigestEnabled)
  const [digestSaving, setDigestSaving] = useState(false)
  const [digestError, setDigestError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true); setSaveError(null); setSaveSuccess(false)
    const result = await saveDeptTimezone(departmentId, timezone)
    if (result?.error) setSaveError(result.error)
    else setSaveSuccess(true)
    setSaving(false)
  }

  async function handleDigestToggle(next: boolean) {
    setDigestEnabled(next); setDigestSaving(true); setDigestError(null)
    const result = await saveWeeklyDigestEnabled(departmentId, next)
    if (result?.error) { setDigestError(result.error); setDigestEnabled(!next) }
    setDigestSaving(false)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Department Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">Timezone and display preferences for this department.</p>
      </div>

      <HelpText className="mb-4">
        Getting the timezone right here matters — it's what every timestamp across the app (sign-ins, inspections,
        certs) displays in, so it should match where your department is actually located.
      </HelpText>

      <div className="rounded-xl bg-white border border-zinc-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-zinc-900 mb-1">Timezone</h2>
        <p className="text-xs text-zinc-500 mb-4">
          Used to display timestamps like sign-ins, certifications, and inspection logs in your department's local time.
        </p>

        {saveError && (
          <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">{saveError}</div>
        )}
        {saveSuccess && (
          <div className="mb-3 rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-sm text-green-700">Timezone saved.</div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={timezone}
            onChange={e => { setTimezone(e.target.value); setSaveSuccess(false) }}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          >
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-white border border-zinc-200 shadow-sm p-5 mt-6">
        <h2 className="text-sm font-semibold text-zinc-900 mb-1">Event Email Reminders</h2>
        <p className="text-xs text-zinc-500 mb-4">
          Emails every active member: a full recap every Monday morning, a heads-up exactly one week before
          each event, and a same-day reminder — silent on days with nothing scheduled.
        </p>

        {digestError && (
          <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">{digestError}</div>
        )}

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={digestEnabled}
            disabled={digestSaving}
            onChange={e => handleDigestToggle(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-red-600 focus:ring-red-500"
          />
          <span className="text-sm text-zinc-700">
            {digestEnabled ? 'Weekly digest is on' : 'Weekly digest is off'}
          </span>
        </label>
      </div>
    </div>
  )
}
