import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import HoseTestSessionClient from './HoseTestSessionClient'

export default async function HoseTestSessionPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  const { data: deptFlags } = await adminClient.from('departments').select('module_iso').eq('id', ctx.departmentId).single()
  if (!deptFlags?.module_iso) redirect('/dashboard')

  if (!(await hasPermission(ctx, 'perform_iso_testing'))) redirect('/iso/hoses')

  const { data: hosesRaw } = await adminClient
    .from('hoses')
    .select('id, hose_identifier, hose_type, diameter_in, length_ft, status')
    .eq('department_id', ctx.departmentId)
    .eq('status', 'in_service')
    .order('hose_identifier')

  const testerName = `${ctx.firstName} ${ctx.lastName}`

  return (
    <HoseTestSessionClient
      hoses={hosesRaw ?? []}
      testerName={testerName}
    />
  )
}
