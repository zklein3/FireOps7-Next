'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { logError } from '@/lib/logger'
import { parseSalamanderCard } from '@/lib/salamander'
import { revalidatePath } from 'next/cache'

// ─── Update own profile ───────────────────────────────────────────────────────
export async function updateOwnProfile(formData: FormData) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const first_name = formData.get('first_name') as string
  const last_name = formData.get('last_name') as string
  const phone = formData.get('phone') as string
  const address = formData.get('address') as string
  const city = formData.get('city') as string
  const state = formData.get('state') as string
  const zip = formData.get('zip') as string

  if (!first_name || !last_name) return { error: 'First and last name are required.' }

  const { error } = await adminClient
    .from('personnel')
    .update({ first_name, last_name, display_name: `${first_name} ${last_name}`, phone: phone || null, address: address || null, city: city || null, state: state || null, zip: zip || null })
    .eq('auth_user_id', user.id)

  if (error) {
    await logError(error, '/personnel/[id]')
    return { error: error.message }
  }

  revalidatePath('/personnel')
  return { success: true }
}

// ─── Officer: Update anyone's basic profile ───────────────────────────────────
export async function updatePersonnelProfile(formData: FormData) {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return { error: 'Session expired.' }
  if (!(await hasPermission(ctx, 'view_personnel_details'))) {
    return { error: 'You do not have permission to edit other profiles.' }
  }

  const personnel_id = formData.get('personnel_id') as string
  const first_name = formData.get('first_name') as string
  const last_name = formData.get('last_name') as string
  const phone = formData.get('phone') as string
  const address = formData.get('address') as string
  const city = formData.get('city') as string
  const state = formData.get('state') as string
  const zip = formData.get('zip') as string

  if (!first_name || !last_name) return { error: 'First and last name are required.' }

  const { error } = await adminClient
    .from('personnel')
    .update({ first_name, last_name, display_name: `${first_name} ${last_name}`, phone: phone || null, address: address || null, city: city || null, state: state || null, zip: zip || null })
    .eq('id', personnel_id)

  if (error) {
    await logError(error, '/personnel/[id]', { personnel_id })
    return { error: error.message }
  }

  revalidatePath(`/personnel/${personnel_id}`)
  revalidatePath('/personnel')
  return { success: true }
}

// ─── Admin: Update department-level info ─────────────────────────────────────
export async function updateDeptPersonnel(formData: FormData) {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return { error: 'Session expired.' }
  if (!(await hasPermission(ctx, 'manage_users'))) {
    return { error: 'You do not have permission to edit department info.' }
  }

  const dept_personnel_id = formData.get('dept_personnel_id') as string
  const personnel_id = formData.get('personnel_id') as string
  const system_role = formData.get('system_role') as string
  const role_id = formData.get('role_id') as string
  const employee_number = formData.get('employee_number') as string
  const hire_date = formData.get('hire_date') as string
  const active = formData.get('active') === 'true'
  const notify_feedback = formData.get('notify_feedback') === 'true'
  const burn_permit_reviewer = formData.get('burn_permit_reviewer') === 'true'

  const { error } = await adminClient
    .from('department_personnel')
    .update({ system_role, role_id: role_id || null, employee_number: employee_number || null, hire_date: hire_date || null, active, notify_feedback, burn_permit_reviewer })
    .eq('id', dept_personnel_id)

  if (error) {
    await logError(error, '/personnel/[id]', { personnel_id })
    return { error: error.message }
  }

  revalidatePath(`/personnel/${personnel_id}`)
  revalidatePath('/personnel')
  revalidatePath('/dept-admin/setup')
  return { success: true }
}

// ─── Change own password ──────────────────────────────────────────────────────
export async function changeOwnPassword(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const current = formData.get('current_password') as string
  const password = formData.get('password') as string
  const confirm = formData.get('confirm') as string

  if (!current) return { error: 'Current password is required.' }
  if (password !== confirm) return { error: 'New passwords do not match.' }
  if (password.length < 8) return { error: 'New password must be at least 8 characters.' }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: current,
  })

  if (signInError) return { error: 'Current password is incorrect.' }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    await logError(error, '/personnel/[id]')
    return { error: error.message }
  }

  return { success: true }
}

