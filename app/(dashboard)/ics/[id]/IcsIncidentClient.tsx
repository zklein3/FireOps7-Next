'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PageNavBar from '@/components/PageNavBar'
import {
  openOperationalPeriod, updateOperationalPeriod, addParticipant, closeParticipantPortion,
  reopenIcsIncident, transferCommand, addAssignment, removeAssignment, addResource, removeResource,
} from '@/app/actions/ics'
import { reopenBoard } from '@/app/actions/accountability'

type Participant = { id: string; department_id: string; status: string; department_name: string; added_at: string; closed_at: string | null }
type Period = { id: string; period_number: number; start_at: string; end_at: string | null; objectives: string | null; safety_message: string | null; weather: string | null; narrative: string | null }
type Assignment = { id: string; display_name: string; raw_agency: string | null; ics_role: string | null; lane_label: string | null }
type Resource = { id: string; display_desc: string | null; raw_agency: string | null; lane_label: string | null; status: string }
type CheckIn = { display_name: string; raw_dept: string | null; ics_role: string | null; checked_in_at: string; released_at: string | null }
type ActivityLogEntry = { entry_time: string; note: string; author_name: string }

export default function IcsIncidentClient({
  incident, currentDepartmentId, isOwner, isJurisdictionParent, isOfficerOrAbove,
  participants, periods, latestPeriod, assignments, resources, checkIns, activityLog,
  hasLinkedBoard, linkedBoardStatus, allDepartments,
}: {
  incident: { id: string; title: string; status: string; departmentId: string; departmentName: string; linkedAccountabilityBoardId: string | null }
  currentDepartmentId: string
  isOwner: boolean
  isJurisdictionParent: boolean
  isOfficerOrAbove: boolean
  participants: Participant[]
  periods: Period[]
  latestPeriod: Period | null
  assignments: Assignment[]
  resources: Resource[]
  checkIns: CheckIn[]
  activityLog: ActivityLogEntry[]
  hasLinkedBoard: boolean
  linkedBoardStatus: string | null
  allDepartments: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [objectives, setObjectives] = useState(latestPeriod?.objectives ?? '')
  const [safetyMessage, setSafetyMessage] = useState(latestPeriod?.safety_message ?? '')
  const [weather, setWeather] = useState(latestPeriod?.weather ?? '')
  const [addDeptId, setAddDeptId] = useState('')
  const [newAssignment, setNewAssignment] = useState({ raw_name: '', raw_agency: '', ics_role: '', lane_label: '' })
  const [newResource, setNewResource] = useState({ kind: '', raw_agency: '', lane_label: '' })

  const myParticipant = participants.find(p => p.department_id === currentDepartmentId)

  async function run(fn: () => Promise<{ error?: string } | undefined>) {
    setBusy(true); setError(null)
    const result = await fn()
    setBusy(false)
    if (result?.error) setError(result.error)
    else router.refresh()
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageNavBar />
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-xl font-semibold text-zinc-900">{incident.title}</h1>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            incident.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
          }`}>
            {incident.status === 'open' ? 'Open' : 'Closed'}
          </span>
        </div>
        <p className="text-sm text-zinc-500 mt-1">Owning department: {incident.departmentName}</p>
        {incident.linkedAccountabilityBoardId && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <Link href={`/accountability/${incident.linkedAccountabilityBoardId}`} className="text-red-700 hover:underline text-sm font-medium">View Accountability Board →</Link>
            {linkedBoardStatus === 'closed' && isOfficerOrAbove && (
              <button
                onClick={() => run(() => reopenBoard(incident.linkedAccountabilityBoardId!))}
                disabled={busy}
                className="rounded bg-green-50 border border-green-200 px-2 py-0.5 text-xs font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50 transition-colors"
              >
                Reopen board
              </button>
            )}
          </div>
        )}
        {incident.status === 'closed' && isJurisdictionParent && (
          <button onClick={() => run(() => reopenIcsIncident(incident.id))} disabled={busy}
            className="mt-2 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-900 transition-colors">
            Reopen (jurisdiction override)
          </button>
        )}
      </div>

      {/* Participants */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900 mb-3">Participating departments</h2>
        <div className="space-y-2">
          {participants.map(p => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <span className="text-zinc-700">
                {p.department_name}
                {p.department_id === incident.departmentId ? ' · owner' : ''}
              </span>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${p.status === 'active' ? 'text-green-600' : 'text-zinc-400'}`}>
                  {p.status === 'active' ? 'Active' : 'Closed their portion'}
                </span>
                {p.department_id === currentDepartmentId && p.status === 'active' && isOfficerOrAbove && (
                  <button onClick={() => run(() => closeParticipantPortion(incident.id, currentDepartmentId))} disabled={busy}
                    className="rounded bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 transition-colors">
                    Close my portion
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {isOfficerOrAbove && (isOwner || isJurisdictionParent) && (
          <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center gap-2">
            <select value={addDeptId} onChange={e => setAddDeptId(e.target.value)}
              className="flex-1 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm">
              <option value="">Add a responding department…</option>
              {allDepartments.filter(d => !participants.some(p => p.department_id === d.id)).map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <button
              onClick={() => addDeptId && run(() => addParticipant(incident.id, addDeptId))}
              disabled={busy || !addDeptId}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
            >
              Add
            </button>
          </div>
        )}
        {isOwner && myParticipant && (
          <p className="mt-2 text-xs text-zinc-400">Owning department can transfer command to another participant via Transfer of Command (not yet in this UI — see STRATEGY.md).</p>
        )}
      </section>

      {/* Operational periods */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-900">Operational periods</h2>
          {isOfficerOrAbove && myParticipant?.status === 'active' && (
            <button onClick={() => run(() => openOperationalPeriod(incident.id))} disabled={busy}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
              {busy ? 'Opening…' : `Open Period ${(periods[0]?.period_number ?? 0) + 1}`}
            </button>
          )}
        </div>
        <div className="space-y-1">
          {periods.length === 0 && <p className="text-sm text-zinc-400">No operational periods opened yet.</p>}
          {periods.map(p => (
            <div key={p.id} className={`text-sm px-2 py-1 rounded ${latestPeriod?.id === p.id ? 'bg-red-50 text-red-800 font-medium' : 'text-zinc-500'}`}>
              Period {p.period_number} — started {new Date(p.start_at).toLocaleString()}{p.end_at ? ` · closed ${new Date(p.end_at).toLocaleString()}` : ''}
            </div>
          ))}
        </div>
      </section>

      {latestPeriod && (
        <>
          {/* ICS 202 — Objectives */}
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900 mb-3">ICS 202 — Objectives (Period {latestPeriod.period_number})</h2>
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Objectives</label>
                <textarea value={objectives} onChange={e => setObjectives(e.target.value)} rows={2}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Safety message</label>
                <textarea value={safetyMessage} onChange={e => setSafetyMessage(e.target.value)} rows={2}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Weather</label>
                <input value={weather} onChange={e => setWeather(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
              </div>
              <button
                onClick={() => run(() => updateOperationalPeriod(latestPeriod.id, incident.id, { objectives, safety_message: safetyMessage, weather }))}
                disabled={busy}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-900 disabled:opacity-50 transition-colors"
              >
                Save
              </button>
            </div>
          </section>

          {/* ICS 203 — Assignments */}
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900 mb-3">ICS 203 — Organization Assignment List</h2>
            <div className="space-y-1 mb-3">
              {assignments.length === 0 && <p className="text-sm text-zinc-400">No assignments yet.</p>}
              {assignments.map(a => (
                <div key={a.id} className="flex items-center justify-between text-sm border-b border-zinc-50 py-1">
                  <span className="text-zinc-700">{a.display_name}{a.raw_agency ? ` (${a.raw_agency})` : ''} — {a.ics_role ?? '—'} {a.lane_label ? `· ${a.lane_label}` : ''}</span>
                  <button onClick={() => run(() => removeAssignment(a.id, incident.id))} className="text-xs text-red-600 hover:underline">Remove</button>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Name" value={newAssignment.raw_name} onChange={e => setNewAssignment(s => ({ ...s, raw_name: e.target.value }))} className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" />
              <input placeholder="Agency" value={newAssignment.raw_agency} onChange={e => setNewAssignment(s => ({ ...s, raw_agency: e.target.value }))} className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" />
              <input placeholder="ICS role" value={newAssignment.ics_role} onChange={e => setNewAssignment(s => ({ ...s, ics_role: e.target.value }))} className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" />
              <input placeholder="Division/Lane" value={newAssignment.lane_label} onChange={e => setNewAssignment(s => ({ ...s, lane_label: e.target.value }))} className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" />
            </div>
            <button
              onClick={() => run(async () => { const r = await addAssignment(latestPeriod.id, incident.id, newAssignment); if (!r?.error) setNewAssignment({ raw_name: '', raw_agency: '', ics_role: '', lane_label: '' }); return r })}
              disabled={busy || !newAssignment.raw_name}
              className="mt-2 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
            >
              Add assignment
            </button>
          </section>

          {/* ICS 204 — Resources */}
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900 mb-3">ICS 204 — Resources</h2>
            <div className="space-y-1 mb-3">
              {resources.length === 0 && <p className="text-sm text-zinc-400">No resources yet.</p>}
              {resources.map(r => (
                <div key={r.id} className="flex items-center justify-between text-sm border-b border-zinc-50 py-1">
                  <span className="text-zinc-700">{r.display_desc}{r.raw_agency ? ` (${r.raw_agency})` : ''} {r.lane_label ? `· ${r.lane_label}` : ''} — {r.status}</span>
                  <button onClick={() => run(() => removeResource(r.id, incident.id))} className="text-xs text-red-600 hover:underline">Remove</button>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input placeholder="Kind (Engine, Medic…)" value={newResource.kind} onChange={e => setNewResource(s => ({ ...s, kind: e.target.value }))} className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" />
              <input placeholder="Agency" value={newResource.raw_agency} onChange={e => setNewResource(s => ({ ...s, raw_agency: e.target.value }))} className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" />
              <input placeholder="Division/Lane" value={newResource.lane_label} onChange={e => setNewResource(s => ({ ...s, lane_label: e.target.value }))} className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" />
            </div>
            <button
              onClick={() => run(async () => { const r = await addResource(latestPeriod.id, incident.id, { ...newResource, raw_description: newResource.kind }); if (!r?.error) setNewResource({ kind: '', raw_agency: '', lane_label: '' }); return r })}
              disabled={busy || !newResource.kind}
              className="mt-2 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
            >
              Add resource
            </button>
          </section>
        </>
      )}

      {hasLinkedBoard && (
        <>
          {/* ICS 211 — live check-in list */}
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900 mb-3">ICS 211 — Check-In List (live from accountability board)</h2>
            <div className="space-y-1">
              {checkIns.length === 0 && <p className="text-sm text-zinc-400">Nobody checked in yet.</p>}
              {checkIns.map((c, i) => (
                <div key={i} className="text-sm text-zinc-700 flex justify-between border-b border-zinc-50 py-1">
                  <span>{c.display_name}{c.raw_dept ? ` (${c.raw_dept})` : ''} — {c.ics_role ?? '—'}</span>
                  <span className={c.released_at ? 'text-zinc-400' : 'text-green-600'}>{c.released_at ? 'Released' : 'On scene'}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ICS 214 — live activity log */}
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900 mb-3">ICS 214 — Activity Log (live from accountability board)</h2>
            <div className="space-y-1">
              {activityLog.length === 0 && <p className="text-sm text-zinc-400">No activity logged yet.</p>}
              {activityLog.map((a, i) => (
                <div key={i} className="text-sm text-zinc-700 border-b border-zinc-50 py-1">
                  <span className="text-zinc-400">{new Date(a.entry_time).toLocaleString()}</span> — {a.note} <span className="text-zinc-400">({a.author_name})</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
