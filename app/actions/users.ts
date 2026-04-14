'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

const TEMP_PASSWORD = 'Hello1!'

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

  if (authError || !authData.user) return { error: authError?.message ?? 'Failed to create auth user.' }

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

// ─── Dept Admin: Create Any Department User ───────────────────────────────────
export async function createDeptMember(formData: FormData) {
  const email = formData.get('email') as string
  const system_role = formData.get('system_role') as string
  const role_id = formData.get('role_id') as string
  const employee_number = formData.get('employee_number') as string
  const hire_date = formData.get('hire_date') as string

  if (!email || !system_role) return { error: 'Email and access level are required.' }

  const validRoles = ['admin', 'officer', 'member']
  if (!validRoles.includes(system_role)) {
    return { error: 'Invalid access level.' }
  }

  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Get the calling user's dept and verify they are an admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired.' }

  const { data: callerPersonnel } = await supabase
    .from('personnel')
    .select('id, is_sys_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!callerPersonnel) return { error: 'Could not verify your account.' }

  const { data: callerDept } = await supabase
    .from('department_personnel')
    .select('department_id, system_role')
    .eq('personnel_id', callerPersonnel.id)
    .eq('active', true)
    .single()

  if (!callerDept) return { error: 'Could not verify your department.' }

  if (callerDept.system_role !== 'admin' && !callerPersonnel.is_sys_admin) {
    return { error: 'You do not have permission to add personnel.' }
  }

  const department_id = callerDept.department_id

  // Check if email already exists
  const { data: existing } = await supabase
    .from('personnel')
    .select('id')
    .eq('email', email)
    .single()

  if (existing) return { error: 'A user with this email already exists.' }

  // Create auth user
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

  // Create department_personnel record
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

  if (deptError) return { error: deptError.message }

  revalidatePath('/dept-admin/personnel')
  return { success: true }
}
