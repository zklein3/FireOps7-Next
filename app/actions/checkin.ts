'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { createCheckinToken, type CheckinType } from '@/lib/checkin-token'

const TTL_MS: Record<CheckinType, number> = {
  event_instance: 24 * 60 * 60 * 1000,
  training_event: 24 * 60 * 60 * 1000,
  incident: 7 * 24 * 60 * 60 * 1000,
}

export async function generateCheckinToken(type: CheckinType, id: string) {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx?.departmentId) return { error: 'Not authenticated.' }
  if (!(await hasPermission(ctx, 'manage_events'))) {
    return { error: 'Officers and admins only.' }
  }

  const adminClient = createAdminClient()
  let belongs = false

  if (type === 'event_instance') {
    const { data: instance } = await adminClient.from('event_instances').select('series_id').eq('id', id).single()
    if (instance) {
      const { data: series } = await adminClient.from('event_series').select('department_id').eq('id', instance.series_id).single()
      belongs = series?.department_id === ctx.departmentId
    }
  } else if (type === 'training_event') {
    const { data: evt } = await adminClient.from('training_events').select('department_id').eq('id', id).single()
    belongs = evt?.department_id === ctx.departmentId
  } else {
    const { data: incident } = await adminClient.from('incidents').select('department_id').eq('id', id).single()
    belongs = incident?.department_id === ctx.departmentId
  }

  if (!belongs) return { error: 'Not found.' }

  return { token: createCheckinToken({ type, id }, TTL_MS[type]) }
}
