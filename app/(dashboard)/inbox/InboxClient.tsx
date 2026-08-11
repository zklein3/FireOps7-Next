'use client'

import { useState } from 'react'
import BurnPermitsTab from './BurnPermitsTab'
import RecordRequestsTab from './RecordRequestsTab'
import RestockTab, { type RestockRequest } from './RestockTab'
import FeedbackTab from './FeedbackTab'
import IncidentSignaturePadModal from '../signatures/IncidentSignaturePadModal'
import EventAttendanceSignaturePadModal from '../signatures/EventAttendanceSignaturePadModal'

type Tab = 'permits' | 'records' | 'signatures' | 'restock' | 'feedback' | 'messages'

type MessageRow = {
  id: string
  message: string
  metadata: Record<string, unknown> | null
  reply_message: string
  replied_at: string | null
  message_read_at: string | null
}

type IncidentSignatureRow = {
  type: 'incident'
  sig_id: string
  incident_id: string
  created_at: string
  incident: {
    id: string
    incident_number: string
    incident_date: string
    incident_type: string | null
    address: string | null
    city: string | null
    state: string | null
  } | null
}

type EventSignatureRow = {
  type: 'event'
  sig_id: string
  instance_id: string
  created_at: string
  event: {
    title: string
    event_type: string
    event_date: string
    location: string | null
  } | null
}

