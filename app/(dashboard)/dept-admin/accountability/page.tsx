import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { ICS_MODE_LANES, ACTIVE_VIOLENCE_LANES, DEFAULT_ACCOUNTABILITY_LANES } from '@/lib/ics-roles'
import AccountabilitySettingsClient from './AccountabilitySettingsClient'

export default async function AccountabilitySettingsPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (!ctx.departmentId || ctx.systemRole !== 'admin') redirect('/dashboard')

  const department_id = ctx.departmentId

  let { data: defaultLanes } = await adminClient
    .from('accountability_lane_templates')
    .select('id, name, sort_order, active')
    .eq('department_id', department_id)
    .eq('profile', 'default')
    .order('sort_order')

  // Seed the default profile on first visit — matches the fallback initBoardLanes()
  // uses when a board is started before anyone's ever opened this settings page.
  if (!defaultLanes || defaultLanes.length === 0) {
    const seeds = DEFAULT_ACCOUNTABILITY_LANES.map((name, i) => ({
      department_id,
      name,
      sort_order: i,
      active: true,
      profile: 'default' as const,
    }))
    await adminClient.from('accountability_lane_templates').insert(seeds)
    const { data: fresh } = await adminClient
      .from('accountability_lane_templates')
      .select('id, name, sort_order, active')
      .eq('department_id', department_id)
      .eq('profile', 'default')
      .order('sort_order')
    defaultLanes = fresh
  }

  const { data: icsLanes } = await adminClient
    .from('accountability_lane_templates')
    .select('id, name, sort_order, active')
    .eq('department_id', department_id)
    .eq('profile', 'ics')
    .order('sort_order')

  const { data: activeViolenceLanes } = await adminClient
    .from('accountability_lane_templates')
    .select('id, name, sort_order, active')
    .eq('department_id', department_id)
    .eq('profile', 'active_violence')
    .order('sort_order')

  return (
    <AccountabilitySettingsClient
      departmentId={department_id}
      profiles={[
        { profile: 'default', label: 'Default', description: 'Copied into every new board — your everyday tactical assignments.', lanes: defaultLanes ?? [], builtInPreset: null },
        { profile: 'ics', label: 'ICS / NIMS Mode', description: 'Ensured on a board the moment ICS/NIMS Mode is switched on (added on top of whatever\'s already there — never replaces it).', lanes: icsLanes ?? [], builtInPreset: ICS_MODE_LANES },
        { profile: 'active_violence', label: 'Active Violence', description: 'Ensured on a board the moment Active Violence / Mass Casualty mode is switched on.', lanes: activeViolenceLanes ?? [], builtInPreset: ACTIVE_VIOLENCE_LANES },
      ]}
    />
  )
}
