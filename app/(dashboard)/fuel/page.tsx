import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import BackButton from '@/components/BackButton'
import FuelClient from './FuelClient'
import TankStatusSection from './TankStatusSection'

export default async function FuelPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  const isOfficerOrAbove = await hasPermission(ctx, 'manage_fuel_log')
  const department_id = ctx.departmentId

  const { data: apparatusRaw } = await adminClient.from('apparatus')
    .select('id, unit_number, apparatus_name')
    .eq('department_id', department_id)
    .eq('active', true)
    .order('unit_number')

  const { data: deptFlags } = await adminClient
    .from('departments')
    .select('module_fuel_storage')
    .eq('id', department_id)
    .single()

  const fuelTanksRaw = deptFlags?.module_fuel_storage
    ? (await adminClient.from('fuel_tanks')
        .select('id, name, fuel_type, capacity_gallons, low_level_threshold_gallons')
        .eq('department_id', department_id)
        .eq('active', true)
        .order('created_at')).data ?? []
    : []

  // Compute current level per tank from deliveries minus draws
  const tankIds = fuelTanksRaw.map(t => t.id)
  const [tankDeliveryResult, tankDrawResult] = tankIds.length > 0
    ? await Promise.all([
        adminClient.from('fuel_tank_deliveries').select('tank_id, gallons').in('tank_id', tankIds),
        adminClient.from('apparatus_fuel_logs').select('fuel_tank_id, gallons').in('fuel_tank_id', tankIds),
      ])
    : [{ data: [] }, { data: [] }]

  const deliverySum: Record<string, number> = {}
  const drawSum: Record<string, number> = {}
  for (const d of tankDeliveryResult.data ?? []) {
    deliverySum[d.tank_id] = (deliverySum[d.tank_id] ?? 0) + Number(d.gallons)
  }
  for (const d of tankDrawResult.data ?? []) {
    if (d.fuel_tank_id) drawSum[d.fuel_tank_id] = (drawSum[d.fuel_tank_id] ?? 0) + Number(d.gallons)
  }
  const tanksWithLevel = fuelTanksRaw.map(t => ({
    ...t,
    fuel_type: t.fuel_type as 'diesel' | 'gasoline' | 'other',
    current_gallons: Math.max(0, (deliverySum[t.id] ?? 0) - (drawSum[t.id] ?? 0)),
  }))

  const { data: logsRaw } = await adminClient
    .from('apparatus_fuel_logs')
    .select('id, apparatus_id, fuel_date, gallons, cost_per_gallon, total_cost, fuel_type, fuel_system, aux_description, odometer, engine_hours, vendor, notes, logged_by_personnel_id, fuel_tank_id')
    .eq('department_id', department_id)
    .order('fuel_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)

  const tankMap = Object.fromEntries(fuelTanksRaw.map(t => [t.id, t.name as string]))

  const personnelIds = [...new Set((logsRaw ?? []).map(l => l.logged_by_personnel_id).filter(Boolean) as string[])]
  const { data: personnelRaw } = personnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', personnelIds)
    : { data: [] }
  const personnelMap = Object.fromEntries((personnelRaw ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  const apparatusMap = Object.fromEntries((apparatusRaw ?? []).map(a => [
    a.id,
    `${a.unit_number}${a.apparatus_name ? ` — ${a.apparatus_name}` : ''}`,
  ]))

  const entries = (logsRaw ?? []).map(l => ({
    id: l.id,
    apparatus_id: l.apparatus_id,
    apparatus_label: apparatusMap[l.apparatus_id] ?? '—',
    fuel_date: l.fuel_date,
    gallons: l.gallons,
    cost_per_gallon: l.cost_per_gallon,
    total_cost: l.total_cost,
    fuel_type: l.fuel_type,
    fuel_system: l.fuel_system,
    aux_description: l.aux_description,
    odometer: l.odometer,
    engine_hours: l.engine_hours,
    vendor: l.vendor,
    notes: l.notes,
    logged_by_name: l.logged_by_personnel_id ? (personnelMap[l.logged_by_personnel_id] ?? null) : null,
    fuel_tank_id: l.fuel_tank_id ?? null,
    tank_name: l.fuel_tank_id ? (tankMap[l.fuel_tank_id] ?? null) : null,
  }))

  return (
    <div className="max-w-2xl">
      <div className="mb-2">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Fuel Log</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Department-wide fuel tracking</p>
      </div>
      <div className="mb-5">
        <BackButton />
      </div>
      {tanksWithLevel.length > 0 && (
        <div className="mb-6">
          <TankStatusSection tanks={tanksWithLevel} />
        </div>
      )}
      <FuelClient
        entries={entries}
        apparatus={apparatusRaw ?? []}
        fuelTanks={fuelTanksRaw}
        isOfficerOrAbove={isOfficerOrAbove}
      />
    </div>
  )
}
