import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import FuelReportClient from './FuelReportClient'

export default async function FuelReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; apparatusId?: string }>
}) {
  const { from: fromParam, to: toParam, apparatusId } = await searchParams

  // Default to current month when no dates provided
  const now = new Date()
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const defaultTo = now.toISOString().split('T')[0]
  const from = fromParam || defaultFrom
  const to = toParam || defaultTo
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')
  if (!(await hasPermission(ctx, 'manage_fuel_log'))) redirect('/dashboard')

  const department_id = ctx.departmentId

  const { data: apparatusRaw } = await adminClient.from('apparatus')
    .select('id, unit_number, apparatus_name')
    .eq('department_id', department_id)
    .eq('active', true)
    .order('unit_number')

  // ── Tank storage report ───────────────────────────────────────────────────
  const { data: deptFlags } = await adminClient
    .from('departments')
    .select('module_fuel_storage')
    .eq('id', department_id)
    .single()

  const tankReport: Array<{
    id: string; name: string; fuel_type: string
    capacity_gallons: number; low_level_threshold_gallons: number; current_gallons: number
    avg_cost_per_gallon: number | null; daily_usage: number | null; days_until_reorder: number | null
    ledger: Array<{ date: string; type: 'delivery' | 'draw'; gallons: number; label: string; cost_per_gallon: number | null; total_cost: number | null; running_balance: number }>
  }> = []

  if (deptFlags?.module_fuel_storage) {
    const { data: tanksRaw } = await adminClient
      .from('fuel_tanks')
      .select('id, name, fuel_type, capacity_gallons, low_level_threshold_gallons')
      .eq('department_id', department_id)
      .eq('active', true)
      .order('created_at')

    const tankIds = (tanksRaw ?? []).map(t => t.id)
    if (tankIds.length > 0) {
      const [allDeliveriesResult, allDrawsResult] = await Promise.all([
        adminClient.from('fuel_tank_deliveries')
          .select('tank_id, delivery_date, gallons, cost_per_gallon, total_cost, vendor')
          .in('tank_id', tankIds)
          .order('delivery_date'),
        adminClient.from('apparatus_fuel_logs')
          .select('fuel_tank_id, fuel_date, gallons, apparatus_id')
          .in('fuel_tank_id', tankIds)
          .eq('department_id', department_id)
          .order('fuel_date'),
      ])

      const allDeliveries = allDeliveriesResult.data ?? []
      const allDraws = allDrawsResult.data ?? []

      // Apparatus names for draw labels
      const drawApparatusIds = [...new Set(allDraws.map(d => d.apparatus_id).filter(Boolean) as string[])]
      const { data: drawApparatus } = drawApparatusIds.length > 0
        ? await adminClient.from('apparatus').select('id, unit_number').in('id', drawApparatusIds)
        : { data: [] }
      const drawApparatusMap = Object.fromEntries((drawApparatus ?? []).map(a => [a.id, a.unit_number]))

      // 90-day cutoff for usage rate
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
      const cutoff90 = ninetyDaysAgo.toISOString().split('T')[0]

      for (const t of tanksRaw ?? []) {
        const tDel = allDeliveries.filter(d => d.tank_id === t.id)
        const tDrw = allDraws.filter(d => d.fuel_tank_id === t.id)

        const totalIn = tDel.reduce((s, d) => s + Number(d.gallons), 0)
        const totalOut = tDrw.reduce((s, d) => s + Number(d.gallons), 0)
        const current_gallons = Math.max(0, totalIn - totalOut)

        const withCost = tDel.filter(d => d.cost_per_gallon != null)
        const avg_cost_per_gallon = withCost.length > 0
          ? withCost.reduce((s, d) => s + Number(d.cost_per_gallon!), 0) / withCost.length
          : null

        const used90 = tDrw.filter(d => d.fuel_date >= cutoff90).reduce((s, d) => s + Number(d.gallons), 0)
        const daily_usage = used90 > 0 ? used90 / 90 : null
        const days_until_reorder = daily_usage && current_gallons > t.low_level_threshold_gallons
          ? Math.floor((current_gallons - t.low_level_threshold_gallons) / daily_usage)
          : null

        // Date-filtered ledger with running balance
        const preIn = tDel.filter(d => d.delivery_date < from).reduce((s, d) => s + Number(d.gallons), 0)
        const preOut = tDrw.filter(d => d.fuel_date < from).reduce((s, d) => s + Number(d.gallons), 0)
        let balance = Math.max(0, preIn - preOut)

        const combined = [
          ...tDel.filter(d => d.delivery_date >= from && d.delivery_date <= to).map(d => ({
            date: d.delivery_date, type: 'delivery' as const,
            gallons: Number(d.gallons), label: d.vendor ?? 'Delivery',
            cost_per_gallon: d.cost_per_gallon != null ? Number(d.cost_per_gallon) : null,
            total_cost: d.total_cost != null ? Number(d.total_cost) : null,
          })),
          ...tDrw.filter(d => d.fuel_date >= from && d.fuel_date <= to).map(d => ({
            date: d.fuel_date, type: 'draw' as const,
            gallons: Number(d.gallons), label: `Unit ${drawApparatusMap[d.apparatus_id] ?? '—'}`,
            cost_per_gallon: null, total_cost: null,
          })),
        ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

        const ledger = combined.map(row => {
          balance = row.type === 'delivery' ? balance + row.gallons : balance - row.gallons
          return { ...row, running_balance: Math.max(0, balance) }
        })

        tankReport.push({
          id: t.id, name: t.name, fuel_type: t.fuel_type,
          capacity_gallons: t.capacity_gallons,
          low_level_threshold_gallons: t.low_level_threshold_gallons,
          current_gallons, avg_cost_per_gallon, daily_usage, days_until_reorder, ledger,
        })
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  let query = adminClient
    .from('apparatus_fuel_logs')
    .select('id, apparatus_id, fuel_date, gallons, cost_per_gallon, total_cost, fuel_type, fuel_system, aux_description, odometer, engine_hours, vendor, notes, logged_by_personnel_id')
    .eq('department_id', department_id)
    .order('fuel_date', { ascending: false })

  if (from) query = query.gte('fuel_date', from)
  if (to) query = query.lte('fuel_date', to)
  if (apparatusId) query = query.eq('apparatus_id', apparatusId)

  const { data: logsRaw } = await query

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
  }))

  return (
    <FuelReportClient
      entries={entries}
      apparatus={apparatusRaw ?? []}
      filters={{ from, to, apparatusId: apparatusId ?? '' }}
      tankReport={tankReport}
    />
  )
}
