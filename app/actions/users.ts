'use server'

import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { getDeptBrandName } from '@/lib/department-theme'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

const TEMP_PASSWORD = 'Hello1!'

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

function generateTempPassword(): string {
  let pw = ''
  for (let i = 0; i < 10; i++) pw += PASSWORD_CHARS[crypto.randomInt(PASSWORD_CHARS.length)]
  return `${pw}!`
}

function getLoginPath(departmentType: string): string {
  switch (departmentType) {
    case 'law_enforcement': return '/police/login'
    case 'public_works': return '/public-works/login'
    case 'fire': return '/fire/login'
    default: return '/login'
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─── Send New-Member Welcome Email ────────────────────────────────────────────
async function sendWelcomeEmail({
  email, firstName, departmentName, departmentType, tempPassword,
}: {
  email: string
  firstName: string
  departmentName: string
  departmentType: string
  tempPassword: string
}): Promise<{ error?: string }> {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return { error: 'Email sending is not configured.' }

  const brand = getDeptBrandName(departmentType)
  const accentColor = departmentType === 'fire' ? '#b91c1c' : '#1e3a8a'
  const loginUrl = `https://www.fireops7.com${getLoginPath(departmentType)}`
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi,'

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:${accentColor}">Welcome to ${brand}</h2>
      <p>${greeting}</p>
      <p>An account has been created for you at <strong>${escapeHtml(departmentName)}</strong>.</p>
      <div style="background:#f4f4f5;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:4px 0"><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p style="margin:4px 0"><strong>Temporary password:</strong> ${tempPassword}</p>
      </div>
      <p>Log in below — you'll be asked to set your own password right away.</p>
      <p style="margin-top:20px">
        <a href="${loginUrl}" style="background:${accentColor};color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">Log In</a>
      </p>
      <p style="margin-top:24px;color:#888;font-size:12px">If you weren't expecting this, contact your department administrator.</p>
    </div>
  `

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${brand} <noreply@fireops7.com>`,
      to: email,
      subject: `Welcome to ${brand} — ${departmentName}`,
      html,
    }),
  })

  if (!emailRes.ok) return { error: await emailRes.text() }
  return {}
}

// ─── Sys Admin Guard ──────────────────────────────────────────────────────────
async function assertSysAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Session expired.')
  const adminClient = createAdminClient()
  const { data: me } = await adminClient
    .from('personnel')
    .select('is_sys_admin')
    .eq('auth_user_id', user.id)
    .single()
  if (!me?.is_sys_admin) throw new Error('Unauthorized.')
}

// ─── Sys Admin: Update User Email ─────────────────────────────────────────────
export async function sysAdminUpdateEmail(personnelId: string, newEmail: string) {
  try {
    await assertSysAdmin()
    if (!newEmail.trim()) return { error: 'Email is required.' }
    const adminClient = createAdminClient()

    const { data: person, error: fetchErr } = await adminClient
      .from('personnel')
      .select('auth_user_id')
      .eq('id', personnelId)
      .single()
    if (fetchErr || !person) return { error: 'User not found.' }

    const { error: authErr } = await adminClient.auth.admin.updateUserById(
      person.auth_user_id,
      { email: newEmail.trim() }
    )
    if (authErr) { await logError(authErr.message, '/admin/users', { metadata: { personnelId } }); return { error: authErr.message } }

    const { error: dbErr } = await adminClient
      .from('personnel')
      .update({ email: newEmail.trim() })
      .eq('id', personnelId)
    if (dbErr) { await logError(dbErr.message, '/admin/users', { metadata: { personnelId } }); return { error: dbErr.message } }

    revalidatePath('/admin/users')
    return { success: true }
  } catch (err) {
    await logError(err, '/admin/users', { metadata: { personnelId } })
    return { error: err instanceof Error ? err.message : 'Failed to update email.' }
  }
}

