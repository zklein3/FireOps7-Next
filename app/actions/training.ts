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
    me: { id: ctx.personnelId, is_sys_admin: ctx.isSysAdmin },
    department_id: ctx.departmentId,
    system_role: ctx.systemRole,
    isAdmin: await hasPermission(ctx, 'manage_training_programs'),
    isOfficerOrAbove: await hasPermission(ctx, 'record_training_completion'),
  }
}

// ─── ADMIN: Certification Types ───────────────────────────────────────────────
export async function createCertificationType(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()
  const does_expire = formData.get('does_expire') === 'true'
  const { error } = await adminClient.from('certification_types').insert({
    department_id: ctx.department_id,
    cert_name: formData.get('cert_name') as string,
    issuing_body: (formData.get('issuing_body') as string) || null,
    does_expire,
    expiration_interval_months: does_expire ? parseInt(formData.get('expiration_interval_months') as string) || null : null,
    is_structured_course: formData.get('is_structured_course') === 'true',
    show_on_run_report: formData.get('show_on_run_report') === 'true',
    active: true,
  })
  if (error) { await logError(error.message, '/dept-admin/training'); return { error: error.message } }
  revalidatePath('/dept-admin/training')
  return { success: true }
}

export async function updateCertificationType(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()
  const does_expire = formData.get('does_expire') === 'true'
  const { error } = await adminClient.from('certification_types').update({
    cert_name: formData.get('cert_name') as string,
    issuing_body: (formData.get('issuing_body') as string) || null,
    does_expire,
    expiration_interval_months: does_expire ? parseInt(formData.get('expiration_interval_months') as string) || null : null,
    is_structured_course: formData.get('is_structured_course') === 'true',
    show_on_run_report: formData.get('show_on_run_report') === 'true',
    active: formData.get('active') === 'true',
    updated_at: new Date().toISOString(),
  }).eq('id', formData.get('id') as string)
  if (error) { await logError(error.message, '/dept-admin/training'); return { error: error.message } }
  revalidatePath('/dept-admin/training')
  return { success: true }
}

// ─── ADMIN: Course Units ──────────────────────────────────────────────────────
export async function createCourseUnit(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()
  const cert_id = formData.get('certification_type_id') as string
  const { data: existing } = await adminClient.from('certification_course_units').select('sort_order').eq('certification_type_id', cert_id).order('sort_order', { ascending: false }).limit(1)
  const sort_order = (existing?.[0]?.sort_order ?? 0) + 1
  const { error } = await adminClient.from('certification_course_units').insert({
    certification_type_id: cert_id,
    unit_title: formData.get('unit_title') as string,
    unit_description: (formData.get('unit_description') as string) || null,
    required_hours: parseFloat(formData.get('required_hours') as string) || null,
    sort_order,
    active: true,
  })
  if (error) { await logError(error.message, '/dept-admin/training'); return { error: error.message } }
  revalidatePath('/dept-admin/training')
  return { success: true }
}

export async function updateCourseUnit(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()
  const { error } = await adminClient.from('certification_course_units').update({
    unit_title: formData.get('unit_title') as string,
    unit_description: (formData.get('unit_description') as string) || null,
    required_hours: parseFloat(formData.get('required_hours') as string) || null,
    active: formData.get('active') === 'true',
  }).eq('id', formData.get('id') as string)
  if (error) { await logError(error.message, '/dept-admin/training'); return { error: error.message } }
  revalidatePath('/dept-admin/training')
  return { success: true }
}

// ─── ADMIN: Enrollments ───────────────────────────────────────────────────────
export async function enrollMember(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()
  const personnelId = formData.get('personnel_id') as string
  const certTypeId = formData.get('certification_type_id') as string
  const trainingDate = (formData.get('training_date') as string) || null

  const { error } = await adminClient.from('course_enrollments').upsert({
    personnel_id: personnelId,
    certification_type_id: certTypeId,
    department_id: ctx.department_id,
    enrolled_by: ctx.me.id,
    training_date: trainingDate,
    status: 'active',
    session_logged_at: null,
    session_status: null,
  }, { onConflict: 'personnel_id,certification_type_id', ignoreDuplicates: false })
  if (error) { await logError(error.message, '/dept-admin/training'); return { error: error.message } }
  revalidatePath('/dept-admin/training')
  revalidatePath('/training')
  return { success: true }
}

