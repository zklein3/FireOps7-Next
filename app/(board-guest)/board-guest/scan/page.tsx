'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import QRScanner from '@/components/QRScanner'
import { resolveCardForBoardAccess } from '@/app/actions/accountability'

// No FireOps7 login here — the physical card is the entire credential. A card only works if an
// officer already checked this exact tag in on an active board and granted it an access tier
// (see the "Card Access" picker in the accountability board's Name Tag flow). Anyone can load
// this URL; nothing happens without a card that's actually been granted access.
export default function BoardGuestScanPage() {
  const router = useRouter()
  const [scannerOpen, setScannerOpen] = useState(true)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleScan(raw: string) {
    setScannerOpen(false)
    setChecking(true)
    setError(null)
    const result = await resolveCardForBoardAccess(raw)
    setChecking(false)
    if (result.error || !result.token) {
      setError(result.error ?? 'This card is not recognized for board access.')
      return
    }
    router.push(`/board-guest/${result.token}`)
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-6 text-center">
        <h1 className="text-lg font-bold text-zinc-900">Scan Your Card</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Scan the card an officer checked you in with to reach your board.
        </p>
      </div>

      {checking && <p className="text-center text-sm text-zinc-500">Checking card…</p>}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {!scannerOpen && !checking && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => { setError(null); setScannerOpen(true) }}
            className="w-full rounded-lg bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800"
          >
            Scan Again
          </button>
          {error && (
            <Link
              href="/login"
              className="block w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-center text-sm font-medium text-zinc-600 hover:bg-zinc-50"
            >
              Back to Login
            </Link>
          )}
        </div>
      )}

      {scannerOpen && (
        <QRScanner
          onScan={handleScan}
          onClose={() => setScannerOpen(false)}
          hint="Point the camera at your card"
        />
      )}
    </div>
  )
}
