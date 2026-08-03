'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserCodeReader, BrowserMultiFormatReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'

// Remembers the last camera picked on this device (e.g. an external webcam over a
// laptop's built-in selfie camera) so switching only has to happen once per machine.
const LAST_DEVICE_KEY = 'fireops7_qr_scanner_device_id'

export default function QRScanner({
  onScan,
  onClose,
  hint,
}: {
  onScan: (raw: string) => void
  onClose: () => void
  hint?: string
}) {
  const [error, setError] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string | undefined>(() =>
    typeof window === 'undefined' ? undefined : localStorage.getItem(LAST_DEVICE_KEY) ?? undefined
  )
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const detectedRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const onScanRef = useRef(onScan)
  useEffect(() => { onScanRef.current = onScan }, [onScan])

  const stop = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
  }, [])

  useEffect(() => { return () => stop() }, [stop])

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()

    async function start() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setError('Camera access is not available on this browser.')
        return
      }

      if (!videoRef.current) return

      try {
        controlsRef.current = await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current,
          (result, err) => {
            if (result && !detectedRef.current) {
              detectedRef.current = true
              onScanRef.current(result.getText())
              stop()
            }
            // NotFoundException fires every frame when nothing is detected — ignore it
            if (err && err.name !== 'NotFoundException') {
              console.warn('[QRScanner]', err.name, err.message)
            }
          }
        )
        // Device labels are blank until permission is granted — only populated now.
        const list = await BrowserCodeReader.listVideoInputDevices()
        setDevices(list)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')) {
          setError('Camera permission denied. Check your browser settings and try again.')
        } else {
          setError('Unable to start camera. Try the photo option below.')
        }
      }
    }

    start()
  }, [stop, deviceId])

  function handleSwitchCamera() {
    if (devices.length < 2) return
    const currentIndex = devices.findIndex(d => d.deviceId === deviceId)
    const next = devices[(currentIndex + 1) % devices.length]
    stop()
    setDeviceId(next.deviceId)
    localStorage.setItem(LAST_DEVICE_KEY, next.deviceId)
  }

  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoError('')

    const url = URL.createObjectURL(file)
    const reader = new BrowserMultiFormatReader()
    try {
      const result = await reader.decodeFromImageUrl(url)
      if (result && !detectedRef.current) {
        detectedRef.current = true
        stop()
        onScanRef.current(result.getText())
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('No MultiFormat Readers were able') || msg.includes('NotFoundException')) {
        setPhotoError('No barcode found in the photo. Try better lighting or move closer.')
      } else {
        setPhotoError('Could not read the photo. Try again.')
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  if (error) {
    return (
      <div className="w-full">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-3">
          {error}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
          onChange={handlePhotoCapture} className="hidden" />
        <button type="button" onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 mb-2">
          Take Photo Instead
        </button>
        <button type="button" onClick={onClose}
          className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 border border-zinc-200">
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="rounded-xl border border-zinc-200 bg-zinc-950 p-3">
        <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg" />
        {hint && <p className="mt-2 text-center text-xs text-zinc-300">{hint}</p>}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
        onChange={handlePhotoCapture} className="hidden" />

      {photoError && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {photoError}
        </div>
      )}

      {devices.length > 1 && (
        <button type="button" onClick={handleSwitchCamera}
          className="mt-3 w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100">
          Switch Camera
        </button>
      )}

      <button type="button" onClick={() => fileInputRef.current?.click()}
        className="mt-3 w-full rounded-lg bg-orange-600 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-700">
        Take Photo to Scan
      </button>
      <button type="button" onClick={() => { stop(); onClose() }}
        className="mt-2 w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 border border-zinc-200">
        Cancel
      </button>
    </div>
  )
}
