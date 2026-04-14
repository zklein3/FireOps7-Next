'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { submitUserReport } from '@/app/actions/personnel'
import { usePathname } from 'next/navigation'

export default function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setMounted(true)
  }, [])

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    formData.set('page', pathname)
    const result = await submitUserReport(formData)
    if (result?.error) {
      setError(result.error)
    } else {
      setSuccess(true)
      setTimeout(() => {
        setOpen(false)
        setSuccess(false)
      }, 2000)
    }
    setLoading(false)
  }

  const modal = open && mounted ? createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-zinc-900">Report an Issue / Give Feedback</h2>
          <button
            onClick={() => setOpen(false)}
            className="text-zinc-400 hover:text-zinc-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {success ? (
          <div className="rounded-lg bg-green-50 px-4 py-6 text-center text-sm text-green-700 border border-green-200">
            ✅ Thanks! Your report has been submitted.
          </div>
        ) : (
          <form action={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Type</label>
              <select
                name="report_type"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              >
                <option value="bug">Bug / Something broken</option>
                <option value="improvement">Improvement suggestion</option>
                <option value="question">Question / Help needed</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Message <span className="text-red-500">*</span>
              </label>
              <textarea
                name="message"
                required
                rows={4}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
                placeholder="Describe the issue or your suggestion..."
              />
            </div>

            <p className="text-xs text-zinc-400">
              Submitted from: <span className="font-mono">{pathname}</span>
            </p>

            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {loading ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  ) : null

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(null); setSuccess(false) }}
        className="w-full rounded-lg border border-red-600 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-700 transition-colors text-left"
      >
        💬 Report / Feedback
      </button>
      {modal}
    </>
  )
}
