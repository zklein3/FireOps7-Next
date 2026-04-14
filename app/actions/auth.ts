'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/logger'
import { redirect } from 'next/navigation'

// ─── Sign In ─────────────────────────────────────────────────────────────────
export async function signIn(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

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
    .select('signup_status, id')
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
    case 'active':
      redirect('/dashboard')
    default:
      redirect('/dashboard')
  }
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
    .update({ signup_status: 'profile_setup' })
    .eq('auth_user_id', user.id)
    .select('id')
    .single()

  if (personnel) {
    await adminClient
      .from('department_personnel')
      .update({ signup_status: 'profile_setup' })
      .eq('personnel_id', personnel.id)
  }

  redirect('/profile-setup')
}

// ─── Sign Out ─────────────────────────────────────────────────────────────────
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
