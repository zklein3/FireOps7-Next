import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import NewIncidentClient from './NewIncidentClient'

export default async function NewIncidentPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')
  if (ctx.departmentType !== 'fire') redirect('/dashboard')
  const me = { id: ctx.personnelId, first_name: ctx.firstName, last_name: ctx.lastName }

  const department_id = ctx.departmentId

  const { data: deptFlagsList } = await adminClient.from('departments').select('module_neris').eq('id', department_id)
  const moduleNeris = deptFlagsList?.[0]?.module_neris ?? false

  // Apparatus list
  const { data: apparatus } = await adminClient
    .from('apparatus')
    .select('id, unit_number, apparatus_type_id')
    .eq('department_id', department_id)
    .eq('active', true)
    .order('unit_number')

  // Personnel list
  const { data: deptPersonnel } = await adminClient
    .from('department_personnel')
    .select('personnel_id, personnel(id, first_name, last_name)')
    .eq('department_id', department_id)
    .eq('active', true)

  const personnel = (deptPersonnel ?? [])
    .map(p => ({
      id: (p.personnel as any)?.id ?? p.personnel_id,
      name: [(p.personnel as any)?.first_name, (p.personnel as any)?.last_name].filter(Boolean).join(' '),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <NewIncidentClient
      apparatus={apparatus ?? []}
      personnel={personnel}
      myPersonnelId={me.id}
      myName={`${me.first_name} ${me.last_name}`}
      moduleNeris={moduleNeris}
      departmentName={ctx.departmentName ?? ''}
    />
  )
}
