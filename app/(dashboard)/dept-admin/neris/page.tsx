import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import NerisSettingsClient from './NerisSettingsClient'

export default async function DeptNerisSettingsPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (!ctx.departmentId) redirect('/dashboard')
  if (!(await hasPermission(ctx, 'submit_neris'))) redirect('/dashboard')
  if (ctx.departmentType !== 'fire') redirect('/dashboard')

  const { data: deptList } = await adminClient
    .from('departments')
    .select('module_neris, neris_entity_id')
    .eq('id', ctx.departmentId)
  const dept = deptList?.[0]

  if (!dept?.module_neris) redirect('/dashboard')

  const clientId = process.env.NERIS_CLIENT_ID ?? null

  return (
    <div className="max-w-2xl">
      <NerisSettingsClient
        departmentId={ctx.departmentId}
        nerisEntityId={dept.neris_entity_id ?? null}
        clientId={clientId}
      />
    </div>
  )
}
