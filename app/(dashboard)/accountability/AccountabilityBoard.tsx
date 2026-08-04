'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import QRScanner from '@/components/QRScanner'
import { parseSalamanderCard, parseFireOps7Card, isFireOps7Card, salamanderCanonicalKey, hashRaw } from '@/lib/salamander'
import {
  initBoardLanes, addBoardLane, deleteLane,
  checkInPerson, movePersonToLane, removeAccountabilityEntry, updateEntryName, recordPAR, saveDebugScan,
  setBoardIcsFields, setEntryIcsRole, setLaneLeader, setLaneWorkAssignment, addActivityLogEntry, logBoardStamp, renameLane,
  releaseAccountabilityEntry, reactivateAccountabilityEntry, linkAccountabilityEntryToPersonnel,
  checkInResource, moveResourceToLane, releaseResource, attachPersonnelToResource,
  generateSelfMoveGuestLink, setEntryAccessTier, attachCardToEntry,
} from '@/app/actions/accountability'
import { ICS_COMMAND_ROLES, ICS_ACTIVE_VIOLENCE_ROLES, icsRoleLabel } from '@/lib/ics-roles'
import { RESOURCE_KINDS, RESOURCE_TYPE_TIERS } from '@/lib/resource-kinds'

interface Lane { id: string; name: string; sort_order: number; leader_entry_id: string | null; work_assignment: string | null; profile: 'default' | 'ics' | 'active_violence' | null }
interface Entry {
  id: string
  lane_id: string | null
  personnel_id: string | null
  raw_name: string | null
  raw_dept: string | null
  status: string
  checked_in_at: string
  display_name: string
  display_dept: string
  ics_role: string | null
  released_at: string | null
  tag_ref: string | null
  resource_id: string | null
  guest_access_tier: string | null
}
interface QrToken { personnel_id: string; token_type: string; token_value: string; display_name: string }
interface EntryRow {
  id: string
  board_id: string
  lane_id: string | null
  personnel_id: string | null
  raw_name: string | null
  raw_dept: string | null
  status: string
  checked_in_at: string
  ics_role: string | null
  released_at: string | null
  tag_ref: string | null
  resource_id: string | null
  guest_access_tier: string | null
}
interface Resource {
  id: string
  lane_id: string | null
  apparatus_id: string | null
  raw_description: string | null
  raw_agency: string | null
  kind: string | null
  type_tier: string | null
  status: string
  checked_in_at: string
  released_at: string | null
  display_desc: string
}

// Stable, non-cryptographic fingerprint for a scanned rapid tag's raw payload — used only to
// recognize "this is the same physical tag" across scans (including after a reload), never
// stored as the raw bytes themselves (which can contain control chars Postgres text can choke on).
// Last name + first initial, not the full string — catches "Zak Klein" vs. "Zachary Klein"
// (nickname on a hand-typed quick tag vs. the real card's full name). A wrong trigger just
// costs one extra "No, different person" click, so it's fine to run loose here.
function nameMatchKey(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name.trim().toLowerCase()
  const last = parts[parts.length - 1].toLowerCase()
  const firstInitial = parts[0][0]?.toLowerCase() ?? ''
  return `${firstInitial}:${last}`
}
interface ActivityLogEntry { id: string; entry_time: string; note: string; author_name: string; lane_id: string | null }

