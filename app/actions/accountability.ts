'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'
import { ALL_ICS_ROLE_VALUES, icsRoleLabel, ICS_MODE_LANES, ACTIVE_VIOLENCE_LANES } from '@/lib/ics-roles'
import { createBoardGuestToken, verifyBoardGuestTokenSignature } from '@/lib/board-guest-token'
import { hashRaw, isFireOps7Card, parseFireOps7Card, parseSalamanderCard, salamanderCanonicalKey } from '@/lib/salamander'

async function getContext() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx || !ctx.departmentId) return null
  const adminClient = createAdminClient()
  return {
    me: { id: ctx.personnelId },
    dept: { department_id: ctx.departmentId, system_role: ctx.systemRole },
    adminClient,
  }
}

// ─── Guest access (no FireOps7 account — see lib/board-guest-token.ts) ────────
//
// Resolves who's calling an action: a normal logged-in dept member ('officer'), a
// Tier 2 guest-admin link scoped to the whole board, or a Tier 1 guest-self link
// scoped to one accountability_entries row. Guest tokens are only ever honored
// while the board is 'active' and hasn't had its guest links revoked — this is
// checked live on every call, not just once, so closing the board or hitting
// "Revoke Guest Access" cuts a guest off immediately.
type Actor =
  | { kind: 'officer'; departmentId: string; personnelId: string; systemRole: string | null }
  | { kind: 'guest_admin'; boardId: string; label: string }
  | { kind: 'guest_self'; boardId: string; entryId: string; label: string }

async function resolveActor(
  adminClient: ReturnType<typeof createAdminClient>,
  boardId: string,
  guestToken?: string | null,
): Promise<Actor | null> {
  if (guestToken) {
    const payload = verifyBoardGuestTokenSignature(guestToken)
    if (!payload || payload.boardId !== boardId) return null

    const { data: boardRows } = await adminClient
      .from('accountability_boards').select('status, guest_links_revoked_at').eq('id', boardId)
    const board = boardRows?.[0]
    if (!board || board.status !== 'active') return null
    if (board.guest_links_revoked_at && payload.issuedAt <= new Date(board.guest_links_revoked_at).getTime()) return null

    if (payload.kind === 'admin') return { kind: 'guest_admin', boardId, label: payload.label }
    return { kind: 'guest_self', boardId, entryId: payload.entryId, label: payload.label }
  }

  const ctx = await getContext()
  if (!ctx) return null
  const { data: boardRows } = await adminClient.from('accountability_boards').select('department_id').eq('id', boardId)
  if (boardRows?.[0]?.department_id !== ctx.dept.department_id) return null
  return { kind: 'officer', departmentId: ctx.dept.department_id, personnelId: ctx.me.id, systemRole: ctx.dept.system_role }
}

// Guest edits get an explicit trail in the same 214 log an officer's manual notes go into — a
// guest has no account, so this is the only record of who actually made a given change.
async function logGuestAction(adminClient: ReturnType<typeof createAdminClient>, boardId: string, label: string, note: string) {
  await adminClient.from('accountability_activity_log').insert({ board_id: boardId, note: `[Guest — ${label}] ${note}` })
}

export async function generateSelfMoveGuestLink(entryId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }

  const { data: entryRows } = await ctx.adminClient
    .from('accountability_entries').select('board_id, raw_name, raw_dept, personnel_id').eq('id', entryId)
  const entry = entryRows?.[0]
  if (!entry) return { error: 'Entry not found.' }

  const { data: boardRows } = await ctx.adminClient.from('accountability_boards').select('department_id').eq('id', entry.board_id)
  if (boardRows?.[0]?.department_id !== ctx.dept.department_id) return { error: 'Not authorized.' }

  let label = entry.raw_name ?? 'Guest'
  if (entry.personnel_id) {
    const { data: p } = await ctx.adminClient.from('personnel').select('first_name, last_name').eq('id', entry.personnel_id).single()
    if (p) label = `${p.first_name} ${p.last_name}`
  }
  if (entry.raw_dept) label = `${label} (${entry.raw_dept})`

  const token = createBoardGuestToken({ kind: 'self', boardId: entry.board_id, entryId, label })
  return { success: true, token }
}

// Sets (or clears) the card-based access tier on an already-checked-in entry — the tier
// picker in the Name Tag flow only offers this at the moment a card is first named, so this
// is the "come back later and grant it" path: re-open an existing entry and set it here
// instead. Meaningful on a personnel-linked entry (resolveCardForBoardAccess matches those by
// personnel_id, no tag_ref needed) or one with a tag_ref (an attached blank/quick tag) — there's
// nothing for /board-guest/scan to recognize on a hand-typed, card-less, personnel-less entry.
export async function setEntryAccessTier(entryId: string, tier: 'self' | 'admin' | null) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }

  const { data: entryRows } = await ctx.adminClient
    .from('accountability_entries').select('board_id, tag_ref, personnel_id').eq('id', entryId)
  const entry = entryRows?.[0]
  if (!entry) return { error: 'Entry not found.' }
  if (!entry.tag_ref && !entry.personnel_id) return { error: 'This entry has no card or personnel record associated with it.' }

  const { data: boardRows } = await ctx.adminClient.from('accountability_boards').select('department_id').eq('id', entry.board_id)
  if (boardRows?.[0]?.department_id !== ctx.dept.department_id) return { error: 'Not authorized.' }

  const { error: dbErr } = await ctx.adminClient
    .from('accountability_entries').update({ guest_access_tier: tier }).eq('id', entryId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

export async function generateBoardGuestAdminLink(boardId: string, guestLabel: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!isOfficerOrAdmin(ctx.dept.system_role)) return { error: 'Officer or admin only.' }
  if (!guestLabel.trim()) return { error: 'Enter a name for this guest.' }

  const { data: boardRows } = await ctx.adminClient.from('accountability_boards').select('department_id').eq('id', boardId)
  if (boardRows?.[0]?.department_id !== ctx.dept.department_id) return { error: 'Not authorized.' }

  const token = createBoardGuestToken({ kind: 'admin', boardId, label: guestLabel.trim() })
  return { success: true, token }
}

