import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import NewEventClient from './NewEventClient'

export default async function NewEventPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (!ctx.departmentId) redirect('/events')
  if (!(await hasPermission(ctx, 'manage_events'))) redirect('/events')

  const { data: certTypes } = await adminClient
    .from('certification_types')
    .select('id, cert_name')
    .eq('department_id', ctx.departmentId)
    .eq('active', true)
    .order('cert_name')

  return <NewEventClient certTypes={certTypes ?? []} />
}
