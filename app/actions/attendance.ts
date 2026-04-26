'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

async function getContext() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) return null
  const { data: myDeptList } = await adminClient.from('department_personnel').select('department_id, system_role').eq('personnel_id', me.id).eq('active', true)
  const myDept = myDeptList?.[0]
  return {
    me,
    department_id: myDept?.department_id ?? null,
    system_role: myDept?.system_role ?? null,
    isAdmin: myDept?.system_role === 'admin' || me.is_sys_admin,
    isOfficerOrAbove: myDept?.system_role === 'admin' || myDept?.system_role === 'officer' || me.is_sys_admin,
  }
}

// ─── Generate instances for a series (up to 1 year out) ──────────────────────
function getNextOccurrences(series: {
  recurrence_type: string
  recurrence_day_of_week: number | null
  recurrence_week_of_month: number | null
  recurrence_date: number | null
  start_time: string | null
}, fromDate: Date, toDate: Date): Date[] {
  const dates: Date[] = []
  const current = new Date(fromDate)
  current.setHours(0, 0, 0, 0)
  const end = new Date(toDate)
  end.setHours(23, 59, 59, 999)

  if (series.recurrence_type === 'one_time') return []

  while (current <= end) {
    const d = new Date(current)

    if (series.recurrence_type === 'weekly') {
      if (d.getDay() === series.recurrence_day_of_week) dates.push(new Date(d))
      current.setDate(current.getDate() + 1)
    } else if (series.recurrence_type === 'monthly_by_dow') {
      // Check if this day matches the day-of-week and week-of-month
      if (d.getDay() === series.recurrence_day_of_week) {
        const weekNum = Math.ceil(d.getDate() / 7)
        if (weekNum === series.recurrence_week_of_month) dates.push(new Date(d))
      }
      current.setDate(current.getDate() + 1)
    } else if (series.recurrence_type === 'monthly_by_date') {
      if (d.getDate() === series.recurrence_date) dates.push(new Date(d))
      current.setDate(current.getDate() + 1)
    } else {
      break
    }
  }

  return dates
}

// ─── Create Event Series ──────────────────────────────────────────────────────
export async function createEventSeries(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can create events.' }

  const adminClient = createAdminClient()
  const department_id = ctx.department_id
  if (!department_id) return { error: 'Department not found.' }

  const title = formData.get('title') as string
  const event_type = formData.get('event_type') as string
  const description = formData.get('description') as string
  const location = formData.get('location') as string
  const recurrence_type = formData.get('recurrence_type') as string
  const recurrence_day_of_week = formData.get('recurrence_day_of_week') as string
  const recurrence_week_of_month = formData.get('recurrence_week_of_month') as string
  const recurrence_date = formData.get('recurrence_date') as string
  const start_time = formData.get('start_time') as string
  const duration_minutes = formData.get('duration_minutes') as string
  const requires_verification = formData.get('requires_verification') !== 'false'
  const event_date = formData.get('event_date') as string // for one_time

  if (!title || !event_type || !recurrence_type) return { error: 'Title, type, and recurrence are required.' }

  const oneYearOut = new Date()
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1)

  const { data: series, error: seriesErr } = await adminClient.from('event_series').insert({
    department_id,
    event_type,
    title,
    description: description || null,
    location: location || null,
    recurrence_type,
    recurrence_day_of_week: recurrence_day_of_week ? parseInt(recurrence_day_of_week) : null,
    recurrence_week_of_month: recurrence_week_of_month ? parseInt(recurrence_week_of_month) : null,
    recurrence_date: recurrence_date ? parseInt(recurrence_date) : null,
    start_time: start_time || null,
    duration_minutes: duration_minutes ? parseInt(duration_minutes) : null,
    requires_verification,
    active: true,
    generate_through_date: oneYearOut.toISOString().split('T')[0],
    created_by: ctx.me.id,
  }).select('id').single()

  if (seriesErr) { await logError(seriesErr.message, '/events'); return { error: seriesErr.message } }

  // Generate instances
  if (recurrence_type === 'one_time' && event_date) {
    await adminClient.from('event_instances').insert({
      series_id: series.id,
      event_date,
      start_time: start_time || null,
      location: location || null,
      requires_verification,
      status: 'scheduled',
    })
  } else {
    const today = new Date()
    const occurrences = getNextOccurrences({
      recurrence_type,
      recurrence_day_of_week: recurrence_day_of_week ? parseInt(recurrence_day_of_week) : null,
      recurrence_week_of_month: recurrence_week_of_month ? parseInt(recurrence_week_of_month) : null,
      recurrence_date: recurrence_date ? parseInt(recurrence_date) : null,
      start_time: start_time || null,
    }, today, oneYearOut)

    if (occurrences.length > 0) {
      await adminClient.from('event_instances').insert(
        occurrences.map(d => ({
          series_id: series.id,
          event_date: d.toISOString().split('T')[0],
          start_time: start_time || null,
          location: location || null,
          requires_verification,
          status: 'scheduled',
        }))
      )
    }
  }

  revalidatePath('/events')
  return { success: true, series_id: series.id }
}

