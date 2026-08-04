'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { getGuestBoardState } from '@/app/actions/accountability'
import BoardGuestSelfView from './BoardGuestSelfView'
import BoardGuestAdminView from './BoardGuestAdminView'

// No FireOps7 login here — the token in the URL is the entire credential (see
// lib/board-guest-token.ts). Polls instead of Realtime for the same reason the kiosk
// does: there's no logged-in session to authenticate a Realtime subscription with.
const POLL_MS = 15000

export default function BoardGuestClient({ token }: { token: string }) {
  const [state, setState] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const refresh = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    const result = await getGuestBoardState(token)
    if ('error' in result) {
      setError(result.error ?? 'This link is no longer valid.')
      setState(null)
    } else {
      setError(null)
      setState(result)
    }
    setLastUpdated(new Date())
    setLoading(false)
    if (manual) setRefreshing(false)
  }, [token])

  useEffect(() => {
    refresh()
    const interval = setInterval(() => refresh(), POLL_MS)
    return () => clearInterval(interval)
  }, [refresh])

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading…</p>
  }

  return (
    <div>
      {/* Permissions/mode can change on the officer's side at any time — this always works,
          on top of the automatic 15s poll, so nothing here ever feels "stuck." Safe to just
          close this tab whenever you're done; it doesn't check you out or end anything. */}
      <div className="mb-3 flex items-center justify-between text-xs text-zinc-400">
        <span>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</span>
        <button
          type="button"
          onClick={() => refresh(true)}
          disabled={refreshing}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1 font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {(error || !state) ? (
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-6 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-lg font-bold text-zinc-900 mb-1">Access Unavailable</h2>
          <p className="text-sm text-zinc-500 mb-4">{error ?? 'This link is no longer valid.'}</p>
          <Link
            href="/board-guest/scan"
            className="inline-block rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
          >
            Scan a Card
          </Link>
        </div>
      ) : state.kind === 'self' ? (
        <BoardGuestSelfView token={token} state={state} onChange={() => refresh(true)} />
      ) : (
        <BoardGuestAdminView token={token} state={state} onChange={() => refresh(true)} />
      )}
    </div>
  )
}
