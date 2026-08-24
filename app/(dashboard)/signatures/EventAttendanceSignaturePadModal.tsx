'use client'

import { useRef, useEffect, useState, useTransition } from 'react'
import SignaturePad from 'signature_pad'
import { saveEventAttendanceSignature } from '@/app/actions/signatures'
import { queuePendingSignature } from '@/lib/pending-signatures'

export default function EventAttendanceSignaturePadModal({
  sig_id,
  memberName,
  eventLabel,
  onClose,
  onSigned,
}: {
  sig_id: string
  memberName: string
  eventLabel: string
  onClose: () => void
  onSigned: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePad | null>(null)
  const [isEmpty, setIsEmpty] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const pad = new SignaturePad(canvas, { backgroundColor: 'rgb(255, 255, 255)' })
    padRef.current = pad

    function resize() {
      if (!canvas || !padRef.current) return
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      canvas.width = canvas.offsetWidth * ratio
      canvas.height = canvas.offsetHeight * ratio
      canvas.getContext('2d')!.scale(ratio, ratio)
      padRef.current.clear()
      setIsEmpty(true)
    }

    resize()
    window.addEventListener('resize', resize)
    pad.addEventListener('beginStroke', () => setIsEmpty(false))

    return () => {
      window.removeEventListener('resize', resize)
      pad.off()
    }
  }, [])

  function handleClear() {
    padRef.current?.clear()
    setIsEmpty(true)
    setError(null)
  }

  function handleConfirm() {
    if (!padRef.current || padRef.current.isEmpty()) return
    setError(null)

    canvasRef.current!.toBlob(blob => {
      if (!blob) { setError('Failed to capture signature.'); return }

      const formData = new FormData()
      formData.append('sig_id', sig_id)
      formData.append('signature', blob, 'signature.png')

      startTransition(async () => {
        try {
          const result = await saveEventAttendanceSignature(formData)
          if (result?.error && result.error !== 'Already signed') { setError(result.error); return }
          onSigned()
        } catch {
          // Network dropped the request mid-flight — hold the signature on
          // this device instead of losing it. It'll send automatically as
          // soon as the connection is back (see lib/pending-signatures.ts).
          const dataUrl = canvasRef.current!.toDataURL('image/png')
          queuePendingSignature({ id: sig_id, kind: 'event', dataUrl, savedAt: new Date().toISOString() })
          onSigned()
        }
      })
    }, 'image/png')
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="shrink-0 px-5 py-4 border-b border-zinc-200 bg-zinc-50">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Event Attendance Signature</p>
        <p className="text-xl font-bold text-zinc-900 mt-0.5">{memberName}</p>
        <p className="text-sm text-zinc-500">{eventLabel}</p>
        <p className="text-xs text-zinc-400 mt-1">
          By signing, you confirm that you attended this event.
        </p>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 bg-white">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
        />
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="select-none text-zinc-300 text-lg">Sign here</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-zinc-200 bg-zinc-50 px-5 py-4 flex items-center gap-3">
        <button
          onClick={onClose}
          disabled={isPending}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleClear}
          disabled={isPending || isEmpty}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 transition-colors disabled:opacity-50"
        >
          Clear
        </button>
        {error && <p className="flex-1 text-center text-sm text-red-600">{error}</p>}
        <button
          onClick={handleConfirm}
          disabled={isPending || isEmpty}
          className="ml-auto rounded-lg bg-red-700 px-6 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50"
        >
          {isPending ? 'Saving...' : 'Confirm'}
        </button>
      </div>
    </div>
  )
}
