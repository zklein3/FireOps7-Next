'use client'

import { useEffect, useState } from 'react'
import { saveDeptTimezone, saveWeeklyDigestEnabled, setFuelStorageModule } from '@/app/actions/departments'
import { setHoseTestingConfig } from '@/app/actions/hose-testing'
import { setPublicSiteEnabled } from '@/app/actions/public-site'
import { TIMEZONES } from '@/lib/format-datetime'
import HelpText from '@/components/HelpText'
import QrPrintLabel from '@/components/QrPrintLabel'

export default function DeptSettingsClient({
  departmentId,
  timezone: initial,
  weeklyDigestEnabled: initialDigestEnabled,
  hoseTestingEnabled: initialHoseTestingEnabled,
  publicSiteEnabled: initialPublicSiteEnabled,
  fuelStorageEnabled: initialFuelStorageEnabled,
  publicSlug: initialPublicSlug,
}: {
  departmentId: string
  timezone: string
  weeklyDigestEnabled: boolean
  hoseTestingEnabled: boolean
  publicSiteEnabled: boolean
  fuelStorageEnabled: boolean
  publicSlug: string | null
}) {
  const [timezone, setTimezone] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Set after mount only, to avoid an SSR/client hydration mismatch — the
  // server has no window.location, so this must never render server-side.
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])

  const [digestEnabled, setDigestEnabled] = useState(initialDigestEnabled)
  const [digestSaving, setDigestSaving] = useState(false)
  const [digestError, setDigestError] = useState<string | null>(null)

  const [hoseTestingEnabled, setHoseTestingEnabled] = useState(initialHoseTestingEnabled)
  const [publicSlug, setPublicSlug] = useState(initialPublicSlug)
  const [slugInput, setSlugInput] = useState('')
  const [hoseTestingSaving, setHoseTestingSaving] = useState(false)
  const [hoseTestingError, setHoseTestingError] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  const [publicSiteEnabled, setPublicSiteEnabledState] = useState(initialPublicSiteEnabled)
  const [publicSiteSaving, setPublicSiteSaving] = useState(false)
  const [publicSiteError, setPublicSiteError] = useState<string | null>(null)
  const [siteLinkCopied, setSiteLinkCopied] = useState(false)

  const [fuelStorageEnabled, setFuelStorageEnabled] = useState(initialFuelStorageEnabled)
  const [fuelStorageSaving, setFuelStorageSaving] = useState(false)
  const [fuelStorageError, setFuelStorageError] = useState<string | null>(null)

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

  async function handleHoseTestingToggle(next: boolean) {
    setHoseTestingSaving(true); setHoseTestingError(null)
    const result = await setHoseTestingConfig(next, publicSlug ? null : slugInput)
    if (result?.error) {
      setHoseTestingError(result.error)
    } else {
      setHoseTestingEnabled(next)
      if (result?.slug) setPublicSlug(result.slug)
    }
    setHoseTestingSaving(false)
  }

  async function handlePublicSiteToggle(next: boolean) {
    setPublicSiteSaving(true); setPublicSiteError(null)
    const result = await setPublicSiteEnabled(next, publicSlug ? null : slugInput)
    if (result?.error) {
      setPublicSiteError(result.error)
    } else {
      setPublicSiteEnabledState(next)
      if (result?.slug) setPublicSlug(result.slug)
    }
    setPublicSiteSaving(false)
  }

  async function handleFuelStorageToggle(next: boolean) {
    setFuelStorageEnabled(next); setFuelStorageSaving(true); setFuelStorageError(null)
    const result = await setFuelStorageModule(next)
    if (result?.error) { setFuelStorageError(result.error); setFuelStorageEnabled(!next) }
    setFuelStorageSaving(false)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Department Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">Timezone, email reminders, and feature toggles for this department.</p>
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

      <div className="rounded-xl bg-white border border-zinc-200 shadow-sm p-5 mt-6">
        <h2 className="text-sm font-semibold text-zinc-900 mb-1">Public Hose Testing</h2>
        <p className="text-xs text-zinc-500 mb-4">
          A no-login page for logging NFPA 1962 hose tests — share the link or a printed QR code with whoever's
          running the test, no FireOps7 account needed. Results write straight into your hose inventory and ISO report.
        </p>

        {hoseTestingError && (
          <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">{hoseTestingError}</div>
        )}

        {publicSlug ? (
          <div className="mb-3 rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2">
            <p className="text-xs font-medium text-zinc-500 mb-0.5">Public link</p>
            <p className="text-sm font-mono text-zinc-800 break-all mb-2">
              {origin}/hose-testing/{publicSlug}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`${origin}/hose-testing/${publicSlug}`)
                  setLinkCopied(true)
                  setTimeout(() => setLinkCopied(false), 2000)
                }}
                className="text-xs font-medium text-red-700 hover:underline"
              >
                {linkCopied ? 'Copied!' : 'Copy Link'}
              </button>
              <QrPrintLabel
                type="hose-testing"
                code={publicSlug}
                title="Hose Testing"
                subtitle="Scan to log NFPA 1962 hose tests"
              />
            </div>
          </div>
        ) : (
          <div className="mb-3">
            <label className="block text-xs font-medium text-zinc-600 mb-1">Choose a URL slug (required to enable)</label>
            <input
              type="text"
              value={slugInput}
              onChange={e => setSlugInput(e.target.value)}
              placeholder="your-department-name"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            <p className="text-xs text-zinc-400 mt-1">
              This becomes your link: /hose-testing/your-slug. Shared with the public site's URL if you set one up later.
            </p>
          </div>
        )}

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={hoseTestingEnabled}
            disabled={hoseTestingSaving}
            onChange={e => handleHoseTestingToggle(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-red-600 focus:ring-red-500"
          />
          <span className="text-sm text-zinc-700">
            {hoseTestingEnabled ? 'Public hose testing is on' : 'Public hose testing is off'}
          </span>
        </label>
      </div>

      <div className="rounded-xl bg-white border border-zinc-200 shadow-sm p-5 mt-6">
        <h2 className="text-sm font-semibold text-zinc-900 mb-1">Public Site</h2>
        <p className="text-xs text-zinc-500 mb-4">
          A citizen-facing page for burn permits, records requests, and general info about your department.
          Shares the same link/slug as public hose testing if you've already set one up.
        </p>

        {publicSiteError && (
          <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">{publicSiteError}</div>
        )}

        {publicSlug ? (
          <div className="mb-3 rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2">
            <p className="text-xs font-medium text-zinc-500 mb-0.5">Public link</p>
            <p className="text-sm font-mono text-zinc-800 break-all mb-2">
              {origin}/dept/{publicSlug}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`${origin}/dept/${publicSlug}`)
                  setSiteLinkCopied(true)
                  setTimeout(() => setSiteLinkCopied(false), 2000)
                }}
                className="text-xs font-medium text-red-700 hover:underline"
              >
                {siteLinkCopied ? 'Copied!' : 'Copy Link'}
              </button>
              <a
                href={`/dept/${publicSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-red-700 hover:underline"
              >
                Open Public Site ↗
              </a>
            </div>
          </div>
        ) : (
          <div className="mb-3">
            <label className="block text-xs font-medium text-zinc-600 mb-1">Choose a URL slug (required to enable)</label>
            <input
              type="text"
              value={slugInput}
              onChange={e => setSlugInput(e.target.value)}
              placeholder="your-department-name"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            <p className="text-xs text-zinc-400 mt-1">
              This becomes your link: /dept/your-slug. Shared with public hose testing's URL if you set one up later.
            </p>
          </div>
        )}

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={publicSiteEnabled}
            disabled={publicSiteSaving}
            onChange={e => handlePublicSiteToggle(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-red-600 focus:ring-red-500"
          />
          <span className="text-sm text-zinc-700">
            {publicSiteEnabled ? 'Public site is on' : 'Public site is off'}
          </span>
        </label>
        <p className="text-xs text-zinc-400 mt-2">
          Content like your tagline, contact info, and about text is still set up by FireOps7 support — reach out once you've turned this on.
        </p>
      </div>

      <div className="rounded-xl bg-white border border-zinc-200 shadow-sm p-5 mt-6">
        <h2 className="text-sm font-semibold text-zinc-900 mb-1">On-Site Fuel Storage</h2>
        <p className="text-xs text-zinc-500 mb-4">
          Track fuel deliveries into department-owned storage tanks and automatically deduct gallons when apparatus fill up on-site.
        </p>

        {fuelStorageError && (
          <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">{fuelStorageError}</div>
        )}

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={fuelStorageEnabled}
            disabled={fuelStorageSaving}
            onChange={e => handleFuelStorageToggle(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-red-600 focus:ring-red-500"
          />
          <span className="text-sm text-zinc-700">
            {fuelStorageEnabled ? 'On-site fuel storage is on' : 'On-site fuel storage is off'}
          </span>
        </label>
      </div>
    </div>
  )
}