export async function enrollAllMembers(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()

  const certTypeId = formData.get('certification_type_id') as string
  const trainingDate = (formData.get('training_date') as string) || null
  if (!certTypeId) return { error: 'Certification type is required.' }

  const { data: deptPersonnel } = await adminClient
    .from('department_personnel')
    .select('personnel_id')
    .eq('department_id', ctx.department_id!)
    .eq('active', true)

  if (!deptPersonnel?.length) return { error: 'No active members found.' }

  const records = deptPersonnel.map(dp => ({
    personnel_id: dp.personnel_id,
    certification_type_id: certTypeId,
    department_id: ctx.department_id,
    enrolled_by: ctx.me.id,
    training_date: trainingDate,
    status: 'active',
    session_logged_at: null,
    session_status: null,
  }))

  const { error } = await adminClient
    .from('course_enrollments')
    .upsert(records, { onConflict: 'personnel_id,certification_type_id', ignoreDuplicates: false })

  if (error) { await logError(error.message, '/dept-admin/training'); return { error: error.message } }
  revalidatePath('/dept-admin/training')
  revalidatePath('/training')
  return { success: true, count: records.length }
}

export async function updateEnrollmentStatus(enrollment_id: string, status: string) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()
  const { error } = await adminClient.from('course_enrollments').update({ status }).eq('id', enrollment_id)
  if (error) { await logError(error.message, '/dept-admin/training'); return { error: error.message } }
  revalidatePath('/dept-admin/training')
  revalidatePath('/training')
  return { success: true }
}

// ─── ADMIN/OFFICER: Verify/Reject Course Progress ─────────────────────────────
export async function verifyProgress(progress_id: string, action: 'verified' | 'rejected', rejection_reason?: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Officers and admins only.' }
  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  const { error } = await adminClient.from('member_course_progress').update({
    status: action,
    verified_by: ctx.me.id,
    verified_at: now,
    rejection_reason: action === 'rejected' ? (rejection_reason || null) : null,
  }).eq('id', progress_id)

  if (error) { await logError(error.message, '/dept-admin/training'); return { error: error.message } }

  if (action === 'verified') {
    const { data: prog } = await adminClient.from('member_course_progress').select('enrollment_id').eq('id', progress_id)
    const enrollmentId = prog?.[0]?.enrollment_id
    if (enrollmentId) {
      const { data: enrollment } = await adminClient.from('course_enrollments').select('certification_type_id').eq('id', enrollmentId)
      const { data: allUnits } = await adminClient.from('certification_course_units').select('id').eq('certification_type_id', enrollment?.[0]?.certification_type_id ?? '').eq('active', true)
      const { data: allProgress } = await adminClient.from('member_course_progress').select('status').eq('enrollment_id', enrollmentId)
      const verifiedCount = (allProgress ?? []).filter(p => p.status === 'verified').length
      if (verifiedCount === (allUnits ?? []).length && (allUnits ?? []).length > 0) {
        await adminClient.from('course_enrollments').update({ status: 'completed' }).eq('id', enrollmentId)
      }
    }
  }

  revalidatePath('/dept-admin/training')
  revalidatePath('/training')
  return { success: true }
}