// ─── Sys Admin: Force Password Reset ─────────────────────────────────────────
export async function sysAdminForcePasswordReset(personnelId: string) {
  try {
    await assertSysAdmin()
    const adminClient = createAdminClient()

    const { data: person, error: fetchErr } = await adminClient
      .from('personnel')
      .select('auth_user_id')
      .eq('id', personnelId)
      .single()
    if (fetchErr || !person) return { error: 'User not found.' }

    const { error: authErr } = await adminClient.auth.admin.updateUserById(
      person.auth_user_id,
      { password: TEMP_PASSWORD }
    )
    if (authErr) { await logError(authErr.message, '/admin/users', { metadata: { personnelId } }); return { error: authErr.message } }

    const { error: dbErr } = await adminClient
      .from('personnel')
      .update({ signup_status: 'temp_password' })
      .eq('id', personnelId)
    if (dbErr) { await logError(dbErr.message, '/admin/users', { metadata: { personnelId } }); return { error: dbErr.message } }

    revalidatePath('/admin/users')
    return { success: true }
  } catch (err) {
    await logError(err, '/admin/users', { metadata: { personnelId } })
    return { error: err instanceof Error ? err.message : 'Failed to reset password.' }
  }
}

// ─── Dept Admin: Force Password Reset ────────────────────────────────────────
// Same reset-to-Hello1!-plus-temp_password mechanism as sysAdminForcePasswordReset,
// but scoped to a dept admin's own department instead of requiring sys admin/
// /admin/users. Verifies the target actually has an active department_personnel
// row in the caller's own department before touching their auth account — a
// multi-dept admin must not be able to reset a password for someone who only
// belongs to a different department they don't administer.
export async function deptAdminForcePasswordReset(personnelId: string) {
  try {
    const ctx = await getCurrentDepartmentContext()
    if (!ctx) return { error: 'Session expired.' }
    if (ctx.systemRole !== 'admin' && !ctx.isSysAdmin) return { error: 'Only admins can reset passwords.' }
    if (!ctx.departmentId) return { error: 'Could not verify your department.' }

    const adminClient = createAdminClient()

    const { data: membership } = await adminClient
      .from('department_personnel')
      .select('id')
      .eq('personnel_id', personnelId)
      .eq('department_id', ctx.departmentId)
      .eq('active', true)
      .maybeSingle()
    if (!membership) return { error: 'This person is not part of your department.' }

    const { data: person, error: fetchErr } = await adminClient
      .from('personnel')
      .select('auth_user_id')
      .eq('id', personnelId)
      .single()
    if (fetchErr || !person) return { error: 'User not found.' }

    const { error: authErr } = await adminClient.auth.admin.updateUserById(
      person.auth_user_id,
      { password: TEMP_PASSWORD }
    )
    if (authErr) { await logError(authErr.message, '/dept-admin/personnel', { metadata: { personnelId } }); return { error: authErr.message } }

    const { error: dbErr } = await adminClient
      .from('personnel')
      .update({ signup_status: 'temp_password' })
      .eq('id', personnelId)
    if (dbErr) { await logError(dbErr.message, '/dept-admin/personnel', { metadata: { personnelId } }); return { error: dbErr.message } }

    revalidatePath('/dept-admin/personnel')
    return { success: true }
  } catch (err) {
    await logError(err, '/dept-admin/personnel', { metadata: { personnelId } })
    return { error: err instanceof Error ? err.message : 'Failed to reset password.' }
  }
}

// ─── Sys Admin: Set Department Role ──────────────────────────────────────────
export async function sysAdminSetRole(personnelId: string, newRole: string) {
  try {
    await assertSysAdmin()
    const validRoles = ['admin', 'officer', 'member']
    if (!validRoles.includes(newRole)) return { error: 'Invalid role.' }
    const adminClient = createAdminClient()

    const { error: dbErr } = await adminClient
      .from('department_personnel')
      .update({ system_role: newRole })
      .eq('personnel_id', personnelId)
    if (dbErr) { await logError(dbErr.message, '/admin/users', { metadata: { personnelId } }); return { error: dbErr.message } }

    revalidatePath('/admin/users')
    return { success: true }
  } catch (err) {
    await logError(err, '/admin/users', { metadata: { personnelId } })
    return { error: err instanceof Error ? err.message : 'Failed to update role.' }
  }
}