// Kills BOTH halves of guest access: the timestamp check blocks any already-issued link/token
// (admin link, or a self-link opened before now), and clearing guest_access_tier on every entry
// stops a physical card from being rescanned to mint a fresh one — resolveCardForBoardAccess only
// looks at that column, not the timestamp, so without this second step a revoked card could just
// be scanned again immediately afterward and hand back a brand-new, perfectly valid token.
export async function revokeGuestLinks(boardId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!isOfficerOrAdmin(ctx.dept.system_role)) return { error: 'Officer or admin only.' }
  const { data: boardRows } = await ctx.adminClient
    .from('accountability_boards').select('id').eq('id', boardId).eq('department_id', ctx.dept.department_id)
  if (!boardRows?.length) return { error: 'Not authorized.' }

  const { error: dbErr } = await ctx.adminClient
    .from('accountability_boards').update({ guest_links_revoked_at: new Date().toISOString() })
    .eq('id', boardId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }

  const { error: entriesErr } = await ctx.adminClient
    .from('accountability_entries').update({ guest_access_tier: null }).eq('board_id', boardId)
  if (entriesErr) { await logError(entriesErr.message, '/accountability'); return { error: entriesErr.message } }

  revalidatePath(`/accountability/${boardId}`)
  revalidatePath('/accountability')
  return { success: true }
}

// Read-only status for the list page / header badge — is there anything to revoke right now?
export async function getGuestAccessStatus(boardId: string) {
  const ctx = await getContext()
  if (!ctx) return { active: false }
  const { data: boardRows } = await ctx.adminClient
    .from('accountability_boards').select('id').eq('id', boardId).eq('department_id', ctx.dept.department_id)
  if (!boardRows?.length) return { active: false }

  const { count } = await ctx.adminClient
    .from('accountability_entries')
    .select('id', { count: 'exact', head: true })
    .eq('board_id', boardId)
    .not('guest_access_tier', 'is', null)
  return { active: (count ?? 0) > 0 }
}

// Public — no ctx, called from the unauthenticated /board-guest/scan page. A card only works
// here if an officer checked this person in AND granted an access tier (see checkInPerson's
// guestAccessTier / the Name Tag flow, or setEntryAccessTier) — scanning an unrecognized or
// tracking-only card just says so, it never falls back to guessing who someone is.
//
// A personally-owned card (a real FireOps7 personal card, or a Salamander card already linked
// to someone via personnel_qr_tokens) is matched by personnel_id, not by a per-entry tag_ref —
// that identity is already permanent and known, so there's nothing to separately "attach" to
// an entry first. Only a blank/quick tag (no personnel_qr_tokens link, checked in by hand-typed
// name) has no other identity to match on and needs its physical tag_ref recognized instead.
export async function resolveCardForBoardAccess(raw: string) {
  const adminClient = createAdminClient()

  let personnelId: string | null = null
  if (isFireOps7Card(raw)) {
    personnelId = parseFireOps7Card(raw)
  } else {
    const card = parseSalamanderCard(raw)
    if (card) {
      const key = salamanderCanonicalKey(card)
      const { data: tokenRows } = await adminClient
        .from('personnel_qr_tokens').select('personnel_id').eq('token_type', 'salamander').eq('token_value', key)
      personnelId = tokenRows?.[0]?.personnel_id ?? null
    }
  }

  const query = adminClient
    .from('accountability_entries')
    .select('id, board_id, raw_name, raw_dept, guest_access_tier, checked_in_at')
    .not('guest_access_tier', 'is', null)
    .is('released_at', null)
    .order('checked_in_at', { ascending: false })

  const { data: entryRows } = personnelId
    ? await query.eq('personnel_id', personnelId)
    : await query.eq('tag_ref', hashRaw(raw))

  if (!entryRows?.length) {
    return { error: 'This card isn\'t currently checked in with board access. Ask an officer to check you in first.' }
  }

  const boardIds = [...new Set(entryRows.map(e => e.board_id))]
  const { data: activeBoards } = await adminClient
    .from('accountability_boards').select('id').in('id', boardIds).eq('status', 'active')
  const activeBoardIds = new Set((activeBoards ?? []).map(b => b.id))

  const entry = entryRows.find(e => activeBoardIds.has(e.board_id))
  if (!entry) return { error: 'The board this card was checked into is no longer active. Ask an officer to check you in again.' }

  const label = entry.raw_name ? (entry.raw_dept ? `${entry.raw_name} (${entry.raw_dept})` : entry.raw_name) : 'Guest'

  const token = entry.guest_access_tier === 'admin'
    ? createBoardGuestToken({ kind: 'admin', boardId: entry.board_id, label })
    : createBoardGuestToken({ kind: 'self', boardId: entry.board_id, entryId: entry.id, label })

  return { success: true, token }
}