// ─── ADMIN/OFFICER: Verify/Reject Training Event Attendance ──────────────────
export async function verifyTrainingAttendance(attendance_id: string, action: 'verified' | 'rejected', rejection_reason?: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Officers and admins only.' }
  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  const { data: attList } = await adminClient
    .from('training_event_attendance')
    .select('event_id, personnel_id')
    .eq('id', attendance_id)
  const att = attList?.[0]

  const { error } = await adminClient.from('training_event_attendance').update({
    status: action,
    verified_by: ctx.me.id,
    verified_at: now,
    rejection_reason: action === 'rejected' ? (rejection_reason || null) : null,
  }).eq('id', attendance_id)
  if (error) { await logError(error.message, '/dept-admin/training'); return { error: error.message } }

  // Auto-create cert if event is linked to a cert type
  if (action === 'verified' && att) {
    await issueCertFromEvent(adminClient, att.event_id, att.personnel_id, ctx.department_id!, now)
  }

  revalidatePath('/dept-admin/training')
  revalidatePath('/training')
  return { success: true }
}

async function issueCertFromEvent(adminClient: ReturnType<typeof createAdminClient>, event_id: string, personnel_id: string, department_id: string, now: string) {
  const { data: evtList } = await adminClient
    .from('training_events')
    .select('certification_type_id, event_date')
    .eq('id', event_id)
  const evt = evtList?.[0]
  if (!evt?.certification_type_id) return

  const { data: ct } = await adminClient
    .from('certification_types')
    .select('cert_name, issuing_body, does_expire, expiration_interval_months')
    .eq('id', evt.certification_type_id)
    .single()
  if (!ct) return

  const issued_date = evt.event_date
  const expiration_date = ct.does_expire && ct.expiration_interval_months
    ? (() => { const d = new Date(issued_date); d.setMonth(d.getMonth() + ct.expiration_interval_months!); return d.toISOString().split('T')[0] })()
    : null

  // Don't duplicate — check if cert already exists for this event
  const { data: existing } = await adminClient
    .from('member_certifications')
    .select('id')
    .eq('personnel_id', personnel_id)
    .eq('certification_type_id', evt.certification_type_id)
    .eq('source', 'training_event')
    .gte('created_at', new Date(now).toISOString().slice(0, 10) + 'T00:00:00Z')
  if (existing?.length) return

  await adminClient.from('member_certifications').insert({
    personnel_id,
    department_id,
    certification_type_id: evt.certification_type_id,
    cert_name: ct.cert_name,
    issuing_body: ct.issuing_body,
    issued_date,
    expiration_date,
    source: 'training_event',
    active: true,
    created_at: now,
  })
}

// ─── MEMBER: Log simple cert session (no units) ──────────────────────────────
export async function logCertSession(enrollment_id: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const adminClient = createAdminClient()

  const { data: enList } = await adminClient
    .from('course_enrollments')
    .select('personnel_id, status')
    .eq('id', enrollment_id)
  const en = enList?.[0]
  if (en?.personnel_id !== ctx.me.id) return { error: 'Not your enrollment.' }
  if (en?.status !== 'active') return { error: 'Enrollment is not active.' }

  const { error } = await adminClient
    .from('course_enrollments')
    .update({ session_logged_at: new Date().toISOString(), session_status: 'pending' })
    .eq('id', enrollment_id)

  if (error) { await logError(error.message, '/training'); return { error: error.message } }
  revalidatePath('/training')
  return { success: true }
}

