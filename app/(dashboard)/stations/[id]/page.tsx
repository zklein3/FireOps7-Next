import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import StationDetailClient from './StationDetailClient'

export default async function StationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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

  // Fetch station
  const { data: stationList } = await adminClient
    .from('stations')
    .select('id, station_number, station_name, address_line_1, address_line_2, city, state, postal_code, active, notes')
    .eq('id', id)

  const station = stationList?.[0]
  if (!station) redirect('/stations')

  // Fetch apparatus assigned to this station
  const { data: apparatusRaw } = await adminClient
    .from('apparatus')
    .select('id, unit_number, apparatus_name, apparatus_type_id, active')
    .eq('station_id', id)
    .order('unit_number')

  // Fetch apparatus types for labels
  const typeIds = (apparatusRaw ?? []).map(a => a.apparatus_type_id).filter(Boolean)
  const { data: typeData } = typeIds.length > 0
    ? await adminClient.from('apparatus_types').select('id, name').in('id', typeIds)
    : { data: [] }

  const typeMap = Object.fromEntries((typeData ?? []).map(t => [t.id, t.name]))

  const apparatus = (apparatusRaw ?? []).map(a => ({
    id: a.id,
    unit_number: a.unit_number,
    apparatus_name: a.apparatus_name,
    active: a.active,
    type_name: a.apparatus_type_id ? (typeMap[a.apparatus_type_id] ?? null) : null,
  }))

  return (
    <StationDetailClient
      station={station}
      apparatus={apparatus}
      isAdmin={isAdmin}
    />
  )
}