// ─── Sys Admin: Move User to Different Department ─────────────────────────────
export async function sysAdminMoveDepartment(personnelId: string, newDeptId: string) {
  try {
    await assertSysAdmin()
    if (!newDeptId) return { error: 'Department is required.' }
    const adminClient = createAdminClient()

    const { error: dbErr } = await adminClient
      .from('department_personnel')
      .update({ department_id: newDeptId })
      .eq('personnel_id', personnelId)
    if (dbErr) { await logError(dbErr.message, '/admin/users', { metadata: { personnelId, newDeptId } }); return { error: dbErr.message } }

    revalidatePath('/admin/users')
    return { success: true }
  } catch (err) {
    await logError(err, '/admin/users', { metadata: { personnelId } })
    return { error: err instanceof Error ? err.message : 'Failed to move department.' }
  }
}

// ─── Sys Admin: Deactivate User ───────────────────────────────────────────────
export async function sysAdminDeactivateUser(personnelId: string) {
  try {
    await assertSysAdmin()
    const adminClient = createAdminClient()

    const { error: dpErr } = await adminClient
      .from('department_personnel')
      .update({ active: false })
      .eq('personnel_id', personnelId)
    if (dpErr) { await logError(dpErr.message, '/admin/users', { metadata: { personnelId } }); return { error: dpErr.message } }

    const { error: pErr } = await adminClient
      .from('personnel')
      .update({ signup_status: 'denied' })
      .eq('id', personnelId)
    if (pErr) { await logError(pErr.message, '/admin/users', { metadata: { personnelId } }); return { error: pErr.message } }

    revalidatePath('/admin/users')
    return { success: true }
  } catch (err) {
    await logError(err, '/admin/users', { metadata: { personnelId } })
    return { error: err instanceof Error ? err.message : 'Failed to deactivate user.' }
  }
}

// ─── Sys Admin: Reactivate User ───────────────────────────────────────────────
export async function sysAdminReactivateUser(personnelId: string) {
  try {
    await assertSysAdmin()
    const adminClient = createAdminClient()

    const { error: dpErr } = await adminClient
      .from('department_personnel')
      .update({ active: true })
      .eq('personnel_id', personnelId)
    if (dpErr) { await logError(dpErr.message, '/admin/users', { metadata: { personnelId } }); return { error: dpErr.message } }

    const { error: pErr } = await adminClient
      .from('personnel')
      .update({ signup_status: 'active' })
      .eq('id', personnelId)
    if (pErr) { await logError(pErr.message, '/admin/users', { metadata: { personnelId } }); return { error: pErr.message } }

    revalidatePath('/admin/users')
    return { success: true }
  } catch (err) {
    await logError(err, '/admin/users', { metadata: { personnelId } })
    return { error: err instanceof Error ? err.message : 'Failed to reactivate user.' }
  }
}