// ─── OFFICER: Verify simple cert session → auto-issue cert ───────────────────
export async function verifyEnrollmentSession(enrollment_id: string, action: 'verified' | 'rejected') {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Officers and admins only.' }
  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  const { data: enList } = await adminClient
    .from('course_enrollments')
    .select('personnel_id, certification_type_id, department_id, training_date, session_logged_at')
    .eq('id', enrollment_id)
  const en = enList?.[0]
  if (!en) return { error: 'Enrollment not found.' }

  const { error } = await adminClient
    .from('course_enrollments')
    .update({
      session_status: action,
      ...(action === 'verified' ? { status: 'completed' } : {}),
    })
    .eq('id', enrollment_id)
  if (error) { await logError(error.message, '/dept-admin/training'); return { error: error.message } }

  if (action === 'verified') {
    const { data: ct } = await adminClient
      .from('certification_types')
      .select('cert_name, issuing_body, does_expire, expiration_interval_months')
      .eq('id', en.certification_type_id)
      .single()

    if (ct) {
      const issued_date = en.training_date ?? now.split('T')[0]
      const expiration_date = ct.does_expire && ct.expiration_interval_months
        ? (() => { const d = new Date(issued_date); d.setMonth(d.getMonth() + ct.expiration_interval_months!); return d.toISOString().split('T')[0] })()
        : null

      await adminClient.from('member_certifications').insert({
        personnel_id: en.personnel_id,
        department_id: en.department_id,
        certification_type_id: en.certification_type_id,
        cert_name: ct.cert_name,
        issuing_body: ct.issuing_body,
        issued_date,
        expiration_date,
        source: 'course_completion',
        active: true,
        created_by: ctx.me.id,
      })
      await adminClient.from('course_enrollments').update({ status: 'completed' }).eq('id', enrollment_id)
    }
  }

  revalidatePath('/dept-admin/training')
  revalidatePath('/training')
  return { success: true }
}

// ─── ADMIN: Direct Cert Entry ─────────────────────────────────────────────────
export async function createDirectCertification(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Officers and admins only.' }
  const adminClient = createAdminClient()

  const personnelId = formData.get('personnel_id') as string
  const certTypeId = (formData.get('certification_type_id') as string) || null
  let certName = (formData.get('cert_name') as string)?.trim()

  if (!personnelId) return { error: 'Member is required.' }

  // Fall back to cert type name if custom name not entered
  if (!certName && certTypeId) {
    const { data: ct } = await adminClient.from('certification_types').select('cert_name').eq('id', certTypeId).single()
    certName = ct?.cert_name ?? ''
  }
  if (!certName) return { error: 'Certification name is required.' }

  const { error } = await adminClient.from('member_certifications').insert({
    personnel_id: personnelId,
    department_id: ctx.department_id,
    certification_type_id: certTypeId,
    cert_name: certName,
    issuing_body: (formData.get('issuing_body') as string) || null,
    cert_number: (formData.get('cert_number') as string) || null,
    issued_date: (formData.get('issued_date') as string) || null,
    expiration_date: (formData.get('expiration_date') as string) || null,
    source: 'direct_entry',
    notes: (formData.get('notes') as string) || null,
    created_by: ctx.me.id,
    active: true,
  })
  if (error) { await logError(error.message, '/dept-admin/training'); return { error: error.message } }
  revalidatePath('/dept-admin/training')
  revalidatePath('/training')
  return { success: true }
}

