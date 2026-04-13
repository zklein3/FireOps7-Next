'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

const TEMP_PASSWORD = 'Hello1!'

export async function createDeptAdmin(formData: FormData) {
  const email = formData.get('email') as string
  const department_id = formData.get('department_id') as string

  if (!email || !department_id) return { error: 'Email and department are required.' }

  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Check if personnel with this email already exists
  const { data: existing } = await supabase
    .from('personnel')
    .select('id')
    .eq('email', email)
    .single()

  if (existing) return { error: 'A user with this email already exists.' }

  // Create auth user with temp password using admin client
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password: TEMP_PASSWORD,
    email_confirm: true,
  })

  if (authError || !authData.user) return { error: authError?.message ?? 'Failed to create auth user.' }

  // Create personnel record
  const { data: personnel, error: personnelError } = await adminClient
    .from('personnel')
    .insert({
      email,
      first_name: '',
      last_name: '',
      auth_user_id: authData.user.id,
      signup_status: 'temp_password',
      is_sys_admin: false,
    })
    .select('id')
    .single()

  if (personnelError || !personnel) {
    return { error: personnelError?.message ?? 'Failed to create personnel record.' }
  }

  // Create department_personnel record with admin role
  const { error: deptError } = await adminClient
    .from('department_personnel')
    .insert({
      personnel_id: personnel.id,
      department_id,
      system_role: 'admin',
      signup_status: 'temp_password',
      active: true,
    })

  if (deptError) return { error: deptError.message }

  revalidatePath('/admin/users')
  return { success: true }
}
