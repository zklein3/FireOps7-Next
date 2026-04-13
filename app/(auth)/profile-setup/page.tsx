'use client'

import { useState } from 'react'
import { saveProfile } from '@/app/actions/profile'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY'
]

export default function ProfileSetupPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setLoading(true)
    const result = await saveProfile(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 py-12">
      <div className="w-full max-w-lg rounded-xl bg-white p-8 shadow-md">

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-700">
            <span className="text-2xl font-bold text-white">F7</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">Set Up Your Profile</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Fill in your information to complete account setup.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
            {error}
          </div>
        )}

        {/* Form */}
        <form action={handleSubmit} className="flex flex-col gap-4">

          {/* Name Row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="first_name">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                id="first_name"
                name="first_name"
                type="text"
                required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="First"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="last_name">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                id="last_name"
                name="last_name"
                type="text"
                required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="Last"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="phone">
              Phone Number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              placeholder="(555) 555-5555"
            />
          </div>

          {/* Address */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="address">
              Street Address
            </label>
            <input
              id="address"
              name="address"
              type="text"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              placeholder="123 Main St"
            />
          </div>

          {/* City / State / Zip Row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="city">
                City
              </label>
              <input
                id="city"
                name="city"
                type="text"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="City"
              />
            </div>
            <div className="w-24">
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="state">
                State
              </label>
              <select
                id="state"
                name="state"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              >
                <option value="">—</option>
                {US_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="w-28">
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="zip">
                ZIP
              </label>
              <input
                id="zip"
                name="zip"
                type="text"
                maxLength={10}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="00000"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Saving...' : 'Save & Continue to Dashboard'}
          </button>
        </form>
      </div>
    </div>
  )
}