// ─── ADMIN: Edit Member Certification ────────────────────────────────────────
export async function updateMemberCertification(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admin only.' }
  const adminClient = createAdminClient()

  const id = formData.get('id') as string
  if (!id) return { error: 'Missing cert id.' }

  const certName = (formData.get('cert_name') as string)?.trim()
  if (!certName) return { error: 'Certification name is required.' }

  const { error: dbErr } = await adminClient.from('member_certifications').update({
    cert_name: certName,
    issuing_body: (formData.get('issuing_body') as string) || null,
    cert_number: (formData.get('cert_number') as string) || null,
    issued_date: (formData.get('issued_date') as string) || null,
    expiration_date: (formData.get('expiration_date') as string) || null,
    notes: (formData.get('notes') as string) || null,
    active: formData.get('active') !== 'false',
  }).eq('id', id).eq('department_id', ctx.department_id)

  if (dbErr) { await logError(dbErr.message, '/dept-admin/training'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/training')
  revalidatePath('/training')
  return { success: true }
}

// ─── ADMIN/OFFICER: Create Training Event ─────────────────────────────────────
export async function createTrainingEvent(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Officers and admins only.' }
  const adminClient = createAdminClient()
  const requires_verification = formData.get('requires_verification') !== 'false'
  const { data: evt, error } = await adminClient.from('training_events').insert({
    department_id: ctx.department_id,
    event_date: formData.get('event_date') as string,
    start_time: (formData.get('start_time') as string) || null,
    topic: formData.get('topic') as string,
    description: (formData.get('description') as string) || null,
    instructor: (formData.get('instructor') as string) || null,
    hours: parseFloat(formData.get('hours') as string) || null,
    location: (formData.get('location') as string) || null,
    requires_verification,
    certification_type_id: (formData.get('certification_type_id') as string) || null,
    created_by: ctx.me.id,
  }).select('id').single()
  if (error) { await logError(error.message, '/dept-admin/training'); return { error: error.message } }
  revalidatePath('/dept-admin/training')
  revalidatePath('/training')
  return { success: true, event_id: evt?.id }
}

// ─── ADMIN/OFFICER: Bulk Log Training Attendance ──────────────────────────────
export async function logTrainingAttendance(event_id: string, personnel_ids: string[]) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Officers and admins only.' }
  const adminClient = createAdminClient()

  // Get event requires_verification
  const { data: evtList } = await adminClient.from('training_events').select('requires_verification').eq('id', event_id)
  const requiresVerification = evtList?.[0]?.requires_verification ?? true
  const now = new Date().toISOString()

  const records = personnel_ids.map(pid => ({
    event_id,
    personnel_id: pid,
    logged_by: ctx.me.id,
    submitted_by: ctx.me.id,
    submitted_at: now,
    status: 'verified' as const, // officer bulk log = auto-verified
    verified_by: ctx.me.id,
    verified_at: now,
  }))
  const { error } = await adminClient.from('training_event_attendance').upsert(records, { onConflict: 'event_id,personnel_id', ignoreDuplicates: true })
  if (error) { await logError(error.message, '/dept-admin/training'); return { error: error.message } }

  // Auto-issue certs if event has a cert type
  for (const pid of personnel_ids) {
    await issueCertFromEvent(adminClient, event_id, pid, ctx.department_id!, now)
  }

  revalidatePath('/dept-admin/training')
  revalidatePath('/training')
  return { success: true }
}

// ─── MEMBER: Self-Report Training Event Attendance ────────────────────────────
export async function selfReportTrainingAttendance(event_id: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const adminClient = createAdminClient()

  // Get event details for window check
  const { data: evtList } = await adminClient
    .from('training_events')
    .select('event_date, start_time, requires_verification, department_id')
    .eq('id', event_id)
  const evt = evtList?.[0]
  if (!evt) return { error: 'Event not found.' }

  // Verify this event belongs to member's department
  if (evt.department_id !== ctx.department_id) return { error: 'Event not found.' }

  // 12-hour self-report window check
  if (!ctx.isOfficerOrAbove) {
    const eventDateTime = new Date(`${evt.event_date}T${evt.start_time || '00:00'}`)
    const windowClose = new Date(eventDateTime.getTime() + 12 * 60 * 60 * 1000)
    if (new Date() > windowClose) {
      return { error: 'Self-report window has closed (12 hours after event start).' }
    }
  }

  const now = new Date().toISOString()
  const status = evt.requires_verification ? 'pending' : 'verified'

  const { error } = await adminClient.from('training_event_attendance').upsert({
    event_id,
    personnel_id: ctx.me.id,
    logged_by: ctx.me.id,
    submitted_by: ctx.me.id,
    submitted_at: now,
    status,
    ...(status === 'verified' ? { verified_by: ctx.me.id, verified_at: now } : {}),
  }, { onConflict: 'event_id,personnel_id', ignoreDuplicates: false })

  if (error) { await logError(error.message, '/training'); return { error: error.message } }
  revalidatePath('/training')
  return { success: true }
}

// ─── MEMBER: Submit Course Unit Progress ──────────────────────────────────────
export async function submitUnitProgress(formData: FormData) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  const adminClient = createAdminClient()
  const enrollment_id = formData.get('enrollment_id') as string
  const unit_id = formData.get('unit_id') as string

  const { data: enrollment } = await adminClient.from('course_enrollments').select('personnel_id, status').eq('id', enrollment_id)
  if (enrollment?.[0]?.personnel_id !== ctx.me.id) return { error: 'Not your enrollment.' }
  if (enrollment?.[0]?.status !== 'active') return { error: 'Enrollment is not active.' }

  const { error } = await adminClient.from('member_course_progress').upsert({
    enrollment_id,
    unit_id,
    personnel_id: ctx.me.id,
    hours_submitted: parseFloat(formData.get('hours_submitted') as string) || null,
    completed_date: (formData.get('completed_date') as string) || null,
    notes: (formData.get('notes') as string) || null,
    status: 'pending',
    submitted_at: new Date().toISOString(),
  }, { onConflict: 'enrollment_id,unit_id' })

  if (error) { await logError(error.message, '/training'); return { error: error.message } }
  revalidatePath('/training')
  return { success: true }
}