// Public read for the unauthenticated /board-guest/[token] page — no ctx, the token is the
// entire authorization. Returns just one entry's slice for a Tier 1 self link, or the full
// board for a Tier 2 admin link. Re-derives the CURRENT tier/mode from the database on every
// call rather than trusting what was true when the token was minted — an officer upgrading,
// downgrading, or revoking a card's access, or flipping NIMS/Active Violence mode, takes effect
// on the guest's next poll with no new link or re-scan needed.
export async function getGuestBoardState(token: string) {
  const payload = verifyBoardGuestTokenSignature(token)
  if (!payload) return { error: 'This link is invalid or has expired.' }

  const adminClient = createAdminClient()
  const { data: boardRows } = await adminClient
    .from('accountability_boards')
    .select('id, title, board_date, status, guest_links_revoked_at, department_id, nims_mode, is_active_violence')
    .eq('id', payload.boardId)
  const board = boardRows?.[0]
  if (!board) return { error: 'Board not found.' }
  if (board.status !== 'active') return { error: 'This board has been closed. Guest access has ended.' }
  if (board.guest_links_revoked_at && payload.issuedAt <= new Date(board.guest_links_revoked_at).getTime()) {
    return { error: 'Guest access to this board has been revoked.' }
  }

  const { data: deptRows } = await adminClient.from('departments').select('name').eq('id', board.department_id)
  const departmentName = deptRows?.[0]?.name ?? null
  const boardInfo = { id: board.id, title: board.title, departmentName, nimsMode: board.nims_mode as boolean, isActiveViolence: board.is_active_violence as boolean }

  if (payload.kind === 'self') {
    const { data: entryRows } = await adminClient
      .from('accountability_entries')
      .select('id, lane_id, personnel_id, raw_name, raw_dept, status, ics_role, released_at, resource_id, guest_access_tier')
      .eq('id', payload.entryId)
    const entry = entryRows?.[0]
    if (!entry) return { error: 'Your entry was not found on this board.' }
    if (entry.released_at) return { error: 'You\'ve been checked out of this board. Ask an officer to check you in again if that\'s not right.' }
    if (!entry.guest_access_tier) return { error: 'Your board access has been turned off. Ask an officer to grant it again.' }

    // An officer can upgrade an already-issued self link to full board access after the fact —
    // reflect that live instead of requiring a new link.
    if (entry.guest_access_tier === 'admin') {
      return fetchGuestAdminState(adminClient, board, boardInfo, payload.label)
    }

    let resource: { id: string; lane_id: string | null; raw_description: string | null; kind: string | null; apparatus_id: string | null; status: string } | null = null
    if (entry.resource_id) {
      const { data: resRows } = await adminClient
        .from('accountability_resources')
        .select('id, lane_id, raw_description, kind, apparatus_id, status')
        .eq('id', entry.resource_id)
      resource = resRows?.[0] ?? null
    }

    const { data: lanes } = await adminClient
      .from('accountability_lanes').select('id, name, sort_order, profile').eq('board_id', board.id).order('sort_order')

    return {
      success: true as const,
      kind: 'self' as const,
      board: boardInfo,
      label: payload.label,
      entry,
      resource,
      lanes: lanes ?? [],
    }
  }

  return fetchGuestAdminState(adminClient, board, boardInfo, payload.label)
}

