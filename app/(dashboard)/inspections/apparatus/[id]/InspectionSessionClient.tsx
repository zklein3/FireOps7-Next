'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { claimCompartment, releaseCompartment, reopenCompartment, closeInspectionSession, deleteInspectionSession, getSessionReconciliation } from '@/app/actions/inspections'
import { moveAssetsToStorage } from '@/app/actions/equipment'
import { formatLocalDateTime } from '@/lib/format-datetime'

interface SessionCompartment {
  id: string
  compartment_id: string
  compartment_name: string
  status: 'pending' | 'in_progress' | 'completed'
  claimed_by: string | null
  claimed_by_name: string | null
  completed_by_name: string | null
  completed_at: string | null
  medication_expiring?: boolean
}

interface Session {
  id: string
  status: string
  started_at: string
  expires_at: string
}

interface ReconciliationAsset {
  id: string
  asset_tag: string
  serial_number: string | null
  item_name: string
}

export default function InspectionSessionClient({
  session,
  compartments,
  apparatus_id,
  apparatus_unit_number,
  personnel_id,
  isOfficerOrAdmin,
  departmentTimezone,
}: {
  session: Session
  compartments: SessionCompartment[]
  apparatus_id: string
  apparatus_unit_number: string
  personnel_id: string
  isOfficerOrAdmin: boolean
  departmentTimezone: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [reconciliation, setReconciliation] = useState<ReconciliationAsset[] | null>(null)
  const [keepOnApparatus, setKeepOnApparatus] = useState<Set<string>>(new Set())
  const [loadingRecon, setLoadingRecon] = useState(false)
  const [closing, setClosing] = useState(false)
  const [abandonConfirm, setAbandonConfirm] = useState(false)

  const done = compartments.filter(c => c.status === 'completed').length
  const total = compartments.length
  const sessionClosed = session.status === 'completed'
  const sessionAllDone = total > 0 && done === total

  // Auto-load reconciliation when all compartments are done
  useEffect(() => {
    if (sessionAllDone && !sessionClosed && isOfficerOrAdmin && reconciliation === null && !loadingRecon) {
      loadReconciliation()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadReconciliation() {
    setLoadingRecon(true)
    setError(null)
    const res = await getSessionReconciliation(session.id, apparatus_id)
    setLoadingRecon(false)
    if ('error' in res) {
      setError(res.error as string)
      return
    }
    setReconciliation(res.unaccounted)
  }

  async function handleInspect(sc: SessionCompartment) {
    setLoadingId(sc.id)
    setError(null)
    const res = await claimCompartment(sc.id)
    if (res?.error) {
      setError(res.error)
      setLoadingId(null)
      return
    }
    router.push(
      `/inspections/run?apparatus_id=${apparatus_id}&compartment_id=${sc.compartment_id}&session_id=${session.id}&session_compartment_id=${sc.id}`
    )
  }

  async function handleRelease(sc: SessionCompartment) {
    setLoadingId(sc.id)
    setError(null)
    startTransition(async () => {
      const res = await releaseCompartment(sc.id)
      if (res?.error) setError(res.error)
      setLoadingId(null)
      router.refresh()
    })
  }

  async function handleReopen(sc: SessionCompartment) {
    setLoadingId(sc.id)
    setError(null)
    startTransition(async () => {
      const res = await reopenCompartment(sc.id)
      if (res?.error) {
        setError(res.error)
        setLoadingId(null)
        return
      }
      router.push(
        `/inspections/run?apparatus_id=${apparatus_id}&compartment_id=${sc.compartment_id}&session_id=${session.id}&session_compartment_id=${sc.id}`
      )
    })
  }

  async function handleAbandon() {
    setError(null)
    setClosing(true)
    const res = done === 0
      ? await deleteInspectionSession(session.id)
      : await closeInspectionSession(session.id)
    if (res?.error) {
      setError(res.error)
      setClosing(false)
      setAbandonConfirm(false)
      return
    }
    router.replace('/inspections')
  }

  async function doConfirmClose() {
    setClosing(true)
    setError(null)
    const current = reconciliation ?? []
    const toStorage = current.filter(a => !keepOnApparatus.has(a.id)).map(a => a.id)
    if (toStorage.length > 0) {
      const moveRes = await moveAssetsToStorage(toStorage)
      if (moveRes?.error) {
        setError(moveRes.error)
        setClosing(false)
        return
      }
    }
    const closeRes = await closeInspectionSession(session.id)
    if (closeRes?.error) {
      setError(closeRes.error)
      setClosing(false)
      return
    }
    router.replace('/inspections')
  }

  function toggleKeep(assetId: string) {
    setKeepOnApparatus(prev => {
      const next = new Set(prev)
      if (next.has(assetId)) next.delete(assetId)
      else next.add(assetId)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%' }}
          />
        </div>
        <span className="text-sm font-medium text-zinc-600 whitespace-nowrap">
          {done} / {total} complete
        </span>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Compartment list */}
      <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {compartments.length === 0 && (
          <div className="px-4 py-6 text-sm text-zinc-500 text-center">
            No compartments assigned to this apparatus.
          </div>
        )}
        {compartments.map(sc => (
          <div key={sc.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-900 truncate flex items-center gap-1.5">
                {apparatus_unit_number} - {sc.compartment_name}
                {sc.medication_expiring && (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 shrink-0">
                    ⚠ Med Expiring
                  </span>
                )}
              </p>
              {sc.status === 'in_progress' && sc.claimed_by_name && (
                <p className="text-xs text-amber-600 mt-0.5">In progress — {sc.claimed_by_name}</p>
              )}
              {sc.status === 'completed' && (
                <p className="text-xs text-green-600 mt-0.5">
                  Completed by {sc.completed_by_name ?? 'Unknown'}
                  {sc.completed_at ? ` · ${formatLocalDateTime(sc.completed_at, departmentTimezone, { month: undefined, day: undefined })}` : ''}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {sc.status === 'pending' && (
                <button
                  onClick={() => handleInspect(sc)}
                  disabled={loadingId === sc.id || isPending}
                  className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
                >
                  {loadingId === sc.id ? 'Starting…' : 'Inspect'}
                </button>
              )}
              {sc.status === 'in_progress' && (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    In Progress
                  </span>
                  <button
                    onClick={() => handleInspect(sc)}
                    disabled={loadingId === sc.id || isPending}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    {loadingId === sc.id ? 'Opening…' : 'Resume'}
                  </button>
                  {isOfficerOrAdmin && (
                    <button
                      onClick={() => handleRelease(sc)}
                      disabled={loadingId === sc.id || isPending}
                      className="text-xs text-zinc-500 hover:text-red-700 underline disabled:opacity-50"
                    >
                      Release
                    </button>
                  )}
                </>
              )}
              {sc.status === 'completed' && (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    ✓ Done
                  </span>
                  {isOfficerOrAdmin && (
                    <button
                      onClick={() => handleReopen(sc)}
                      disabled={loadingId === sc.id || isPending}
                      className="text-xs text-zinc-500 hover:text-amber-700 underline disabled:opacity-50"
                    >
                      Reopen
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Reconciliation panel — all compartments done, assets to resolve */}
      {isOfficerOrAdmin && !sessionClosed && reconciliation !== null && reconciliation.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-amber-900">Asset Reconciliation</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {reconciliation.length} asset{reconciliation.length !== 1 ? 's' : ''} assigned to this apparatus
              {reconciliation.length !== 1 ? ' were' : ' was'} not confirmed during this inspection.
              Choose what to do with each before closing.
            </p>
          </div>

          <div className="divide-y divide-amber-200 rounded-lg border border-amber-200 bg-white overflow-hidden">
            {reconciliation.map(asset => {
              const keep = keepOnApparatus.has(asset.id)
              return (
                <div key={asset.id} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900">{asset.asset_tag}</p>
                    <p className="text-xs text-zinc-500">
                      {asset.item_name}{asset.serial_number ? ` · S/N: ${asset.serial_number}` : ''}
                    </p>
                  </div>
                  <div className="flex rounded-lg border border-zinc-200 overflow-hidden shrink-0 text-xs font-semibold">
                    <button
                      onClick={() => keep && toggleKeep(asset.id)}
                      className={`px-3 py-1.5 transition-colors ${!keep ? 'bg-amber-600 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}
                    >
                      To Storage
                    </button>
                    <button
                      onClick={() => !keep && toggleKeep(asset.id)}
                      className={`px-3 py-1.5 border-l border-zinc-200 transition-colors ${keep ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}
                    >
                      Keep on Unit
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <button
            onClick={doConfirmClose}
            disabled={closing}
            className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
          >
            {closing ? 'Closing…' : (() => {
              const toStorage = reconciliation.filter(a => !keepOnApparatus.has(a.id)).length
              return toStorage > 0 ? `Move ${toStorage} to Storage & Close Session` : 'Close Session'
            })()}
          </button>
        </div>
      )}

      {/* Loading reconciliation */}
      {isOfficerOrAdmin && !sessionClosed && loadingRecon && (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 text-center">
          Checking asset reconciliation…
        </div>
      )}

      {/* All done, no unaccounted assets — confirm close */}
      {isOfficerOrAdmin && !sessionClosed && sessionAllDone && reconciliation !== null && reconciliation.length === 0 && (
        <div className="flex justify-end pt-2">
          <button
            onClick={doConfirmClose}
            disabled={closing}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
          >
            {closing ? 'Closing…' : 'Close Session'}
          </button>
        </div>
      )}

      {/* Bottom bar — back link for everyone, abandon for officers only */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
        <button
          onClick={() => router.push('/inspections')}
          className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          ← Back to Inspections
        </button>

        {isOfficerOrAdmin && !sessionClosed && !sessionAllDone && (
          <>
            {!abandonConfirm ? (
              <button
                onClick={() => setAbandonConfirm(true)}
                className="text-xs text-zinc-400 hover:text-red-600 underline transition-colors"
              >
                Abandon Session
              </button>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs text-red-800">
                  {done === 0
                    ? 'Cancel this inspection? It will be removed.'
                    : `Close with ${total - done} compartment${total - done !== 1 ? 's' : ''} incomplete?`}
                </p>
                <button
                  onClick={handleAbandon}
                  disabled={closing}
                  className="rounded bg-red-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                >
                  {closing ? (done === 0 ? 'Removing…' : 'Closing…') : (done === 0 ? 'Yes, Cancel' : 'Yes, Abandon')}
                </button>
                <button
                  onClick={() => setAbandonConfirm(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-700 underline"
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
