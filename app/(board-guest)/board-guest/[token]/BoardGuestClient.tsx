'use client'

import { useCallback, useEffect, useState } from 'react'
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

  const refresh = useCallback(async () => {
    const result = await getGuestBoardState(token)
    if ('error' in result) {
      setError(result.error ?? 'This link is no longer valid.')
      setState(null)
    } else {
      setError(null)
      setState(result)
    }
    setLoading(false)
  }, [token])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, POLL_MS)
    return () => clearInterval(interval)
  }, [refresh])

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading…</p>
  }

  if (error || !state) {
    return (
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-6 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <h2 className="text-lg font-bold text-zinc-900 mb-1">Access Unavailable</h2>
        <p className="text-sm text-zinc-500">{error ?? 'This link is no longer valid.'}</p>
      </div>
    )
  }

  if (state.kind === 'self') {
    return <BoardGuestSelfView token={token} state={state} onChange={refresh} />
  }

  return <BoardGuestAdminView token={token} state={state} onChange={refresh} />
}
