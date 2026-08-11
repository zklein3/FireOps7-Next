import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import BackButton from '@/components/BackButton'
import FuelClient from '@/app/(dashboard)/fuel/FuelClient'

export default async function ApparatusFuelPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  const isOfficerOrAbove = await hasPermission(ctx, 'manage_fuel_log')
  const department_id = ctx.departmentId

  const { data: apparatus } = await adminClient.from('apparatus')
    .select('id, unit_number, apparatus_name').eq('id', id).eq('department_id', department_id).single()
  if (!apparatus) redirect('/equipment')

  const { data: deptFlags } = await adminClient
    .from('departments')
    .select('module_fuel_storage')
    .eq('id', department_id)
    .single()

  const fuelTanksRaw = deptFlags?.module_fuel_storage
    ? (await adminClient.from('fuel_tanks')
        .select('id, name, fuel_type')
        .eq('department_id', department_id)
        .eq('active', true)
        .order('created_at')).data ?? []
    : []

  const tankMap = Object.fromEntries(fuelTanksRaw.map(t => [t.id, t.name]))

  const { data: logsRaw } = await adminClient
    .from('apparatus_fuel_logs')
    .select('id, apparatus_id, fuel_date, gallons, cost_per_gallon, total_cost, fuel_type, fuel_system, aux_description, odometer, engine_hours, vendor, notes, logged_by_personnel_id, fuel_tank_id')
    .eq('apparatus_id', id)
    .eq('department_id', department_id)
    .order('fuel_date', { ascending: false })
    .order('created_at', { ascending: false })

  const personnelIds = [...new Set((logsRaw ?? []).map(l => l.logged_by_personnel_id).filter(Boolean) as string[])]
  const { data: personnelRaw } = personnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', personnelIds)
    : { data: [] }
  const personnelMap = Object.fromEntries((personnelRaw ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  const apparatusLabel = `${apparatus.unit_number}${apparatus.apparatus_name ? ` — ${apparatus.apparatus_name}` : ''}`

  const entries = (logsRaw ?? []).map(l => ({
    id: l.id,
    apparatus_id: l.apparatus_id,
    apparatus_label: apparatusLabel,
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
        <p className="text-sm text-zinc-500 mt-0.5">{apparatusLabel}</p>
      </div>
      <div className="mb-5">
        <BackButton href={`/equipment/${id}?from=/inspections`} />
      </div>
      <FuelClient
        entries={entries}
        apparatus={[{ id: apparatus.id, unit_number: apparatus.unit_number, apparatus_name: apparatus.apparatus_name }]}
        fuelTanks={fuelTanksRaw}
        fixedApparatusId={id}
        isOfficerOrAbove={isOfficerOrAbove}
      />
    </div>
  )
}