// ─── ANY MEMBER: Save Cert Signature ─────────────────────────────────────────
export async function saveCertSignature(formData: FormData) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }

  const file = formData.get('signature') as File
  const certId = formData.get('certId') as string
  const personnelId = formData.get('personnelId') as string
  if (!file || !certId || !personnelId) return { error: 'Missing required fields.' }

  if (!ctx.isOfficerOrAbove && ctx.me.id !== personnelId) {
    return { error: 'You may only sign your own certification record.' }
  }

  const adminClient = createAdminClient()
  const path = `certifications/${certId}/${personnelId}.png`
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error: uploadErr } = await adminClient.storage
    .from('signatures')
    .upload(path, buffer, { contentType: 'image/png', upsert: true })

  if (uploadErr) {
    await logError(uploadErr, 'saveCertSignature/upload')
    return { error: 'Failed to upload signature.' }
  }

  const signedAt = new Date().toISOString()

  const { error: dbErr } = await adminClient
    .from('member_certifications')
    .update({ signature_url: path, signed_at: signedAt })
    .eq('id', certId)
    .eq('personnel_id', personnelId)

  if (dbErr) {
    await logError(dbErr, 'saveCertSignature/db')
    return { error: 'Failed to save signature record.' }
  }

  revalidatePath('/training')
  return { success: true, signedAt }
}

// ─── ADMIN: Delete Enrollment ────────────────────────────────────────────────
export async function deleteEnrollment(enrollmentId: string) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admins only.' }
  const adminClient = createAdminClient()

  // Must be withdrawn or completed — never delete an active enrollment
  const { data: enList } = await adminClient
    .from('course_enrollments')
    .select('status')
    .eq('id', enrollmentId)
    .eq('department_id', ctx.department_id!)
  const en = enList?.[0]
  if (!en) return { error: 'Enrollment not found.' }
  if (en.status === 'active') return { error: 'Withdraw the enrollment before removing it.' }

  // Delete progress records first, then the enrollment
  await adminClient.from('member_course_progress').delete().eq('enrollment_id', enrollmentId)
  const { error: dbErr } = await adminClient.from('course_enrollments').delete().eq('id', enrollmentId)
  if (dbErr) { await logError(dbErr.message, '/dept-admin/training'); return { error: dbErr.message } }

  revalidatePath('/dept-admin/training')
  return { success: true }
}

