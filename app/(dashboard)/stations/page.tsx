import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import StationsListClient from './StationsListClient'

export default async function StationsPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  const isAdmin = await hasPermission(ctx, 'manage_dept_setup')

  // Fetch stations
  const { data: stations } = await adminClient
    .from('stations')
    .select('id, station_number, station_name, address_line_1, city, state, postal_code, active, notes')
    .eq('department_id', ctx.departmentId)
    .order('station_number')

  // Fetch apparatus counts per station
  const { data: apparatus } = await adminClient
    .from('apparatus')
    .select('id, station_id')
    .eq('department_id', ctx.departmentId)
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
    .eq('department_id', ctx.departmentId)
    .eq('active', true)
    .eq('signup_status', 'active')

  return (
    <StationsListClient
      stations={stations ?? []}
      apparatusCountMap={apparatusCountMap}
      personnelCount={personnel?.length ?? 0}
      isAdmin={isAdmin}
      departmentId={ctx.departmentId}
    />
  )
}
