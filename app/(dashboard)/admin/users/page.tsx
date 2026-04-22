import { createAdminClient } from '@/lib/supabase/admin'
import UsersClient from './UsersClient'

export default async function UsersPage() {
  const adminClient = createAdminClient()

  const { data: departments } = await adminClient
    .from('departments')
    .select('id, name, code')
    .eq('active', true)
    .order('name')

  const { data: users } = await adminClient
    .from('personnel')
    .select(`
      id, first_name, last_name, email, signup_status, is_sys_admin, created_at,
      department_personnel(system_role, department_id, active)
    `)
    .order('created_at', { ascending: false })

  // Fetch department names separately to avoid type issues with nested joins
  const { data: allDepts } = await adminClient
    .from('departments')
    .select('id, name')

  const deptMap = Object.fromEntries((allDepts ?? []).map(d => [d.id, d.name]))

  // Attach department name to each user's dept record
  const usersWithDept = (users ?? []).map(user => ({
    ...user,
    department_personnel: (user.department_personnel ?? []).map((dp: any) => ({
      ...dp,
      department_name: deptMap[dp.department_id] ?? null,
    })),
  }))

  return <UsersClient departments={departments ?? []} users={usersWithDept} />
}
