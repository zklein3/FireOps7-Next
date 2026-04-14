import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import StationsListClient from './StationsListClient'

export default async function StationsPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) redirect('/login')

  const { data: myDeptList } = await adminClient.from('department_personnel').select('department_id, system_role').eq('personnel_id', me.id).eq('active', true)
  const myDept = myDeptList?.[0]
  if (!myDept) redirect('/dashboard')

  const isAdmin = myDept.system_role === 'admin' || me.is_sys_admin

  // Fetch stations
  const { data: stations } = await adminClient
    .from('stations')
    .select('id, station_number, station_name, address_line_1, city, state, postal_code, active, notes')
    .eq('department_id', myDept.department_id)
    .order('station_number')

  // Fetch apparatus counts per station
  const { data: apparatus } = await adminClient
    .from('apparatus')
    .select('id, station_id')
    .eq('department_id', myDept.department_id)
    .eq('active', true)

  const apparatusCountMap: Record<string, number> = {}
  for (const a of apparatus ?? []) {
    if (a.station_id) {
      apparatusCountMap[a.station_id] = (apparatusCountMap[a.station_id] ?? 0) + 1
    }
  }

  // Fetch personnel counts per station (future — for now just count dept personnel)
  const { data: personnel } = await adminClient
    .from('department_personnel')
    .select('id')
    .eq('department_id', myDept.department_id)
    .eq('active', true)
    .eq('signup_status', 'active')

  return (
    <StationsListClient
      stations={stations ?? []}
      apparatusCountMap={apparatusCountMap}
      personnelCount={personnel?.length ?? 0}
      isAdmin={isAdmin}
      departmentId={myDept.department_id}
    />
  )
}
