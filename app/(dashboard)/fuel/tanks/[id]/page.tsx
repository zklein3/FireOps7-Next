import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import BackButton from '@/components/BackButton'
import Link from 'next/link'
import HelpText from '@/components/HelpText'

const FUEL_LABELS: Record<string, string> = { diesel: 'Diesel', gasoline: 'Gasoline', other: 'Other' }
const FUEL_COLORS: Record<string, string> = {
  diesel: 'bg-blue-100 text-blue-700',
  gasoline: 'bg-amber-100 text-amber-700',
  other: 'bg-zinc-100 text-zinc-600',
}

export default async function TankDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (!ctx.departmentId) redirect('/dashboard')

  const department_id = ctx.departmentId
  const canManageFuelStorage = await hasPermission(ctx, 'manage_fuel_storage')

  // Verify tank belongs to this dept and module is on
  const { data: deptFlags } = await adminClient
    .from('departments')
    .select('module_fuel_storage')
    .eq('id', department_id)
    .single()
  if (!deptFlags?.module_fuel_storage) redirect('/fuel')

  const { data: tank } = await adminClient
    .from('fuel_tanks')
    .select('id, name, fuel_type, capacity_gallons, low_level_threshold_gallons, notes, active')
    .eq('id', id)
    .eq('department_id', department_id)
    .single()
  if (!tank) redirect('/fuel')

  const [deliveryResult, drawResult] = await Promise.all([
    adminClient.from('fuel_tank_deliveries')
      .select('id, delivery_date, gallons, cost_per_gallon, total_cost, vendor, received_by_personnel_id, notes, created_at')
      .eq('tank_id', id)
      .order('delivery_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50),
    adminClient.from('apparatus_fuel_logs')
      .select('id, apparatus_id, fuel_date, gallons, fuel_type, logged_by_personnel_id')
      .eq('fuel_tank_id', id)
      .eq('department_id', department_id)
      .order('fuel_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const deliveries = deliveryResult.data ?? []
  const draws = drawResult.data ?? []

  // Compute current level
  const totalIn = deliveries.reduce((s, d) => s + Number(d.gallons), 0)
  const totalOut = draws.reduce((s, d) => s + Number(d.gallons), 0)
  const current = Math.max(0, totalIn - totalOut)

  // Fetch personnel + apparatus names for display
  const personnelIds = [
    ...new Set([
      ...deliveries.map(d => d.received_by_personnel_id).filter(Boolean),
      ...draws.map(d => d.logged_by_personnel_id).filter(Boolean),
    ] as string[]),
  ]
  const apparatusIds = [...new Set(draws.map(d => d.apparatus_id).filter(Boolean) as string[])]

  const [personnelResult, apparatusResult] = await Promise.all([
    personnelIds.length > 0
      ? adminClient.from('personnel').select('id, first_name, last_name').in('id', personnelIds)
      : { data: [] },
    apparatusIds.length > 0
      ? adminClient.from('apparatus').select('id, unit_number').in('id', apparatusIds)
      : { data: [] },
  ])

  const personnelMap = Object.fromEntries(
    (personnelResult.data ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`])
  )
  const apparatusMap = Object.fromEntries(
    (apparatusResult.data ?? []).map(a => [a.id, a.unit_number])
  )

  const levelPct = tank.capacity_gallons > 0
    ? Math.min(100, (current / tank.capacity_gallons) * 100)
    : 0
  const threshPct = tank.capacity_gallons > 0
    ? Math.min(100, (tank.low_level_threshold_gallons / tank.capacity_gallons) * 100)
    : 0
  const isEmpty = current <= 0
  const isLow = !isEmpty && current <= tank.low_level_threshold_gallons
  const barColor = isEmpty ? 'bg-red-400' : isLow ? 'bg-amber-400' : 'bg-green-500'

  return (
    <div className="max-w-2xl">
      <div className="mb-2">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">{tank.name}</h1>
        <div className="flex items-center gap-2 mt-1">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${FUEL_COLORS[tank.fuel_type]}`}>
            {FUEL_LABELS[tank.fuel_type]}
          </span>
          {!tank.active && (
            <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">Inactive</span>
          )}
          {isEmpty && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Empty</span>
          )}
          {isLow && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Low Fuel</span>
          )}
        </div>
      </div>
      <HelpText className="mb-4">
        The level here updates automatically as apparatus fill up on-site and deliveries are received — it's not
        something you adjust by hand.
      </HelpText>
      <div className="mb-5">
        <BackButton href="/fuel" />
      </div>

      {/* Level gauge */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 mb-5">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className={`text-3xl font-bold ${isEmpty ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-zinc-900'}`}>
              {current.toFixed(1)} gal
            </p>
            <p className="text-sm text-zinc-500 mt-0.5">
              of {tank.capacity_gallons.toLocaleString()} gal capacity ({levelPct.toFixed(0)}%)
            </p>
          </div>
          <div className="text-right text-xs text-zinc-400">
            <p>In: {totalIn.toFixed(1)} gal</p>
            <p>Out: {totalOut.toFixed(1)} gal</p>
          </div>
        </div>

        <div className="relative">
          <div className="h-4 rounded-full bg-zinc-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${levelPct}%` }}
            />
          </div>
          {tank.low_level_threshold_gallons > 0 && (
            <div
              className="absolute top-0 h-4 w-0.5 bg-zinc-400 rounded"
              style={{ left: `${threshPct}%` }}
              title={`Alert threshold`}
            />
          )}
        </div>
        <div className="flex justify-between text-xs text-zinc-400 mt-1">
          <span>0</span>
          {tank.low_level_threshold_gallons > 0 && (
            <span style={{ marginLeft: `${threshPct}%` }} className="-translate-x-1/2">
              Alert: {tank.low_level_threshold_gallons} gal
            </span>
          )}
          <span>{tank.capacity_gallons.toLocaleString()}</span>
        </div>

        {tank.notes && (
          <p className="mt-3 text-xs text-zinc-400 border-t border-zinc-100 pt-3">{tank.notes}</p>
        )}
      </div>

      {/* Delivery history */}
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-zinc-700 mb-3">
          Delivery History ({deliveries.length} {deliveries.length === 50 ? '+ more' : 'total'})
        </h2>
        {deliveries.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-400">
            No deliveries logged yet.
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100 overflow-hidden">
            {deliveries.map(d => (
              <div key={d.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-zinc-400">{d.delivery_date}</span>
                      <span className="font-semibold text-zinc-900">+{Number(d.gallons).toFixed(1)} gal</span>
                      {d.cost_per_gallon != null && (
                        <span className="text-zinc-500">${Number(d.cost_per_gallon).toFixed(3)}/gal</span>
                      )}
                      {d.total_cost != null && (
                        <span className="font-semibold text-zinc-700">${Number(d.total_cost).toFixed(2)}</span>
                      )}
                    </div>
                    <div className="flex gap-3 mt-0.5 text-xs text-zinc-400">
                      {d.vendor && <span>{d.vendor}</span>}
                      {d.received_by_personnel_id && (
                        <span>Received by {personnelMap[d.received_by_personnel_id] ?? '—'}</span>
                      )}
                      {d.notes && <span className="italic">{d.notes}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Draw history */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-700 mb-3">
          Apparatus Fill-Ups ({draws.length} {draws.length === 50 ? '+ more' : 'total'})
        </h2>
        {draws.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-400">
            No fill-ups logged from this tank yet.
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100 overflow-hidden">
            {draws.map(d => (
              <div key={d.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-zinc-400">{d.fuel_date}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                    Unit {apparatusMap[d.apparatus_id] ?? '—'}
                  </span>
                </div>
                <span className="text-sm font-semibold text-red-600">−{Number(d.gallons).toFixed(3)} gal</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {canManageFuelStorage && (
        <div className="mt-6">
          <Link href="/dept-admin/fuel-tanks" className="text-xs text-zinc-400 hover:text-zinc-600 underline underline-offset-2">
            Manage tanks in Dept Admin →
          </Link>
        </div>
      )}
    </div>
  )
}
