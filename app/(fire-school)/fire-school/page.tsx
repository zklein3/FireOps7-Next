'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkBottle, logFill } from '@/app/actions/fire-school'

const CYLINDER_TYPE_LABELS: Record<string, string> = {
  composite_15: 'Composite (15yr)',
  composite_30: 'Composite (30yr)',
  steel: 'Steel',
  aluminum: 'Aluminum',
}

interface Bottle {
  bottle_id: string
  department_name: string | null
  psi: number | null
  cylinder_type: string | null
  manufacture_date: string | null
  last_requal_date: string | null
  requal_interval_years: number | null
  service_life_years: number | null
  requires_service_life: boolean | null
  active: boolean
}

interface CheckBottleResult {
  found: boolean
  bottle?: Bottle
  fillable?: boolean
  reason?: string | null
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): {
        detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>
      }
    }
  }
}

export default function FillStationPage() {
  const router = useRouter()

  const [bottleInput, setBottleInput] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<CheckBottleResult | null>(null)
  const [logging, setLogging] = useState(false)
  const [logged, setLogged] = useState(false)
  const [notes, setNotes] = useState('')

  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const [scannerSupported, setScannerSupported] = useState(false)
  const [scanDetected, setScanDetected] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)
  const detectorRef = useRef<{
    detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>
  } | null>(null)

  const stopScanner = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    detectorRef.current = null
    setScannerOpen(false)
  }, [])

  async function handleCheck(overrideBottleId?: string) {
    const rawValue = overrideBottleId ?? bottleInput
    const cleanBottleId = rawValue.trim().toUpperCase()

    if (!cleanBottleId) return

    setBottleInput(cleanBottleId)
    setChecking(true)
    setResult(null)
    setLogged(false)

    try {
      const res = await checkBottle(cleanBottleId)
      setResult(res as CheckBottleResult)
    } finally {
      setChecking(false)
    }
  }

  async function handleLogFill() {
    if (!result?.bottle) return

    setLogging(true)

    try {
      const res = await logFill(result.bottle.bottle_id, notes)
      if (res.success) {
        setLogged(true)
        setNotes('')
      }
    } finally {
      setLogging(false)
    }
  }

  function handleReset() {
    setBottleInput('')
    setResult(null)
    setLogged(false)
    setNotes('')
    setScannerError('')
    setScanDetected(false)
    stopScanner()
    router.replace('/fire-school')
  }

  const getRequalExpiry = (bottle: Bottle) => {
    if (!bottle.last_requal_date || !bottle.requal_interval_years) return null
    const d = new Date(bottle.last_requal_date)
    d.setFullYear(d.getFullYear() + bottle.requal_interval_years)
    return d
  }

  const getServiceLifeExpiry = (bottle: Bottle) => {
    if (!bottle.requires_service_life || !bottle.manufacture_date || !bottle.service_life_years) return null
    const d = new Date(bottle.manufacture_date)
    d.setFullYear(d.getFullYear() + bottle.service_life_years)
    return d
  }

  useEffect(() => {
    setScannerSupported(
      typeof window !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof window.BarcodeDetector !== 'undefined'
    )
  }, [])

  const startScanner = useCallback(async () => {
    setScannerError('')
    setScanDetected(false)

    if (
      typeof window === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof window.BarcodeDetector === 'undefined'
    ) {
      setScannerError('Camera QR scanning is not supported on this device/browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })

      streamRef.current = stream

      detectorRef.current = new window.BarcodeDetector({
        formats: ['qr_code'],
      })

      setScannerOpen(true)
    } catch {
      setScannerError('Unable to access camera.')
      stopScanner()
    }
  }, [stopScanner])

  useEffect(() => {
    if (!scannerOpen) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const detector = detectorRef.current

    if (!video || !canvas || !streamRef.current || !detector) {
      setScannerError('Scanner video element not ready.')
      stopScanner()
      return
    }

    const start = async () => {
      try {
        video.srcObject = streamRef.current
        await video.play()

        const scanLoop = async () => {
          if (scanDetected) return

          if (video.readyState >= 2) {
            const ctx = canvas.getContext('2d')

            if (ctx) {
              canvas.width = video.videoWidth
              canvas.height = video.videoHeight
              ctx.drawImage(video, 0, 0)

              try {
                const codes = await detector.detect(canvas)
                const value = codes?.[0]?.rawValue?.trim()

                if (value) {
                  setScanDetected(true)
                  stopScanner()
                  router.replace(`/fire-school/bottles?scan=${encodeURIComponent(value.toUpperCase())}`)
                  return
                }
              } catch {
                // keep scanning
              }
            }
          }

          frameRef.current = requestAnimationFrame(scanLoop)
        }

        frameRef.current = requestAnimationFrame(scanLoop)
      } catch {
        setScannerError('Unable to start scanner.')
        stopScanner()
      }
    }

    start()
  }, [scannerOpen, scanDetected, router, stopScanner])

  useEffect(() => {
    return () => {
      stopScanner()
    }
  }, [stopScanner])

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-zinc-900">SCBA Fill Station</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Enter a bottle ID or scan with the camera
        </p>
      </div>

      {!result && (
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-6">
          <label className="mb-2 block text-sm font-medium text-zinc-700">Bottle ID</label>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={bottleInput}
              onChange={e => setBottleInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleCheck()}
              placeholder="B-0001"
              className="flex-1 min-w-0 rounded-lg border border-zinc-300 px-4 py-3 text-base sm:text-lg font-mono font-bold text-zinc-900 uppercase placeholder-zinc-300 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              autoFocus
            />
            <button
              onClick={() => handleCheck()}
              disabled={checking || !bottleInput.trim()}
              className="w-full sm:w-auto rounded-lg bg-orange-600 px-4 sm:px-6 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {checking ? 'Checking...' : 'Check'}
            </button>
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={startScanner}
              disabled={checking || scannerOpen}
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {scannerOpen ? 'Scanner Open...' : 'Scan QR with Camera'}
            </button>
          </div>

          <p className="mt-2 text-xs text-zinc-400">
            Press Enter, tap Check, or scan a QR code
          </p>

          {!scannerSupported && (
            <p className="mt-2 text-xs text-amber-600">
              In-page camera scanning may not work on every browser. QR links with
              <span className="font-mono"> ?scan=</span> still work on the bottles page.
            </p>
          )}

          {scannerError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {scannerError}
            </div>
          )}

          {scannerOpen && (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-950 p-3">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-lg"
              />
              <canvas ref={canvasRef} className="hidden" />

              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={stopScanner}
                  className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  Cancel Scan
                </button>
              </div>

              <p className="mt-2 text-center text-xs text-zinc-300">
                Point the camera at the bottle QR code
              </p>
            </div>
          )}
        </div>
      )}

      {result && !logged && (
        <div className="flex flex-col gap-4">
          {!result.found && (
            <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-6 text-center">
              <div className="text-4xl mb-3">🔍</div>
              <h2 className="text-lg font-bold text-zinc-900 mb-1">Bottle Not Found</h2>
              <p className="text-sm text-zinc-500 mb-6">
                <span className="font-mono font-bold">{bottleInput.toUpperCase()}</span> is not in the system.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  className="flex-1 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  Try Again
                </button>
                <button
                  onClick={() => router.push(`/fire-school/bottles?add=${bottleInput.toUpperCase()}`)}
                  className="flex-1 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700"
                >
                  Add Bottle
                </button>
              </div>
            </div>
          )}

          {result.found && result.bottle && (
            <>
              <div
                className={`rounded-xl shadow-sm border p-5 ${
                  result.fillable ? 'bg-white border-zinc-200' : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-start justify-between mb-4 gap-3">
                  <div>
                    <span className="text-3xl font-bold font-mono text-zinc-900 break-all">
                      {result.bottle.bottle_id}
                    </span>
                    {result.bottle.department_name && (
                      <p className="text-sm text-zinc-500 mt-0.5">
                        {result.bottle.department_name}
                      </p>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold whitespace-nowrap ${
                      result.fillable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {result.fillable ? '✓ OK to Fill' : '✗ Do Not Fill'}
                  </span>
                </div>

                {!result.fillable && result.reason && (
                  <div className="mb-4 rounded-lg bg-red-100 border border-red-200 px-4 py-3 text-sm font-medium text-red-800">
                    ⚠️ {result.reason}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <DetailField
                    label="PSI"
                    value={result.bottle.psi ? `${result.bottle.psi} PSI` : null}
                  />
                  <DetailField
                    label="Type"
                    value={
                      result.bottle.cylinder_type
                        ? CYLINDER_TYPE_LABELS[result.bottle.cylinder_type] ??
                          result.bottle.cylinder_type
                        : null
                    }
                  />
                  <DetailField
                    label="Manufacture Date"
                    value={
                      result.bottle.manufacture_date
                        ? new Date(result.bottle.manufacture_date).toLocaleDateString()
                        : null
                    }
                  />
                  <DetailField
                    label="Last Requal"
                    value={
                      result.bottle.last_requal_date
                        ? new Date(result.bottle.last_requal_date).toLocaleDateString()
                        : null
                    }
                  />
                  <DetailField
                    label="Requal Expiry"
                    value={getRequalExpiry(result.bottle)?.toLocaleDateString() ?? null}
                  />
                  {result.bottle.requires_service_life && (
                    <DetailField
                      label="Service Life Ends"
                      value={getServiceLifeExpiry(result.bottle)?.toLocaleDateString() ?? null}
                    />
                  )}
                </div>
              </div>

              {result.fillable && (
                <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5">
                  <h3 className="text-base font-semibold text-zinc-900 mb-3">Log Fill</h3>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Notes (optional)"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm mb-3 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
                  />
                  <button
                    onClick={handleLogFill}
                    disabled={logging}
                    className="w-full rounded-lg bg-green-600 px-4 py-3 text-base font-bold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {logging ? 'Logging Fill...' : '✓ Log Fill'}
                  </button>
                </div>
              )}

              <button
                onClick={handleReset}
                className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                ← Check Another Bottle
              </button>
            </>
          )}
        </div>
      )}

      {logged && (
        <div className="rounded-xl bg-white shadow-sm border border-green-200 p-8 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-zinc-900 mb-1">Fill Logged!</h2>
          <p className="text-sm text-zinc-500 mb-6">
            Fill recorded for <span className="font-mono font-bold">{result?.bottle?.bottle_id}</span>
          </p>
          <button
            onClick={handleReset}
            className="w-full rounded-lg bg-orange-600 px-4 py-3 text-base font-bold text-white hover:bg-orange-700"
          >
            Fill Another Bottle
          </button>
        </div>
      )}
    </div>
  )
}

function DetailField({
  label,
  value,
}: {
  label: string
  value: string | null
}) {
  return (
    <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 font-semibold text-zinc-900 break-words">{value ?? '—'}</div>
    </div>
  )
}