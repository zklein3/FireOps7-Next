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
    isOfficerOrAbove: ['admin','officer'].includes(myDept?.system_role ?? '') || me.is_sys_admin,
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
  const { error } = await adminClient.from('course_enrollments').upsert({
    personnel_id: formData.get('personnel_id') as string,
    certification_type_id: formData.get('certification_type_id') as string,
    department_id: ctx.department_id,
    enrolled_by: ctx.me.id,
    status: 'active',
  }, { onConflict: 'personnel_id,certification_type_id' })
  if (error) { await logError(error.message, '/dept-admin/training'); return { error: error.message } }
  revalidatePath('/dept-admin/training')
  revalidatePath('/training')
  return { success: true }
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
  const { error } = await adminClient.from('training_event_attendance').update({
    status: action,
    verified_by: ctx.me.id,
    verified_at: now,
    rejection_reason: action === 'rejected' ? (rejection_reason || null) : null,
  }).eq('id', attendance_id)
  if (error) { await logError(error.message, '/dept-admin/training'); return { error: error.message } }
  revalidatePath('/dept-admin/training')
  revalidatePath('/training')
  return { success: true }
}

// ─── ADMIN: Direct Cert Entry ─────────────────────────────────────────────────
export async function createDirectCertification(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Officers and admins only.' }
  const adminClient = createAdminClient()
  const { error } = await adminClient.from('member_certifications').insert({
    personnel_id: formData.get('personnel_id') as string,
    department_id: ctx.department_id,
    certification_type_id: (formData.get('certification_type_id') as string) || null,
    cert_name: formData.get('cert_name') as string,
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
    hours: parseFloat(formData.get('hours') as string) || null,
    location: (formData.get('location') as string) || null,
    requires_verification,
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