// ─── Sys Admin: Create Dept Admin ─────────────────────────────────────────────
export async function createDeptAdmin(formData: FormData) {
  try {
    await assertSysAdmin()
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unauthorized.' }
  }

  const email = formData.get('email') as string
  const department_id = formData.get('department_id') as string
  const first_name = (formData.get('first_name') as string)?.trim() || ''
  const last_name = (formData.get('last_name') as string)?.trim() || ''
  const sendWelcome = formData.get('send_welcome_email') === 'true'

  if (!email || !department_id) return { error: 'Email and department are required.' }

  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: existing } = await supabase
    .from('personnel')
    .select('id')
    .eq('email', email)
    .single()

  // A person can belong to more than one department — link the existing account
  // instead of blocking, unless they're already in this exact department.
  if (existing) {
    const { data: existingLink } = await adminClient
      .from('department_personnel')
      .select('id')
      .eq('personnel_id', existing.id)
      .eq('department_id', department_id)
      .single()

    if (existingLink) {
      await logError('Attempted to add existing member who is already part of this department', '/admin/users', { metadata: { email, department_id } })
      return { error: 'This person is already part of this department.' }
    }

    const { error: linkError } = await adminClient
      .from('department_personnel')
      .insert({ personnel_id: existing.id, department_id, system_role: 'admin', signup_status: 'active', active: true })

    if (linkError) {
      await logError(linkError, '/admin/users', { metadata: { email, department_id } })
      return { error: linkError.message }
    }

    revalidatePath('/admin/users')
    return { success: true, existingUser: true }
  }

  const { data: dept } = await adminClient
    .from('departments')
    .select('name, department_type')
    .eq('id', department_id)
    .single()

  const password = sendWelcome ? generateTempPassword() : TEMP_PASSWORD

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    await logError(authError ?? 'Failed to create auth user', '/admin/users', { metadata: { email } })
    return { error: authError?.message ?? 'Failed to create auth user.' }
  }

  const { data: personnel, error: personnelError } = await adminClient
    .from('personnel')
    .insert({ email, first_name, last_name, auth_user_id: authData.user.id, signup_status: 'temp_password', is_sys_admin: false })
    .select('id')
    .single()

  if (personnelError || !personnel) {
    await logError(personnelError ?? 'Failed to create personnel', '/admin/users', { metadata: { email } })
    return { error: personnelError?.message ?? 'Failed to create personnel record.' }
  }

  const { error: deptError } = await adminClient
    .from('department_personnel')
    .insert({ personnel_id: personnel.id, department_id, system_role: 'admin', signup_status: 'temp_password', active: true })

  if (deptError) {
    await logError(deptError, '/admin/users', { metadata: { email } })
    return { error: deptError.message }
  }

  let emailSent = false
  if (sendWelcome && dept) {
    const { error: emailErr } = await sendWelcomeEmail({
      email, firstName: first_name, departmentName: dept.name, departmentType: dept.department_type, tempPassword: password,
    })
    if (emailErr) await logError(emailErr, '/admin/users', { metadata: { email, report_type: 'welcome_email' } })
    else emailSent = true
  }

  revalidatePath('/admin/users')
  return { success: true, emailSent, tempPassword: emailSent ? undefined : password }
}