async function fetchGuestAdminState(
  adminClient: ReturnType<typeof createAdminClient>,
  board: { id: string },
  boardInfo: { id: string; title: string; departmentName: string | null; nimsMode: boolean; isActiveViolence: boolean },
  label: string,
) {
  const { data: lanes } = await adminClient
    .from('accountability_lanes').select('id, name, sort_order, leader_entry_id, work_assignment, profile').eq('board_id', board.id).order('sort_order')

  const { data: entriesRaw } = await adminClient
    .from('accountability_entries')
    .select('id, lane_id, personnel_id, raw_name, raw_dept, status, checked_in_at, ics_role, released_at, tag_ref, resource_id')
    .eq('board_id', board.id)
    .order('checked_in_at')

  const { data: resourcesRaw } = await adminClient
    .from('accountability_resources')
    .select('id, lane_id, apparatus_id, raw_description, raw_agency, kind, type_tier, status, checked_in_at, released_at')
    .eq('board_id', board.id)
    .order('checked_in_at')

  const resourceApparatusIds = [...new Set((resourcesRaw ?? []).map(r => r.apparatus_id).filter(Boolean))] as string[]
  const { data: resourceApparatusRaw } = resourceApparatusIds.length > 0
    ? await adminClient.from('apparatus').select('id, unit_number').in('id', resourceApparatusIds)
    : { data: [] }
  const resourceApparatusUnitById = Object.fromEntries((resourceApparatusRaw ?? []).map(a => [a.id, a.unit_number]))
  const resources = (resourcesRaw ?? []).map(r => ({
    ...r,
    display_desc: r.apparatus_id ? (resourceApparatusUnitById[r.apparatus_id] ?? '—') : (r.raw_description ?? r.kind ?? '—'),
  }))

  const personnelIds = [...new Set((entriesRaw ?? []).map(e => e.personnel_id).filter(Boolean))] as string[]
  const { data: personnelRaw } = personnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', personnelIds)
    : { data: [] }
  const nameMap = Object.fromEntries((personnelRaw ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  const entries = (entriesRaw ?? []).map(e => ({
    ...e,
    display_name: e.personnel_id ? (nameMap[e.personnel_id] ?? '—') : (e.raw_name ?? '—'),
  }))

  return {
    success: true as const,
    kind: 'admin' as const,
    board: boardInfo,
    label,
    lanes: lanes ?? [],
    entries,
    resources,
  }
}

// ─── Lane template actions ────────────────────────────────────────────────────

export async function addLaneTemplate(departmentId: string, name: string, profile: 'default' | 'ics' | 'active_violence' = 'default') {
  const ctx = await getContext()
  if (!ctx || ctx.dept.system_role !== 'admin') return { error: 'Admin only.' }
  if (!name.trim()) return { error: 'Name is required.' }

  const { data: existing } = await ctx.adminClient
    .from('accountability_lane_templates')
    .select('sort_order')
    .eq('department_id', departmentId)
    .eq('profile', profile)
    .order('sort_order', { ascending: false })
    .limit(1)
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

  const { error: dbErr } = await ctx.adminClient
    .from('accountability_lane_templates')
    .insert({ department_id: departmentId, name: name.trim(), sort_order: nextOrder, active: true, profile })
  if (dbErr) { await logError(dbErr.message, '/dept-admin/accountability'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/accountability')
  return { success: true }
}

export async function updateLaneTemplate(id: string, name: string) {
  const ctx = await getContext()
  if (!ctx || ctx.dept.system_role !== 'admin') return { error: 'Admin only.' }
  if (!name.trim()) return { error: 'Name is required.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_lane_templates').update({ name: name.trim() }).eq('id', id)
  if (dbErr) { await logError(dbErr.message, '/dept-admin/accountability'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/accountability')
  return { success: true }
}

export async function toggleLaneTemplate(id: string, active: boolean) {
  const ctx = await getContext()
  if (!ctx || ctx.dept.system_role !== 'admin') return { error: 'Admin only.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_lane_templates').update({ active }).eq('id', id)
  if (dbErr) { await logError(dbErr.message, '/dept-admin/accountability'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/accountability')
  return { success: true }
}

export async function reorderLaneTemplates(departmentId: string, orderedIds: string[]) {
  const ctx = await getContext()
  if (!ctx || ctx.dept.system_role !== 'admin') return { error: 'Admin only.' }
  const updates = orderedIds.map((id, i) =>
    ctx.adminClient.from('accountability_lane_templates').update({ sort_order: i }).eq('id', id).eq('department_id', departmentId)
  )
  await Promise.all(updates)
  revalidatePath('/dept-admin/accountability')
  return { success: true }
}

// ─── Board actions ────────────────────────────────────────────────────────────

export async function createBoard(
  title: string,
  boardDate: string,
  linkedIncidentId?: string | null,
  linkedTrainingEventId?: string | null,
  linkedEventInstanceId?: string | null,
) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!title.trim()) return { error: 'Title is required.' }

  const { data: row, error: dbErr } = await ctx.adminClient
    .from('accountability_boards')
    .insert({
      department_id: ctx.dept.department_id,
      title: title.trim(),
      board_date: boardDate,
      created_by: ctx.me.id,
      linked_incident_id: linkedIncidentId ?? null,
      linked_training_event_id: linkedTrainingEventId ?? null,
      linked_event_instance_id: linkedEventInstanceId ?? null,
    })
    .select('id')
    .single()
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  revalidatePath('/accountability')
  return { success: true, boardId: row.id }
}

export async function updateBoardLink(
  boardId: string,
  linkedIncidentId: string | null,
  linkedTrainingEventId: string | null,
  linkedEventInstanceId: string | null,
) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_boards')
    .update({ linked_incident_id: linkedIncidentId, linked_training_event_id: linkedTrainingEventId, linked_event_instance_id: linkedEventInstanceId })
    .eq('id', boardId)
    .eq('department_id', ctx.dept.department_id)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  revalidatePath(`/accountability/${boardId}`)
  return { success: true }
}

export async function closeBoard(boardId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_boards')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', boardId)
    .eq('department_id', ctx.dept.department_id)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  revalidatePath('/accountability')
  revalidatePath(`/accountability/${boardId}`)
  return { success: true }
}

export async function reopenBoard(boardId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_boards')
    .update({ status: 'active', closed_at: null })
    .eq('id', boardId)
    .eq('department_id', ctx.dept.department_id)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  revalidatePath('/accountability')
  revalidatePath(`/accountability/${boardId}`)
  return { success: true }
}

// ─── Lane actions ─────────────────────────────────────────────────────────────

export async function initBoardLanes(boardId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }

  const { data: boardList } = await ctx.adminClient
    .from('accountability_boards').select('department_id').eq('id', boardId)
  const board = boardList?.[0]
  if (!board) return { error: 'Board not found.' }

  const { data: templates } = await ctx.adminClient
    .from('accountability_lane_templates')
    .select('name, sort_order')
    .eq('department_id', board.department_id)
    .eq('profile', 'default')
    .eq('active', true)
    .order('sort_order')

  if (!templates?.length) return { error: 'No lane templates configured. Set them up in Dept Admin → Accountability.' }

  const rows = templates.map(t => ({ board_id: boardId, name: t.name, sort_order: t.sort_order, profile: 'default' as const }))
  const { data: inserted, error: dbErr } = await ctx.adminClient
    .from('accountability_lanes').insert(rows).select('id, name, sort_order, leader_entry_id, work_assignment, profile')
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true, lanes: inserted ?? [] }
}

export async function addBoardLane(boardId: string, name: string, guestToken?: string) {
  const adminClient = createAdminClient()
  const actor = await resolveActor(adminClient, boardId, guestToken)
  if (!actor) return { error: 'Not authorized.' }
  if (actor.kind === 'guest_self') return { error: 'Not authorized.' }
  if (!name.trim()) return { error: 'Name required.' }

  const { data: existing } = await adminClient
    .from('accountability_lanes').select('sort_order')
    .eq('board_id', boardId).order('sort_order', { ascending: false }).limit(1)
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

  const { data: row, error: dbErr } = await adminClient
    .from('accountability_lanes')
    .insert({ board_id: boardId, name: name.trim(), sort_order: nextOrder })
    .select('id, name, sort_order, leader_entry_id, work_assignment, profile').single()
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }

  if (actor.kind === 'guest_admin') await logGuestAction(adminClient, boardId, actor.label, `Created lane "${row.name}".`)
  return { success: true, lane: row }
}

// Refuses if anyone active is still in the lane — reassign them first rather than
// silently orphaning an assignment. Empty lanes only.
export async function deleteLane(laneId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!isOfficerOrAdmin(ctx.dept.system_role)) return { error: 'Officer or admin only.' }

  const { data: laneRows } = await ctx.adminClient
    .from('accountability_lanes').select('board_id').eq('id', laneId)
  const boardId = laneRows?.[0]?.board_id
  if (!boardId) return { error: 'Lane not found.' }

  const { data: boardRows } = await ctx.adminClient
    .from('accountability_boards').select('department_id').eq('id', boardId)
  if (boardRows?.[0]?.department_id !== ctx.dept.department_id) return { error: 'Not authorized.' }

  const { count } = await ctx.adminClient
    .from('accountability_entries').select('id', { count: 'exact', head: true })
    .eq('lane_id', laneId).is('released_at', null)
  if (count && count > 0) return { error: 'Move everyone out of this lane before deleting it.' }

  const { count: logCount } = await ctx.adminClient
    .from('accountability_activity_log').select('id', { count: 'exact', head: true }).eq('lane_id', laneId)
  if (logCount && logCount > 0) return { error: 'This lane has 214 log entries against it — its history stays intact, so it can\'t be deleted.' }

  const { error: dbErr } = await ctx.adminClient.from('accountability_lanes').delete().eq('id', laneId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

// ─── Entry actions ────────────────────────────────────────────────────────────

export async function checkInPerson(
  boardId: string,
  laneId: string | null,
  personnelId: string | null,
  rawName: string | null,
  rawDept: string | null,
  tagRef: string | null = null,
  resourceId: string | null = null,
  guestAccessTier: 'self' | 'admin' | null = null,
  guestToken?: string,
) {
  const adminClient = createAdminClient()
  const actor = await resolveActor(adminClient, boardId, guestToken)
  if (!actor) return { error: 'Not authorized.' }
  // A guest-self link is scoped to their own single entry — they can't add other people.
  // A guest-admin has full board control but no visibility into this department's actual
  // personnel roster, so they can only ever check someone in by name, never by personnel_id.
  if (actor.kind === 'guest_self') return { error: 'Not authorized.' }
  if (actor.kind === 'guest_admin' && personnelId) return { error: 'Not authorized.' }
  if (!personnelId && !rawName) return { error: 'Must provide personnel or name.' }
  // A card-based access grant only means anything if there's an actual card to recognize
  // on a future scan — a pure hand-typed name with no tag has nothing to look up.
  const tier = tagRef ? guestAccessTier : null

  const { data: row, error: dbErr } = await adminClient
    .from('accountability_entries')
    .insert({
      board_id: boardId, lane_id: laneId, personnel_id: personnelId, raw_name: rawName, raw_dept: rawDept,
      tag_ref: tagRef, added_by: actor.kind === 'officer' ? actor.personnelId : null, resource_id: resourceId, guest_access_tier: tier,
    })
    .select('id, lane_id, personnel_id, raw_name, raw_dept, status, checked_in_at, ics_role, released_at, tag_ref, resource_id, guest_access_tier').single()
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }

  if (actor.kind === 'guest_admin') {
    await logGuestAction(adminClient, boardId, actor.label, `Checked in ${rawName ?? 'a new entry'}${rawDept ? ` (${rawDept})` : ''}.`)
  }
  return { success: true, entry: row }
}

// Moving a person individually is a deliberate split from their resource/crew —
// clears resource_id so they're no longer implicitly dragged along when that
// resource later moves lanes. Moving the resource itself (moveResourceToLane)
// is the "whole unit moves together" path.
export async function movePersonToLane(entryId: string, laneId: string, guestToken?: string) {
  const adminClient = createAdminClient()
  const { data: entryRows } = await adminClient
    .from('accountability_entries').select('board_id, raw_name').eq('id', entryId)
  const entry = entryRows?.[0]
  if (!entry) return { error: 'Entry not found.' }

  const actor = await resolveActor(adminClient, entry.board_id, guestToken)
  if (!actor) return { error: 'Not authorized.' }
  if (actor.kind === 'guest_self' && actor.entryId !== entryId) return { error: 'Not authorized.' }

  const { data: laneRows } = await adminClient.from('accountability_lanes').select('name').eq('id', laneId)
  const { error: dbErr } = await adminClient
    .from('accountability_entries').update({ lane_id: laneId, resource_id: null }).eq('id', entryId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }

  if (actor.kind !== 'officer') {
    const who = entry.raw_name ?? 'a crew member'
    await logGuestAction(adminClient, entry.board_id, actor.label, `Moved ${who} to ${laneRows?.[0]?.name ?? 'a lane'}.`)
  }
  return { success: true }
}

// ─── Resource actions ─────────────────────────────────────────────────────────

export async function checkInResource(
  boardId: string,
  laneId: string | null,
  apparatusId: string | null,
  description: string | null,
  agency: string | null,
  kind: string | null,
  typeTier: string | null = null,
) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!apparatusId && !description) return { error: 'Must provide apparatus or a description.' }

  const { data: row, error: dbErr } = await ctx.adminClient
    .from('accountability_resources')
    .insert({ board_id: boardId, lane_id: laneId, apparatus_id: apparatusId, raw_description: description, raw_agency: agency, kind, type_tier: typeTier, created_by: ctx.me.id })
    .select('id, lane_id, apparatus_id, raw_description, raw_agency, kind, type_tier, status, checked_in_at, released_at').single()
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true, resource: row }
}

