'use server'

import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'
import { parseSalamanderCard, salamanderCanonicalKey, isFireOps7Card, parseFireOps7Card } from '@/lib/salamander'
import { saveDebugScan } from '@/app/actions/accountability'

function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex')
}

// ─── Dept Admin: Manage Kiosk Devices ─────────────────────────────────────────

export async function createKioskDevice(deviceName: string) {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx?.departmentId) return { error: 'Not authenticated.' }
  if (!(await hasPermission(ctx, 'manage_kiosk_devices'))) return { error: 'Only admins can create kiosk devices.' }
  if (!deviceName.trim()) return { error: 'Device name is required.' }

  const secret = crypto.randomBytes(24).toString('base64url')
  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('kiosk_devices')
    .insert({ department_id: ctx.departmentId, device_name: deviceName.trim(), secret_hash: hashSecret(secret), created_by: ctx.personnelId })
    .select('id')
    .single()

  if (error) { await logError(error.message, '/dept-admin', { department_id: ctx.departmentId }); return { error: error.message } }
  revalidatePath('/dept-admin')
  return { success: true, deviceId: data.id, secret }
}

export async function listKioskDevices() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx?.departmentId) return { error: 'Not authenticated.' }
  if (!(await hasPermission(ctx, 'manage_kiosk_devices'))) return { error: 'Only admins can view kiosk devices.' }

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('kiosk_devices')
    .select('id, device_name, created_at, revoked_at')
    .eq('department_id', ctx.departmentId)
    .order('created_at', { ascending: false })

  if (error) { await logError(error.message, '/dept-admin', { department_id: ctx.departmentId }); return { error: error.message } }
  return { devices: data ?? [] }
}

export async function revokeKioskDevice(deviceId: string) {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx?.departmentId) return { error: 'Not authenticated.' }
  if (!(await hasPermission(ctx, 'manage_kiosk_devices'))) return { error: 'Only admins can revoke kiosk devices.' }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('kiosk_devices')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', deviceId)
    .eq('department_id', ctx.departmentId)

  if (error) { await logError(error.message, '/dept-admin', { department_id: ctx.departmentId, metadata: { deviceId } }); return { error: error.message } }
  revalidatePath('/dept-admin')
  return { success: true }
}

// ─── Kiosk Device (no user session — verified by device credential) ──────────

async function verifyDevice(deviceId: string, secret: string) {
  const adminClient = createAdminClient()
  const { data: device } = await adminClient
    .from('kiosk_devices')
    .select('id, department_id, revoked_at, secret_hash')
    .eq('id', deviceId)
    .single()

  if (!device || device.revoked_at) return null
  const providedHash = hashSecret(secret)
  const a = Buffer.from(providedHash)
  const b = Buffer.from(device.secret_hash)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  return { departmentId: device.department_id as string, adminClient }
}

async function isActiveDeptMember(adminClient: ReturnType<typeof createAdminClient>, personnelId: string, departmentId: string) {
  const { data } = await adminClient
    .from('department_personnel')
    .select('id')
    .eq('personnel_id', personnelId)
    .eq('department_id', departmentId)
    .eq('active', true)
    .maybeSingle()
  return !!data
}

