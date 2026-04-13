'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export async function saveProfile(formData: FormData) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired. Please log in again.' }

  const first_name = formData.get('first_name') as string
  const last_name = formData.get('last_name') as string
  const phone = formData.get('phone') as string
  const address = formData.get('address') as string
  const city = formData.get('city') as string
  const state = formData.get('state') as string
  const zip = formData.get('zip') as string

  if (!first_name || !last_name) {
    return { error: 'First and last name are required.' }
  }

  const display_name = `${first_name} ${last_name}`

  // Update personnel record
  const { data: personnel, error } = await adminClient
    .from('personnel')
    .update({
      first_name,
      last_name,
      display_name,
      phone: phone || null,
      address: address || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      signup_status: 'active',
    })
    .eq('auth_user_id', user.id)
    .select('id')
    .single()

  if (error) return { error: error.message }

  // Update department_personnel status to active
  if (personnel) {
    await adminClient
      .from('department_personnel')
      .update({ signup_status: 'active' })
      .eq('personnel_id', personnel.id)
  }

  redirect('/dashboard')
}
