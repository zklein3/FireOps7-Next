import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import IncidentsClient from './IncidentsClient'

export default async function IncidentsPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient.from('personnel').select('id, first_name, last_name, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) redirect('/login')

  const { data: myDeptList } = await adminClient.from('department_personnel').select('department_id, system_role').eq('personnel_id', me.id).eq('active', true)
  const myDept = myDeptList?.[0]
  if (!myDept) redirect('/dashboard')

  const department_id = myDept.department_id
  const isOfficerOrAbove = myDept.system_role === 'admin' || myDept.system_role === 'officer'

  // Last 6 months of incidents
  const since = new Date()
  since.setMonth(since.getMonth() - 6)

  const { data: incidents } = await adminClient
    .from('incidents')
    .select('id, incident_number, cad_number, incident_date, incident_type, fire_subtype, address, status, neris_reported, created_by, created_at')
    .eq('department_id', department_id)
    .gte('incident_date', since.toISOString().split('T')[0])
    .order('incident_date', { ascending: false })

  // Creator names
  const creatorIds = [...new Set((incidents ?? []).map(i => i.created_by).filter(Boolean))]
  const { data: creatorsRaw } = creatorIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', creatorIds)
    : { data: [] }
  const creatorMap = Object.fromEntries((creatorsRaw ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  return (
    <IncidentsClient
      incidents={(incidents ?? []).map(i => ({ ...i, creator_name: creatorMap[i.created_by] ?? '—' }))}
      isOfficerOrAbove={isOfficerOrAbove}
      myPersonnelId={me.id}
    />
  )
}
