'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

async function getContext() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return null
  return {
    me: { id: ctx.personnelId, is_sys_admin: ctx.isSysAdmin },
    department_id: ctx.departmentId,
    system_role: ctx.systemRole,
    isAdmin: ctx.systemRole === 'admin' || ctx.isSysAdmin,
    isOfficerOrAbove: ctx.systemRole === 'admin' || ctx.systemRole === 'officer' || ctx.isSysAdmin,
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
  const requires_signature = formData.get('requires_signature') === 'true'
  const event_date = formData.get('event_date') as string // for one_time
  const is_training = formData.get('is_training') === 'true'
  const training_hours = formData.get('training_hours') ? parseFloat(formData.get('training_hours') as string) : null
  const training_cert_type_id = (formData.get('training_cert_type_id') as string) || null
  const training_instructor = (formData.get('training_instructor') as string) || null

  if (!title || !event_type || !recurrence_type) return { error: 'Title, type, and recurrence are required.' }

  // Guard against double-submit (double-click, HMR resetting client state mid-request, etc.) —
  // if the same person just created an identical series in the last 10 seconds, treat this as
  // a resubmit of that request rather than a genuine second event.
  const tenSecondsAgo = new Date(Date.now() - 10_000).toISOString()
  const { data: recentDupe } = await adminClient
    .from('event_series')
    .select('id')
    .eq('department_id', department_id)
    .eq('created_by', ctx.me.id)
    .eq('title', title)
    .eq('event_type', event_type)
    .eq('recurrence_type', recurrence_type)
    .gte('created_at', tenSecondsAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recentDupe) return { success: true, series_id: recentDupe.id }

  const oneYearOut = new Date()
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1)

  const generate_through_date_raw = formData.get('generate_through_date') as string
  const generate_through_date = generate_through_date_raw || oneYearOut.toISOString().split('T')[0]

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
    requires_signature,
    is_training,
    training_hours: is_training ? training_hours : null,
    training_cert_type_id: is_training ? training_cert_type_id : null,
    training_instructor: is_training ? training_instructor : null,
    active: true,
    generate_through_date,
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
      requires_signature,
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
    }, today, new Date(generate_through_date))

    if (occurrences.length > 0) {
      await adminClient.from('event_instances').insert(
        occurrences.map(d => ({
          series_id: series.id,
          event_date: d.toISOString().split('T')[0],
          start_time: start_time || null,
          location: location || null,
          requires_verification,
          requires_signature,
          status: 'scheduled',
        }))
      )
    }
  }

  // If training event, create a training_events row for each generated instance
  if (is_training) {
    const { data: createdInstances } = await adminClient
      .from('event_instances')
      .select('id, event_date')
      .eq('series_id', series.id)

    if (createdInstances?.length) {
      await adminClient.from('training_events').insert(
        createdInstances.map(inst => ({
          department_id,
          event_instance_id: inst.id,
          topic: title,
          description: description || null,
          instructor: training_instructor,
          event_date: inst.event_date,
          hours: training_hours,
          certification_type_id: training_cert_type_id,
          requires_verification,
          start_time: start_time || null,
          location: location || null,
          created_by: ctx.me.id,
        }))
      )
    }
  }

  revalidatePath('/events')
  revalidatePath('/training')
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
  const start_time = formData.get('start_time') as string
  const event_date = formData.get('event_date') as string
  const requires_verification = formData.get('requires_verification') !== 'false'
  const requires_signature = formData.get('requires_signature') === 'true'
  const title = formData.get('title') as string | null
  const description = formData.get('description') as string | null

  const updatePayload: Record<string, unknown> = {
    location: location || null,
    notes: notes || null,
    status,
    start_time: start_time || null,
    requires_verification,
    requires_signature,
    updated_at: new Date().toISOString(),
  }
  if (event_date) updatePayload.event_date = event_date

  // Title/description are series-wide by default — only store an override on this
  // instance if it actually diverges from the series' current value.
  if (title !== null) {
    const { data: instRow } = await adminClient.from('event_instances').select('series_id').eq('id', id).single()
    const { data: seriesRow } = instRow
      ? await adminClient.from('event_series').select('title, description').eq('id', instRow.series_id).single()
      : { data: null }
    const trimmedTitle = title.trim()
    const trimmedDescription = (description ?? '').trim()
    updatePayload.title_override = trimmedTitle && trimmedTitle !== seriesRow?.title?.trim() ? trimmedTitle : null
    updatePayload.description_override = trimmedDescription && trimmedDescription !== (seriesRow?.description ?? '').trim() ? trimmedDescription : null
  }

  const { error } = await adminClient.from('event_instances').update(updatePayload).eq('id', id)

  if (error) { await logError(error.message, '/events'); return { error: error.message } }

  // If requires_signature just enabled, create sig records for members already marked present
  if (requires_signature && ctx.department_id) {
    const { data: presentAttendance } = await adminClient
      .from('event_attendance')
      .select('personnel_id')
      .eq('instance_id', id)
      .eq('status', 'present')

    if (presentAttendance && presentAttendance.length > 0) {
      await adminClient.from('event_attendance_signatures').upsert(
        presentAttendance.map(a => ({
          instance_id: id,
          personnel_id: a.personnel_id,
          department_id: ctx.department_id!,
        })),
        { onConflict: 'instance_id,personnel_id', ignoreDuplicates: true }
      )
    }
  }

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
  const event_date = formData.get('event_date') as string // only used for one_time events
  const title = formData.get('title') as string
  const description = formData.get('description') as string
  const location = formData.get('location') as string
  const start_time = formData.get('start_time') as string
  const duration_minutes = formData.get('duration_minutes') as string
  const requires_verification = formData.get('requires_verification') !== 'false'
  const requires_signature = formData.get('requires_signature') === 'true'
  const is_training = formData.get('is_training') === 'true'
  const training_hours = formData.get('training_hours') ? parseFloat(formData.get('training_hours') as string) : null
  const training_cert_type_id = (formData.get('training_cert_type_id') as string) || null
  const training_instructor = (formData.get('training_instructor') as string) || null

  // Update series
  const { error: seriesErr } = await adminClient.from('event_series').update({
    title,
    description: description || null,
    location: location || null,
    start_time: start_time || null,
    duration_minutes: duration_minutes ? parseInt(duration_minutes) : null,
    requires_verification,
    requires_signature,
    is_training,
    training_hours: is_training ? training_hours : null,
    training_cert_type_id: is_training ? training_cert_type_id : null,
    training_instructor: is_training ? training_instructor : null,
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

  // Update future instances
  if (instanceIds.length > 0) {
    const { data: attended } = await adminClient
      .from('event_attendance')
      .select('instance_id, personnel_id, status')
      .in('instance_id', instanceIds)

    const attendedInstanceIds = new Set((attended ?? []).map(a => a.instance_id))
    const unattendedIds = instanceIds.filter(id => !attendedInstanceIds.has(id))

    if (unattendedIds.length > 0) {
      const instanceUpdate: Record<string, unknown> = {
        location: location || null,
        requires_verification,
        requires_signature,
        updated_at: new Date().toISOString(),
      }
      if (event_date) instanceUpdate.event_date = event_date
      await adminClient.from('event_instances').update(instanceUpdate).in('id', unattendedIds)
    }

    // requires_signature is a setting, not a data record — apply to attended instances too
    const attendedInstanceIdList = instanceIds.filter(id => attendedInstanceIds.has(id))
    if (attendedInstanceIdList.length > 0) {
      await adminClient.from('event_instances')
        .update({ requires_signature, updated_at: new Date().toISOString() })
        .in('id', attendedInstanceIdList)
    }

    // If requires_signature enabled, create sig records for all present attendees
    if (requires_signature) {
      const { data: seriesList } = await adminClient
        .from('event_series').select('department_id').eq('id', series_id)
      const dept_id = seriesList?.[0]?.department_id

      if (dept_id) {
        const presentAttendance = (attended ?? []).filter(a => a.status === 'present')
        if (presentAttendance.length > 0) {
          await adminClient.from('event_attendance_signatures').upsert(
            presentAttendance.map(a => ({
              instance_id: a.instance_id,
              personnel_id: a.personnel_id,
              department_id: dept_id,
            })),
            { onConflict: 'instance_id,personnel_id', ignoreDuplicates: true }
          )
        }
      }
    }
  }

  // Sync training_events for all future instances
  if (instanceIds.length > 0) {
    if (is_training) {
      const { data: existingTE } = await adminClient
        .from('training_events')
        .select('id, event_instance_id')
        .in('event_instance_id', instanceIds)
      const existingTEMap = Object.fromEntries((existingTE ?? []).map(te => [te.event_instance_id, te.id]))

      const { data: instData } = await adminClient
        .from('event_instances').select('id, event_date').in('id', instanceIds)
      const instDateMap = Object.fromEntries((instData ?? []).map(i => [i.id, i.event_date]))

      const toInsert: Record<string, unknown>[] = []
      const toUpdateIds: string[] = []
      for (const instId of instanceIds) {
        if (existingTEMap[instId]) {
          toUpdateIds.push(existingTEMap[instId])
        } else {
          toInsert.push({
            department_id: ctx.department_id,
            event_instance_id: instId,
            topic: title,
            description: description || null,
            instructor: training_instructor,
            event_date: instDateMap[instId],
            hours: training_hours,
            certification_type_id: training_cert_type_id,
            requires_verification,
            start_time: start_time || null,
            location: location || null,
            created_by: ctx.me.id,
          })
        }
      }
      if (toUpdateIds.length > 0) {
        await adminClient.from('training_events')
          .update({
            hours: training_hours, certification_type_id: training_cert_type_id, cancelled: false,
            topic: title, description: description || null, instructor: training_instructor,
          })
          .in('id', toUpdateIds)
      }
      if (toInsert.length > 0) {
        await adminClient.from('training_events').insert(toInsert)
      }
    } else {
      await adminClient.from('training_events')
        .update({ cancelled: true })
        .in('event_instance_id', instanceIds)
    }
  }

  revalidatePath('/events')
  revalidatePath('/training')
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
    .select('id, event_date, start_time, requires_verification, requires_signature, series_id')
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

  // If attendance auto-approves (no verification required) and event requires signatures, create sig records
  if (status === 'present' && instance.requires_signature && ctx.department_id) {
    await adminClient.from('event_attendance_signatures').upsert(
      personnel_ids.map(pid => ({
        instance_id,
        personnel_id: pid,
        department_id: ctx.department_id!,
      })),
      { onConflict: 'instance_id,personnel_id', ignoreDuplicates: true }
    )
  }

  revalidatePath('/events')
  return { success: true }
}

// ─── Log Absent (officer/admin marks members absent — excused or unexcused) ──
export async function logAbsentAttendance(
  instance_id: string,
  personnel_ids: string[],
  excused: boolean,
  excuse_type_id?: string,
  notes?: string
) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can log absences directly.' }
  if (personnel_ids.length === 0) return { error: 'Select at least one member.' }
  if (excused && !excuse_type_id) return { error: 'Select an excuse type.' }

  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  const records = personnel_ids.map(pid => ({
    instance_id,
    personnel_id: pid,
    status: excused ? 'excused' : 'absent',
    excuse_type_id: excused ? excuse_type_id : null,
    submitted_by: ctx.me.id,
    submitted_at: now,
    notes: notes || null,
    verified_by: ctx.me.id,
    verified_at: now,
  }))

  const { error } = await adminClient
    .from('event_attendance')
    .upsert(records, { onConflict: 'instance_id,personnel_id', ignoreDuplicates: false })

  if (error) { await logError(error.message, '/events'); return { error: error.message } }

  revalidatePath('/events')
  revalidatePath('/reports/my-activity')
  return { success: true }
}

