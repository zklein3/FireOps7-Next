'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getPendingSignatures, syncPendingSignatures } from '@/lib/pending-signatures'

// Mounted once in the dashboard layout so a signature queued on any page
// (Inbox, Events, Events Admin) gets flushed the moment connectivity is
// back — on load, when the browser regains a connection, and periodically
// while the tab stays open on a flaky connection.
export default function PendingSignatureSync() {
  const router = useRouter()

  useEffect(() => {
    async function attempt() {
      if (getPendingSignatures().length === 0) return
      const synced = await syncPendingSignatures()
      if (synced.length > 0) router.refresh()
    }

    attempt()
    window.addEventListener('online', attempt)
    const interval = setInterval(attempt, 60_000)

    return () => {
      window.removeEventListener('online', attempt)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
