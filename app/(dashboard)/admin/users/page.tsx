import { createClient } from '@/lib/supabase/server'
import UsersClient from './UsersClient'

export default async function UsersPage() {
  const supabase = await createClient()

  const { data: departments } = await supabase
    .from('departments')
    .select('id, name, code')
    .eq('active', true)
    .order('name')

  const { data: users } = await supabase
    .from('personnel')
    .select(`
      id, first_name, last_name, email, signup_status, is_sys_admin, created_at,
      department_personnel(system_role, department_id, departments(name))
    `)
    .order('created_at', { ascending: false })

  return <UsersClient departments={departments ?? []} users={users ?? []} />
}