// ─── Update Event Instance (this one only) ────────────────────────────────────
export async function updateEventInstance(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can edit events.' }

  const adminClient = createAdminClient()
  const id = formData.get('id') as string
  const location = formData.get('location') as string
  const notes = formData.get('notes') as string
  const status = formData.get('status') as string
  const requires_verification = formData.get('requires_verification') !== 'false'

  const { error } = await adminClient.from('event_instances').update({
    location: location || null,
    notes: notes || null,
    status,
    requires_verification,
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  if (error) { await logError(error.message, '/events'); return { error: error.message } }
  revalidatePath('/events')
  return { success: true }
}

// ─── Update Event Series (this and all future) ────────────────────────────────
export async function updateEventSeries(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can edit events.' }

  const adminClient = createAdminClient()
  const series_id = formData.get('series_id') as string
  const from_date = formData.get('from_date') as string // instances from this date forward get updated
  const title = formData.get('title') as string
  const description = formData.get('description') as string
  const location = formData.get('location') as string
  const start_time = formData.get('start_time') as string
  const duration_minutes = formData.get('duration_minutes') as string
  const requires_verification = formData.get('requires_verification') !== 'false'

  // Update series
  const { error: seriesErr } = await adminClient.from('event_series').update({
    title,
    description: description || null,
    location: location || null,
    start_time: start_time || null,
    duration_minutes: duration_minutes ? parseInt(duration_minutes) : null,
    requires_verification,
    updated_at: new Date().toISOString(),
  }).eq('id', series_id)

  if (seriesErr) { await logError(seriesErr.message, '/events'); return { error: seriesErr.message } }

  // Update future instances that have no attendance yet
  const { data: futureInstances } = await adminClient
    .from('event_instances')
    .select('id')
    .eq('series_id', series_id)
    .gte('event_date', from_date)

  const instanceIds = (futureInstances ?? []).map(i => i.id)

  // Only update instances with no attendance records
  if (instanceIds.length > 0) {
    const { data: attended } = await adminClient
      .from('event_attendance')
      .select('instance_id')
      .in('instance_id', instanceIds)

    const attendedIds = new Set((attended ?? []).map(a => a.instance_id))
    const unattendedIds = instanceIds.filter(id => !attendedIds.has(id))

    if (unattendedIds.length > 0) {
      await adminClient.from('event_instances').update({
        location: location || null,
        requires_verification,
        updated_at: new Date().toISOString(),
      }).in('id', unattendedIds)
    }
  }

  revalidatePath('/events')
  return { success: true }
}

// ─── Log Attendance (self-report or bulk) ─────────────────────────────────────
export async function logAttendance(instance_id: string, personnel_ids: string[], notes?: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }

  const adminClient = createAdminClient()

  // Check if instance exists and get its details
  const { data: instanceList } = await adminClient
    .from('event_instances')
    .select('id, event_date, start_time, requires_verification, series_id')
    .eq('id', instance_id)
  const instance = instanceList?.[0]
  if (!instance) return { error: 'Event not found.' }

  // Self-report window check — 12 hours from event start
  if (!ctx.isOfficerOrAbove) {
    const eventDateTime = new Date(`${instance.event_date}T${instance.start_time || '00:00'}`)
    const windowClose = new Date(eventDateTime.getTime() + 12 * 60 * 60 * 1000)
    if (new Date() > windowClose) {
      return { error: 'Self-report window has closed (12 hours after event start).' }
    }
    // Members can only log themselves
    if (personnel_ids.length !== 1 || personnel_ids[0] !== ctx.me.id) {
      return { error: 'You can only log your own attendance.' }
    }
  }

  const status = instance.requires_verification ? 'pending' : 'present'
  const now = new Date().toISOString()

  const records = personnel_ids.map(pid => ({
    instance_id,
    personnel_id: pid,
    status,
    submitted_by: ctx.me.id,
    submitted_at: now,
    notes: notes || null,
    ...(status === 'present' ? { verified_by: ctx.me.id, verified_at: now } : {}),
  }))

  // Upsert — don't error if already logged
  const { error } = await adminClient
    .from('event_attendance')
    .upsert(records, { onConflict: 'instance_id,personnel_id', ignoreDuplicates: false })

  if (error) { await logError(error.message, '/events'); return { error: error.message } }
  revalidatePath('/events')
  return { success: true }
}

// ─── Verify / Reject Attendance ───────────────────────────────────────────────
export async function verifyAttendance(attendance_id: string, action: 'present' | 'absent' | 'excused', rejection_reason?: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can verify attendance.' }

  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  const { error } = await adminClient.from('event_attendance').update({
    status: action,
    verified_by: ctx.me.id,
    verified_at: now,
    rejection_reason: action === 'absent' ? (rejection_reason || null) : null,
  }).eq('id', attendance_id)

  if (error) { await logError(error.message, '/events'); return { error: error.message } }
  revalidatePath('/events')
  revalidatePath('/reports/my-activity')
  revalidatePath('/dashboard')
  return { success: true }
}

// ─── Request Excuse (member self-submit) ─────────────────────────────────────
export async function requestExcuse(instance_id: string, excuse_type_id: string, notes?: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (ctx.isOfficerOrAbove) return { error: 'Officers use the attendance log directly.' }

  const adminClient = createAdminClient()

  const { data: instanceList } = await adminClient
    .from('event_instances')
    .select('id, event_date')
    .eq('id', instance_id)
  const instance = instanceList?.[0]
  if (!instance) return { error: 'Event not found.' }

  const eventEnd = new Date(instance.event_date + 'T23:59:59')
  const isPastEvent = eventEnd < new Date()
  if (isPastEvent) {
    const windowClose = new Date(eventEnd.getTime() + 7 * 24 * 60 * 60 * 1000)
    if (new Date() > windowClose) {
      return { error: 'Excuse request window has closed (7 days after the event).' }
    }
  }

  const { data: existing } = await adminClient
    .from('event_attendance')
    .select('id')
    .eq('instance_id', instance_id)
    .eq('personnel_id', ctx.me.id)

  if (existing && existing.length > 0) {
    return { error: 'You already have an attendance record for this event.' }
  }

  const { error } = await adminClient.from('event_attendance').insert({
    instance_id,
    personnel_id: ctx.me.id,
    status: 'excused_pending',
    excuse_type_id,
    notes: notes || null,
    submitted_by: ctx.me.id,
    submitted_at: new Date().toISOString(),
  })

  if (error) { await logError(error.message, '/events'); return { error: error.message } }
  revalidatePath('/events')
  revalidatePath('/reports/my-activity')
  return { success: true }
}

// ─── Close Event — mark non-logged members absent, finalize attendance ────────
export async function closeEventInstance(instance_id: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can close events.' }

  const adminClient = createAdminClient()

  // Verify event is past and belongs to this dept
  const { data: instanceList } = await adminClient
    .from('event_instances')
    .select('id, event_date, series_id, status')
    .eq('id', instance_id)
  const instance = instanceList?.[0]
  if (!instance) return { error: 'Event not found.' }
  if (new Date(instance.event_date + 'T23:59:59') >= new Date()) return { error: 'Cannot close a future event.' }
  if (instance.status !== 'scheduled') return { error: 'Event is already closed or cancelled.' }

  const { data: seriesList } = await adminClient
    .from('event_series')
    .select('department_id')
    .eq('id', instance.series_id)
  const department_id = seriesList?.[0]?.department_id
  if (!department_id) return { error: 'Could not determine department.' }

  // Get all active dept members
  const { data: deptPersonnel } = await adminClient
    .from('department_personnel')
    .select('personnel_id')
    .eq('department_id', department_id)
    .eq('active', true)
  const allMemberIds = (deptPersonnel ?? []).map(p => p.personnel_id)

  // Find who already has any record
  const { data: existing } = await adminClient
    .from('event_attendance')
    .select('personnel_id')
    .eq('instance_id', instance_id)
  const existingIds = new Set((existing ?? []).map(e => e.personnel_id))

  const absentIds = allMemberIds.filter(id => !existingIds.has(id))
  const now = new Date().toISOString()

  if (absentIds.length > 0) {
    const { error: insertErr } = await adminClient.from('event_attendance').insert(
      absentIds.map(pid => ({
        instance_id,
        personnel_id: pid,
        status: 'absent',
        submitted_by: ctx.me.id,
        submitted_at: now,
        verified_by: ctx.me.id,
        verified_at: now,
      }))
    )
    if (insertErr) { await logError(insertErr.message, '/events'); return { error: insertErr.message } }
  }

  const { error: updateErr } = await adminClient
    .from('event_instances')
    .update({ status: 'completed', updated_at: now })
    .eq('id', instance_id)
  if (updateErr) { await logError(updateErr.message, '/events'); return { error: updateErr.message } }

  revalidatePath('/events')
  revalidatePath('/reports/my-activity')
  revalidatePath('/dashboard')
  return { success: true, absent_count: absentIds.length }
}

// ─── Cancel Event Instance ─────────────────────────────────────────────────────
export async function cancelEventInstance(instance_id: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can cancel events.' }

  const adminClient = createAdminClient()
  const { error } = await adminClient.from('event_instances').update({
    status: 'cancelled',
    updated_at: new Date().toISOString(),
  }).eq('id', instance_id)

  if (error) { await logError(error.message, '/events'); return { error: error.message } }
  revalidatePath('/events')
  return { success: true }
}

// ─── Create Excuse Type (admin only) ─────────────────────────────────────────
export async function createExcuseType(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage excuse types.' }

  const adminClient = createAdminClient()
  const excuse_name = formData.get('excuse_name') as string
  if (!excuse_name) return { error: 'Excuse name is required.' }

  const { error } = await adminClient.from('excuse_types').insert({
    department_id: ctx.department_id,
    excuse_name,
    active: true,
  })

  if (error) { await logError(error.message, '/dept-admin/attendance'); return { error: error.message } }
  revalidatePath('/dept-admin/attendance')
  return { success: true }
}

// ─── Save Participation Requirements (admin only) ─────────────────────────────
export async function saveParticipationRequirement(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can set participation requirements.' }

  const adminClient = createAdminClient()
  const event_type = formData.get('event_type') as string
  const minimum_percentage = formData.get('minimum_percentage') as string
  const period = formData.get('period') as string

  const { error } = await adminClient.from('participation_requirements').upsert({
    department_id: ctx.department_id,
    event_type,
    minimum_percentage: parseInt(minimum_percentage) || 0,
    period: period || 'monthly',
    active: true,
  }, { onConflict: 'department_id,event_type' })

  if (error) { await logError(error.message, '/dept-admin/attendance'); return { error: error.message } }
  revalidatePath('/dept-admin/attendance')
  return { success: true }
}
