'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

const TEMP_PASSWORD = 'Hello1!'

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
    if (authErr) return { error: authErr.message }

    const { error: dbErr } = await adminClient
      .from('personnel')
      .update({ email: newEmail.trim() })
      .eq('id', personnelId)
    if (dbErr) return { error: dbErr.message }

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
    if (authErr) return { error: authErr.message }

    const { error: dbErr } = await adminClient
      .from('personnel')
      .update({ signup_status: 'temp_password' })
      .eq('id', personnelId)
    if (dbErr) return { error: dbErr.message }

    revalidatePath('/admin/users')
    return { success: true }
  } catch (err) {
    await logError(err, '/admin/users', { metadata: { personnelId } })
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
    if (dbErr) return { error: dbErr.message }

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
    if (dbErr) return { error: dbErr.message }

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
    if (dpErr) return { error: dpErr.message }

    const { error: pErr } = await adminClient
      .from('personnel')
      .update({ signup_status: 'denied' })
      .eq('id', personnelId)
    if (pErr) return { error: pErr.message }

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
    if (dpErr) return { error: dpErr.message }

    const { error: pErr } = await adminClient
      .from('personnel')
      .update({ signup_status: 'active' })
      .eq('id', personnelId)
    if (pErr) return { error: pErr.message }

    revalidatePath('/admin/users')
    return { success: true }
  } catch (err) {
    await logError(err, '/admin/users', { metadata: { personnelId } })
    return { error: err instanceof Error ? err.message : 'Failed to reactivate user.' }
  }
}

// ─── Sys Admin: Create Dept Admin ─────────────────────────────────────────────
export async function createDeptAdmin(formData: FormData) {
  const email = formData.get('email') as string
  const department_id = formData.get('department_id') as string

  if (!email || !department_id) return { error: 'Email and department are required.' }

  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: existing } = await supabase
    .from('personnel')
    .select('id')
    .eq('email', email)
    .single()

  if (existing) return { error: 'A user with this email already exists.' }

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password: TEMP_PASSWORD,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    await logError(authError ?? 'Failed to create auth user', '/admin/users', { metadata: { email } })
    return { error: authError?.message ?? 'Failed to create auth user.' }
  }

  const { data: personnel, error: personnelError } = await adminClient
    .from('personnel')
    .insert({ email, first_name: '', last_name: '', auth_user_id: authData.user.id, signup_status: 'temp_password', is_sys_admin: false })
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

  revalidatePath('/admin/users')
  return { success: true }
}

// ─── Dept Admin: Create Any Department User ───────────────────────────────────
export async function createDeptMember(formData: FormData) {
  const email = formData.get('email') as string
  const system_role = formData.get('system_role') as string
  const role_id = formData.get('role_id') as string
  const employee_number = formData.get('employee_number') as string
  const hire_date = formData.get('hire_date') as string

  if (!email || !system_role) return { error: 'Email and access level are required.' }

  const validRoles = ['admin', 'officer', 'member']
  if (!validRoles.includes(system_role)) return { error: 'Invalid access level.' }

  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const { data: meList } = await adminClient
    .from('personnel')
    .select('id, is_sys_admin')
    .eq('auth_user_id', user.id)

  const me = meList?.[0]
  if (!me) return { error: 'Could not verify your account.' }

  const { data: myDeptList } = await adminClient
    .from('department_personnel')
    .select('department_id, system_role')
    .eq('personnel_id', me.id)
    .eq('active', true)

  const myDept = myDeptList?.[0]
  if (!myDept) return { error: 'Could not verify your department.' }

  if (myDept.system_role !== 'admin' && !me.is_sys_admin) {
    return { error: 'You do not have permission to add personnel.' }
  }

  const department_id = myDept.department_id

  const { data: existing } = await supabase
    .from('personnel')
    .select('id')
    .eq('email', email)
    .single()

  if (existing) return { error: 'A user with this email already exists.' }

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password: TEMP_PASSWORD,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    await logError(authError ?? 'Failed to create auth user', '/dept-admin/personnel', { metadata: { email } })
    return { error: authError?.message ?? 'Failed to create auth user.' }
  }

  const { data: personnel, error: personnelError } = await adminClient
    .from('personnel')
    .insert({ email, first_name: '', last_name: '', auth_user_id: authData.user.id, signup_status: 'temp_password', is_sys_admin: false })
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
      employee_number: employee_number || null,
      hire_date: hire_date || null,
      signup_status: 'temp_password',
      active: true,
    })

  if (deptError) {
    await logError(deptError, '/dept-admin/personnel', { metadata: { email } })
    return { error: deptError.message }
  }

  revalidatePath('/dept-admin/personnel')
  return { success: true }
}
