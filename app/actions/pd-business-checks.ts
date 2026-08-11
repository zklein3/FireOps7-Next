'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

async function getContext() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return null
  return {
    personnelId: ctx.personnelId,
    officerName: `${ctx.firstName} ${ctx.lastName}`,
    department_id: ctx.departmentId,
    isOfficerOrAbove: await hasPermission(ctx, 'manage_pd_logs'),
  }
}

function fieldsFromForm(formData: FormData) {
  const check_date = formData.get('check_date') as string
  const time_arrived = formData.get('time_arrived') as string
  const time_cleared = formData.get('time_cleared') as string
  const business_id = formData.get('business_id') as string
  const business_name = formData.get('business_name') as string
  const address = formData.get('address') as string
  const check_type = formData.get('check_type') as string || 'routine'
  const doors_secure = formData.get('doors_secure') === 'on'
  const windows_secure = formData.get('windows_secure') === 'on'
  const lights_as_expected = formData.get('lights_as_expected') === 'on'
  const suspicious_activity = formData.get('suspicious_activity') === 'on'
  const interior_check = formData.get('interior_check') === 'on'
  const interior_authorized_by = formData.get('interior_authorized_by') as string
  const interior_findings = formData.get('interior_findings') as string
  const alarm_status = formData.get('alarm_status') as string
  const owner_notified = formData.get('owner_notified') === 'on'
  const owner_name = formData.get('owner_name') as string
  const owner_notified_time = formData.get('owner_notified_time') as string
  const disposition = formData.get('disposition') as string || 'all_secure'
  const notes = formData.get('notes') as string
  const securedRaw = formData.get('secured_on_departure') as string | null
  const secured_on_departure = securedRaw === 'false' ? false : true

  return {
    check_date,
    time_arrived: time_arrived || null,
    time_cleared: time_cleared || null,
    business_id: business_id || null,
    business_name,
    address: address || null,
    check_type,
    doors_secure,
    windows_secure,
    lights_as_expected,
    suspicious_activity,
    interior_check,
    interior_authorized_by: interior_check ? (interior_authorized_by || null) : null,
    interior_findings: interior_check ? (interior_findings || null) : null,
    alarm_status: alarm_status || null,
    owner_notified,
    owner_name: owner_notified ? (owner_name || null) : null,
    owner_notified_time: owner_notified ? (owner_notified_time || null) : null,
    disposition,
    notes: notes || null,
    secured_on_departure,
  }
}

type RoundDetailOverride = {
  check_type?: string
  doors_secure?: boolean
  windows_secure?: boolean
  lights_as_expected?: boolean
  suspicious_activity?: boolean
  interior_check?: boolean
  interior_authorized_by?: string | null
  interior_findings?: string | null
  alarm_status?: string | null
  owner_notified?: boolean
  owner_name?: string | null
  owner_notified_time?: string | null
  disposition?: string
  notes?: string | null
  secured_on_departure?: boolean
}

// ─── Routine Round (Cover Sheet) ──────────────────────────────────────────────
// One pass through the block: start time, end time, and the businesses that
// were checked. Each selected business gets its own row defaulting to
// "nothing found" unless the officer filled in a detail override for it
// in-form (via the detail sheet) before submitting the round.
export async function createBusinessCheckRound(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Not authorized.' }
  const adminClient = createAdminClient()

  const check_date = formData.get('check_date') as string
  const time_arrived = formData.get('time_arrived') as string
  const time_cleared = formData.get('time_cleared') as string
  const businessIds = formData.getAll('business_ids') as string[]
  const detailsRaw = formData.get('details') as string

  if (!check_date) return { error: 'Date is required.' }
  if (businessIds.length === 0) return { error: 'Select at least one business.' }

  let details: Record<string, RoundDetailOverride> = {}
  if (detailsRaw) {
    try { details = JSON.parse(detailsRaw) } catch { /* ignore malformed input, fall back to defaults */ }
  }

  const { data: businesses, error: bErr } = await adminClient
    .from('pd_businesses')
    .select('id, name, address')
    .eq('department_id', ctx.department_id)
    .in('id', businessIds)

  if (bErr) { await logError(bErr.message, '/forms/business-check'); return { error: bErr.message } }
  if (!businesses || businesses.length === 0) return { error: 'Selected businesses not found.' }

  const round_id = crypto.randomUUID()
  const rows = businesses.map(b => {
    const override = details[b.id] ?? {}
    return {
      department_id: ctx.department_id,
      officer_id: ctx.personnelId,
      officer_name: ctx.officerName,
      round_id,
      business_id: b.id,
      business_name: b.name,
      address: b.address,
      check_date,
      time_arrived: time_arrived || null,
      time_cleared: time_cleared || null,
      check_type: override.check_type || 'routine',
      doors_secure: override.doors_secure ?? false,
      windows_secure: override.windows_secure ?? false,
      lights_as_expected: override.lights_as_expected ?? false,
      suspicious_activity: override.suspicious_activity ?? false,
      interior_check: override.interior_check ?? false,
      interior_authorized_by: override.interior_check ? (override.interior_authorized_by || null) : null,
      interior_findings: override.interior_check ? (override.interior_findings || null) : null,
      alarm_status: override.alarm_status || null,
      owner_notified: override.owner_notified ?? false,
      owner_name: override.owner_notified ? (override.owner_name || null) : null,
      owner_notified_time: override.owner_notified ? (override.owner_notified_time || null) : null,
      disposition: override.disposition || 'all_secure',
      notes: override.notes || null,
      secured_on_departure: override.secured_on_departure ?? true,
    }
  })

  const { error } = await adminClient.from('pd_business_checks').insert(rows)

  if (error) { await logError(error.message, '/forms/business-check'); return { error: error.message } }
  revalidatePath('/forms/business-check')
  return { success: true, count: rows.length }
}

export async function logBusinessCheck(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Not authorized.' }
  const adminClient = createAdminClient()

  const fields = fieldsFromForm(formData)
  if (!fields.check_date) return { error: 'Date is required.' }
  if (!fields.business_name) return { error: 'Business name is required.' }

  const { error } = await adminClient.from('pd_business_checks').insert({
    department_id: ctx.department_id,
    officer_id: ctx.personnelId,
    officer_name: ctx.officerName,
    ...fields,
  })

  if (error) { await logError(error.message, '/forms/business-check'); return { error: error.message } }
  revalidatePath('/forms/business-check')
  return { success: true }
}

export async function updateBusinessCheck(id: string, formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can edit business checks.' }
  const adminClient = createAdminClient()

  const fields = fieldsFromForm(formData)
  if (!fields.check_date) return { error: 'Date is required.' }
  if (!fields.business_name) return { error: 'Business name is required.' }

  const { error } = await adminClient
    .from('pd_business_checks')
    .update(fields)
    .eq('id', id)
    .eq('department_id', ctx.department_id!)

  if (error) { await logError(error.message, '/forms/business-check'); return { error: error.message } }
  revalidatePath('/forms/business-check')
  return { success: true }
}

export async function deleteBusinessCheck(id: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can delete business checks.' }
  const adminClient = createAdminClient()
  const { error } = await adminClient.from('pd_business_checks').delete().eq('id', id).eq('department_id', ctx.department_id!)
  if (error) { await logError(error.message, '/forms/business-check'); return { error: error.message } }
  revalidatePath('/forms/business-check')
  return { success: true }
}
