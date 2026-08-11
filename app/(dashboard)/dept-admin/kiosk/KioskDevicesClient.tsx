'use client'

import { useState } from 'react'
import { createKioskDevice, revokeKioskDevice } from '@/app/actions/kiosk'
import HelpText from '@/components/HelpText'

interface Device {
  id: string
  device_name: string
  created_at: string
  revoked_at: string | null
}

export default function KioskDevicesClient({ devices: initialDevices }: { devices: Device[] }) {
  const [devices, setDevices] = useState(initialDevices)
  const [deviceName, setDeviceName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newCredential, setNewCredential] = useState<{ deviceId: string; secret: string; name: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function handleCreate() {
    if (!deviceName.trim()) { setError('Enter a name for this device (e.g. "Station 1 Tablet").'); return }
    setError(null)
    setCreating(true)
    const result = await createKioskDevice(deviceName.trim())
    setCreating(false)
    if (result.error || !result.deviceId || !result.secret) { setError(result.error ?? 'Failed to create device.'); return }
    setNewCredential({ deviceId: result.deviceId, secret: result.secret, name: deviceName.trim() })
    setDevices(prev => [{ id: result.deviceId!, device_name: deviceName.trim(), created_at: new Date().toISOString(), revoked_at: null }, ...prev])
    setDeviceName('')
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this device? It will no longer be able to scan people in or out.')) return
    setBusyId(id)
    const result = await revokeKioskDevice(id)
    if (!result?.error) setDevices(prev => prev.map(d => d.id === id ? { ...d, revoked_at: new Date().toISOString() } : d))
    setBusyId(null)
  }

  function handleSetUpThisDevice() {
    if (!newCredential) return
    localStorage.setItem('kiosk_device_id', newCredential.deviceId)
    localStorage.setItem('kiosk_device_secret', newCredential.secret)
    window.location.href = '/kiosk'
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Kiosk Devices</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          A kiosk device lets a shared station tablet scan people in/out without anyone logging in on it. Set one up once, then leave the tablet on the <span className="font-mono">/kiosk</span> page.
        </p>
      </div>

      <HelpText className="mb-4">
        The device credential is shown once at creation — if you navigate away before saving it on the tablet,
        you'll need to revoke the device and create a new one. Revoking locks that tablet out immediately.
      </HelpText>

      {newCredential && (
        <div className="mb-6 rounded-xl bg-amber-50 border border-amber-300 p-5">
          <p className="text-sm font-semibold text-amber-900 mb-1">"{newCredential.name}" created — set it up now</p>
          <p className="text-xs text-amber-800 mb-3">
            This credential is shown once and can&apos;t be retrieved later. If you&apos;re on the tablet you want to set up, tap the button below —
            it stores the credential in this browser and opens the kiosk screen. If you&apos;re not on that tablet, revoke this device and create a new one from there instead.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSetUpThisDevice}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
            >
              Set Up This Device Now →
            </button>
            <button
              onClick={() => setNewCredential(null)}
              className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-white border border-zinc-200 p-5 mb-6">
        <p className="text-sm font-semibold text-zinc-900 mb-3">Add a Device</p>
        {error && <div className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}
        <div className="flex gap-2">
          <input
            type="text"
            value={deviceName}
            onChange={e => setDeviceName(e.target.value)}
            placeholder="e.g. Station 1 Tablet"
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
          >
            {creating ? 'Creating…' : '+ Add'}
          </button>
        </div>
      </div>

      {devices.length === 0 ? (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-10 text-center text-sm text-zinc-400">
          No kiosk devices yet.
        </div>
      ) : (
        <div className="rounded-xl bg-white border border-zinc-200 shadow-sm divide-y divide-zinc-100">
          {devices.map(d => (
            <div key={d.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-zinc-900">{d.device_name}</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Added {new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {d.revoked_at && <span className="text-red-500 ml-2">· Revoked</span>}
                </p>
              </div>
              {!d.revoked_at && (
                <button
                  onClick={() => handleRevoke(d.id)}
                  disabled={busyId === d.id}
                  className="text-xs font-medium text-zinc-400 hover:text-red-600 disabled:opacity-40 transition-colors"
                >
                  {busyId === d.id ? '…' : 'Revoke'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