// Moves the resource and cascades to every crew member still attached to it —
// the "whole unit moves together" mechanic. Anyone previously detached (moved
// individually) doesn't move, since their resource_id is already null.
export async function moveResourceToLane(resourceId: string, laneId: string, guestToken?: string) {
  const adminClient = createAdminClient()
  const { data: resourceRows } = await adminClient
    .from('accountability_resources').select('board_id, raw_description, kind').eq('id', resourceId)
  const resource = resourceRows?.[0]
  if (!resource) return { error: 'Resource not found.' }

  const actor = await resolveActor(adminClient, resource.board_id, guestToken)
  if (!actor) return { error: 'Not authorized.' }
  if (actor.kind === 'guest_self') {
    // Engine boss moving their own rig moves the crew with it — but only the resource
    // actually attached to their own entry, never someone else's.
    const { data: myEntryRows } = await adminClient
      .from('accountability_entries').select('resource_id').eq('id', actor.entryId)
    if (myEntryRows?.[0]?.resource_id !== resourceId) return { error: 'Not authorized.' }
  }

  const { data: laneRows } = await adminClient.from('accountability_lanes').select('name').eq('id', laneId)
  const { error: dbErr } = await adminClient
    .from('accountability_resources').update({ lane_id: laneId }).eq('id', resourceId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  const { error: crewErr } = await adminClient
    .from('accountability_entries').update({ lane_id: laneId }).eq('resource_id', resourceId)
  if (crewErr) { await logError(crewErr.message, '/accountability'); return { error: crewErr.message } }

  if (actor.kind !== 'officer') {
    const who = resource.raw_description ?? resource.kind ?? 'a resource'
    await logGuestAction(adminClient, resource.board_id, actor.label, `Moved ${who} and its crew to ${laneRows?.[0]?.name ?? 'a lane'}.`)
  }
  return { success: true }
}

export async function releaseResource(resourceId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_resources').update({ status: 'released', released_at: new Date().toISOString() }).eq('id', resourceId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

export async function attachPersonnelToResource(entryId: string, resourceId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { data: resourceRows } = await ctx.adminClient
    .from('accountability_resources').select('lane_id').eq('id', resourceId)
  const laneId = resourceRows?.[0]?.lane_id ?? null
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_entries').update({ resource_id: resourceId, lane_id: laneId }).eq('id', entryId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

export async function updateEntryName(entryId: string, rawName: string, rawDept: string | null) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!rawName.trim()) return { error: 'Name required.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_entries')
    .update({ raw_name: rawName.trim(), raw_dept: rawDept?.trim() ?? null })
    .eq('id', entryId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

// A quick-tag entry (typed name, no personnel_id) is later confirmed to be the same person as
// a real-card scan — link it in place instead of leaving two rows for one person on the board.
// Backfills tag_ref on an entry that's already checked in — covers re-scanning a personally-
// recognized card that was checked in before entries stored tag_ref for that path, or someone's
// card simply changing. Without this, an already-on-board entry can never pick up a card scan
// after the fact; the person would have to check out and back in to get one attached.
export async function attachCardToEntry(entryId: string, tagRef: string, tier?: 'self' | 'admin' | null) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!isOfficerOrAdmin(ctx.dept.system_role)) return { error: 'Officer or admin only.' }
  const { data: entryRows } = await ctx.adminClient.from('accountability_entries').select('board_id').eq('id', entryId)
  const entry = entryRows?.[0]
  if (!entry) return { error: 'Entry not found.' }
  const { data: boardRows } = await ctx.adminClient.from('accountability_boards').select('department_id').eq('id', entry.board_id)
  if (boardRows?.[0]?.department_id !== ctx.dept.department_id) return { error: 'Not authorized.' }

  const update: Record<string, unknown> = { tag_ref: tagRef }
  if (tier !== undefined) update.guest_access_tier = tier
  const { error: dbErr } = await ctx.adminClient.from('accountability_entries').update(update).eq('id', entryId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

export async function linkAccountabilityEntryToPersonnel(entryId: string, personnelId: string, tagRef?: string | null) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const update: Record<string, unknown> = { personnel_id: personnelId, raw_name: null, raw_dept: null, status: 'on_scene', released_at: null }
  // The card just scanned to trigger this merge is the person's real card — store its hash so
  // it's recognized on future scans, replacing whatever tag (if any) the quick-tag entry had.
  if (tagRef) update.tag_ref = tagRef
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_entries')
    .update(update)
    .eq('id', entryId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

export async function removeAccountabilityEntry(entryId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_entries').delete().eq('id', entryId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

export async function releaseAccountabilityEntry(entryId: string, guestToken?: string) {
  const adminClient = createAdminClient()
  const { data: entryRows } = await adminClient.from('accountability_entries').select('board_id, raw_name').eq('id', entryId)
  const entry = entryRows?.[0]
  if (!entry) return { error: 'Entry not found.' }

  const actor = await resolveActor(adminClient, entry.board_id, guestToken)
  if (!actor) return { error: 'Not authorized.' }
  if (actor.kind === 'guest_self' && actor.entryId !== entryId) return { error: 'Not authorized.' }

  const { error: dbErr } = await adminClient
    .from('accountability_entries')
    .update({ status: 'released', released_at: new Date().toISOString() })
    .eq('id', entryId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }

  if (actor.kind !== 'officer') {
    await logGuestAction(adminClient, entry.board_id, actor.label, `Checked out ${entry.raw_name ?? 'a crew member'}.`)
  }
  return { success: true }
}

export async function reactivateAccountabilityEntry(entryId: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_entries')
    .update({ status: 'on_scene', released_at: null })
    .eq('id', entryId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

export async function recordPAR(boardId: string, snapshot: { lane_name: string; count: number; names: string[] }[]) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_par_checks')
    .insert({ board_id: boardId, checked_by: ctx.me.id, snapshot })
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

// ─── ICS fields (command roles, lane leader/work assignment, board objectives) ─

function isOfficerOrAdmin(role: string | null) {
  return role === 'officer' || role === 'admin'
}

export async function setBoardIcsFields(
  boardId: string,
  fields: { objectives?: string | null; safety_message?: string | null; weather?: string | null; is_active_violence?: boolean; nims_mode?: boolean }
) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!isOfficerOrAdmin(ctx.dept.system_role)) return { error: 'Officer or admin only.' }
  const { error: dbErr } = await ctx.adminClient
    .from('accountability_boards')
    .update(fields)
    .eq('id', boardId)
    .eq('department_id', ctx.dept.department_id)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }

  // Switching a mode on shouldn't leave a board stuck with only whatever
  // fire-flavored preset lanes it started with — ensure that mode's lane profile
  // exists (additive only, never touches or removes existing lanes). Uses the
  // department's own customized profile if they've set one up, otherwise the
  // built-in preset.
  if (fields.nims_mode === true) await ensureModeLaneProfile(ctx.adminClient, boardId, ctx.dept.department_id, 'ics', ICS_MODE_LANES)
  if (fields.is_active_violence === true) await ensureModeLaneProfile(ctx.adminClient, boardId, ctx.dept.department_id, 'active_violence', ACTIVE_VIOLENCE_LANES)

  return { success: true }
}

async function ensureModeLaneProfile(
  adminClient: ReturnType<typeof createAdminClient>,
  boardId: string,
  departmentId: string,
  profile: 'ics' | 'active_violence',
  builtInPreset: string[],
) {
  const { data: customTemplates } = await adminClient
    .from('accountability_lane_templates')
    .select('name').eq('department_id', departmentId).eq('profile', profile).eq('active', true)
  const laneNames = customTemplates && customTemplates.length > 0
    ? customTemplates.map(t => t.name)
    : builtInPreset

  const { data: existingLanes } = await adminClient
    .from('accountability_lanes').select('name').eq('board_id', boardId)
  const existingNames = new Set((existingLanes ?? []).map(l => l.name.trim().toLowerCase()))
  const { data: maxSort } = await adminClient
    .from('accountability_lanes').select('sort_order').eq('board_id', boardId).order('sort_order', { ascending: false }).limit(1)
  let nextOrder = (maxSort?.[0]?.sort_order ?? -1) + 1
  const toAdd = laneNames.filter(n => !existingNames.has(n.toLowerCase()))
  if (toAdd.length > 0) {
    await adminClient.from('accountability_lanes').insert(
      toAdd.map(name => ({ board_id: boardId, name, sort_order: nextOrder++, profile }))
    )
  }
}

export async function setEntryIcsRole(entryId: string, role: string | null) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!isOfficerOrAdmin(ctx.dept.system_role)) return { error: 'Officer or admin only.' }
  if (role && !ALL_ICS_ROLE_VALUES.includes(role as typeof ALL_ICS_ROLE_VALUES[number])) return { error: 'Invalid role.' }

  const { data: entryRows } = await ctx.adminClient
    .from('accountability_entries').select('board_id').eq('id', entryId)
  const boardId = entryRows?.[0]?.board_id
  if (!boardId) return { error: 'Entry not found.' }

  const { data: boardRows } = await ctx.adminClient
    .from('accountability_boards').select('department_id').eq('id', boardId)
  if (boardRows?.[0]?.department_id !== ctx.dept.department_id) return { error: 'Not authorized.' }

  const { error: dbErr } = await ctx.adminClient
    .from('accountability_entries').update({ ics_role: role }).eq('id', entryId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

export async function setLaneLeader(laneId: string, entryId: string | null) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!isOfficerOrAdmin(ctx.dept.system_role)) return { error: 'Officer or admin only.' }

  const { data: laneRows } = await ctx.adminClient
    .from('accountability_lanes').select('board_id').eq('id', laneId)
  const boardId = laneRows?.[0]?.board_id
  if (!boardId) return { error: 'Lane not found.' }

  const { data: boardRows } = await ctx.adminClient
    .from('accountability_boards').select('department_id').eq('id', boardId)
  if (boardRows?.[0]?.department_id !== ctx.dept.department_id) return { error: 'Not authorized.' }

  const { error: dbErr } = await ctx.adminClient
    .from('accountability_lanes').update({ leader_entry_id: entryId }).eq('id', laneId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

// Renames a live lane in place — entries reference lane_id, not the name, so
// whoever's already checked in stays put. This is the NIMS-mode mechanic: relabel
// "Interior Attack" to "Division A" without resetting anyone's assignment.
export async function renameLane(laneId: string, name: string, guestToken?: string) {
  if (!name.trim()) return { error: 'Name is required.' }

  const adminClient = createAdminClient()
  const { data: laneRows } = await adminClient
    .from('accountability_lanes').select('board_id, name').eq('id', laneId)
  const lane = laneRows?.[0]
  if (!lane) return { error: 'Lane not found.' }

  const actor = await resolveActor(adminClient, lane.board_id, guestToken)
  if (!actor) return { error: 'Not authorized.' }
  if (actor.kind === 'officer' && !isOfficerOrAdmin(actor.systemRole)) return { error: 'Officer or admin only.' }
  if (actor.kind === 'guest_self') return { error: 'Not authorized.' }

  const { error: dbErr } = await adminClient
    .from('accountability_lanes').update({ name: name.trim() }).eq('id', laneId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }

  if (actor.kind === 'guest_admin') await logGuestAction(adminClient, lane.board_id, actor.label, `Renamed lane "${lane.name}" to "${name.trim()}".`)
  return { success: true }
}

export async function setLaneWorkAssignment(laneId: string, text: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!isOfficerOrAdmin(ctx.dept.system_role)) return { error: 'Officer or admin only.' }

  const { data: laneRows } = await ctx.adminClient
    .from('accountability_lanes').select('board_id').eq('id', laneId)
  const boardId = laneRows?.[0]?.board_id
  if (!boardId) return { error: 'Lane not found.' }

  const { data: boardRows } = await ctx.adminClient
    .from('accountability_boards').select('department_id').eq('id', boardId)
  if (boardRows?.[0]?.department_id !== ctx.dept.department_id) return { error: 'Not authorized.' }

  const { error: dbErr } = await ctx.adminClient
    .from('accountability_lanes').update({ work_assignment: text.trim() || null }).eq('id', laneId)
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true }
}

// ─── Activity log ──────────────────────────────────────────────────────────────

export async function addActivityLogEntry(boardId: string, note: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!note.trim()) return { error: 'Note required.' }

  const { data: row, error: dbErr } = await ctx.adminClient
    .from('accountability_activity_log')
    .insert({ board_id: boardId, author_personnel_id: ctx.me.id, note: note.trim() })
    .select('id, entry_time, note, author_personnel_id')
    .single()
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  return { success: true, entry: row }
}

// Captures a formatted stamp of who is currently assigned where (lane-by-lane,
// released entries excluded — this is "what's happening right now", not a historical
// record) into the same activity log a manual note goes into. This is the ICS 214
// entry point: hit it whenever assignments change, and the log builds a chronological
// trail of the board's state across the incident without anyone typing it out by hand.
// laneId narrows the stamp to one lane — a supervisor logging their own unit's 214
// only stamps who's currently reporting to them, tagged so the activity log can be
// filtered back down to just that lane later. Omit it for the old incident-wide stamp.
export async function logBoardStamp(boardId: string, manualNote?: string, laneId?: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }

  const { data: lanes } = await ctx.adminClient
    .from('accountability_lanes').select('id, name, sort_order').eq('board_id', boardId).order('sort_order')
  let entriesQuery = ctx.adminClient
    .from('accountability_entries')
    .select('personnel_id, raw_name, lane_id, ics_role')
    .eq('board_id', boardId)
    .is('released_at', null)
  if (laneId) entriesQuery = entriesQuery.eq('lane_id', laneId)
  const { data: entries } = await entriesQuery

  const personnelIds = [...new Set((entries ?? []).map(e => e.personnel_id).filter(Boolean))] as string[]
  const { data: personnelRaw } = personnelIds.length > 0
    ? await ctx.adminClient.from('personnel').select('id, first_name, last_name').in('id', personnelIds)
    : { data: [] }
  const nameById = Object.fromEntries((personnelRaw ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))
  const laneNameById = Object.fromEntries((lanes ?? []).map(l => [l.id, l.name]))

  const byLane: Record<string, string[]> = {}
  for (const e of entries ?? []) {
    const laneLabel = e.lane_id ? (laneNameById[e.lane_id] ?? 'Unassigned') : 'Unassigned'
    const name = e.personnel_id ? (nameById[e.personnel_id] ?? '—') : (e.raw_name ?? '—')
    const label = e.ics_role ? `${name} (${icsRoleLabel(e.ics_role)})` : name
    byLane[laneLabel] = byLane[laneLabel] ?? []
    byLane[laneLabel].push(label)
  }

  const laneOrder = laneId ? [laneNameById[laneId] ?? 'Unassigned'] : [...(lanes ?? []).map(l => l.name), 'Unassigned']
  const seen = new Set<string>()
  const parts: string[] = []
  for (const laneName of laneOrder) {
    if (seen.has(laneName)) continue
    seen.add(laneName)
    const people = byLane[laneName]
    if (people && people.length > 0) parts.push(`${laneName}: ${people.join(', ')}`)
  }
  const stampText = laneId
    ? `ICS 214 stamp — ${parts.length > 0 ? parts[0] : `${laneNameById[laneId] ?? 'Lane'}: no one currently assigned`}`
    : `ICS 214 stamp — ${parts.length > 0 ? parts.join(' · ') : 'no one currently on scene'}`
  const note = manualNote?.trim() ? `${manualNote.trim()} — ${stampText}` : stampText

  const { data: row, error: dbErr } = await ctx.adminClient
    .from('accountability_activity_log')
    .insert({ board_id: boardId, author_personnel_id: ctx.me.id, note, lane_id: laneId ?? null })
    .select('id, entry_time, note, author_personnel_id, lane_id')
    .single()
  if (dbErr) { await logError(dbErr.message, '/accountability'); return { error: dbErr.message } }
  revalidatePath(`/accountability/${boardId}`)
  return { success: true, entry: row }
}

export async function saveDebugScan(rawValue: string, source: string = 'accountability') {
  const adminClient = createAdminClient()
  // Escape control chars so Postgres accepts the string
  const sanitized = Array.from(rawValue).map(c => {
    const code = c.charCodeAt(0)
    if ((code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D) || (code >= 0x7F && code <= 0x9F)) {
      return `\\x${code.toString(16).padStart(2, '0')}`
    }
    return c
  }).join('')
  await adminClient.from('qr_debug_scans').insert({ raw_value: sanitized, source })
  return { success: true }
}
