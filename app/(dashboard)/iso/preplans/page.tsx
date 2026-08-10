import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import PreplansClient from './PreplansClient'

export default async function PreplansPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  const { data: deptFlags } = await adminClient.from('departments').select('module_iso').eq('id', ctx.departmentId).single()
  if (!deptFlags?.module_iso) redirect('/dashboard')

  const isOfficerOrAbove = await hasPermission(ctx, 'perform_iso_testing')

  const { data: preplans } = await adminClient
    .from('iso_preplans')
    .select('id, location_name, address, surveyed_date, document_path, notes, updated_at')
    .eq('department_id', ctx.departmentId)
    .order('location_name')

  return <PreplansClient preplans={preplans ?? []} isOfficerOrAbove={isOfficerOrAbove} />
}
