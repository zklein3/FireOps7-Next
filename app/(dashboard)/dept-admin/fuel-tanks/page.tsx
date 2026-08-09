import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import FuelTanksClient from './FuelTanksClient'

export default async function FuelTanksPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (!ctx.departmentId) redirect('/dashboard')
  if (!(await hasPermission(ctx, 'manage_fuel_storage'))) redirect('/dashboard')

  const { data: deptRow } = await adminClient
    .from('departments')
    .select('module_fuel_storage')
    .eq('id', ctx.departmentId)
    .single()
  if (!deptRow?.module_fuel_storage) redirect('/dept-admin')

  const department_id = ctx.departmentId

  const { data: tanks } = await adminClient
    .from('fuel_tanks')
    .select('id, name, fuel_type, capacity_gallons, low_level_threshold_gallons, active, notes')
    .eq('department_id', department_id)
    .order('created_at')

  const tankIds = (tanks ?? []).map(t => t.id)

  const [deliveryResult, drawResult, historyResult] = tankIds.length > 0
    ? await Promise.all([
        adminClient.from('fuel_tank_deliveries')
          .select('tank_id, gallons')
          .in('tank_id', tankIds),
        adminClient.from('apparatus_fuel_logs')
          .select('fuel_tank_id, gallons')
          .in('fuel_tank_id', tankIds),
        adminClient.from('fuel_tank_deliveries')
          .select('id, tank_id, delivery_date, gallons, cost_per_gallon, total_cost, vendor')
          .in('tank_id', tankIds)
          .order('delivery_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(100),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const deliverySum: Record<string, number> = {}
  const drawSum: Record<string, number> = {}

  for (const d of deliveryResult.data ?? []) {
    deliverySum[d.tank_id] = (deliverySum[d.tank_id] ?? 0) + Number(d.gallons)
  }
  for (const d of drawResult.data ?? []) {
    if (d.fuel_tank_id) {
      drawSum[d.fuel_tank_id] = (drawSum[d.fuel_tank_id] ?? 0) + Number(d.gallons)
    }
  }

  // Keep latest 5 per tank for history display
  const deliveryHistory: Record<string, Array<{
    id: string
    delivery_date: string
    gallons: number
    cost_per_gallon: number | null
    total_cost: number | null
    vendor: string | null
  }>> = {}
  for (const d of historyResult.data ?? []) {
    if (!deliveryHistory[d.tank_id]) deliveryHistory[d.tank_id] = []
    if (deliveryHistory[d.tank_id].length < 5) {
      deliveryHistory[d.tank_id].push({
        id: d.id,
        delivery_date: d.delivery_date,
        gallons: Number(d.gallons),
        cost_per_gallon: d.cost_per_gallon != null ? Number(d.cost_per_gallon) : null,
        total_cost: d.total_cost != null ? Number(d.total_cost) : null,
        vendor: d.vendor,
      })
    }
  }

  const tanksWithLevel = (tanks ?? []).map(t => ({
    ...t,
    fuel_type: t.fuel_type as 'diesel' | 'gasoline' | 'other',
    current_gallons: Math.max(0, (deliverySum[t.id] ?? 0) - (drawSum[t.id] ?? 0)),
  }))

  return (
    <FuelTanksClient
      tanks={tanksWithLevel}
      deliveryHistory={deliveryHistory}
      departmentId={department_id}
    />
  )
}