// ─── Verify / Reject Attendance ───────────────────────────────────────────────
export async function verifyAttendance(attendance_id: string, action: 'present' | 'absent' | 'excused', rejection_reason?: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can verify attendance.' }

  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  // Fetch the attendance record first so we can create a sig record if needed
  const { data: attList } = await adminClient
    .from('event_attendance')
    .select('instance_id, personnel_id')
    .eq('id', attendance_id)
  const att = attList?.[0]

  const { error } = await adminClient.from('event_attendance').update({
    status: action,
    verified_by: ctx.me.id,
    verified_at: now,
    rejection_reason: action === 'absent' ? (rejection_reason || null) : null,
  }).eq('id', attendance_id)

  if (error) { await logError(error.message, '/events'); return { error: error.message } }

  // When approving attendance, create a signature record if the event requires one
  if (action === 'present' && att) {
    const { data: instList } = await adminClient
      .from('event_instances')
      .select('requires_signature, series_id')
      .eq('id', att.instance_id)
    const inst = instList?.[0]

    if (inst?.requires_signature) {
      const { data: seriesList } = await adminClient
        .from('event_series')
        .select('department_id')
        .eq('id', inst.series_id)
      const dept_id = seriesList?.[0]?.department_id

      if (dept_id) {
        await adminClient.from('event_attendance_signatures').upsert(
          { instance_id: att.instance_id, personnel_id: att.personnel_id, department_id: dept_id },
          { onConflict: 'instance_id,personnel_id', ignoreDuplicates: true }
        )
      }
    }
  }

  // If this instance has a linked training_events record with a cert type, issue the cert
  if (action === 'present' && att) {
    const { data: trainingEvtList } = await adminClient
      .from('training_events')
      .select('id, certification_type_id, event_date')
      .eq('event_instance_id', att.instance_id)
    const trainingEvt = trainingEvtList?.[0]
    if (trainingEvt?.certification_type_id && ctx.department_id) {
      await issueCertFromTrainingLink(adminClient, trainingEvt, att.personnel_id, ctx.department_id)
    }
  }

  revalidatePath('/events')
  revalidatePath('/training')
  revalidatePath('/reports/my-activity')
  revalidatePath('/dashboard')
  return { success: true }
}