type SignatureRow = IncidentSignatureRow | EventSignatureRow

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function InboxClient({
  permits,
  requests,
  signatureRows,
  messages,
  restockRequests,
  expiredLots,
  feedbackItems,
  memberName,
  initialTab,
  canReviewPermits,
  canManageInbox,
  canManageMedical,
  moduleMedical,
  publicSiteEnabled,
  deptName,
  burnPermitCountyInfo,
  burnPermitRestrictions,
  departmentTimezone,
}: {
  permits: any[]
  requests: any[]
  signatureRows: SignatureRow[]
  messages: MessageRow[]
  restockRequests: RestockRequest[]
  expiredLots: { supply_name: string; storeroom_name: string; quantity_remaining: number; expiration_date: string; lot_number: string | null; go_to_href: string }[]
  feedbackItems: any[]
  memberName: string
  initialTab: Tab
  canReviewPermits: boolean
  canManageInbox: boolean
  canManageMedical: boolean
  moduleMedical: boolean
  publicSiteEnabled: boolean
  deptName: string | null
  burnPermitCountyInfo: string | null
  burnPermitRestrictions: string | null
  departmentTimezone: string
}) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [pendingSigs, setPendingSigs] = useState<SignatureRow[]>(signatureRows)
  const [activeSig, setActiveSig] = useState<SignatureRow | null>(null)
  const hasAnyOfficerInboxAccess = canReviewPermits || canManageInbox || canManageMedical
  const unreadMessageCount = messages.filter(m => !m.message_read_at).length

  const EVENT_TYPE_LABELS: Record<string, string> = {
    training: 'Training', meeting: 'Meeting', incident: 'Incident', special: 'Special Event',
  }

  const pendingPermits  = permits.filter(p => p.status === 'pending').length
  const pendingRequests = requests.filter(r => r.status === 'pending').length
  const newFeedback     = feedbackItems.filter(f => f.status === 'new').length

  function handleSigned(sig_id: string) {
    setPendingSigs(prev => prev.filter(r => r.sig_id !== sig_id))
    setActiveSig(null)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Inbox</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          {hasAnyOfficerInboxAccess ? 'Signatures, burn permits, and public records requests' : 'Incident signatures pending your review'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-zinc-200 p-1 mb-6 w-fit flex-wrap">
        {/* Signatures tab — all members */}
        <button
          onClick={() => setTab('signatures')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'signatures' ? 'bg-red-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'
          }`}
        >
          Signatures
          {pendingSigs.length > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold leading-none ${
              tab === 'signatures' ? 'bg-red-500 text-white' : 'bg-orange-100 text-orange-700'
            }`}>
              {pendingSigs.length}
            </span>
          )}
        </button>

        {/* Messages — all members, replies to your own Report/Feedback submissions */}
        {messages.length > 0 && (
          <button
            onClick={() => setTab('messages')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'messages' ? 'bg-red-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            Messages
            {unreadMessageCount > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold leading-none ${
                tab === 'messages' ? 'bg-red-500 text-white' : 'bg-orange-100 text-orange-700'
              }`}>
                {unreadMessageCount}
              </span>
            )}
          </button>
        )}

        {/* Burn Permits — review_burn_permits */}
        {publicSiteEnabled && canReviewPermits && (
          <button
            onClick={() => setTab('permits')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'permits' ? 'bg-red-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            Burn Permits
            {pendingPermits > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold leading-none ${
                tab === 'permits' ? 'bg-red-500 text-white' : 'bg-red-100 text-red-700'
              }`}>
                {pendingPermits}
              </span>
            )}
          </button>
        )}

        {/* Records Requests + Feedback — manage_public_inbox */}
        {publicSiteEnabled && canManageInbox && (
          <button
            onClick={() => setTab('records')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'records' ? 'bg-red-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            Records Requests
            {pendingRequests > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold leading-none ${
                tab === 'records' ? 'bg-red-500 text-white' : 'bg-red-100 text-red-700'
              }`}>
                {pendingRequests}
              </span>
            )}
          </button>
        )}
        {canManageInbox && (
          <button
            onClick={() => setTab('feedback')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'feedback' ? 'bg-red-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            Feedback
            {newFeedback > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold leading-none ${
                tab === 'feedback' ? 'bg-red-500 text-white' : 'bg-red-100 text-red-700'
              }`}>
                {newFeedback}
              </span>
            )}
          </button>
        )}

        {/* Restock — manage_medical_inventory */}
        {moduleMedical && canManageMedical && (() => {
          const restockBadge = restockRequests.length + expiredLots.length
          return (
            <button
              onClick={() => setTab('restock')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === 'restock' ? 'bg-red-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              Restock
              {restockBadge > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold leading-none ${
                  tab === 'restock' ? 'bg-red-500 text-white' : expiredLots.length > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {restockBadge}
                </span>
              )}
            </button>
          )
        })()}
      </div>

      {/* Signatures tab content */}
      {tab === 'signatures' && (
        <div>
          {pendingSigs.length === 0 ? (
            <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center">
              <p className="text-2xl mb-2">✓</p>
              <p className="text-sm font-semibold text-zinc-700">All caught up</p>
              <p className="text-xs text-zinc-400 mt-1">No runs pending your signature.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pendingSigs.map(row => {
                if (row.type === 'incident') {
                  const inc = row.incident
                  const location = [inc?.address, inc?.city, inc?.state].filter(Boolean).join(', ')
                  return (
                    <div key={row.sig_id} className="rounded-xl bg-white border border-zinc-200 p-5 flex items-center gap-4">
                      {inc?.incident_date && (
                        <div className="shrink-0 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-center min-w-[52px]">
                          <p className="text-xs font-semibold text-red-500 uppercase">
                            {new Date(inc.incident_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                          </p>
                          <p className="text-2xl font-bold text-red-800 leading-none">
                            {new Date(inc.incident_date + 'T00:00:00').getDate()}
                          </p>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-0.5">Run Report</p>
                        <p className="font-semibold text-zinc-900 text-sm">
                          {inc?.incident_number ?? '—'}
                          {inc?.incident_type && (
                            <span className="ml-2 text-xs font-normal text-zinc-400">{inc.incident_type}</span>
                          )}
                        </p>
                        {inc?.incident_date && (
                          <p className="text-xs text-zinc-500 mt-0.5">{formatDate(inc.incident_date)}</p>
                        )}
                        {location && (
                          <p className="text-xs text-zinc-400 mt-0.5 truncate">{location}</p>
                        )}
                      </div>
                      <button
                        onClick={() => setActiveSig(row)}
                        className="shrink-0 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-colors"
                      >
                        Sign
                      </button>
                    </div>
                  )
                } else {
                  const ev = row.event
                  return (
                    <div key={row.sig_id} className="rounded-xl bg-white border border-zinc-200 p-5 flex items-center gap-4">
                      {ev?.event_date && (
                        <div className="shrink-0 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-center min-w-[52px]">
                          <p className="text-xs font-semibold text-blue-500 uppercase">
                            {new Date(ev.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                          </p>
                          <p className="text-2xl font-bold text-blue-800 leading-none">
                            {new Date(ev.event_date + 'T00:00:00').getDate()}
                          </p>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-0.5">
                          {ev ? (EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type) : 'Event'}
                        </p>
                        <p className="font-semibold text-zinc-900 text-sm">{ev?.title ?? '—'}</p>
                        {ev?.event_date && (
                          <p className="text-xs text-zinc-500 mt-0.5">{formatDate(ev.event_date)}</p>
                        )}
                        {ev?.location && (
                          <p className="text-xs text-zinc-400 mt-0.5 truncate">{ev.location}</p>
                        )}
                      </div>
                      <button
                        onClick={() => setActiveSig(row)}
                        className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
                      >
                        Sign
                      </button>
                    </div>
                  )
                }
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'messages' && (
        <div className="flex flex-col gap-3">
          {messages.map(m => {
            const reportType = typeof m.metadata?.report_type === 'string' ? m.metadata.report_type : null
            return (
              <div key={m.id} className="rounded-xl bg-white border border-zinc-200 p-5">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                  Reply to your report{reportType ? ` (${reportType})` : ''}
                </p>
                <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-line mb-3">{m.reply_message}</p>
                <div className="rounded-lg bg-zinc-50 border border-zinc-100 px-3 py-2">
                  <p className="text-xs font-medium text-zinc-500 mb-0.5">You reported:</p>
                  <p className="text-xs text-zinc-500 leading-relaxed whitespace-pre-line">{m.message}</p>
                </div>
                {m.replied_at && (
                  <p className="text-xs text-zinc-400 mt-2">{formatDate(m.replied_at.slice(0, 10))}</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'permits' && canReviewPermits && (
        <BurnPermitsTab
          permits={permits}
          deptName={deptName}
          burnPermitCountyInfo={burnPermitCountyInfo}
          burnPermitRestrictions={burnPermitRestrictions}
          departmentTimezone={departmentTimezone}
        />
      )}

      {tab === 'records' && canManageInbox && (
        <RecordRequestsTab requests={requests} departmentTimezone={departmentTimezone} />
      )}

      {tab === 'restock' && canManageMedical && moduleMedical && (
        <RestockTab requests={restockRequests} expiredLots={expiredLots} />
      )}

      {tab === 'feedback' && canManageInbox && (
        <FeedbackTab items={feedbackItems} departmentTimezone={departmentTimezone} />
      )}

      {activeSig && activeSig.type === 'incident' && (
        <IncidentSignaturePadModal
          sig_id={activeSig.sig_id}
          memberName={memberName}
          incidentLabel={
            activeSig.incident
              ? `${activeSig.incident.incident_number}${activeSig.incident.incident_date ? ' — ' + formatDate(activeSig.incident.incident_date) : ''}`
              : 'Incident'
          }
          onClose={() => setActiveSig(null)}
          onSigned={() => handleSigned(activeSig.sig_id)}
        />
      )}
      {activeSig && activeSig.type === 'event' && (
        <EventAttendanceSignaturePadModal
          sig_id={activeSig.sig_id}
          memberName={memberName}
          eventLabel={
            activeSig.event
              ? `${activeSig.event.title}${activeSig.event.event_date ? ' — ' + formatDate(activeSig.event.event_date) : ''}`
              : 'Event'
          }
          onClose={() => setActiveSig(null)}
          onSigned={() => handleSigned(activeSig.sig_id)}
        />
      )}
    </div>
  )
}
