'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/logger'
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
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) return { error: 'Could not verify your account.' }

  const { data: myDeptList } = await adminClient.from('department_personnel').select('system_role').eq('personnel_id', me.id).eq('active', true)
  const myDept = myDeptList?.[0]
  if (!myDept || (myDept.system_role === 'member' && !me.is_sys_admin)) {
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
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) return { error: 'Could not verify your account.' }

  const { data: myDeptList } = await adminClient.from('department_personnel').select('system_role').eq('personnel_id', me.id).eq('active', true)
  const myDept = myDeptList?.[0]
  if (!myDept || (myDept.system_role !== 'admin' && !me.is_sys_admin)) {
    return { error: 'You do not have permission to edit department info.' }
  }

  const dept_personnel_id = formData.get('dept_personnel_id') as string
  const personnel_id = formData.get('personnel_id') as string
  const system_role = formData.get('system_role') as string
  const role_id = formData.get('role_id') as string
  const employee_number = formData.get('employee_number') as string
  const hire_date = formData.get('hire_date') as string
  const active = formData.get('active') === 'true'

  const { error } = await adminClient
    .from('department_personnel')
    .update({ system_role, role_id: role_id || null, employee_number: employee_number || null, hire_date: hire_date || null, active })
    .eq('id', dept_personnel_id)

  if (error) {
    await logError(error, '/personnel/[id]', { personnel_id })
    return { error: error.message }
  }

  revalidatePath(`/personnel/${personnel_id}`)
  revalidatePath('/personnel')
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

  if (error) return { error: 'Failed to submit report. Please try again.' }

  return { success: true }
}
