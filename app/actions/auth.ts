'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/logger'
import { redirect } from 'next/navigation'
import { SELECTED_DEPARTMENT_COOKIE, SYS_ADMIN_SENTINEL } from '@/lib/auth-cookies'

// ─── Sign In ─────────────────────────────────────────────────────────────────
export async function signIn(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const rawNext = formData.get('next') as string | null
  const next = rawNext?.startsWith('/') ? rawNext : '/dashboard'

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    await logError(error, '/login', { metadata: { email } })
    return { error: error.message }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Authentication failed.' }

  const { data: personnel } = await supabase
    .from('personnel')
    .select('signup_status, id, is_sys_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!personnel) {
    await logError('No personnel record found', '/login', { metadata: { email } })
    return { error: 'No personnel record found for this account.' }
  }

  switch (personnel.signup_status) {
    case 'temp_password':
      redirect('/change-password')
    case 'profile_setup':
      redirect('/profile-setup')
    case 'awaiting_approval':
      redirect('/pending')
    case 'denied':
      redirect('/denied')
    case 'active': {
      const adminClient = createAdminClient()
      const { data: deptRows } = await adminClient
        .from('department_personnel')
        .select('department_id')
        .eq('personnel_id', personnel.id)
        .eq('active', true)

      const isSysAdmin = personnel.is_sys_admin ?? false
      const totalOptions = (deptRows?.length ?? 0) + (isSysAdmin ? 1 : 0)

      if (totalOptions > 1) {
        const nextParam = next !== '/dashboard' ? `?next=${encodeURIComponent(next)}` : ''
        redirect(`/select-department${nextParam}`)
      }

      if (deptRows?.length === 1) {
        const cookieStore = await cookies()
        cookieStore.set(SELECTED_DEPARTMENT_COOKIE, deptRows[0].department_id, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 30,
        })
      }

      redirect(next)
    }
    default:
      redirect('/dashboard')
  }
}

// ─── Select Department ────────────────────────────────────────────────────────
export async function selectDepartment(formData: FormData) {
  const departmentId = formData.get('department_id') as string
  const rawNext = formData.get('next') as string | null
  const next = rawNext?.startsWith('/') ? rawNext : '/dashboard'
  const nextParam = next !== '/dashboard' ? `?next=${encodeURIComponent(next)}` : ''

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()
  const { data: personnel } = await adminClient
    .from('personnel')
    .select('id, is_sys_admin')
    .eq('auth_user_id', user.id)
    .single()
  if (!personnel) redirect('/login')

  if (departmentId === SYS_ADMIN_SENTINEL) {
    if (!personnel.is_sys_admin) {
      await logError('Attempted to select sys admin view without sys admin flag', '/select-department', { personnel_id: personnel.id })
      redirect(`/select-department${nextParam}`)
    }
  } else {
    const { data: membership } = await adminClient
      .from('department_personnel')
      .select('department_id')
      .eq('personnel_id', personnel.id)
      .eq('department_id', departmentId)
      .eq('active', true)
      .maybeSingle()

    if (!membership) {
      await logError('Attempted to select a department not assigned to this user', '/select-department', { personnel_id: personnel.id, metadata: { departmentId } })
      redirect(`/select-department${nextParam}`)
    }
  }

  const cookieStore = await cookies()
  cookieStore.set(SELECTED_DEPARTMENT_COOKIE, departmentId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })

  redirect(next)
}

// ─── Change Password ──────────────────────────────────────────────────────────
export async function changePassword(formData: FormData) {
  const password = formData.get('password') as string
  const confirm = formData.get('confirm') as string

  if (password !== confirm) return { error: 'Passwords do not match.' }
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }

  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    await logError(error, '/change-password')
    return { error: error.message }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired. Please log in again.' }

  const { data: personnel } = await adminClient
    .from('personnel')
    .select('id, first_name, last_name')
    .eq('auth_user_id', user.id)
    .single()
  if (!personnel) return { error: 'No personnel record found for this account.' }

  // A force-reset (sysAdminForcePasswordReset / deptAdminForcePasswordReset)
  // only ever touches signup_status, never first_name/last_name — so an
  // already-set-up member changing a reset password has a complete profile
  // already and shouldn't be walked through profile setup again.
  const hasProfile = !!(personnel.first_name?.trim() && personnel.last_name?.trim())
  const nextStatus = hasProfile ? 'active' : 'profile_setup'

  await adminClient.from('personnel').update({ signup_status: nextStatus }).eq('id', personnel.id)
  await adminClient.from('department_personnel').update({ signup_status: nextStatus }).eq('personnel_id', personnel.id)

  redirect(hasProfile ? '/dashboard' : '/profile-setup')
}

// ─── Sign Out ─────────────────────────────────────────────────────────────────
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const cookieStore = await cookies()
  cookieStore.delete(SELECTED_DEPARTMENT_COOKIE)
  redirect('/login')
}
