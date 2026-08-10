'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'

const CATEGORY_LABELS: Record<string, string> = { medication: 'Medication', supply: 'Supply', equipment: 'Equipment' }
const CATEGORY_COLORS: Record<string, string> = {
  medication: 'bg-red-100 text-red-700',
  supply: 'bg-blue-100 text-blue-700',
  equipment: 'bg-zinc-100 text-zinc-600',
}
const LOC_TYPE_COLORS: Record<string, string> = {
  Storeroom: 'bg-zinc-100 text-zinc-600',
  Bag: 'bg-purple-100 text-purple-700',
  Compartment: 'bg-blue-100 text-blue-700',
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type StoreroomRow = { id: string; name: string; apparatus_id: string | null; compartment_id: string | null }

function locationType(s: StoreroomRow): 'Storeroom' | 'Bag' | 'Compartment' {
  if (!s.apparatus_id) return 'Storeroom'
  if (!s.compartment_id) return 'Bag'
  return 'Compartment'
}

function locationLabel(s: StoreroomRow, unitMap: Record<string, string>): string {
  if (!s.apparatus_id) return s.name
  return `${unitMap[s.apparatus_id] ?? '?'} — ${s.name}`
}

export default async function MedicalReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const { days } = await searchParams
  const windowDays = parseInt(days ?? '30') || 30

  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  if (!(await hasPermission(ctx, 'manage_medical_inventory'))) redirect('/reports')

  const { data: deptRow } = await adminClient.from('departments').select('module_medical').eq('id', ctx.departmentId).single()
  if (!deptRow?.module_medical && !ctx.isSysAdmin) redirect('/reports')

  const department_id = ctx.departmentId
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  // Storerooms — include compartment_id to distinguish Storeroom / Bag / Compartment
  const { data: storeroomsRaw } = await adminClient
    .from('medical_storerooms')
    .select('id, name, apparatus_id, compartment_id')
    .eq('department_id', department_id)
    .eq('active', true)
  const storerooms: StoreroomRow[] = (storeroomsRaw ?? []).map(s => ({
    id: s.id,
    name: s.name,
    apparatus_id: s.apparatus_id ?? null,
    compartment_id: s.compartment_id ?? null,
  }))
  const storeroomIds = storerooms.map(s => s.id)
  const storeroomIndex = Object.fromEntries(storerooms.map(s => [s.id, s]))

  // Apparatus unit numbers (for bags + compartments location labels)
  const appIds = [...new Set(storerooms.map(s => s.apparatus_id).filter(Boolean) as string[])]
  const { data: apparatusRows } = appIds.length > 0
    ? await adminClient.from('apparatus').select('id, unit_number').in('id', appIds)
    : { data: [] }
  const unitMap = Object.fromEntries((apparatusRows ?? []).map(a => [a.id, a.unit_number]))

  // Supply types
  const { data: supplyTypes } = await adminClient
    .from('medical_supply_types')
    .select('id, name, category, unit_of_measure, is_controlled')
    .eq('department_id', department_id)
    .eq('active', true)
    .order('category').order('name')
  const supplyMap = Object.fromEntries((supplyTypes ?? []).map(s => [s.id, s]))

  if (storeroomIds.length === 0) {
    return (
      <div className="max-w-2xl">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Medical Supplies Report</h1>
        </div>
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          No medical storerooms configured.
        </div>
      </div>
    )
  }

  // Storeroom inventory
  const { data: inventory } = await adminClient
    .from('medical_storeroom_inventory')
    .select('id, storeroom_id, supply_type_id, par_level')
    .in('storeroom_id', storeroomIds)
  const invIds = (inventory ?? []).map(i => i.id)

  // Active lots with remaining stock
  const { data: lots } = invIds.length > 0
    ? await adminClient
        .from('medical_stock_lots')
        .select('id, storeroom_inventory_id, quantity_remaining, expiration_date, lot_number')
        .in('storeroom_inventory_id', invIds)
        .eq('active', true)
        .gt('quantity_remaining', 0)
    : { data: [] }

  // Consumption transactions in window
  const { data: transactions } = storeroomIds.length > 0
    ? await adminClient
        .from('medical_stock_transactions')
        .select('supply_type_id, storeroom_id, transaction_type, quantity')
        .in('storeroom_id', storeroomIds)
        .in('transaction_type', ['dispensed', 'administered', 'wasted'])
        .gte('created_at', since)
    : { data: [] }

  // ── Build consumption summary ──────────────────────────────────────────────
  // 'administered' (controlled substances, one vial per transaction) counts as Used
  // alongside 'dispensed' — both represent whole units leaving stock via legitimate use.
  const consumptionBySupply: Record<string, { dispensed: number; wasted: number }> = {}
  for (const tx of transactions ?? []) {
    if (!consumptionBySupply[tx.supply_type_id]) consumptionBySupply[tx.supply_type_id] = { dispensed: 0, wasted: 0 }
    if (tx.transaction_type === 'dispensed' || tx.transaction_type === 'administered') consumptionBySupply[tx.supply_type_id]!.dispensed += tx.quantity
    if (tx.transaction_type === 'wasted') consumptionBySupply[tx.supply_type_id]!.wasted += tx.quantity
  }
  const consumptionRows = Object.entries(consumptionBySupply)
    .map(([id, c]) => ({ id, ...c, total: c.dispensed + c.wasted }))
    .sort((a, b) => b.total - a.total)

  // ── Build stock vs PAR table ───────────────────────────────────────────────
  const stockRows = (inventory ?? []).map(inv => {
    const supply = supplyMap[inv.supply_type_id]
    const storeroom = storeroomIndex[inv.storeroom_id]
    const invLots = (lots ?? []).filter(l => l.storeroom_inventory_id === inv.id)
    const total = invLots.reduce((s, l) => s + l.quantity_remaining, 0)
    const status = total === 0 ? 'empty' : total < inv.par_level ? 'low' : 'good'
    const locType = storeroom ? locationType(storeroom) : 'Storeroom'
    const locLabel = storeroom ? locationLabel(storeroom, unitMap) : '—'
    return { inv, supply, total, status, locType, locLabel }
  }).sort((a, b) => {
    const order: Record<string, number> = { empty: 0, low: 1, good: 2 }
    return (order[a.status] ?? 3) - (order[b.status] ?? 3)
  })

  // ── Expiring / expired lots (active stock only) ────────────────────────────
  const now = new Date()
  const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
  const expiringLots = (lots ?? [])
    .filter(l => l.expiration_date && new Date(l.expiration_date + 'T00:00:00') <= in60)
    .map(l => {
      const inv = (inventory ?? []).find(i => i.id === l.storeroom_inventory_id)
      const supply = inv ? supplyMap[inv.supply_type_id] : null
      const storeroom = inv ? storeroomIndex[inv.storeroom_id] : null
      const locType = storeroom ? locationType(storeroom) : 'Storeroom'
      const locLabel = storeroom ? locationLabel(storeroom, unitMap) : '—'
      const expDate = new Date(l.expiration_date! + 'T00:00:00')
      const isExpired = expDate < now
      return { lot: l, supply, locType, locLabel, isExpired }
    })
    .sort((a, b) => (a.lot.expiration_date ?? '').localeCompare(b.lot.expiration_date ?? ''))

  const expiredCount = expiringLots.filter(e => e.isExpired).length
  const dayOptions = [7, 30, 60, 90]

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Medical Supplies Report</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Stock levels, consumption, and expiration</p>
        </div>
      </div>

      {/* ── Stock vs PAR ──────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-zinc-900 mb-3">Current Stock vs PAR</h2>
        {stockRows.length === 0 ? (
          <div className="rounded-xl bg-white border border-zinc-200 px-6 py-8 text-center text-sm text-zinc-400">No supply types assigned to any storeroom.</div>
        ) : (
          <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden divide-y divide-zinc-100">
            {stockRows.map(({ inv, supply, total, status, locType, locLabel }) => (
              <div key={inv.id} className="flex items-center px-5 py-3 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-zinc-900">{supply?.name ?? '—'}</p>
                    {supply && <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${CATEGORY_COLORS[supply.category] ?? ''}`}>{CATEGORY_LABELS[supply.category] ?? supply.category}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${LOC_TYPE_COLORS[locType]}`}>{locType}</span>
                    <p className="text-xs text-zinc-400">{locLabel}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 text-right">
                  <div>
                    <p className="text-xs text-zinc-400">PAR</p>
                    <p className="text-sm font-semibold text-zinc-600">{inv.par_level}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-400">On Hand</p>
                    <p className={`text-sm font-bold ${status === 'empty' ? 'text-red-600' : status === 'low' ? 'text-orange-600' : 'text-green-700'}`}>
                      {total} {supply?.unit_of_measure ?? ''}
                    </p>
                  </div>
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                    status === 'empty' ? 'bg-red-100 text-red-700' :
                    status === 'low' ? 'bg-orange-100 text-orange-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {status === 'empty' ? 'Empty' : status === 'low' ? 'Below PAR' : 'Good'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Consumption Summary ───────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-base font-semibold text-zinc-900">Consumption</h2>
          <div className="flex gap-1">
            {dayOptions.map(d => (
              <a key={d} href={`?days=${d}`}
                className={`rounded-lg px-3 py-1 text-xs font-semibold border transition-colors ${
                  windowDays === d ? 'bg-red-700 text-white border-red-700' : 'bg-white text-zinc-600 border-zinc-200 hover:border-red-300'
                }`}>
                {d}d
              </a>
            ))}
          </div>
        </div>
        {consumptionRows.length === 0 ? (
          <div className="rounded-xl bg-white border border-zinc-200 px-6 py-8 text-center text-sm text-zinc-400">
            No dispensing or waste recorded in the last {windowDays} days.
          </div>
        ) : (
          <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden divide-y divide-zinc-100">
            {consumptionRows.map(row => {
              const supply = supplyMap[row.id]
              return (
                <div key={row.id} className="flex items-center px-5 py-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-900">{supply?.name ?? '—'}</p>
                    <p className="text-xs text-zinc-400">{supply?.unit_of_measure ?? ''}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-right text-xs">
                    <div>
                      <p className="text-zinc-400">Used</p>
                      <p className="font-semibold text-blue-700">{row.dispensed}</p>
                    </div>
                    <div>
                      <p className="text-zinc-400">Wasted</p>
                      <p className="font-semibold text-red-600">{row.wasted}</p>
                    </div>
                    <div>
                      <p className="text-zinc-400">Total</p>
                      <p className="font-bold text-zinc-900">{row.total}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Expiring / Expired Lots ───────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-base font-semibold text-zinc-900">Expiring / Expired Lots</h2>
          {expiredCount > 0 && (
            <span className="rounded-full bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5">
              {expiredCount} expired
            </span>
          )}
          <span className="text-sm font-normal text-zinc-400">active stock only · within 60 days</span>
        </div>
        {expiringLots.length === 0 ? (
          <div className="rounded-xl bg-white border border-zinc-200 px-6 py-8 text-center text-sm text-zinc-400">
            No lots expiring within 60 days.
          </div>
        ) : (
          <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden divide-y divide-zinc-100">
            {expiringLots.map(({ lot, supply, locType, locLabel, isExpired }) => (
              <div key={lot.id} className={`flex items-center px-5 py-3 gap-3 ${isExpired ? 'bg-red-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900">{supply?.name ?? '—'}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${LOC_TYPE_COLORS[locType]}`}>{locType}</span>
                    <p className="text-xs text-zinc-400">
                      {locLabel}{lot.lot_number ? ` · Lot ${lot.lot_number}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 text-right">
                  <div>
                    <p className="text-xs text-zinc-400">Qty</p>
                    <p className="text-sm font-semibold text-zinc-900">{lot.quantity_remaining} {supply?.unit_of_measure ?? ''}</p>
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${isExpired ? 'text-red-600' : 'text-amber-600'}`}>
                      {isExpired ? '⚠ Expired' : 'Exp'} {fmtDate(lot.expiration_date)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