export default function AccountabilityBoard({
  boardId,
  initialLanes,
  initialEntries,
  qrTokens,
  deptPersonnel,
  departmentName,
  isOfficerOrAbove,
  initialObjectives,
  initialSafetyMessage,
  initialWeather,
  initialIsActiveViolence,
  initialNimsMode,
  initialActivityLog,
  initialResources,
  fleetApparatus,
  currentUserName,
}: {
  boardId: string
  initialLanes: Lane[]
  initialEntries: Entry[]
  qrTokens: QrToken[]
  deptPersonnel: { id: string; name: string; title: string | null }[]
  departmentName: string | null
  isOfficerOrAbove: boolean
  initialObjectives: string | null
  initialSafetyMessage: string | null
  initialWeather: string | null
  initialIsActiveViolence: boolean
  initialNimsMode: boolean
  initialActivityLog: ActivityLogEntry[]
  initialResources: Resource[]
  fleetApparatus: { id: string; unit_number: string }[]
  currentUserName: string
}) {
  const [lanes, setLanes] = useState<Lane[]>(initialLanes)
  const [entries, setEntries] = useState<Entry[]>(initialEntries)
  const [resources, setResources] = useState<Resource[]>(initialResources)
  const [resourceFormOpen, setResourceFormOpen] = useState(false)
  const [resourceApparatusId, setResourceApparatusId] = useState('')
  const [resourceDescription, setResourceDescription] = useState('')
  const [resourceAgency, setResourceAgency] = useState('')
  const [resourceKind, setResourceKind] = useState('')
  const [resourceKindOther, setResourceKindOther] = useState('')
  const [resourceTypeTier, setResourceTypeTier] = useState('')
  const [resourceSaving, setResourceSaving] = useState(false)
  const [movingResourceId, setMovingResourceId] = useState<string | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isActiveViolence, setIsActiveViolence] = useState(initialIsActiveViolence)
  useEffect(() => { setIsActiveViolence(initialIsActiveViolence) }, [initialIsActiveViolence])
  const [nimsMode, setNimsMode] = useState(initialNimsMode)
  useEffect(() => { setNimsMode(initialNimsMode) }, [initialNimsMode])
  const [renamingLaneId, setRenamingLaneId] = useState<string | null>(null)
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>(initialActivityLog)
  const [noteInput, setNoteInput] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [stampSaving, setStampSaving] = useState(false)
  const [activityLogFilter, setActivityLogFilter] = useState<'all' | string>('all')

  const [addingLane, setAddingLane] = useState(false)
  const [newLaneName, setNewLaneName] = useState('')
  const [savingLane, setSavingLane] = useState(false)

  const [movingEntryId, setMovingEntryId] = useState<string | null>(null)

  const [guestLinkEntryId, setGuestLinkEntryId] = useState<string | null>(null)
  const [guestLinkUrl, setGuestLinkUrl] = useState<string | null>(null)
  const [guestLinkBusy, setGuestLinkBusy] = useState(false)
  const [guestLinkCopied, setGuestLinkCopied] = useState(false)

  const [accessTierSaving, setAccessTierSaving] = useState(false)

  async function handleSetAccessTier(entryId: string, tier: 'self' | 'admin' | null) {
    setAccessTierSaving(true)
    const result = await setEntryAccessTier(entryId, tier)
    setAccessTierSaving(false)
    if (result?.error) { setError(result.error); return }
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, guest_access_tier: tier } : e))
  }

  async function handleGenerateGuestLink(entryId: string) {
    setGuestLinkEntryId(entryId)
    setGuestLinkUrl(null)
    setGuestLinkCopied(false)
    setGuestLinkBusy(true)
    const result = await generateSelfMoveGuestLink(entryId)
    setGuestLinkBusy(false)
    if (!result.error && result.token) setGuestLinkUrl(`${window.location.origin}/board-guest/${result.token}`)
  }

  async function handleCopyGuestLink() {
    if (!guestLinkUrl) return
    await navigator.clipboard.writeText(guestLinkUrl)
    setGuestLinkCopied(true)
  }

  const [manualOpen, setManualOpen] = useState(false)
  const [manualPersonnelId, setManualPersonnelId] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualDept, setManualDept] = useState('')
  const [manualLaneId, setManualLaneId] = useState('')
  const [manualSaving, setManualSaving] = useState(false)

  const [parSaving, setParSaving] = useState(false)
  const [parDone, setParDone] = useState(false)

  const [debugOpen, setDebugOpen] = useState(false)
  const [debugValue, setDebugValue] = useState('')
  const [debugSaved, setDebugSaved] = useState(false)

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDept, setEditDept] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // Rapid/quick tags (Salamander's unassigned event tags) carry no name — scanning one
  // prompts for a name on the spot instead of checking in raw undecoded tag data.
  const [nameTagOpen, setNameTagOpen] = useState(false)
  const [tagName, setTagName] = useState('')
  const [tagDept, setTagDept] = useState('')
  const [tagAccessTier, setTagAccessTier] = useState<'' | 'self' | 'admin'>('')
  const [tagSaving, setTagSaving] = useState(false)
  const pendingTagRawRef = useRef<string | null>(null)

  // A real-card scan resolves to a person already on the board under a typed quick-tag
  // name (possibly released from a prior day of a multi-day incident) — confirm before
  // linking rather than auto-merging, since two different people can share a name.
  const [mergeCandidate, setMergeCandidate] = useState<{
    entryId: string; existingName: string; wasReleased: boolean
    personnelId: string; newDisplayName: string; newDisplayDept: string; tagRef: string
  } | null>(null)
  const [mergeSaving, setMergeSaving] = useState(false)

  const stagingLane = lanes.find(l => l.name === 'Staging') ?? lanes[0] ?? null

  async function handleInit() {
    setError(null)
    const res = await initBoardLanes(boardId)
    if (res?.error) { setError(res.error); return }
    if (res.lanes) setLanes(res.lanes.sort((a: Lane, b: Lane) => a.sort_order - b.sort_order))
  }

  async function handleAddLane() {
    if (!newLaneName.trim()) return
    setSavingLane(true)
    const res = await addBoardLane(boardId, newLaneName.trim())
    setSavingLane(false)
    if (res?.error) { setError(res.error); return }
    if (res.lane) setLanes(prev => [...prev, res.lane])
    setNewLaneName('')
    setAddingLane(false)
  }

  function deptAndTitle(personnelId: string): string {
    const dp = deptPersonnel.find(p => p.id === personnelId)
    return [departmentName, dp?.title].filter(Boolean).join(' · ')
  }

  function resolveResourceDisplay(row: { apparatus_id: string | null; raw_description: string | null; kind: string | null }): string {
    if (row.apparatus_id) return fleetApparatus.find(a => a.id === row.apparatus_id)?.unit_number ?? '—'
    return row.raw_description ?? row.kind ?? '—'
  }

  function resolveEntryDisplay(row: { personnel_id: string | null; raw_name: string | null; raw_dept: string | null }): { display_name: string; display_dept: string } {
    if (row.personnel_id) {
      const token = qrTokens.find(t => t.personnel_id === row.personnel_id)
      const dp = deptPersonnel.find(p => p.id === row.personnel_id)
      return { display_name: token?.display_name ?? dp?.name ?? '—', display_dept: deptAndTitle(row.personnel_id) }
    }
    return { display_name: row.raw_name ?? '—', display_dept: row.raw_dept ?? '' }
  }

  // Live sync — other officers' scans/moves/check-ins on this board appear without a manual refresh.
  // Realtime evaluates our RLS policies using the JWT attached to the socket, so the session
  // token must be loaded and handed to supabase.realtime before subscribing — otherwise the
  // socket connects unauthenticated and silently receives zero rows (subscribe still "succeeds").
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function refetchBoardState() {
      const [{ data: entryRows }, { data: laneRows }, { data: logRows }, { data: resourceRows }] = await Promise.all([
        supabase.from('accountability_entries')
          .select('id, board_id, lane_id, personnel_id, raw_name, raw_dept, status, checked_in_at, ics_role, released_at, tag_ref, resource_id, guest_access_tier')
          .eq('board_id', boardId).order('checked_in_at'),
        supabase.from('accountability_lanes')
          .select('id, name, sort_order, leader_entry_id, work_assignment, profile')
          .eq('board_id', boardId).order('sort_order'),
        supabase.from('accountability_activity_log')
          .select('id, entry_time, note, author_personnel_id, lane_id')
          .eq('board_id', boardId).order('entry_time', { ascending: false }),
        supabase.from('accountability_resources')
          .select('id, lane_id, apparatus_id, raw_description, raw_agency, kind, type_tier, status, checked_in_at, released_at')
          .eq('board_id', boardId).order('checked_in_at'),
      ])
      if (cancelled) return
      if (entryRows) setEntries(entryRows.map(row => ({ ...row, ...resolveEntryDisplay(row) } as Entry)))
      if (laneRows) setLanes(laneRows as Lane[])
      if (logRows) setActivityLog(logRows.map(row => ({
        id: row.id, entry_time: row.entry_time, note: row.note, lane_id: row.lane_id,
        author_name: row.author_personnel_id ? (deptPersonnel.find(p => p.id === row.author_personnel_id)?.name ?? '—') : '—',
      })))
      if (resourceRows) setResources(resourceRows.map(row => ({ ...row, display_desc: resolveResourceDisplay(row) })))
    }

    async function subscribeChannel() {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (session) supabase.realtime.setAuth(session.access_token)

      channelRef.current = supabase
        .channel(`accountability_board_${boardId}_${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'accountability_entries', filter: `board_id=eq.${boardId}` },
          payload => {
            const row = payload.new as EntryRow
            setEntries(prev => prev.some(e => e.id === row.id) ? prev : [...prev, { ...row, ...resolveEntryDisplay(row) }])
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'accountability_entries', filter: `board_id=eq.${boardId}` },
          payload => {
            const row = payload.new as EntryRow
            setEntries(prev => prev.map(e => e.id === row.id ? { ...row, ...resolveEntryDisplay(row) } : e))
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'accountability_entries', filter: `board_id=eq.${boardId}` },
          payload => {
            const row = payload.old as EntryRow
            setEntries(prev => prev.filter(e => e.id !== row.id))
          }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'accountability_lanes', filter: `board_id=eq.${boardId}` },
          payload => {
            const row = payload.new as Lane
            setLanes(prev => prev.some(l => l.id === row.id) ? prev : [...prev, row].sort((a, b) => a.sort_order - b.sort_order))
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'accountability_lanes', filter: `board_id=eq.${boardId}` },
          payload => {
            const row = payload.new as Lane
            setLanes(prev => prev.map(l => l.id === row.id ? row : l))
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'accountability_lanes', filter: `board_id=eq.${boardId}` },
          payload => {
            const row = payload.old as Lane
            setLanes(prev => prev.filter(l => l.id !== row.id))
          }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'accountability_activity_log', filter: `board_id=eq.${boardId}` },
          payload => {
            const row = payload.new as { id: string; entry_time: string; note: string; author_personnel_id: string | null; lane_id: string | null }
            const authorName = row.author_personnel_id ? (deptPersonnel.find(p => p.id === row.author_personnel_id)?.name ?? '—') : '—'
            setActivityLog(prev => prev.some(a => a.id === row.id) ? prev : [{ id: row.id, entry_time: row.entry_time, note: row.note, author_name: authorName, lane_id: row.lane_id }, ...prev])
          }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'accountability_resources', filter: `board_id=eq.${boardId}` },
          payload => {
            const row = payload.new as Omit<Resource, 'display_desc'>
            setResources(prev => prev.some(r => r.id === row.id) ? prev : [...prev, { ...row, display_desc: resolveResourceDisplay(row) }])
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'accountability_resources', filter: `board_id=eq.${boardId}` },
          payload => {
            const row = payload.new as Omit<Resource, 'display_desc'>
            setResources(prev => prev.map(r => r.id === row.id ? { ...row, display_desc: resolveResourceDisplay(row) } : r))
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'accountability_resources', filter: `board_id=eq.${boardId}` },
          payload => {
            const row = payload.old as { id: string }
            setResources(prev => prev.filter(r => r.id !== row.id))
          }
        )
        .subscribe()
    }

    subscribeChannel()

    // Keep the realtime socket's auth token current across refreshes so the
    // subscription doesn't silently go dark when the session token rotates.
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) supabase.realtime.setAuth(session.access_token)
    })

    // Phones suspend background tabs — screen lock, app switch, dead cell signal — which can
    // silently kill the socket with no error and no reconnect. On regaining focus, always pull
    // fresh state (Realtime doesn't replay missed events) and rejoin if the channel isn't live.
    function handleResume() {
      if (document.visibilityState !== 'visible') return
      refetchBoardState()
      if (channelRef.current?.state !== 'joined') subscribeChannel()
    }
    document.addEventListener('visibilitychange', handleResume)
    window.addEventListener('focus', handleResume)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleResume)
      window.removeEventListener('focus', handleResume)
      authListener.subscription.unsubscribe()
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
    }
  }, [boardId])

  function resolveCard(raw: string): { personnelId: string | null; rawName: string | null; rawDept: string | null; displayName: string; displayDept: string; needsNaming?: boolean } {
    if (isFireOps7Card(raw)) {
      const pid = parseFireOps7Card(raw)
      if (pid) {
        const token = qrTokens.find(t => t.token_type === 'fireops7' && t.personnel_id === pid)
        const dp = deptPersonnel.find(p => p.id === pid)
        return { personnelId: pid, rawName: null, rawDept: null, displayName: token?.display_name ?? dp?.name ?? 'Unknown', displayDept: deptAndTitle(pid) }
      }
    }
    const card = parseSalamanderCard(raw)
    if (card) {
      const key = salamanderCanonicalKey(card)
      const token = qrTokens.find(t => t.token_type === 'salamander' && t.token_value === key)
      if (token) {
        return { personnelId: token.personnel_id, rawName: null, rawDept: null, displayName: token.display_name, displayDept: '' }
      }
      return { personnelId: null, rawName: `${card.firstName} ${card.lastName}`, rawDept: card.department, displayName: `${card.firstName} ${card.lastName}`, displayDept: card.department }
    }
    // Doesn't match the personally-assigned card format — this is a Salamander rapid/quick
    // tag (blank event tags with no name encoded) rather than a misread. Signal for naming
    // instead of dumping the undecoded tag data onto the board as the "name".
    return { personnelId: null, rawName: null, rawDept: null, displayName: '', displayDept: '', needsNaming: true }
  }

  async function handleScan(raw: string) {
    setScannerOpen(false)
    setError(null)

    // Auto-save unrecognized card formats to debug table
    const isKnown = isFireOps7Card(raw) || !!parseSalamanderCard(raw)
    if (!isKnown) saveDebugScan(raw)

    // Hash the raw scan regardless of card type — a personally-recognized card (FireOps7
    // personal card, or a Salamander card matched to a known personnel_qr_tokens entry) needs
    // this stored on its entry just as much as a blank tag does, otherwise there's nothing for
    // setEntryAccessTier or /board-guest/scan to ever recognize on that physical card later.
    const tagRef = hashRaw(raw)
    const resolved = resolveCard(raw)

    if (resolved.needsNaming) {
      // Match on tag_ref (persisted) rather than the session-only ref, so re-scanning the same
      // physical tag still finds its entry after a reload/board reopen instead of re-prompting.
      const existingEntry = entries.find(e => e.tag_ref === tagRef)
      if (existingEntry) { setMovingEntryId(existingEntry.id); return }
      pendingTagRawRef.current = raw
      setTagName('')
      setTagDept('')
      setNameTagOpen(true)
      return
    }

    const alreadyOn = entries.find(e =>
      (resolved.personnelId && e.personnel_id === resolved.personnelId) ||
      (!resolved.personnelId && e.raw_name === resolved.rawName && e.raw_dept === resolved.rawDept)
    )
    if (alreadyOn) {
      // Backfills tag_ref on a re-scan when it's missing or stale — otherwise an entry checked
      // in via a recognized card before this existed (or with a since-replaced card) can never
      // pick one up short of checking out and back in.
      if (alreadyOn.tag_ref !== tagRef) {
        await attachCardToEntry(alreadyOn.id, tagRef)
        setEntries(prev => prev.map(e => e.id === alreadyOn.id ? { ...e, tag_ref: tagRef } : e))
      }
      setMovingEntryId(alreadyOn.id)
      return
    }

    // A real, linked card may match someone already on the board under a typed quick-tag
    // name — e.g. showed up on a prior day of a multi-day incident with only a quick tag,
    // brought their real card today. Confirm before linking; don't auto-merge on name alone.
    if (resolved.personnelId) {
      const targetKey = nameMatchKey(resolved.displayName)
      const nameMatch = entries.find(e =>
        !e.personnel_id && e.raw_name && nameMatchKey(e.raw_name) === targetKey
      )
      if (nameMatch) {
        setMergeCandidate({
          entryId: nameMatch.id, existingName: nameMatch.display_name, wasReleased: nameMatch.status === 'released',
          personnelId: resolved.personnelId, newDisplayName: resolved.displayName, newDisplayDept: resolved.displayDept, tagRef,
        })
        return
      }
    }

    const laneId = stagingLane?.id ?? null
    const res = await checkInPerson(boardId, laneId, resolved.personnelId, resolved.rawName, resolved.rawDept, tagRef)
    if (res?.error) { setError(res.error); return }
    if (res.entry) {
      setEntries(prev => [...prev, { ...res.entry, display_name: resolved.displayName, display_dept: resolved.displayDept }])
    }
  }

  async function handleConfirmMerge() {
    if (!mergeCandidate) return
    setMergeSaving(true)
    const { entryId, personnelId, newDisplayName, newDisplayDept, tagRef } = mergeCandidate
    const res = await linkAccountabilityEntryToPersonnel(entryId, personnelId, tagRef)
    setMergeSaving(false)
    if (res?.error) { setError(res.error); return }
    setEntries(prev => prev.map(e => e.id === entryId
      ? { ...e, personnel_id: personnelId, raw_name: null, raw_dept: null, status: 'on_scene', released_at: null, display_name: newDisplayName, display_dept: newDisplayDept, tag_ref: tagRef }
      : e
    ))
    setMergeCandidate(null)
  }

  async function handleDeclineMerge() {
    if (!mergeCandidate) return
    setMergeSaving(true)
    const { personnelId, newDisplayName, newDisplayDept, tagRef } = mergeCandidate
    const laneId = stagingLane?.id ?? null
    const res = await checkInPerson(boardId, laneId, personnelId, null, null, tagRef)
    setMergeSaving(false)
    if (res?.error) { setError(res.error); setMergeCandidate(null); return }
    if (res.entry) {
      setEntries(prev => [...prev, { ...res.entry, display_name: newDisplayName, display_dept: newDisplayDept }])
    }
    setMergeCandidate(null)
  }

  async function handleNameTag() {
    if (!tagName.trim()) return
    setTagSaving(true)
    const laneId = stagingLane?.id ?? null
    const name = tagName.trim()
    const dept = tagDept.trim() || null
    const tagRef = pendingTagRawRef.current ? hashRaw(pendingTagRawRef.current) : null
    const tier = tagAccessTier || null
    const res = await checkInPerson(boardId, laneId, null, name, dept, tagRef, null, tier)
    setTagSaving(false)
    if (res?.error) { setError(res.error); return }
    if (res.entry) {
      setEntries(prev => [...prev, { ...res.entry, display_name: name, display_dept: dept ?? '' }])
    }
    pendingTagRawRef.current = null
    setTagAccessTier('')
    setNameTagOpen(false)
  }

  async function handleMove(entryId: string, laneId: string) {
    setMovingEntryId(null)
    const res = await movePersonToLane(entryId, laneId)
    if (res?.error) { setError(res.error); return }
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, lane_id: laneId } : e))
  }

  async function handleRemove(entryId: string) {
    const res = await removeAccountabilityEntry(entryId)
    if (res?.error) { setError(res.error); return }
    setEntries(prev => prev.filter(e => e.id !== entryId))
  }

  async function handleRelease(entryId: string) {
    setMovingEntryId(null)
    const now = new Date().toISOString()
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, status: 'released', released_at: now } : e))
    const res = await releaseAccountabilityEntry(entryId)
    if (res?.error) setError(res.error)
  }

  async function handleReactivate(entryId: string) {
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, status: 'on_scene', released_at: null } : e))
    const res = await reactivateAccountabilityEntry(entryId)
    if (res?.error) setError(res.error)
  }

  async function handleSetIcsRole(entryId: string, role: string | null) {
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, ics_role: role } : e))
    const res = await setEntryIcsRole(entryId, role)
    if (res?.error) setError(res.error)
  }

  async function handleToggleLeader(lane: Lane, entry: Entry) {
    const newLeaderId = lane.leader_entry_id === entry.id ? null : entry.id
    setLanes(prev => prev.map(l => l.id === lane.id ? { ...l, leader_entry_id: newLeaderId } : l))
    const res = await setLaneLeader(lane.id, newLeaderId)
    if (res?.error) setError(res.error)
  }

  async function handleRenameLane(lane: Lane, value: string) {
    const trimmed = value.trim()
    setRenamingLaneId(null)
    if (!trimmed || trimmed === lane.name) return
    setLanes(prev => prev.map(l => l.id === lane.id ? { ...l, name: trimmed } : l))
    const res = await renameLane(lane.id, trimmed)
    if (res?.error) setError(res.error)
  }

  async function handleLaneWorkAssignmentBlur(lane: Lane, value: string) {
    const trimmed = value.trim() || null
    if (trimmed === lane.work_assignment) return
    setLanes(prev => prev.map(l => l.id === lane.id ? { ...l, work_assignment: trimmed } : l))
    const res = await setLaneWorkAssignment(lane.id, value)
    if (res?.error) setError(res.error)
  }

  async function handleSaveBoardField(field: 'objectives' | 'safety_message' | 'weather', value: string) {
    const res = await setBoardIcsFields(boardId, { [field]: value.trim() || null })
    if (res?.error) setError(res.error)
  }

  async function handleAddNote() {
    if (!noteInput.trim()) return
    setNoteSaving(true)
    const res = await addActivityLogEntry(boardId, noteInput.trim())
    setNoteSaving(false)
    if (res?.error) { setError(res.error); return }
    if (res.entry) {
      setActivityLog(prev => [{ id: res.entry.id, entry_time: res.entry.entry_time, note: res.entry.note, author_name: currentUserName, lane_id: null }, ...prev])
    }
    setNoteInput('')
  }

  async function handleLogStamp() {
    setStampSaving(true)
    const res = await logBoardStamp(boardId, noteInput)
    setStampSaving(false)
    if (res?.error) { setError(res.error); return }
    if (res.entry) {
      setActivityLog(prev => [{ id: res.entry.id, entry_time: res.entry.entry_time, note: res.entry.note, author_name: currentUserName, lane_id: null }, ...prev])
    }
    setNoteInput('')
  }

  async function handleDeleteLane(lane: Lane, occupied: boolean) {
    if (occupied) { setError('Move everyone out of this lane before deleting it.'); return }
    if (!confirm(`Delete lane "${lane.name}"?`)) return
    const res = await deleteLane(lane.id)
    if (res?.error) { setError(res.error); return }
    setLanes(prev => prev.filter(l => l.id !== lane.id))
  }

  async function handleCheckInResource() {
    if (!resourceApparatusId && !resourceDescription.trim()) { setError('Pick an apparatus or type a description.'); return }
    setResourceSaving(true)
    const kindValue = resourceKind === 'Other' ? resourceKindOther.trim() : resourceKind
    const res = await checkInResource(
      boardId, stagingLane?.id ?? null,
      resourceApparatusId || null, resourceDescription.trim() || null, resourceAgency.trim() || null,
      kindValue || null, resourceTypeTier || null,
    )
    setResourceSaving(false)
    if (res?.error) { setError(res.error); return }
    if (res.resource) setResources(prev => [...prev, { ...res.resource, display_desc: resolveResourceDisplay(res.resource) }])
    setResourceApparatusId(''); setResourceDescription(''); setResourceAgency(''); setResourceKind(''); setResourceKindOther(''); setResourceTypeTier('')
    setResourceFormOpen(false)
  }

  async function handleMoveResource(resourceId: string, laneId: string) {
    setResources(prev => prev.map(r => r.id === resourceId ? { ...r, lane_id: laneId } : r))
    setEntries(prev => prev.map(e => e.resource_id === resourceId ? { ...e, lane_id: laneId } : e))
    setMovingResourceId(null)
    const res = await moveResourceToLane(resourceId, laneId)
    if (res?.error) setError(res.error)
  }

  async function handleReleaseResource(resourceId: string) {
    if (!confirm('Release this resource? Attached crew stay where they are.')) return
    const res = await releaseResource(resourceId)
    if (res?.error) { setError(res.error); return }
    setResources(prev => prev.map(r => r.id === resourceId ? { ...r, status: 'released', released_at: new Date().toISOString() } : r))
  }

  async function handleAttachToResource(entryId: string, resourceId: string) {
    const resource = resources.find(r => r.id === resourceId)
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, resource_id: resourceId, lane_id: resource?.lane_id ?? e.lane_id } : e))
    const res = await attachPersonnelToResource(entryId, resourceId)
    if (res?.error) setError(res.error)
  }

  async function handleLogLaneStamp(laneId: string) {
    setStampSaving(true)
    const res = await logBoardStamp(boardId, undefined, laneId)
    setStampSaving(false)
    if (res?.error) { setError(res.error); return }
    if (res.entry) {
      setActivityLog(prev => [{ id: res.entry.id, entry_time: res.entry.entry_time, note: res.entry.note, author_name: currentUserName, lane_id: laneId }, ...prev])
    }
  }

  function renderEntryCard(entry: Entry) {
    // Only offer positions nobody else currently holds — a role someone else is
    // already in disappears from every other entry's list, but stays selectable
    // here if it's this entry's own current assignment.
    const takenRoles = new Set(
      activeEntries.filter(e => e.id !== entry.id && e.ics_role).map(e => e.ics_role)
    )
    const availableCommandRoles = ICS_COMMAND_ROLES.filter(r => !takenRoles.has(r.value) || r.value === entry.ics_role)
    const availableActiveViolenceRoles = ICS_ACTIVE_VIOLENCE_ROLES.filter(r => !takenRoles.has(r.value) || r.value === entry.ics_role)
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm w-full">
        <div onClick={() => isOfficerOrAbove ? setMovingEntryId(entry.id) : undefined}
          className={`flex-1 min-w-0 ${isOfficerOrAbove ? 'cursor-pointer' : ''}`}>
          <p className="text-sm font-medium text-zinc-900 truncate">{entry.display_name}</p>
          {entry.display_dept && <p className="text-xs text-zinc-400 truncate">{entry.display_dept}</p>}
        </div>
        {isOfficerOrAbove ? (
          <select
            value={entry.ics_role ?? ''}
            onClick={e => e.stopPropagation()}
            onChange={e => handleSetIcsRole(entry.id, e.target.value || null)}
            className="shrink-0 max-w-[130px] rounded border border-zinc-300 px-1 py-1 text-xs focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
            <option value="">ICS Role —</option>
            <optgroup label="Command">
              {availableCommandRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </optgroup>
            {isActiveViolence && (
              <optgroup label="Active Violence">
                {availableActiveViolenceRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </optgroup>
            )}
          </select>
        ) : entry.ics_role ? (
          <span className="shrink-0 text-xs font-semibold text-red-700">{icsRoleLabel(entry.ics_role)}</span>
        ) : null}
        {isOfficerOrAbove && !entry.resource_id && resources.filter(r => r.status !== 'released').length > 0 && (
          <select value="" onClick={e => e.stopPropagation()}
            onChange={e => e.target.value && handleAttachToResource(entry.id, e.target.value)}
            title="Attach to a resource's crew"
            className="shrink-0 max-w-[90px] rounded border border-zinc-300 px-1 py-1 text-xs focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
            <option value="">+ Crew of…</option>
            {resources.filter(r => r.status !== 'released').map(r => <option key={r.id} value={r.id}>{r.display_desc}</option>)}
          </select>
        )}
      </div>
    )
  }

  function openEditName(entry: Entry) {
    setMovingEntryId(null)
    setEditingEntryId(entry.id)
    setEditName(entry.raw_name ?? entry.display_name)
    setEditDept(entry.raw_dept ?? entry.display_dept ?? '')
  }

  async function handleEditName() {
    if (!editingEntryId) return
    setEditSaving(true)
    const res = await updateEntryName(editingEntryId, editName, editDept || null)
    setEditSaving(false)
    if (res?.error) { setError(res.error); return }
    setEntries(prev => prev.map(e => e.id === editingEntryId
      ? { ...e, raw_name: editName.trim(), raw_dept: editDept.trim() || null, display_name: editName.trim(), display_dept: editDept.trim() }
      : e
    ))
    setEditingEntryId(null)
  }

  async function handleManualAdd() {
    setManualSaving(true)
    setError(null)
    const laneId = manualLaneId || stagingLane?.id || null
    const personnelId = manualPersonnelId || null
    const rawName = personnelId ? null : (manualName.trim() || null)
    const rawDept = personnelId ? null : (manualDept.trim() || null)
    const dp = deptPersonnel.find(p => p.id === personnelId)
    const displayName = dp?.name ?? manualName.trim()
    const displayDept = personnelId ? deptAndTitle(personnelId) : manualDept.trim()
    const res = await checkInPerson(boardId, laneId, personnelId, rawName, rawDept)
    setManualSaving(false)
    if (res?.error) { setError(res.error); return }
    if (res.entry) {
      setEntries(prev => [...prev, { ...res.entry, display_name: displayName, display_dept: displayDept }])
    }
    setManualOpen(false)
    setManualPersonnelId('')
    setManualName('')
    setManualDept('')
    setManualLaneId('')
  }

  async function handlePAR() {
    setParSaving(true)
    const onScene = entries.filter(e => e.status !== 'released')
    const snapshot = lanes.map(lane => {
      const inLane = onScene.filter(e => e.lane_id === lane.id)
      return { lane_name: lane.name, count: inLane.length, names: inLane.map(e => e.display_name) }
    })
    const unassigned = onScene.filter(e => !e.lane_id)
    if (unassigned.length) snapshot.push({ lane_name: 'Unassigned', count: unassigned.length, names: unassigned.map(e => e.display_name) })
    const res = await recordPAR(boardId, snapshot)
    setParSaving(false)
    if (res?.error) { setError(res.error); return }
    setParDone(true)
    setTimeout(() => setParDone(false), 3000)
  }

  if (lanes.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-zinc-500 mb-4">No lanes set up yet. Start accountability to load your department's default lanes.</p>
        {isOfficerOrAbove && (
          <button type="button" onClick={handleInit}
            className="rounded-lg bg-red-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800 transition-colors">
            Start Accountability
          </button>
        )}
      </div>
    )
  }

  const movingEntry = movingEntryId ? entries.find(e => e.id === movingEntryId) : null
  const activeEntries = entries.filter(e => e.status !== 'released')
  const releasedEntries = entries.filter(e => e.status === 'released')
    .sort((a, b) => new Date(b.released_at ?? 0).getTime() - new Date(a.released_at ?? 0).getTime())

  // A lane never disappears if anyone's actually checked into it — only empty
  // lanes get hidden/shown based on which mode(s) are currently active. Lanes with
  // no profile (added ad hoc via + Lane) always show, regardless of mode.
  const visibleLanes = lanes.filter(lane => {
    if (activeEntries.some(e => e.lane_id === lane.id)) return true
    if (lane.profile === 'default') return !nimsMode && !isActiveViolence
    if (lane.profile === 'ics') return nimsMode
    if (lane.profile === 'active_violence') return isActiveViolence
    return true
  })

  return (
    <div>
      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {isOfficerOrAbove && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button type="button" onClick={() => setScannerOpen(true)}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors">
            Scan Card
          </button>
          <button type="button" onClick={() => setManualOpen(true)}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            Add Manually
          </button>
          <button type="button" onClick={() => setAddingLane(true)}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            + Lane
          </button>
          {nimsMode && (
            <button type="button" onClick={() => setResourceFormOpen(true)}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              + Resource
            </button>
          )}
          <button type="button" disabled={parSaving} onClick={handlePAR}
            className="ml-auto rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-900 disabled:opacity-50 transition-colors">
            {parDone ? '✓ PAR Recorded' : parSaving ? 'Recording...' : 'PAR'}
          </button>
        </div>
      )}

      {scannerOpen && (
        <div className="mb-4">
          <QRScanner onScan={handleScan} onClose={() => setScannerOpen(false)} hint="Scan FireOps7 QR or Salamander PDF417" />
        </div>
      )}

      {resourceFormOpen && (
        <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 space-y-2">
          <p className="text-sm font-semibold text-zinc-900">Check In Resource</p>
          <select value={resourceApparatusId} onChange={e => { setResourceApparatusId(e.target.value); if (e.target.value) setResourceDescription('') }}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
            <option value="">— Pick your own apparatus (optional) —</option>
            {fleetApparatus.map(a => <option key={a.id} value={a.id}>{a.unit_number}</option>)}
          </select>
          {!resourceApparatusId && (
            <input value={resourceDescription} onChange={e => setResourceDescription(e.target.value)}
              placeholder="Or describe it (e.g. Engine 32, mutual aid)"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
          )}
          <div className="grid grid-cols-2 gap-2">
            <select value={resourceKind} onChange={e => setResourceKind(e.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
              <option value="">Kind —</option>
              {RESOURCE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              <option value="Other">Other…</option>
            </select>
            <select value={resourceTypeTier} onChange={e => setResourceTypeTier(e.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
              <option value="">Type tier (optional)</option>
              {RESOURCE_TYPE_TIERS.map(t => <option key={t} value={t}>Type {t}</option>)}
            </select>
          </div>
          {resourceKind === 'Other' && (
            <input value={resourceKindOther} onChange={e => setResourceKindOther(e.target.value)}
              placeholder="Describe the kind" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
          )}
          <input value={resourceAgency} onChange={e => setResourceAgency(e.target.value)}
            placeholder="Agency (if outside/mutual aid)" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button type="button" disabled={resourceSaving} onClick={handleCheckInResource}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
              {resourceSaving ? 'Checking in…' : 'Check In'}
            </button>
            <button type="button" onClick={() => setResourceFormOpen(false)}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Debug raw scan input */}
      {isOfficerOrAbove && (
        <div className="mb-4">
          {!debugOpen ? (
            <button type="button" onClick={() => setDebugOpen(true)}
              className="text-xs text-zinc-400 hover:text-zinc-600 underline">
              Paste raw scan data
            </button>
          ) : (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 flex flex-col gap-2">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Raw Scan Debug</p>
              <textarea
                autoFocus
                value={debugValue}
                onChange={e => setDebugValue(e.target.value)}
                placeholder="Paste raw card data here..."
                rows={3}
                className="w-full rounded border border-zinc-300 px-2 py-1.5 text-xs font-mono focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              <div className="flex gap-2">
                <button type="button"
                  disabled={!debugValue.trim()}
                  onClick={async () => {
                    await saveDebugScan(debugValue.trim())
                    setDebugSaved(true)
                    setDebugValue('')
                    setTimeout(() => setDebugSaved(false), 2000)
                  }}
                  className="rounded bg-zinc-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50">
                  {debugSaved ? '✓ Saved' : 'Save to DB'}
                </button>
                <button type="button" onClick={() => { setDebugOpen(false); setDebugValue('') }}
                  className="rounded border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-white">
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {addingLane && (
        <div className="flex gap-2 mb-4">
          <input autoFocus value={newLaneName} onChange={e => setNewLaneName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddLane(); if (e.key === 'Escape') setAddingLane(false) }}
            placeholder="Lane name..." className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
          <button type="button" disabled={savingLane} onClick={handleAddLane}
            className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
            {savingLane ? '...' : 'Add'}
          </button>
          <button type="button" onClick={() => setAddingLane(false)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">Cancel</button>
        </div>
      )}

      {movingEntry && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <p className="font-semibold text-zinc-900 mb-1">{movingEntry.display_name}</p>
            <p className="text-sm text-zinc-500 mb-4">Move to which lane?</p>
            <div className="flex flex-col gap-2 mb-3">
              {lanes.map(l => (
                <button key={l.id} type="button" onClick={() => handleMove(movingEntry.id, l.id)}
                  className={`w-full rounded-lg border px-4 py-2.5 text-sm font-medium text-left transition-colors ${
                    movingEntry.lane_id === l.id
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-zinc-200 hover:bg-zinc-50 text-zinc-700'
                  }`}>
                  {l.name}{movingEntry.lane_id === l.id ? ' ✓' : ''}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => handleRelease(movingEntry.id)}
              className="w-full mb-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors">
              Release (Left Scene)
            </button>
            {movingEntry.tag_ref && (
              <div className="w-full mb-2 rounded-lg border border-zinc-200 p-3">
                <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wide">Card Access</label>
                <select
                  value={movingEntry.guest_access_tier ?? ''}
                  disabled={accessTierSaving}
                  onChange={e => handleSetAccessTier(movingEntry.id, (e.target.value || null) as 'self' | 'admin' | null)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  <option value="">Tracking only — no self-access</option>
                  <option value="self">Self-move — they can move only themselves/their resource</option>
                  <option value="admin">Planning / Command — full board control on this device</option>
                </select>
                <p className="mt-1 text-xs text-zinc-400">Scanning this card at fireops7.com/board-guest/scan will get them straight to this board with whatever's picked above.</p>
              </div>
            )}
            {!movingEntry.personnel_id && (
              <button type="button" onClick={() => { handleGenerateGuestLink(movingEntry.id); setMovingEntryId(null) }}
                className="w-full mb-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
                Grant Self-Move Access…
              </button>
            )}
            <div className="flex gap-2">
              {!movingEntry.personnel_id && (
                <button type="button" onClick={() => openEditName(movingEntry)}
                  className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
                  Edit Name
                </button>
              )}
              <button type="button" onClick={() => { handleRemove(movingEntry.id); setMovingEntryId(null) }}
                className="flex-1 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                Remove
              </button>
              <button type="button" onClick={() => setMovingEntryId(null)}
                className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {guestLinkEntryId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <p className="font-semibold text-zinc-900 mb-1">Self-Move Access</p>
            <p className="text-xs text-zinc-500 mb-4">
              No FireOps7 account needed. They can view and move only their own entry (and their resource/crew, if attached) — nothing else on this board. Access ends when this board closes.
            </p>
            {guestLinkBusy && <p className="text-sm text-zinc-500">Generating…</p>}
            {guestLinkUrl && (
              <>
                <div className="mb-4 rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 break-all">
                  {guestLinkUrl}
                </div>
                <button type="button" onClick={handleCopyGuestLink}
                  className="w-full mb-2 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
                  {guestLinkCopied ? 'Copied ✓' : 'Copy Link'}
                </button>
              </>
            )}
            <button type="button" onClick={() => setGuestLinkEntryId(null)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
              Done
            </button>
          </div>
        </div>
      )}

      {movingResourceId && (() => {
        const resource = resources.find(r => r.id === movingResourceId)
        if (!resource) return null
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
              <p className="font-semibold text-zinc-900 mb-1">{resource.display_desc}</p>
              <p className="text-sm text-zinc-500 mb-4">Move this resource (and its attached crew) to which lane?</p>
              <div className="flex flex-col gap-2 mb-3">
                {lanes.map(l => (
                  <button key={l.id} type="button" onClick={() => handleMoveResource(resource.id, l.id)}
                    className={`w-full rounded-lg border px-4 py-2.5 text-sm font-medium text-left transition-colors ${
                      resource.lane_id === l.id ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-zinc-200 hover:bg-zinc-50 text-zinc-700'
                    }`}>
                    {l.name}{resource.lane_id === l.id ? ' ✓' : ''}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setMovingResourceId(null)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
                Cancel
              </button>
            </div>
          </div>
        )
      })()}

      {manualOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <p className="font-semibold text-zinc-900 mb-4">Add Person Manually</p>
            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wide">Dept Member</label>
                <select value={manualPersonnelId} onChange={e => setManualPersonnelId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                  <option value="">— Select member or enter name below —</option>
                  {deptPersonnel.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {!manualPersonnelId && (
                <>
                  <input value={manualName} onChange={e => setManualName(e.target.value)}
                    placeholder="Name (mutual aid / visitor)" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                  <input value={manualDept} onChange={e => setManualDept(e.target.value)}
                    placeholder="Agency / Department" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                </>
              )}
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wide">Lane</label>
                <select value={manualLaneId} onChange={e => setManualLaneId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                  <option value="">Staging (default)</option>
                  {lanes.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={manualSaving || (!manualPersonnelId && !manualName.trim())} onClick={handleManualAdd}
                className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                {manualSaving ? 'Adding...' : 'Add'}
              </button>
              <button type="button" onClick={() => setManualOpen(false)}
                className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {editingEntryId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <p className="font-semibold text-zinc-900 mb-4">Edit Name</p>
            <div className="flex flex-col gap-3 mb-4">
              <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                placeholder="Name" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              <input value={editDept} onChange={e => setEditDept(e.target.value)}
                placeholder="Agency / Department (optional)" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={editSaving || !editName.trim()} onClick={handleEditName}
                className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                {editSaving ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditingEntryId(null)}
                className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {nameTagOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <p className="font-semibold text-zinc-900 mb-1">Name This Tag</p>
            <p className="text-xs text-zinc-500 mb-4">This is a rapid tag — it doesn&apos;t carry a name. Enter who it was handed to for this incident.</p>
            <div className="flex flex-col gap-3 mb-4">
              <input autoFocus value={tagName} onChange={e => setTagName(e.target.value)}
                placeholder="Name" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              <input value={tagDept} onChange={e => setTagDept(e.target.value)}
                placeholder="Agency / Department (optional)" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wide">Card Access (optional)</label>
                <select value={tagAccessTier} onChange={e => setTagAccessTier(e.target.value as '' | 'self' | 'admin')}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                  <option value="">Tracking only — no self-access</option>
                  <option value="self">Self-move — they can move only themselves/their resource</option>
                  <option value="admin">Planning / Command — full board control on this device</option>
                </select>
                <p className="mt-1 text-xs text-zinc-400">If they scan this same card at fireops7.com/board-guest/scan, it'll get them straight to this board with the access picked above — no link to send.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={tagSaving || !tagName.trim()} onClick={handleNameTag}
                className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                {tagSaving ? 'Saving...' : 'Check In'}
              </button>
              <button type="button" onClick={() => { setNameTagOpen(false); pendingTagRawRef.current = null; setTagAccessTier('') }}
                className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {mergeCandidate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <p className="font-semibold text-zinc-900 mb-1">Same Person?</p>
            <p className="text-sm text-zinc-600 mb-4">
              <strong>{mergeCandidate.existingName}</strong> is already {mergeCandidate.wasReleased ? 'on this board (released)' : 'checked in'} under a quick tag.
              This card belongs to <strong>{mergeCandidate.newDisplayName}</strong>. Same person?
            </p>
            <div className="flex flex-col gap-2">
              <button type="button" disabled={mergeSaving} onClick={handleConfirmMerge}
                className="w-full rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                {mergeSaving ? 'Saving...' : 'Yes — Link to This Card'}
              </button>
              <button type="button" disabled={mergeSaving} onClick={handleDeclineMerge}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
                No — Different Person, Check In Separately
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3">
        {isActiveViolence && (
          <p className="text-sm font-semibold text-red-700">⚠ Active Violence / Mass Casualty Event</p>
        )}
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wide">Objectives</label>
          <textarea disabled={!isOfficerOrAbove} defaultValue={initialObjectives ?? ''} rows={2}
            onBlur={e => handleSaveBoardField('objectives', e.target.value)}
            placeholder={isOfficerOrAbove ? 'Incident objectives...' : 'None set'}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-50 disabled:text-zinc-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wide">Safety Message</label>
          <textarea disabled={!isOfficerOrAbove} defaultValue={initialSafetyMessage ?? ''} rows={2}
            onBlur={e => handleSaveBoardField('safety_message', e.target.value)}
            placeholder={isOfficerOrAbove ? 'Safety message...' : 'None set'}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-50 disabled:text-zinc-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wide">Weather</label>
          <input disabled={!isOfficerOrAbove} defaultValue={initialWeather ?? ''}
            onBlur={e => handleSaveBoardField('weather', e.target.value)}
            placeholder={isOfficerOrAbove ? 'Weather / conditions...' : 'None set'}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-50 disabled:text-zinc-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {visibleLanes.map(lane => {
          const resourcesInLane = resources.filter(r => r.lane_id === lane.id && r.status !== 'released')
          const inLane = activeEntries.filter(e => e.lane_id === lane.id && !e.resource_id)
          const totalInLane = activeEntries.filter(e => e.lane_id === lane.id).length + resourcesInLane.length
          return (
            <div key={lane.id} className="rounded-xl border border-zinc-200 bg-zinc-50 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 bg-zinc-100 border-b border-zinc-200">
                {nimsMode && isOfficerOrAbove && renamingLaneId === lane.id ? (
                  <input autoFocus key={`${lane.id}-rename`} defaultValue={lane.name}
                    onBlur={e => handleRenameLane(lane, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    className="text-xs font-semibold uppercase tracking-wide text-zinc-600 shrink-0 rounded border border-red-300 px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-red-500 w-32" />
                ) : nimsMode && isOfficerOrAbove ? (
                  <button type="button" onClick={() => setRenamingLaneId(lane.id)}
                    className="text-xs font-semibold uppercase tracking-wide text-zinc-600 shrink-0 hover:underline decoration-dashed underline-offset-2"
                    title="Rename lane">
                    {lane.name} ✎
                  </button>
                ) : (
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600 shrink-0">{lane.name}</span>
                )}
                {isOfficerOrAbove ? (
                  <input key={`${lane.id}-wa`} defaultValue={lane.work_assignment ?? ''}
                    onBlur={e => handleLaneWorkAssignmentBlur(lane, e.target.value)}
                    placeholder="Work assignment / instructions..."
                    className="flex-1 min-w-0 rounded border border-zinc-300 bg-white px-2 py-1 text-xs focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
                ) : lane.work_assignment ? (
                  <span className="flex-1 min-w-0 truncate text-xs italic text-zinc-500">{lane.work_assignment}</span>
                ) : <span className="flex-1" />}
                <span className="text-xs text-zinc-400 shrink-0">{totalInLane}</span>
                {isOfficerOrAbove && (
                  <button type="button" disabled={stampSaving} onClick={() => handleLogLaneStamp(lane.id)}
                    title="Log a 214 stamp for just this lane's current crew"
                    className="shrink-0 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors">
                    214
                  </button>
                )}
                {isOfficerOrAbove && (
                  <button type="button" onClick={() => handleDeleteLane(lane, totalInLane > 0)}
                    title={totalInLane > 0 ? 'Move everyone out before deleting' : 'Delete lane'}
                    className="shrink-0 text-zinc-300 hover:text-red-600 disabled:opacity-30 text-sm leading-none px-0.5">
                    ✕
                  </button>
                )}
              </div>
              {resourcesInLane.map(resource => {
                const crew = activeEntries.filter(e => e.resource_id === resource.id)
                return (
                  <div key={resource.id} className="mx-3 mt-3 rounded-lg border border-blue-200 bg-blue-50 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 border-b border-blue-200">
                      <span className="text-xs font-bold text-blue-900 shrink-0">{resource.display_desc}</span>
                      {resource.kind && <span className="text-xs text-blue-700 shrink-0">· {resource.kind}{resource.type_tier ? ` (Type ${resource.type_tier})` : ''}</span>}
                      {resource.raw_agency && <span className="text-xs text-blue-700 shrink-0">({resource.raw_agency})</span>}
                      <span className="text-xs text-blue-500 shrink-0 ml-auto">{crew.length} crew</span>
                      {isOfficerOrAbove && (
                        <button type="button" onClick={() => setMovingResourceId(resource.id)}
                          className="shrink-0 text-xs font-semibold text-blue-700 hover:underline">Move</button>
                      )}
                      {isOfficerOrAbove && (
                        <button type="button" onClick={() => handleReleaseResource(resource.id)}
                          className="shrink-0 text-xs font-semibold text-zinc-500 hover:text-red-600">Release</button>
                      )}
                    </div>
                    <div className="p-2 flex flex-col gap-1.5">
                      {crew.length === 0 && <p className="text-xs text-blue-400 text-center py-1">No crew attached</p>}
                      {crew.map(entry => <div key={entry.id}>{renderEntryCard(entry)}</div>)}
                    </div>
                  </div>
                )
              })}
              <div className="p-3 flex flex-col gap-2 min-h-[48px]">
                {inLane.length === 0 && resourcesInLane.length === 0 && <p className="text-xs text-zinc-400 text-center py-2">Empty</p>}
                {inLane.map(entry => (
                  <div key={entry.id} className="flex items-center gap-1.5">
                    {isOfficerOrAbove ? (
                      <button type="button" title="Mark as lane leader" onClick={() => handleToggleLeader(lane, entry)}
                        className={`shrink-0 text-lg leading-none ${lane.leader_entry_id === entry.id ? 'text-amber-500' : 'text-zinc-300 hover:text-amber-400'}`}>
                        ★
                      </button>
                    ) : lane.leader_entry_id === entry.id ? (
                      <span className="shrink-0 text-lg leading-none text-amber-500">★</span>
                    ) : null}
                    {renderEntryCard(entry)}
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {activeEntries.filter(e => !e.lane_id).length > 0 && (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 overflow-hidden">
            <div className="px-4 py-2 bg-yellow-100 border-b border-yellow-200">
              <span className="text-xs font-semibold uppercase tracking-wide text-yellow-700">Unassigned</span>
            </div>
            <div className="p-3 flex flex-col gap-2">
              {activeEntries.filter(e => !e.lane_id).map(entry => (
                <div key={entry.id}>{renderEntryCard(entry)}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {activeEntries.length === 0 && (
        <p className="text-center text-sm text-zinc-400 mt-6">No one checked in yet. Scan a card or add manually.</p>
      )}

      {releasedEntries.length > 0 && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 overflow-hidden">
          <div className="px-4 py-2 bg-zinc-100 border-b border-zinc-200">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Released ({releasedEntries.length})</span>
          </div>
          <div className="p-3 flex flex-col gap-1.5">
            {releasedEntries.map(entry => (
              <div key={entry.id} className="flex items-center justify-between gap-2 text-sm text-zinc-500">
                <span className="truncate">
                  {entry.display_name}
                  {entry.released_at && (
                    <span className="ml-2 text-xs text-zinc-400">
                      left {new Date(entry.released_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  )}
                </span>
                {isOfficerOrAbove && (
                  <button type="button" onClick={() => handleReactivate(entry.id)}
                    className="shrink-0 text-xs font-medium text-red-700 hover:underline">
                    ↩ Reactivate
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Activity Log</p>
          {isOfficerOrAbove && (
            <button type="button" disabled={stampSaving} onClick={handleLogStamp}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors">
              {stampSaving ? 'Logging…' : 'Log 214'}
            </button>
          )}
        </div>
        <div className="flex gap-2 mb-3">
          <input value={noteInput} onChange={e => setNoteInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddNote() }}
            placeholder="Add a timestamped note..."
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
          <button type="button" disabled={noteSaving || !noteInput.trim()} onClick={handleAddNote}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
            {noteSaving ? '...' : 'Add'}
          </button>
        </div>
        {lanes.length > 0 && (
          <select value={activityLogFilter} onChange={e => setActivityLogFilter(e.target.value)}
            className="mb-2 rounded-lg border border-zinc-300 px-2 py-1 text-xs focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
            <option value="all">All lanes</option>
            {lanes.map(l => <option key={l.id} value={l.id}>{l.name} only</option>)}
          </select>
        )}
        <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
          {(() => {
            const filtered = activityLogFilter === 'all' ? activityLog : activityLog.filter(a => a.lane_id === activityLogFilter)
            if (filtered.length === 0) return <p className="text-xs text-zinc-400 text-center py-2">No activity logged yet.</p>
            return filtered.map(a => (
              <div key={a.id} className="text-xs text-zinc-600 border-b border-zinc-100 pb-1.5 last:border-0">
                <span className="font-mono text-zinc-400">
                  {new Date(a.entry_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
                {' · '}<span className="font-medium text-zinc-700">{a.author_name}</span>
                {a.lane_id && <span className="text-zinc-400"> ({lanes.find(l => l.id === a.lane_id)?.name ?? 'lane'})</span>}
                {' — '}{a.note}
              </div>
            ))
          })()}
        </div>
      </div>
    </div>
  )
}