// ─── MEMBER: Parse Training Document Photo ───────────────────────────────────
export async function parseTrainingPhoto(formData: FormData): Promise<{
  topic?: string; course_date?: string; hours?: string; provider?: string; location?: string; error?: string
}> {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }

  const file = formData.get('photo') as File | null
  if (!file || file.size === 0) return { error: 'No file provided.' }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) return { error: 'Unsupported file type. Use JPG, PNG, or WEBP.' }

  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp'

  const prompt = `Parse this training document, certificate, or course description image. Extract:
- topic: Course or class name/title
- course_date: Date in YYYY-MM-DD format (null if not found)
- hours: CE/training hours as a decimal number (null if not found)
- provider: Organization, institution, or instructor name (null if not found)
- location: City, state, or venue (null if not found)

Respond with ONLY a JSON object using these exact keys. No explanation.
Example: {"topic":"Respiratory Distress Management","course_date":"2026-06-01","hours":1.5,"provider":"NAEMSP","location":"Kansas City, MO"}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  })

  if (!response.ok) return { error: 'Failed to contact AI service.' }

  const result = await response.json()
  const text = result.content?.[0]?.text ?? ''

  try {
    const parsed = JSON.parse(text)
    return {
      topic: parsed.topic ?? undefined,
      course_date: parsed.course_date ?? undefined,
      hours: parsed.hours != null ? String(parsed.hours) : undefined,
      provider: parsed.provider ?? undefined,
      location: parsed.location ?? undefined,
    }
  } catch {
    return { error: 'Could not parse AI response.' }
  }
}

// ─── MEMBER: Submit Outside Training ─────────────────────────────────────────
export async function submitOutsideTraining(formData: FormData) {
  const ctx = await getContext()
  if (!ctx || !ctx.department_id) return { error: 'Not authenticated.' }

  const topic = (formData.get('topic') as string)?.trim()
  const course_date = formData.get('course_date') as string
  const hours = parseFloat(formData.get('hours') as string)

  if (!topic) return { error: 'Course name is required.' }
  if (!course_date) return { error: 'Course date is required.' }
  if (!hours || hours <= 0) return { error: 'Hours must be greater than 0.' }

  const adminClient = createAdminClient()
  let document_url: string | null = null

  const photo = formData.get('photo') as File | null
  if (photo && photo.size > 0) {
    const arrayBuffer = await photo.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const ext = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${ctx.department_id}/${ctx.me.id}/${Date.now()}.${ext}`

    const { error: uploadErr } = await adminClient.storage
      .from('training-docs')
      .upload(path, buffer, { contentType: photo.type, upsert: false })

    if (uploadErr) {
      await logError(uploadErr.message, 'submitOutsideTraining/upload')
      return { error: 'Failed to upload document. Try again or submit without the photo.' }
    }
    document_url = path
  }

  const { error: dbErr } = await adminClient.from('training_submissions').insert({
    department_id: ctx.department_id,
    personnel_id: ctx.me.id,
    topic,
    course_date,
    hours,
    provider: (formData.get('provider') as string) || null,
    location: (formData.get('location') as string) || null,
    notes: (formData.get('notes') as string) || null,
    document_url,
    purpose: (formData.get('purpose') as string) || null,
    nremt_category: (formData.get('nremt_category') as string) || null,
  })

  if (dbErr) { await logError(dbErr.message, '/training'); return { error: dbErr.message } }
  revalidatePath('/training')
  return { success: true }
}

