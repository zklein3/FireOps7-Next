'use client'

import { useEffect, useState } from 'react'
import { generateBoardGuestAdminLink, revokeGuestLinks, getGuestAccessStatus } from '@/app/actions/accountability'

// Self-contained button + modal for granting/revoking guest access on a board. Fetches current
// status on mount rather than requiring the caller to pass it, so it drops into any surface
// (board header, board list row) with no extra server query wired up on the caller's side.
export default function GuestAccessControl({ boardId }: { boardId: string }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [guestLink, setGuestLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getGuestAccessStatus(boardId).then(res => setActive(res.active))
  }, [boardId])

  function openModal() {
    setGuestLink(null)
    setGuestName('')
    setError(null)
    setCopied(false)
    setOpen(true)
    getGuestAccessStatus(boardId).then(res => setActive(res.active))
  }

  async function handleGenerate() {
    setBusy(true); setError(null); setCopied(false)
    const result = await generateBoardGuestAdminLink(boardId, guestName)
    setBusy(false)
    if (result.error) { setError(result.error); return }
    setGuestLink(`${window.location.origin}/board-guest/${result.token}`)
  }

  async function handleCopy() {
    if (!guestLink) return
    await navigator.clipboard.writeText(guestLink)
    setCopied(true)
  }

  async function handleRevoke() {
    setBusy(true); setError(null)
    const res = await revokeGuestLinks(boardId)
    setBusy(false)
    if (res?.error) { setError(res.error); return }
    setGuestLink(null)
    setActive(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); openModal() }}
        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors shadow-sm shrink-0 ${
          active ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100' : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
        }`}
      >
        {active ? 'Guest Access ●' : 'Guest Access'}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-zinc-900 mb-1">Guest Access</p>
            <p className="text-xs text-zinc-500 mb-4">
              No FireOps7 account needed — a shared link or a granted card is the credential. Ends automatically when this board closes, or immediately via Revoke below.
            </p>

            <div className={`mb-4 rounded-lg px-3 py-2 text-xs font-medium border ${
              active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-zinc-50 text-zinc-500 border-zinc-200'
            }`}>
              {active
                ? 'Card-based guest access is currently granted on this board.'
                : 'No card-based guest access currently granted. A previously shared link may still work until revoked.'}
            </div>

            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

            {!guestLink ? (
              <>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Generate a new link — guest's name / agency</label>
                <input
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="e.g. Jane Doe, Cass County EM"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm mb-3 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                <button type="button" disabled={busy || !guestName.trim()} onClick={handleGenerate}
                  className="w-full rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                  {busy ? 'Generating...' : 'Generate Link'}
                </button>
              </>
            ) : (
              <>
                <div className="mb-3 rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 break-all">
                  {guestLink}
                </div>
                <button type="button" onClick={handleCopy}
                  className="w-full rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
                  {copied ? 'Copied ✓' : 'Copy Link'}
                </button>
              </>
            )}

            <button type="button" disabled={busy} onClick={handleRevoke}
              className="mt-3 w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">
              {busy ? 'Working...' : 'Revoke All Guest Access'}
            </button>
            <button type="button" onClick={() => setOpen(false)}
              className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
              Done
            </button>
          </div>
        </div>
      )}
    </>
  )
}