// ─── Submit user feedback/report ──────────────────────────────────────────────
export async function submitUserReport(formData: FormData) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const { data: meList } = await adminClient.from('personnel').select('id').eq('auth_user_id', user.id)
  const me = meList?.[0]

  const message = formData.get('message') as string
  const report_type = formData.get('report_type') as string
  const page = formData.get('page') as string

  if (!message) return { error: 'Please enter a message.' }

  const { error } = await adminClient
    .from('system_logs')
    .insert({
      log_type: 'user_report',
      page: page || 'unknown',
      message,
      metadata: { report_type },
      personnel_id: me?.id ?? null,
    })

  if (error) { await logError(error.message, page || 'unknown', { personnel_id: me?.id, metadata: { report_type } }); return { error: 'Failed to submit report. Please try again.' } }

  return { success: true }
}

// Marks a member's own unread reply messages (replies to their Report/Feedback
// submissions) as read, called when they open the Inbox "Messages" tab.
export async function markMessagesRead() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const { data: meList } = await adminClient.from('personnel').select('id').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) return { error: 'Unauthorized' }

  await adminClient
    .from('system_logs')
    .update({ message_read_at: new Date().toISOString() })
    .eq('personnel_id', me.id)
    .is('message_read_at', null)

  return { success: true }
}


// ─── Link a QR/barcode token to a personnel record ───────────────────────────
export async function linkQrToken(
  personnelId: string,
  tokenType: 'fireops7' | 'salamander' | 'custom',
  tokenValue: string,
  label: string | null
) {
  const adminClient = createAdminClient()
  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return { error: 'Session expired.' }
  const me = { id: ctx.personnelId }

  const isMe = me.id === personnelId
  if (!isMe) {
    if (!(await hasPermission(ctx, 'view_personnel_details'))) return { error: 'Not authorized.' }
    const { data: targetDept } = await adminClient
      .from('department_personnel').select('id')
      .eq('personnel_id', personnelId).eq('department_id', ctx.departmentId ?? '').eq('active', true).limit(1)
    if (!targetDept?.length) return { error: 'Member not found in your department.' }
  }

  // Salamander payloads contain binary control chars that PostgreSQL rejects.
  // Store a canonical key derived from the parsed data instead of the raw string.
  let storedValue = tokenValue
  if (tokenType === 'salamander') {
    const card = parseSalamanderCard(tokenValue)
    if (!card) return { error: 'Could not parse Salamander card data.' }
    const deptKey = card.department.toUpperCase().replace(/[^A-Z0-9]/g, '')
    storedValue = `SAL:${card.lastName.toUpperCase()}:${card.firstName.toUpperCase()}:${deptKey}`
  }

  const { error: dbErr } = await adminClient
    .from('personnel_qr_tokens')
    .upsert(
      { personnel_id: personnelId, token_type: tokenType, token_value: storedValue, label, linked_by: me.id },
      { onConflict: 'personnel_id,token_type' }
    )

  if (dbErr) { await logError(dbErr.message, '/personnel'); return { error: dbErr.message } }
  revalidatePath(`/personnel/${personnelId}`)
  return { success: true }
}

// ─── Delete a linked QR token ─────────────────────────────────────────────────
export async function deleteQrToken(tokenId: string) {
  const adminClient = createAdminClient()
  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return { error: 'Session expired.' }
  const me = { id: ctx.personnelId }

  const { data: tokenList } = await adminClient
    .from('personnel_qr_tokens').select('id, personnel_id').eq('id', tokenId)
  const token = tokenList?.[0]
  if (!token) return { error: 'Token not found.' }

  const isMe = me.id === token.personnel_id
  if (!isMe) {
    if (!(await hasPermission(ctx, 'view_personnel_details'))) return { error: 'Not authorized.' }
  }

  const { error: dbErr } = await adminClient.from('personnel_qr_tokens').delete().eq('id', tokenId)
  if (dbErr) { await logError(dbErr.message, '/personnel'); return { error: dbErr.message } }
  revalidatePath(`/personnel/${token.personnel_id}`)
  return { success: true }
}