// ─── Dept Admin: Create Any Department User ───────────────────────────────────
export async function createDeptMember(formData: FormData) {
  const email = formData.get('email') as string
  const system_role = formData.get('system_role') as string
  const role_id = formData.get('role_id') as string
  const permission_group_id = (formData.get('permission_group_id') as string) || null
  const employee_number = formData.get('employee_number') as string
  const hire_date = formData.get('hire_date') as string
  const first_name = (formData.get('first_name') as string)?.trim() || ''
  const last_name = (formData.get('last_name') as string)?.trim() || ''
  const sendWelcome = formData.get('send_welcome_email') === 'true'

  if (!email || !system_role) return { error: 'Email and access level are required.' }

  const validRoles = ['admin', 'officer', 'member']
  if (!validRoles.includes(system_role)) return { error: 'Invalid access level.' }

  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return { error: 'Session expired.' }

  if (ctx.systemRole !== 'admin' && ctx.systemRole !== 'officer' && !ctx.isSysAdmin) {
    return { error: 'You do not have permission to add personnel.' }
  }

  // SysAdminDeptClient (the sys-admin-only per-department panel) explicitly passes
  // department_id in the form, since sys admin has no department_personnel row of
  // their own there. But a sys-admin-flagged account can *also* be a real member of
  // a department and use the ordinary dept-admin self-service pages (DeptPersonnelClient,
  // the Dept Setup wizard) — those forms never include department_id at all, so a
  // sys admin using their own department's normal tools must fall back to their
  // currently-selected department context, same as everyone else. Only trust the
  // form value when it's actually present; a non-sys-admin can't reach this branch
  // at all since isSysAdmin gates it, so this can't be spoofed to another department.
  const formDeptId = formData.get('department_id') as string | null
  const department_id = (ctx.isSysAdmin && formDeptId) ? formDeptId : ctx.departmentId
  if (!department_id) {
    await logError('Department could not be resolved when adding personnel', '/dept-admin/personnel', {
      personnel_id: ctx.personnelId,
      metadata: { hasMultipleDepartments: ctx.hasMultipleDepartments, selectionPending: ctx.selectionPending, isSysAdmin: ctx.isSysAdmin },
    })
    return { error: 'Could not verify your department. Please refresh the page and try again — if you belong to more than one department, your selection may have expired.' }
  }

  const { data: existing } = await adminClient
    .from('personnel')
    .select('id')
    .eq('email', email)
    .single()

  // A person can belong to more than one department (e.g. a member who's also an
  // officer at a neighboring department) — link the existing account instead of
  // blocking, unless they're already in this exact department.
  if (existing) {
    const { data: existingLink } = await adminClient
      .from('department_personnel')
      .select('id')
      .eq('personnel_id', existing.id)
      .eq('department_id', department_id)
      .single()

    if (existingLink) {
      await logError('Attempted to add existing member who is already part of this department', '/dept-admin/personnel', { metadata: { email, department_id } })
      return { error: 'This person is already part of this department.' }
    }

    const { error: linkError } = await adminClient
      .from('department_personnel')
      .insert({
        personnel_id: existing.id,
        department_id,
        system_role,
        role_id: role_id || null,
        permission_group_id,
        employee_number: employee_number || null,
        hire_date: hire_date || null,
        signup_status: 'active',
        active: true,
      })

    if (linkError) {
      await logError(linkError, '/dept-admin/personnel', { metadata: { email, department_id } })
      return { error: linkError.message }
    }

    revalidatePath('/dept-admin/personnel')
    revalidatePath('/dept-admin/setup')
    return { success: true, existingUser: true }
  }

  const password = sendWelcome ? generateTempPassword() : TEMP_PASSWORD

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    await logError(authError ?? 'Failed to create auth user', '/dept-admin/personnel', { metadata: { email } })
    return { error: authError?.message ?? 'Failed to create auth user.' }
  }

  const { data: personnel, error: personnelError } = await adminClient
    .from('personnel')
    .insert({ email, first_name, last_name, auth_user_id: authData.user.id, signup_status: 'temp_password', is_sys_admin: false })
    .select('id')
    .single()

  if (personnelError || !personnel) {
    await logError(personnelError ?? 'Failed to create personnel', '/dept-admin/personnel', { metadata: { email } })
    return { error: personnelError?.message ?? 'Failed to create personnel record.' }
  }

  const { error: deptError } = await adminClient
    .from('department_personnel')
    .insert({
      personnel_id: personnel.id,
      department_id,
      system_role,
      role_id: role_id || null,
      permission_group_id,
      employee_number: employee_number || null,
      hire_date: hire_date || null,
      signup_status: 'temp_password',
      active: true,
    })

  if (deptError) {
    await logError(deptError, '/dept-admin/personnel', { metadata: { email } })
    return { error: deptError.message }
  }

  let emailSent = false
  if (sendWelcome) {
    const { error: emailErr } = await sendWelcomeEmail({
      email, firstName: first_name, departmentName: ctx.departmentName ?? 'your department', departmentType: ctx.departmentType, tempPassword: password,
    })
    if (emailErr) await logError(emailErr, '/dept-admin/personnel', { metadata: { email, report_type: 'welcome_email' } })
    else emailSent = true
  }

  revalidatePath('/dept-admin/personnel')
  revalidatePath('/dept-admin/setup')
  return { success: true, emailSent, tempPassword: emailSent ? undefined : password }
}