async function issueCertFromTrainingLink(
  adminClient: ReturnType<typeof createAdminClient>,
  trainingEvt: { id: string; certification_type_id: string; event_date: string },
  personnel_id: string,
  department_id: string
) {
  const { data: ct } = await adminClient
    .from('certification_types')
    .select('cert_name, issuing_body, does_expire, expiration_interval_months')
    .eq('id', trainingEvt.certification_type_id)
    .single()
  if (!ct) return

  const issued_date = trainingEvt.event_date
  const expiration_date = ct.does_expire && ct.expiration_interval_months
    ? (() => { const d = new Date(issued_date); d.setMonth(d.getMonth() + ct.expiration_interval_months!); return d.toISOString().split('T')[0] })()
    : null

  const { data: existing } = await adminClient
    .from('member_certifications')
    .select('id')
    .eq('personnel_id', personnel_id)
    .eq('certification_type_id', trainingEvt.certification_type_id)
    .eq('source', 'training_event')
    .eq('issued_date', issued_date)
  if (existing?.length) return

  await adminClient.from('member_certifications').insert({
    personnel_id,
    department_id,
    certification_type_id: trainingEvt.certification_type_id,
    cert_name: ct.cert_name,
    issuing_body: ct.issuing_body,
    issued_date,
    expiration_date,
    source: 'training_event',
    active: true,
  })
}

