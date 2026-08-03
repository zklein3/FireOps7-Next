'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { closeBoard, reopenBoard, updateBoardLink, setBoardIcsFields, generateBoardGuestAdminLink, revokeGuestLinks } from '@/app/actions/accountability'
import { createIcsIncident } from '@/app/actions/ics'

export default function BoardHeader({
  boardId,
  title,
  boardDate,
  status,
  linkedIncidentId,
  linkedIncidentLabel,
  isOfficerOrAbove,
  incidentOptions,
  moduleIcs,
  existingIcsIncidentId,
  initialIsActiveViolence,
  initialNimsMode,
}: {
  boardId: string
  title: string
  boardDate: string
  status: string
  linkedIncidentId: string | null
  linkedIncidentLabel: string | null
  isOfficerOrAbove: boolean
  incidentOptions: { id: string; label: string }[]
  moduleIcs: boolean
  existingIcsIncidentId: string | null
  initialIsActiveViolence: boolean
  initialNimsMode: boolean
}) {
  const router = useRouter()
  const [toggling, setToggling] = useState(false)
  const [openingIcs, setOpeningIcs] = useState(false)
  const [isActiveViolence, setIsActiveViolence] = useState(initialIsActiveViolence)
  const [nimsMode, setNimsMode] = useState(initialNimsMode)
  const [modeSaving, setModeSaving] = useState<'violence' | 'nims' | null>(null)

  async function handleToggleMode(field: 'is_active_violence' | 'nims_mode', checked: boolean) {
    setModeSaving(field === 'is_active_violence' ? 'violence' : 'nims')
    const res = await setBoardIcsFields(boardId, { [field]: checked })
    setModeSaving(null)
    if (res?.error) return
    if (field === 'is_active_violence') setIsActiveViolence(checked)
    else setNimsMode(checked)
    router.refresh()
  }

  async function handleOpenIcsPacket() {
    if (existingIcsIncidentId) { router.push(`/ics/${existingIcsIncidentId}`); return }
    setOpeningIcs(true)
    const result = await createIcsIncident(title, null, boardId)
    setOpeningIcs(false)
    if (result?.id) router.push(`/ics/${result.id}`)
  }
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkType, setLinkType] = useState<'none' | 'incident'>(linkedIncidentId ? 'incident' : 'none')
  const [selectedIncident, setSelectedIncident] = useState(linkedIncidentId ?? '')
  const [linkSaving, setLinkSaving] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  const [guestOpen, setGuestOpen] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [guestLink, setGuestLink] = useState<string | null>(null)
  const [guestError, setGuestError] = useState<string | null>(null)
  const [guestBusy, setGuestBusy] = useState(false)
  const [guestCopied, setGuestCopied] = useState(false)

  const formattedDate = new Date(boardDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })

  async function handleToggleStatus() {
    setToggling(true)
    const res = status === 'active' ? await closeBoard(boardId) : await reopenBoard(boardId)
    setToggling(false)
    if (!res?.error) router.refresh()
  }

  async function handleSaveLink() {
    setLinkSaving(true)
    setLinkError(null)
    const incId = linkType === 'incident' ? (selectedIncident || null) : null
    const res = await updateBoardLink(boardId, incId, null, null)
    setLinkSaving(false)
    if (res?.error) { setLinkError(res.error); return }
    setLinkOpen(false)
    router.refresh()
  }

  async function handleGenerateGuestLink() {
    setGuestBusy(true)
    setGuestError(null)
    setGuestCopied(false)
    const result = await generateBoardGuestAdminLink(boardId, guestName)
    setGuestBusy(false)
    if (result.error) { setGuestError(result.error); return }
    setGuestLink(`${window.location.origin}/board-guest/${result.token}`)
  }

  async function handleCopyGuestLink() {
    if (!guestLink) return
    await navigator.clipboard.writeText(guestLink)
    setGuestCopied(true)
  }

  async function handleRevokeGuestLinks() {
    setGuestBusy(true)
    setGuestError(null)
    const res = await revokeGuestLinks(boardId)
    setGuestBusy(false)
    if (res?.error) { setGuestError(res.error); return }
    setGuestLink(null)
    setGuestName('')
  }

  return (
    <>
      <div className="flex items-start gap-3 mb-5">
        <Link href="/accountability"
          className="rounded-lg bg-white border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-sm shrink-0 mt-0.5">
          ← Back
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-zinc-900 truncate">{title}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              status === 'active' ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
            }`}>
              {status === 'active' ? 'Active' : 'Closed'}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <p className="text-xs text-zinc-500">{formattedDate}</p>
            {linkedIncidentLabel && (
              <span className="text-xs text-zinc-400">· Incident {linkedIncidentLabel}</span>
            )}
            {!linkedIncidentId && (
              <span className="text-xs text-zinc-400">· Standalone</span>
            )}
          </div>
        </div>
        {isOfficerOrAbove && (
          <div className="flex gap-2 shrink-0">
            {moduleIcs && (
              <button type="button" disabled={openingIcs} onClick={handleOpenIcsPacket}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors shadow-sm disabled:opacity-50">
                {openingIcs ? 'Opening…' : existingIcsIncidentId ? 'View ICS Packet' : 'Open ICS Packet'}
              </button>
            )}
            <button type="button" onClick={() => setLinkOpen(true)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors shadow-sm">
              Link
            </button>
            {status === 'active' && (
              <button type="button" onClick={() => setGuestOpen(true)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors shadow-sm">
                Guest Access
              </button>
            )}
            <button type="button" disabled={toggling} onClick={handleToggleStatus}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors shadow-sm ${
                status === 'active'
                  ? 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                  : 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
              }`}>
              {toggling ? '...' : status === 'active' ? 'Close' : 'Reopen'}
            </button>
          </div>
        )}
      </div>

      <div className="mb-5 rounded-xl border border-zinc-200 bg-white p-3 flex flex-wrap gap-x-6 gap-y-2">
        {isOfficerOrAbove ? (
          <label className="flex items-center gap-2 text-sm font-semibold text-red-700">
            <input type="checkbox" checked={isActiveViolence} disabled={modeSaving === 'violence'}
              onChange={e => handleToggleMode('is_active_violence', e.target.checked)} />
            Active Violence / Mass Casualty Event
          </label>
        ) : isActiveViolence ? (
          <p className="text-sm font-semibold text-red-700">⚠ Active Violence / Mass Casualty Event</p>
        ) : null}
        {isOfficerOrAbove ? (
          <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <input type="checkbox" checked={nimsMode} disabled={modeSaving === 'nims'}
              onChange={e => handleToggleMode('nims_mode', e.target.checked)} />
            ICS / NIMS Mode
          </label>
        ) : nimsMode ? (
          <p className="text-sm font-semibold text-zinc-700">ICS / NIMS Mode active</p>
        ) : null}
      </div>

      {linkOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <p className="font-semibold text-zinc-900 mb-4">Link Board To</p>
            {linkError && <p className="text-sm text-red-600 mb-3">{linkError}</p>}
            <div className="flex gap-2 mb-4">
              {(['none', 'incident'] as const).map(t => (
                <button key={t} type="button" onClick={() => setLinkType(t)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    linkType === t ? 'border-red-300 bg-red-50 text-red-700' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                  }`}>
                  {t === 'none' ? 'None' : 'Incident'}
                </button>
              ))}
            </div>
            {linkType === 'incident' && (
              <select value={selectedIncident} onChange={e => setSelectedIncident(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm mb-4 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="">— Select incident —</option>
                {incidentOptions.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
              </select>
            )}
            <div className="flex gap-2">
              <button type="button" disabled={linkSaving} onClick={handleSaveLink}
                className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                {linkSaving ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={() => setLinkOpen(false)}
                className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {guestOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <p className="font-semibold text-zinc-900 mb-1">Guest Access</p>
            <p className="text-xs text-zinc-500 mb-4">
              No FireOps7 account needed — the link itself is the credential. Full board control (view everyone, create/edit lanes, move people and resources). Access ends automatically when this board closes, or immediately if you revoke below.
            </p>
            {guestError && <p className="text-sm text-red-600 mb-3">{guestError}</p>}

            {!guestLink ? (
              <>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Guest's name / agency</label>
                <input
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="e.g. Jane Doe, Cass County EM"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm mb-4 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                <div className="flex gap-2">
                  <button type="button" disabled={guestBusy || !guestName.trim()} onClick={handleGenerateGuestLink}
                    className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                    {guestBusy ? 'Generating...' : 'Generate Link'}
                  </button>
                  <button type="button" onClick={() => setGuestOpen(false)}
                    className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 break-all">
                  {guestLink}
                </div>
                <div className="flex gap-2 mb-3">
                  <button type="button" onClick={handleCopyGuestLink}
                    className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
                    {guestCopied ? 'Copied ✓' : 'Copy Link'}
                  </button>
                  <button type="button" onClick={() => setGuestOpen(false)}
                    className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
                    Done
                  </button>
                </div>
                <button type="button" disabled={guestBusy} onClick={handleRevokeGuestLinks}
                  className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">
                  Revoke All Guest Access
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
