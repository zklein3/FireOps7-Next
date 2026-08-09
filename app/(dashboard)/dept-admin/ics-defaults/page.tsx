import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import IcsDefaultsClient from './IcsDefaultsClient'

export default async function IcsDefaultsPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (!ctx.departmentId) redirect('/dashboard')
  if (!(await hasPermission(ctx, 'manage_ics_defaults'))) redirect('/dashboard')

  const departmentId = ctx.departmentId

  const [{ data: channels }, { data: contacts }] = await Promise.all([
    adminClient.from('department_radio_channels').select('id, channel_name, assignment, sort_order, active').eq('department_id', departmentId).order('sort_order'),
    adminClient.from('department_medical_plan_contacts').select('id, contact_type, name, phone, address, sort_order, active').eq('department_id', departmentId).order('sort_order'),
  ])

  return (
    <IcsDefaultsClient
      departmentId={departmentId}
      channels={channels ?? []}
      contacts={contacts ?? []}
    />
  )
}
