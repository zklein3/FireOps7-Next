'use client'

import { useState } from 'react'
import { saveDeptInboxSettings } from '@/app/actions/public-site'
import CountyContactsEditor from '@/components/CountyContactsEditor'
import HelpText from '@/components/HelpText'

export default function PublicInboxSettingsClient({
  departmentId,
  burn_permit_county_info,
  burn_permit_restrictions,
}: {
  departmentId: string
  burn_permit_county_info: string | null
  burn_permit_restrictions: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSave(formData: FormData) {
    setLoading(true); setError(null); setSuccess(null)
    const result = await saveDeptInboxSettings(formData)
    if (result.error) setError(result.error)
    else setSuccess('Settings saved.')
    setLoading(false)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Public Inbox Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">Configure burn permit and records request forms shown to the public.</p>
      </div>

      <HelpText className="mb-4">
        This controls what residents see on your public site's burn permit form — county info, restrictions text,
        and contacts. Submissions themselves are reviewed in the Inbox, not here.
      </HelpText>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">{success}</div>}

      <form action={handleSave} className="flex flex-col gap-5">
        <input type="hidden" name="department_id" value={departmentId} />

        <div className="rounded-xl bg-white border border-zinc-200 p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-zinc-900">Burn Permits</h2>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              County / Sheriff Info <span className="text-red-500">*</span>
            </label>
            <CountyContactsEditor name="burn_permit_county_info" defaultValue={burn_permit_county_info} />
            <p className="mt-1 text-xs text-zinc-400">Printed on approved permits. Required before approving any permit.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Burn Restrictions</label>
            <input
              name="burn_permit_restrictions"
              type="text"
              defaultValue={burn_permit_restrictions ?? ''}
              placeholder="e.g. Brush until 1900 daily, no burning on Red Flag days"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            <p className="mt-1 text-xs text-zinc-400">Shown to residents on the public burn permit form and printed on the permit.</p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-red-700 px-5 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