// ─── ADMIN/OFFICER: Review Training Submission ────────────────────────────────
export async function reviewTrainingSubmission(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Officers and admins only.' }

  const adminClient = createAdminClient()
  const id = formData.get('id') as string
  const action = formData.get('action') as 'approve' | 'reject'
  const reviewer_notes = (formData.get('reviewer_notes') as string) || null

  if (!id || !action) return { error: 'Missing required fields.' }

  const { data: subList } = await adminClient
    .from('training_submissions')
    .select('*')
    .eq('id', id)
    .eq('department_id', ctx.department_id!)
  const sub = subList?.[0]
  if (!sub) return { error: 'Submission not found.' }

  const now = new Date().toISOString()

  if (action === 'reject') {
    const { error: dbErr } = await adminClient.from('training_submissions').update({
      status: 'rejected', reviewer_id: ctx.me.id, reviewed_at: now, reviewer_notes, updated_at: now,
    }).eq('id', id)
    if (dbErr) { await logError(dbErr.message, '/dept-admin/training'); return { error: dbErr.message } }
    revalidatePath('/dept-admin/training')
    revalidatePath('/training')
    return { success: true }
  }

  // Approve — use admin-confirmed values, fall back to member's suggestions
  const approved_purpose = (formData.get('approved_purpose') as string) || sub.purpose || null
  const approved_nremt_category = (formData.get('approved_nremt_category') as string) || sub.nremt_category || null
  const cert_type_id = (formData.get('cert_type_id') as string) || null

  const { error: dbErr } = await adminClient.from('training_submissions').update({
    status: 'approved', reviewer_id: ctx.me.id, reviewed_at: now, reviewer_notes,
    approved_purpose, approved_nremt_category,
    cert_type_id: cert_type_id || null,
    updated_at: now,
  }).eq('id', id)

  if (dbErr) { await logError(dbErr.message, '/dept-admin/training'); return { error: dbErr.message } }

  // If a cert type is linked and purpose is recert or initial_cert → issue cert record
  if (cert_type_id && (approved_purpose === 'recert' || approved_purpose === 'initial_cert')) {
    const { data: ctList } = await adminClient
      .from('certification_types')
      .select('cert_name, issuing_body, does_expire, expiration_interval_months')
      .eq('id', cert_type_id)
    const ct = ctList?.[0]
    if (ct) {
      let expiration_date: string | null = null
      if (ct.does_expire && ct.expiration_interval_months) {
        const exp = new Date(sub.course_date)
        exp.setMonth(exp.getMonth() + ct.expiration_interval_months)
        expiration_date = exp.toISOString().split('T')[0]
      }
      await adminClient.from('member_certifications').insert({
        department_id: ctx.department_id,
        personnel_id: sub.personnel_id,
        cert_name: ct.cert_name,
        issuing_body: ct.issuing_body,
        issued_date: sub.course_date,
        expiration_date,
        source: 'self_report',
        notes: `Approved from outside training: ${sub.topic}${sub.provider ? ` — ${sub.provider}` : ''}`,
        active: true,
      })
    }
  }

  revalidatePath('/dept-admin/training')
  revalidatePath('/training')
  return { success: true }
}

// ─── Cancel standalone training event ────────────────────────────────────────

export async function cancelTrainingEvent(id: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Officers and admins only.' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient
    .from('training_events')
    .update({ cancelled: true })
    .eq('id', id)
    .is('event_instance_id', null) // only cancel standalone events

  if (dbErr) {
    await logError(dbErr.message, 'cancelTrainingEvent')
    return { error: dbErr.message }
  }

  revalidatePath('/dept-admin/training')
  revalidatePath('/training')
  return { success: true }
}

// ─── ANY MEMBER: Save Training Signature (own record only; officers can sign any) ──
export async function saveTrainingSignature(formData: FormData) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }

  const file = formData.get('signature') as File
  const eventId = formData.get('eventId') as string
  const personnelId = formData.get('personnelId') as string
  if (!file || !eventId || !personnelId) return { error: 'Missing required fields.' }

  // Members may only sign their own record
  if (!ctx.isOfficerOrAbove && ctx.me.id !== personnelId) {
    return { error: 'You may only sign your own attendance record.' }
  }

  const adminClient = createAdminClient()
  const path = `training/${eventId}/${personnelId}.png`
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error: uploadErr } = await adminClient.storage
    .from('signatures')
    .upload(path, buffer, { contentType: 'image/png', upsert: true })

  if (uploadErr) {
    await logError(uploadErr, 'saveTrainingSignature/upload')
    return { error: 'Failed to upload signature.' }
  }

  const signedAt = new Date().toISOString()

  const { error: dbErr } = await adminClient
    .from('training_event_attendance')
    .update({ signature_url: path, signed_at: signedAt })
    .eq('event_id', eventId)
    .eq('personnel_id', personnelId)

  if (dbErr) {
    await logError(dbErr, 'saveTrainingSignature/db')
    return { error: 'Failed to save signature record.' }
  }

  revalidatePath('/training')
  return { success: true, signedAt }
}
