import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { getPermissionSnapshot } from '@/lib/permissions'
import InboxClient from './InboxClient'

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)

  // Sys admin has no dept record — allow through with signatures-only view
  if (!ctx.departmentId && !ctx.isSysAdmin) redirect('/dashboard')

  const me = { id: ctx.personnelId, first_name: ctx.firstName, last_name: ctx.lastName }
  const department_id = ctx.departmentId
  const inboxPermissions = await getPermissionSnapshot(ctx)
  const canReviewPermits = inboxPermissions.review_burn_permits ?? false
  const canManageInbox = inboxPermissions.manage_public_inbox ?? false
  const canManageMedical = inboxPermissions.manage_medical_inventory ?? false
  const hasAnyOfficerInboxAccess = canReviewPermits || canManageInbox || canManageMedical

  // Pending signatures — all members (incident + event)
  const [{ data: pendingIncidentSigs }, { data: pendingEventSigs }] = await Promise.all([
    adminClient.from('incident_signatures').select('id, incident_id, created_at')
      .eq('personnel_id', me.id).is('signed_at', null).order('created_at', { ascending: false }),
    adminClient.from('event_attendance_signatures').select('id, instance_id, created_at')
      .eq('personnel_id', me.id).is('signed_at', null).order('created_at', { ascending: false }),
  ])

  // Sys-admin replies to a user_report they submitted via the Report/Feedback
  // button — one-way, no threading. Shown to every member unconditionally,
  // like Signatures.
  const { data: messageRows } = await adminClient
    .from('system_logs')
    .select('id, message, metadata, reply_message, replied_at, message_read_at')
    .eq('personnel_id', me.id)
    .not('reply_message', 'is', null)
    .order('replied_at', { ascending: false })
  const messages = messageRows ?? []
  const unreadMessageCount = messages.filter(m => !m.message_read_at).length

  // Mark unread messages read as soon as the tab is actually viewed, not on
  // every Inbox page load regardless of tab.
  if (tab === 'messages' && unreadMessageCount > 0) {
    await adminClient
      .from('system_logs')
      .update({ message_read_at: new Date().toISOString() })
      .eq('personnel_id', me.id)
      .is('message_read_at', null)
  }

  let signatureRows: any[] = []

  if ((pendingIncidentSigs ?? []).length > 0) {
    const incidentIds = (pendingIncidentSigs ?? []).map(s => s.incident_id)
    const { data: sigIncidents } = await adminClient
      .from('incidents')
      .select('id, incident_number, incident_date, incident_type, address, city, state')
      .in('id', incidentIds)
    const incidentMap = Object.fromEntries((sigIncidents ?? []).map(i => [i.id, i]))
    signatureRows.push(...(pendingIncidentSigs ?? []).map(s => ({
      type: 'incident' as const,
      sig_id: s.id,
      incident_id: s.incident_id,
      created_at: s.created_at,
      incident: incidentMap[s.incident_id] ?? null,
    })))
  }

  if ((pendingEventSigs ?? []).length > 0) {
    const instanceIds = (pendingEventSigs ?? []).map(s => s.instance_id)
    const { data: eventInstances } = await adminClient
      .from('event_instances')
      .select('id, event_date, location, series_id, title_override')
      .in('id', instanceIds)
    const seriesIds = [...new Set((eventInstances ?? []).map(i => i.series_id))]
    const { data: seriesData } = seriesIds.length > 0
      ? await adminClient.from('event_series').select('id, title, event_type').in('id', seriesIds)
      : { data: [] }
    const seriesMap = Object.fromEntries((seriesData ?? []).map(s => [s.id, s]))
    const instanceMap = Object.fromEntries((eventInstances ?? []).map(i => [i.id, i]))
    signatureRows.push(...(pendingEventSigs ?? []).map(s => {
      const inst = instanceMap[s.instance_id]
      const series = inst ? seriesMap[inst.series_id] : null
      return {
        type: 'event' as const,
        sig_id: s.id,
        instance_id: s.instance_id,
        created_at: s.created_at,
        event: inst && series ? {
          title: inst.title_override ?? series.title,
          event_type: series.event_type,
          event_date: inst.event_date,
          location: inst.location,
        } : null,
      }
    }))
  }

  // Sort combined list by created_at desc
  signatureRows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // Officer+ data
  let permits: any[] = []
  let requestsRaw: any[] = []
  let deptConfig: any = null
  let restockRequests: any[] = []
  let expiredLots: { supply_name: string; storeroom_name: string; quantity_remaining: number; expiration_date: string; lot_number: string | null; go_to_href: string }[] = []
  let feedbackItems: any[] = []

  if (hasAnyOfficerInboxAccess && department_id) {
    const [deptRes, permitsRes, recordsRes, feedbackRes] = await Promise.all([
      adminClient.from('departments').select('name, burn_permit_county_info, burn_permit_restrictions, module_medical, public_site_enabled').eq('id', department_id).single(),
      canReviewPermits
        ? adminClient.from('burn_permits')
            .select('id, confirmation_code, contact_name, contact_email, contact_phone, burn_address, burn_date, burn_description, status, reviewer_notes, permit_expiry_date, issued_date, approved_by_personnel_id, officer_signed_at, applicant_signed_at, applicant_acknowledged_at, created_at')
            .eq('department_id', department_id).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      canManageInbox
        ? adminClient.from('public_record_requests')
            .select('id, confirmation_code, contact_name, contact_email, contact_phone, request_type, description, incident_date, incident_address, status, reviewer_notes, created_at')
            .eq('department_id', department_id).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      canManageInbox
        ? adminClient.from('public_feedback')
            .select('id, feedback_type, contact_name, contact_email, message, page_url, status, reviewer_notes, reply_message, replied_at, replied_by_personnel_id, created_at')
            .eq('department_id', department_id).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ])
    deptConfig = deptRes.data
    feedbackItems = feedbackRes.data ?? []

    const replierIds = [...new Set(feedbackItems.map((f: any) => f.replied_by_personnel_id).filter(Boolean))]
    if (replierIds.length > 0) {
      const { data: replierData } = await adminClient
        .from('personnel').select('id, first_name, last_name').in('id', replierIds)
      const replierMap = Object.fromEntries(
        (replierData ?? []).map((p: any) => [p.id, `${p.first_name} ${p.last_name}`.trim()])
      )
      feedbackItems = feedbackItems.map((f: any) => ({
        ...f,
        replied_by_name: f.replied_by_personnel_id ? (replierMap[f.replied_by_personnel_id] ?? null) : null,
      }))
    }

    // Reorder requests + expired lots (medical module)
    if (deptConfig?.module_medical && canManageMedical) {
      const today = new Date().toISOString().split('T')[0]

      const [{ data: reorderRaw }, { data: expiredLotsRaw }] = await Promise.all([
        adminClient
          .from('medical_reorder_requests')
          .select('id, storeroom_inventory_id, requested_by, notes, created_at')
          .eq('department_id', department_id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        adminClient
          .from('medical_stock_lots')
          .select('id, lot_number, expiration_date, quantity_remaining, storeroom_inventory_id')
          .eq('department_id', department_id)
          .eq('active', true)
          .gt('quantity_remaining', 0)
          .lt('expiration_date', today)
          .order('expiration_date'),
      ])

      if (reorderRaw && reorderRaw.length > 0) {
        const invIds = reorderRaw.map((r: any) => r.storeroom_inventory_id)
        const [{ data: invRows }, { data: requesterRows }] = await Promise.all([
          adminClient.from('medical_storeroom_inventory').select('id, storeroom_id, supply_type_id').in('id', invIds),
          adminClient.from('personnel').select('id, first_name, last_name')
            .in('id', reorderRaw.map((r: any) => r.requested_by).filter(Boolean)),
        ])
        const srIds = [...new Set((invRows ?? []).map((i: any) => i.storeroom_id))]
        const supplyIds = [...new Set((invRows ?? []).map((i: any) => i.supply_type_id))]
        const [{ data: srRows }, { data: supplyRows }] = await Promise.all([
          adminClient.from('medical_storerooms').select('id, name').in('id', srIds),
          adminClient.from('medical_supply_types').select('id, name').in('id', supplyIds),
        ])
        const invMap = Object.fromEntries((invRows ?? []).map((i: any) => [i.id, i]))
        const srMap = Object.fromEntries((srRows ?? []).map((s: any) => [s.id, s.name]))
        const supMap = Object.fromEntries((supplyRows ?? []).map((s: any) => [s.id, s.name]))
        const reqMap = Object.fromEntries((requesterRows ?? []).map((p: any) => [p.id, `${p.first_name} ${p.last_name}`.trim()]))
        restockRequests = reorderRaw.map((r: any) => {
          const inv = invMap[r.storeroom_inventory_id]
          return {
            id: r.id,
            supply_name: inv ? (supMap[inv.supply_type_id] ?? '—') : '—',
            storeroom_name: inv ? (srMap[inv.storeroom_id] ?? '—') : '—',
            requested_by_name: r.requested_by ? (reqMap[r.requested_by] ?? null) : null,
            notes: r.notes,
            created_at: r.created_at,
          }
        })
      }

      if (expiredLotsRaw && expiredLotsRaw.length > 0) {
        const invIds = [...new Set(expiredLotsRaw.map((l: any) => l.storeroom_inventory_id))]
        const { data: invRows } = await adminClient
          .from('medical_storeroom_inventory').select('id, storeroom_id, supply_type_id').in('id', invIds)
        const srIds = [...new Set((invRows ?? []).map((i: any) => i.storeroom_id))]
        const supIds = [...new Set((invRows ?? []).map((i: any) => i.supply_type_id))]
        const [{ data: srRows }, { data: supRows }] = await Promise.all([
          adminClient.from('medical_storerooms').select('id, name, apparatus_id').in('id', srIds),
          adminClient.from('medical_supply_types').select('id, name').in('id', supIds),
        ])
        const invMap = Object.fromEntries((invRows ?? []).map((i: any) => [i.id, i]))
        const srFullMap = Object.fromEntries((srRows ?? []).map((s: any) => [s.id, s]))
        const supMap = Object.fromEntries((supRows ?? []).map((s: any) => [s.id, s.name]))
        expiredLots = expiredLotsRaw.map((l: any) => {
          const inv = invMap[l.storeroom_inventory_id]
          const sr = inv ? srFullMap[inv.storeroom_id] : null
          const go_to_href = sr?.apparatus_id ? `/equipment/${sr.apparatus_id}` : '/medical'
          return {
            supply_name: inv ? (supMap[inv.supply_type_id] ?? '—') : '—',
            storeroom_name: inv ? (sr?.name ?? '—') : '—',
            quantity_remaining: l.quantity_remaining,
            expiration_date: l.expiration_date,
            lot_number: l.lot_number,
            go_to_href,
          }
        })
      }
    }
    const permitsRaw = permitsRes.data ?? []
    requestsRaw = recordsRes.data ?? []

    const approverIds = [...new Set(permitsRaw.map((p: any) => p.approved_by_personnel_id).filter(Boolean))]
    const { data: approverData } = approverIds.length > 0
      ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', approverIds)
      : { data: [] }
    const approverMap = Object.fromEntries(
      (approverData ?? []).map((p: any) => [p.id, `${p.first_name} ${p.last_name}`])
    )
    permits = permitsRaw.map((p: any) => ({
      ...p,
      approved_by_name: p.approved_by_personnel_id ? (approverMap[p.approved_by_personnel_id] ?? null) : null,
    }))
  }

  const moduleMedical = deptConfig?.module_medical ?? false
  const publicSiteEnabled = deptConfig?.public_site_enabled ?? false
  const validTabs = [
    'signatures', 'messages',
    ...(canManageInbox ? ['feedback'] : []),
    ...(publicSiteEnabled && canReviewPermits ? ['permits'] : []),
    ...(publicSiteEnabled && canManageInbox ? ['records'] : []),
    ...(moduleMedical && canManageMedical ? ['restock'] : []),
  ]
  const initialTab = validTabs.includes(tab ?? '')
    ? tab!
    : (publicSiteEnabled && canReviewPermits ? 'permits' : 'signatures')

  return (
    <InboxClient
      permits={permits}
      requests={requestsRaw}
      signatureRows={signatureRows}
      messages={messages}
      restockRequests={restockRequests}
      expiredLots={expiredLots}
      feedbackItems={feedbackItems}
      memberName={`${me.first_name} ${me.last_name}`.trim()}
      initialTab={initialTab as any}
      canReviewPermits={canReviewPermits}
      canManageInbox={canManageInbox}
      canManageMedical={canManageMedical}
      moduleMedical={moduleMedical}
      publicSiteEnabled={publicSiteEnabled}
      deptName={deptConfig?.name ?? null}
      burnPermitCountyInfo={deptConfig?.burn_permit_county_info ?? null}
      burnPermitRestrictions={deptConfig?.burn_permit_restrictions ?? null}
      departmentTimezone={ctx.departmentTimezone}
    />
  )
}