async function fetchRoster(adminClient: ReturnType<typeof createAdminClient>, departmentId: string) {
  const { data: present } = await adminClient
    .from('station_presence')
    .select('id, personnel_id, raw_name, raw_dept, checked_in_at')
    .eq('department_id', departmentId)
    .is('checked_out_at', null)
    .order('checked_in_at')

  const personnelIds = (present ?? []).map(p => p.personnel_id).filter((id): id is string => !!id)
  const { data: personnelRows } = personnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', personnelIds)
    : { data: [] }
  const nameMap = new Map((personnelRows ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`.trim()]))

  return (present ?? []).map(p => ({
    id: p.id,
    name: p.personnel_id ? (nameMap.get(p.personnel_id) ?? 'Unknown') : (p.raw_name ?? 'Unknown'),
    dept: p.raw_dept,
    checked_in_at: p.checked_in_at,
  }))
}

export async function getKioskContext(deviceId: string, secret: string) {
  const verified = await verifyDevice(deviceId, secret)
  if (!verified) return { error: 'This device is not set up or has been revoked.' }

  const { data: dept } = await verified.adminClient.from('departments').select('name').eq('id', verified.departmentId).single()
  const roster = await fetchRoster(verified.adminClient, verified.departmentId)
  return { deptName: dept?.name ?? 'Department', roster }
}

export async function kioskScan(deviceId: string, secret: string, raw: string) {
  const verified = await verifyDevice(deviceId, secret)
  if (!verified) return { error: 'This device is not set up or has been revoked.' }
  const { adminClient, departmentId } = verified

  // Resolve the scanned card to a personnel_id (or raw name/dept for unmatched cards)
  let personnelId: string | null = null
  let rawName: string | null = null
  let rawDept: string | null = null

  if (isFireOps7Card(raw)) {
    personnelId = parseFireOps7Card(raw)
  } else {
    const card = parseSalamanderCard(raw)
    if (card) {
      const key = salamanderCanonicalKey(card)
      const { data: token } = await adminClient
        .from('personnel_qr_tokens')
        .select('personnel_id')
        .eq('token_type', 'salamander')
        .eq('token_value', key)
        .single()
      if (token) {
        personnelId = token.personnel_id
      } else {
        rawName = `${card.firstName} ${card.lastName}`
        rawDept = card.department
      }
    } else {
      await saveDebugScan(raw, 'kiosk')
      return { error: 'Card not recognized. Try again or use manual entry.' }
    }
  }

  let personName: string | null = null
  if (personnelId) {
    if (!(await isActiveDeptMember(adminClient, personnelId, departmentId))) {
      await saveDebugScan(raw, 'kiosk')
      return { error: 'Card not recognized. Try again or use manual entry.' }
    }
    const { data: person } = await adminClient.from('personnel').select('first_name, last_name').eq('id', personnelId).single()
    if (!person) return { error: 'Personnel record not found.' }
    personName = `${person.first_name} ${person.last_name}`.trim()
    rawName = null
  }

  // Toggle presence: check out if already checked in, otherwise check in
  let existingQuery = adminClient
    .from('station_presence')
    .select('id')
    .eq('department_id', departmentId)
    .is('checked_out_at', null)
  existingQuery = personnelId
    ? existingQuery.eq('personnel_id', personnelId)
    : existingQuery.match({ raw_name: rawName, raw_dept: rawDept })
  const { data: existing } = await existingQuery.maybeSingle()

  let action: 'checked_in' | 'checked_out'

  if (existing) {
    action = 'checked_out'
    const { error } = await adminClient.from('station_presence').update({ checked_out_at: new Date().toISOString() }).eq('id', existing.id)
    if (error) { await logError(error.message, '/kiosk', { department_id: departmentId }); return { error: error.message } }
  } else {
    action = 'checked_in'
    const { error } = await adminClient.from('station_presence').insert({
      department_id: departmentId, personnel_id: personnelId, raw_name: rawName, raw_dept: rawDept, kiosk_device_id: deviceId,
    })
    if (error) { await logError(error.message, '/kiosk', { department_id: departmentId }); return { error: error.message } }
  }

  const displayName = personName ?? rawName ?? 'Unknown'
  const roster = await fetchRoster(adminClient, departmentId)
  return { success: true, action, displayName, roster }
}

// ─── Kiosk Device Manual Entry (no scan) ──────────────────────────────────────

export async function kioskManualEntry(deviceId: string, secret: string, personnelId: string) {
  const verified = await verifyDevice(deviceId, secret)
  if (!verified) return { error: 'This device is not set up or has been revoked.' }
  const { adminClient, departmentId } = verified

  if (!(await isActiveDeptMember(adminClient, personnelId, departmentId))) return { error: 'Personnel record not found.' }

  const { data: person } = await adminClient.from('personnel').select('first_name, last_name').eq('id', personnelId).single()
  if (!person) return { error: 'Personnel record not found.' }

  const { data: existing } = await adminClient
    .from('station_presence')
    .select('id')
    .eq('department_id', departmentId)
    .eq('personnel_id', personnelId)
    .is('checked_out_at', null)
    .maybeSingle()

  let action: 'checked_in' | 'checked_out'
  if (existing) {
    action = 'checked_out'
    const { error } = await adminClient.from('station_presence').update({ checked_out_at: new Date().toISOString() }).eq('id', existing.id)
    if (error) { await logError(error.message, '/kiosk', { department_id: departmentId, metadata: { personnelId } }); return { error: error.message } }
  } else {
    action = 'checked_in'
    const { error } = await adminClient.from('station_presence').insert({ department_id: departmentId, personnel_id: personnelId, kiosk_device_id: deviceId })
    if (error) { await logError(error.message, '/kiosk', { department_id: departmentId, metadata: { personnelId } }); return { error: error.message } }
  }

  const roster = await fetchRoster(adminClient, departmentId)
  return { success: true, action, displayName: `${person.first_name} ${person.last_name}`.trim(), roster }
}

export async function getKioskRosterPickerList(deviceId: string, secret: string) {
  const verified = await verifyDevice(deviceId, secret)
  if (!verified) return { error: 'This device is not set up or has been revoked.' }

  const { data: deptPersonnelRaw } = await verified.adminClient
    .from('department_personnel')
    .select('personnel_id')
    .eq('department_id', verified.departmentId)
    .eq('active', true)

  const personnelIds = (deptPersonnelRaw ?? []).map(p => p.personnel_id)
  const { data: personnelRows } = personnelIds.length > 0
    ? await verified.adminClient.from('personnel').select('id, first_name, last_name').in('id', personnelIds)
    : { data: [] }

  const list = (personnelRows ?? [])
    .map(p => ({ id: p.id, name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() }))
    .filter(p => p.name)
    .sort((a, b) => a.name.localeCompare(b.name))

  return { list }
}