// ─── Log Excused Absence (officer/admin self-submit, auto-approved) ──────────
export async function logExcusedAttendance(instance_id: string, excuse_type_id: string, notes?: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can log excused attendance directly.' }

  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  const { error } = await adminClient.from('event_attendance').upsert({
    instance_id,
    personnel_id: ctx.me.id,
    status: 'excused',
    excuse_type_id,
    notes: notes || null,
    submitted_by: ctx.me.id,
    submitted_at: now,
    verified_by: ctx.me.id,
    verified_at: now,
  }, { onConflict: 'instance_id,personnel_id' })

  if (error) { await logError(error.message, '/events'); return { error: error.message } }
  revalidatePath('/events')
  revalidatePath('/reports/my-activity')
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
    .select('id, status')
    .eq('instance_id', instance_id)
    .eq('personnel_id', ctx.me.id)

  const existingRecord = existing?.[0]

  if (existingRecord && existingRecord.status !== 'absent') {
    return { error: 'You already have an attendance record for this event.' }
  }

  const now = new Date().toISOString()

  // Update auto-assigned absent record to excused_pending
  if (existingRecord?.status === 'absent') {
    const { error } = await adminClient.from('event_attendance').update({
      status: 'excused_pending',
      excuse_type_id,
      notes: notes || null,
      submitted_by: ctx.me.id,
      submitted_at: now,
      verified_by: null,
      verified_at: null,
    }).eq('id', existingRecord.id)
    if (error) { await logError(error.message, '/events'); return { error: error.message } }
    revalidatePath('/events')
    revalidatePath('/reports/my-activity')
    return { success: true }
  }

  const { error } = await adminClient.from('event_attendance').insert({
    instance_id,
    personnel_id: ctx.me.id,
    status: 'excused_pending',
    excuse_type_id,
    notes: notes || null,
    submitted_by: ctx.me.id,
    submitted_at: now,
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

// ─── Delete Event Instance (admin only) ───────────────────────────────────────
export async function deleteEventInstance(instance_id: string) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can delete events.' }

  const adminClient = createAdminClient()
  await adminClient.from('event_attendance').delete().eq('instance_id', instance_id)
  const { error } = await adminClient.from('event_instances').delete().eq('id', instance_id)

  if (error) { await logError(error.message, '/events'); return { error: error.message } }
  revalidatePath('/events')
  return { success: true }
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
