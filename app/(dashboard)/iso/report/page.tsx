import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import Link from 'next/link'
import HelpText from '@/components/HelpText'

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl bg-white border border-zinc-200 p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-zinc-900">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default async function IsoReportPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  // Module gate — Bundle B required
  const { data: deptFlags } = await adminClient.from('departments').select('module_iso').eq('id', ctx.departmentId).single()
  if (!deptFlags?.module_iso) redirect('/dashboard')

  const department_id = ctx.departmentId
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const oneYearAgoStr = oneYearAgo.toISOString().slice(0, 10)

  // Apparatus specs coverage
  const { data: allApparatus } = await adminClient
    .from('apparatus')
    .select('id, unit_number, make, model, model_year, exclude_from_iso')
    .eq('department_id', department_id)
    .eq('active', true)
    .order('unit_number')

  const { data: isoSpecs } = await adminClient
    .from('apparatus_iso_specs')
    .select('apparatus_id, pump_rating_gpm, tank_capacity_gal, foam_capacity_gal, aerial_length_ft, turning_radius_ft, gvwr_lbs, hose_loads')
    .eq('department_id', department_id)

  // Latest pump test per apparatus
  const { data: pumpTestsRaw } = await adminClient
    .from('apparatus_pump_tests')
    .select('apparatus_id, test_date, passed')
    .eq('department_id', department_id)
    .order('test_date', { ascending: false })

  const isoSpecMap = Object.fromEntries((isoSpecs ?? []).map(s => [s.apparatus_id, s]))

  // Latest pump test per apparatus (first row per apparatus_id since ordered desc)
  const pumpTestMap: Record<string, { test_date: string; passed: boolean }> = {}
  for (const t of pumpTestsRaw ?? []) {
    if (!pumpTestMap[t.apparatus_id]) pumpTestMap[t.apparatus_id] = { test_date: t.test_date, passed: t.passed }
  }

  // Hose stats
  const { data: hoses } = await adminClient
    .from('hoses')
    .select('id, hose_identifier, hose_type, diameter_in, length_ft, status, apparatus_id')
    .eq('department_id', department_id)
    .neq('status', 'retired')

  const { data: recentHoseTests } = await adminClient
    .from('hose_tests')
    .select('hose_id, test_date, passed')
    .eq('department_id', department_id)
    .gte('test_date', oneYearAgoStr)
    .order('test_date', { ascending: false })

  const testedHoseIds = new Set((recentHoseTests ?? []).map(t => t.hose_id))
  const hosesFailed = new Set((recentHoseTests ?? []).filter(t => !t.passed).map(t => t.hose_id))

  // Hydrant stats
  const { data: hydrants } = await adminClient
    .from('hydrants')
    .select('id, hydrant_number, location_description, out_of_service')
    .eq('department_id', department_id)

  const { data: recentFlowTests } = await adminClient
    .from('hydrant_flow_tests')
    .select('hydrant_id, test_date, flow_gpm')
    .eq('department_id', department_id)
    .gte('test_date', oneYearAgoStr)
    .order('test_date', { ascending: false })

  const testedHydrantIds = new Set((recentFlowTests ?? []).map(t => t.hydrant_id))

  // Staffing
  const { data: deptPersonnel } = await adminClient
    .from('department_personnel')
    .select('personnel_id, system_role')
    .eq('department_id', department_id)
    .eq('active', true)

  const staffingTotal = (deptPersonnel ?? []).length
  const staffingByRole = {
    admin: (deptPersonnel ?? []).filter(p => p.system_role === 'admin').length,
    officer: (deptPersonnel ?? []).filter(p => p.system_role === 'officer').length,
    member: (deptPersonnel ?? []).filter(p => p.system_role === 'member').length,
  }

  // Training certifications
  const { data: certsRaw } = await adminClient
    .from('member_certifications')
    .select('personnel_id, cert_name, expiration_date, active')
    .eq('department_id', department_id)
    .eq('active', true)

  // Group by cert_name — count holders and expired
  const certMap = new Map<string, { total: number; expired: number }>()
  const today = new Date()
  for (const c of certsRaw ?? []) {
    const name = c.cert_name ?? 'Unknown'
    const isExpired = c.expiration_date ? new Date(c.expiration_date + 'T00:00:00') < today : false
    const existing = certMap.get(name) ?? { total: 0, expired: 0 }
    certMap.set(name, { total: existing.total + 1, expired: existing.expired + (isExpired ? 1 : 0) })
  }
  const certSummary = [...certMap.entries()]
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.total - a.total)

  // Pre-plans
  const { data: preplans } = await adminClient
    .from('iso_preplans')
    .select('id, location_name, address, surveyed_date')
    .eq('department_id', department_id)
    .order('location_name')

  // Mutual aid agreements
  const { data: mutualAidAgreements } = await adminClient
    .from('iso_mutual_aid_agreements')
    .select('id, partner_department, agreement_type, effective_date, expiration_date, active, apparatus')
    .eq('department_id', department_id)
    .order('partner_department')

  // Training hours (last 12 months)
  const { data: trainingEvents } = await adminClient
    .from('training_events')
    .select('id, topic, event_date, hours')
    .eq('department_id', department_id)
    .gte('event_date', oneYearAgoStr)
    .order('event_date', { ascending: false })

  const trainingEventIds = (trainingEvents ?? []).map(e => e.id)
  const { data: trainingAttendance } = trainingEventIds.length > 0
    ? await adminClient
        .from('training_event_attendance')
        .select('event_id, personnel_id')
        .in('event_id', trainingEventIds)
        .eq('status', 'verified')
    : { data: [] as { event_id: string; personnel_id: string }[] }

  const attendeeIds = [...new Set((trainingAttendance ?? []).map(a => a.personnel_id))]
  const { data: attendeePersonnel } = attendeeIds.length > 0
    ? await adminClient
        .from('personnel')
        .select('id, first_name, last_name')
        .in('id', attendeeIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[] }

  // Hose inventory summary — total owned from hoses table, on-truck from hose_loads
  type HoseLoad = { diameter_in: number; length_ft: number }
  const ownedByDiameter = new Map<number, number>()
  for (const h of hoses ?? []) {
    if (h.diameter_in && h.length_ft) {
      ownedByDiameter.set(h.diameter_in, (ownedByDiameter.get(h.diameter_in) ?? 0) + h.length_ft)
    }
  }
  const onTruckByDiameter = new Map<number, number>()
  for (const spec of isoSpecs ?? []) {
    const loads = spec.hose_loads as HoseLoad[] | null
    for (const load of loads ?? []) {
      if (load.diameter_in && load.length_ft) {
        onTruckByDiameter.set(load.diameter_in, (onTruckByDiameter.get(load.diameter_in) ?? 0) + load.length_ft)
      }
    }
  }
  const allDiameters = [...new Set([...ownedByDiameter.keys(), ...onTruckByDiameter.keys()])].sort((a, b) => a - b)
  const hoseInventory = allDiameters.map(d => {
    const owned = ownedByDiameter.get(d) ?? 0
    const onTruck = onTruckByDiameter.get(d) ?? 0
    const inStorage = owned - onTruck
    return { diameter: d, owned, onTruck, inStorage, gap: inStorage < 0 }
  })

  // Training summary calculations
  const eventHoursMap = Object.fromEntries((trainingEvents ?? []).map(e => [e.id, parseFloat(e.hours) || 0]))
  const personnelNameMap = Object.fromEntries((attendeePersonnel ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))
  const hoursByPersonnel = new Map<string, number>()
  for (const a of trainingAttendance ?? []) {
    const hrs = eventHoursMap[a.event_id] ?? 0
    hoursByPersonnel.set(a.personnel_id, (hoursByPersonnel.get(a.personnel_id) ?? 0) + hrs)
  }
  const trainingRoster = [...hoursByPersonnel.entries()]
    .map(([id, hours]) => ({ id, name: personnelNameMap[id] ?? '—', hours }))
    .sort((a, b) => b.hours - a.hours)
  const totalTrainingEvents = (trainingEvents ?? []).length
  const totalTrainingHours = (trainingEvents ?? []).reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0)
  const avgHoursPerMember = trainingRoster.length > 0
    ? Math.round((trainingRoster.reduce((s, r) => s + r.hours, 0) / trainingRoster.length) * 10) / 10
    : 0

  const isoApparatus = (allApparatus ?? []).filter(a => !a.exclude_from_iso)
  const excludedApparatus = (allApparatus ?? []).filter(a => a.exclude_from_iso)
  const totalApparatus = isoApparatus.length
  const specsComplete = isoApparatus.filter(a => isoSpecMap[a.id]).length

  const activeHoses = (hoses ?? []).filter(h => h.status === 'in_service')
  const hosesTestedPct = activeHoses.length > 0
    ? Math.round((activeHoses.filter(h => testedHoseIds.has(h.id)).length / activeHoses.length) * 100)
    : null

  const totalHydrants = (hydrants ?? []).length
  const hydrantsTestedPct = totalHydrants > 0
    ? Math.round((hydrants ?? []).filter(h => testedHydrantIds.has(h.id)).length / totalHydrants * 100)
    : null

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">ISO Report</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Coverage summary for ISO audit preparation</p>
        </div>
        <Link href="/iso/report/print"
          className="shrink-0 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors">
          Build Report →
        </Link>
      </div>

      <HelpText className="mb-4">
        This page is a live summary — "Build Report →" is where you configure sections, set the audit date, and
        print the actual audit-ready document.
      </HelpText>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-8">
        <StatCard label="Apparatus Specs" value={`${specsComplete}/${totalApparatus}`} sub="ISO specs entered" />
        <StatCard label="Active Personnel" value={staffingTotal} sub={`${staffingByRole.officer} officers · ${staffingByRole.member} members`} />
        <StatCard label="Training Hours" value={totalTrainingHours} sub={`${totalTrainingEvents} events · past 12 months`} />
        <StatCard label="Mutual Aid" value={(mutualAidAgreements ?? []).filter(a => a.active).length} sub="active agreements" />
      </div>

      {/* Apparatus specs table */}
      <section className="rounded-xl bg-white border border-zinc-200 p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-900">Apparatus Specifications</h2>
        </div>
        {totalApparatus === 0 && excludedApparatus.length === 0 ? (
          <p className="text-sm text-zinc-400">No active apparatus.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-400 border-b border-zinc-100">
                  <th className="pb-2 font-medium pr-4">Unit</th>
                  <th className="pb-2 font-medium pr-4">Year/Make/Model</th>
                  <th className="pb-2 font-medium pr-4">Pump (GPM)</th>
                  <th className="pb-2 font-medium pr-4">Tank (gal)</th>
                  <th className="pb-2 font-medium pr-4">Aerial (ft)</th>
                  <th className="pb-2 font-medium pr-4">Turn Radius (ft)</th>
                  <th className="pb-2 font-medium pr-4">GVWR (lbs)</th>
                  <th className="pb-2 font-medium pr-4">ISO Specs</th>
                  <th className="pb-2 font-medium">Pump Test</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {isoApparatus.map(a => {
                  const spec = isoSpecMap[a.id]
                  return (
                    <tr key={a.id}>
                      <td className="py-2 pr-4 font-medium text-zinc-800">
                        <Link href={`/apparatus/${a.id}`} className="hover:underline text-red-700">{a.unit_number}</Link>
                      </td>
                      <td className="py-2 pr-4 text-zinc-600">
                        {[a.model_year, a.make, a.model].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="py-2 pr-4 text-zinc-600">{spec?.pump_rating_gpm ?? '—'}</td>
                      <td className="py-2 pr-4 text-zinc-600">{spec?.tank_capacity_gal ?? '—'}</td>
                      <td className="py-2 pr-4 text-zinc-600">{spec?.aerial_length_ft ?? '—'}</td>
                      <td className="py-2 pr-4 text-zinc-600">{spec?.turning_radius_ft ?? '—'}</td>
                      <td className="py-2 pr-4 text-zinc-600">{spec?.gvwr_lbs != null ? spec.gvwr_lbs.toLocaleString() : '—'}</td>
                      <td className="py-2 pr-4">
                        <span className={`rounded-full px-2 py-0.5 font-medium ${spec ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-400'}`}>
                          {spec ? 'Complete' : 'Missing'}
                        </span>
                      </td>
                      <td className="py-2">
                        {(() => {
                          const pt = pumpTestMap[a.id]
                          if (!pt) return <span className="rounded-full px-2 py-0.5 font-medium bg-zinc-100 text-zinc-400">No record</span>
                          const overdue = new Date(pt.test_date + 'T00:00:00') < new Date(new Date().setFullYear(new Date().getFullYear() - 1))
                          if (overdue) return <span className="rounded-full px-2 py-0.5 font-medium bg-yellow-100 text-yellow-700">Overdue</span>
                          return <span className={`rounded-full px-2 py-0.5 font-medium ${pt.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{pt.passed ? 'Pass' : 'Fail'} · {formatDate(pt.test_date)}</span>
                        })()}
                      </td>
                    </tr>
                  )
                })}
                {excludedApparatus.map(a => (
                  <tr key={a.id} className="opacity-50">
                    <td className="py-2 pr-4 font-medium text-zinc-500">
                      <Link href={`/apparatus/${a.id}`} className="hover:underline">{a.unit_number}</Link>
                    </td>
                    <td className="py-2 pr-4 text-zinc-400">
                      {[a.model_year, a.make, a.model].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="py-2 pr-4 text-zinc-400">—</td>
                    <td className="py-2 pr-4 text-zinc-400">—</td>
                    <td className="py-2 pr-4 text-zinc-400">—</td>
                    <td className="py-2 pr-4 text-zinc-400">—</td>
                    <td className="py-2 pr-4 text-zinc-400">—</td>
                    <td className="py-2">
                      <span className="rounded-full px-2 py-0.5 font-medium bg-zinc-100 text-zinc-400">
                        Excluded
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Staffing */}
      <section className="rounded-xl bg-white border border-zinc-200 p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-900">Personnel &amp; Staffing</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-3 text-center">
            <p className="text-2xl font-bold text-zinc-900">{staffingTotal}</p>
            <p className="text-xs text-zinc-400 mt-0.5">Total Active</p>
          </div>
          <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-3 text-center">
            <p className="text-2xl font-bold text-zinc-900">{staffingByRole.admin}</p>
            <p className="text-xs text-zinc-400 mt-0.5">Admins</p>
          </div>
          <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-3 text-center">
            <p className="text-2xl font-bold text-zinc-900">{staffingByRole.officer}</p>
            <p className="text-xs text-zinc-400 mt-0.5">Officers</p>
          </div>
          <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-3 text-center">
            <p className="text-2xl font-bold text-zinc-900">{staffingByRole.member}</p>
            <p className="text-xs text-zinc-400 mt-0.5">Members</p>
          </div>
        </div>
      </section>

      {/* Pre-Fire Plans */}
      <section className="rounded-xl bg-white border border-zinc-200 p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-900">Pre-Fire Plans</h2>
          <Link href="/iso/preplans" className="text-xs text-red-700 hover:underline font-medium">Manage →</Link>
        </div>
        {(preplans ?? []).length === 0 ? (
          <p className="text-sm text-zinc-400">No pre-fire plans on file. <Link href="/iso/preplans" className="text-red-600 hover:underline">Add plans →</Link></p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-400 border-b border-zinc-100">
                  <th className="pb-2 font-medium pr-4">Location</th>
                  <th className="pb-2 font-medium pr-4">Address</th>
                  <th className="pb-2 font-medium">Date Surveyed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {(preplans ?? []).map(p => (
                  <tr key={p.id}>
                    <td className="py-2 pr-4 font-medium text-zinc-800">{p.location_name}</td>
                    <td className="py-2 pr-4 text-zinc-500">{p.address ?? '—'}</td>
                    <td className="py-2 text-zinc-500">{p.surveyed_date ? formatDate(p.surveyed_date) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Hose Inventory Summary */}
      <section className="rounded-xl bg-white border border-zinc-200 p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-900">Hose Inventory Summary</h2>
          <Link href="/iso/hoses" className="text-xs text-red-700 hover:underline font-medium">Manage →</Link>
        </div>
        {hoseInventory.length === 0 ? (
          <p className="text-sm text-zinc-400">No hose data entered yet. <Link href="/iso/hoses" className="text-red-600 hover:underline">Add hoses →</Link></p>
        ) : (
          <>
            {hoseInventory.some(h => h.gap) && (
              <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                ⚠ Some diameters show more hose on trucks than in the inventory. Add hose records to close the gap.
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-zinc-400 border-b border-zinc-100">
                    <th className="pb-2 font-medium pr-4">Diameter</th>
                    <th className="pb-2 font-medium pr-4 text-right">Total Owned</th>
                    <th className="pb-2 font-medium pr-4 text-right">On Trucks</th>
                    <th className="pb-2 font-medium pr-4 text-right">In Storage</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {hoseInventory.map(h => (
                    <tr key={h.diameter}>
                      <td className="py-2 pr-4 font-medium text-zinc-800">{h.diameter}&quot;</td>
                      <td className="py-2 pr-4 text-zinc-600 text-right">{h.owned > 0 ? `${h.owned} ft` : '—'}</td>
                      <td className="py-2 pr-4 text-zinc-600 text-right">{h.onTruck > 0 ? `${h.onTruck} ft` : '—'}</td>
                      <td className="py-2 pr-4 text-right">
                        {h.gap ? (
                          <span className="text-amber-600 font-medium">—</span>
                        ) : (
                          <span className="text-zinc-600">{h.inStorage > 0 ? `${h.inStorage} ft` : '0 ft'}</span>
                        )}
                      </td>
                      <td className="py-2">
                        {h.gap ? (
                          <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 font-medium">Inventory incomplete</span>
                        ) : h.owned === 0 ? (
                          <span className="rounded-full bg-zinc-100 text-zinc-400 px-2 py-0.5 font-medium">No inventory</span>
                        ) : (
                          <span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 font-medium">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Hose compliance */}
      <section className="rounded-xl bg-white border border-zinc-200 p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-900">Hose Test Compliance (NFPA 1962)</h2>
          <Link href="/iso/hoses" className="text-xs text-red-700 hover:underline font-medium">Manage →</Link>
        </div>
        {activeHoses.length === 0 ? (
          <p className="text-sm text-zinc-400">No active hoses. <Link href="/iso/hoses" className="text-red-600 hover:underline">Add hoses →</Link></p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {activeHoses.map(h => {
              const tested = testedHoseIds.has(h.id)
              const failed = hosesFailed.has(h.id)
              return (
                <div key={h.id} className="flex items-center gap-3 text-xs py-1 border-b border-zinc-50 last:border-0">
                  <span className="font-mono font-medium text-zinc-800 w-20 shrink-0">{h.hose_identifier}</span>
                  <span className="text-zinc-500 w-16 shrink-0 capitalize">{h.hose_type.replace('_', ' ')}</span>
                  <span className="text-zinc-400">{h.diameter_in}" × {h.length_ft}ft</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 font-medium shrink-0 ${
                    failed ? 'bg-red-100 text-red-700' :
                    tested ? 'bg-green-100 text-green-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {failed ? 'Failed' : tested ? 'Tested' : 'Overdue'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Hydrant compliance */}
      <section className="rounded-xl bg-white border border-zinc-200 p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-900">Hydrant Flow Test Compliance</h2>
          <Link href="/iso/hydrants" className="text-xs text-red-700 hover:underline font-medium">Manage →</Link>
        </div>
        {(hydrants ?? []).length === 0 ? (
          <p className="text-sm text-zinc-400">No hydrants added. <Link href="/iso/hydrants" className="text-red-600 hover:underline">Add hydrants →</Link></p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {(hydrants ?? []).map(h => {
              const tested = testedHydrantIds.has(h.id)
              return (
                <div key={h.id} className="flex items-center gap-3 text-xs py-1 border-b border-zinc-50 last:border-0">
                  <span className="font-mono font-medium text-zinc-800 w-16 shrink-0">{h.hydrant_number}</span>
                  <span className="text-zinc-600 min-w-0 truncate">{h.location_description}</span>
                  {h.out_of_service && <span className="text-xs text-red-600 shrink-0">OOS</span>}
                  <span className={`ml-auto rounded-full px-2 py-0.5 font-medium shrink-0 ${tested ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {tested ? 'Tested' : 'Overdue'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Training Hours */}
      <section className="rounded-xl bg-white border border-zinc-200 p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-900">Training Hours (Past 12 Months)</h2>
          <Link href="/training" className="text-xs text-red-700 hover:underline font-medium">Manage →</Link>
        </div>
        {totalTrainingEvents === 0 ? (
          <p className="text-sm text-zinc-400">No training events logged in the past 12 months.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-3 text-center">
                <p className="text-2xl font-bold text-zinc-900">{totalTrainingEvents}</p>
                <p className="text-xs text-zinc-400 mt-0.5">Events</p>
              </div>
              <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-3 text-center">
                <p className="text-2xl font-bold text-zinc-900">{totalTrainingHours}</p>
                <p className="text-xs text-zinc-400 mt-0.5">Total Hours</p>
              </div>
              <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-3 text-center">
                <p className="text-2xl font-bold text-zinc-900">{avgHoursPerMember}</p>
                <p className="text-xs text-zinc-400 mt-0.5">Avg / Member</p>
              </div>
            </div>
            {trainingRoster.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-zinc-400 border-b border-zinc-100">
                      <th className="pb-2 font-medium pr-4">Member</th>
                      <th className="pb-2 font-medium text-right">Hours (12 mo)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {trainingRoster.map(r => (
                      <tr key={r.id}>
                        <td className="py-2 pr-4 text-zinc-800 font-medium">{r.name}</td>
                        <td className="py-2 text-right font-semibold text-zinc-900">{r.hours} hrs</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {/* Training Certifications */}
      <section className="rounded-xl bg-white border border-zinc-200 p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-900">Training Certifications</h2>
          <Link href="/training" className="text-xs text-red-700 hover:underline font-medium">Manage →</Link>
        </div>
        {certSummary.length === 0 ? (
          <p className="text-sm text-zinc-400">No certifications on file.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-400 border-b border-zinc-100">
                  <th className="pb-2 font-medium pr-4">Certification</th>
                  <th className="pb-2 font-medium pr-4 text-right">Members Certified</th>
                  <th className="pb-2 font-medium text-right">Expired</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {certSummary.map(c => (
                  <tr key={c.name}>
                    <td className="py-2 pr-4 font-medium text-zinc-800">{c.name}</td>
                    <td className="py-2 pr-4 text-right font-semibold text-zinc-900">{c.total}</td>
                    <td className="py-2 text-right">
                      {c.expired > 0
                        ? <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 font-medium">{c.expired}</span>
                        : <span className="text-zinc-400">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Mutual Aid Agreements */}
      <section className="rounded-xl bg-white border border-zinc-200 p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-900">Mutual Aid Agreements</h2>
          <Link href="/iso/mutual-aid" className="text-xs text-red-700 hover:underline font-medium">Manage →</Link>
        </div>
        {(mutualAidAgreements ?? []).filter(a => a.active).length === 0 ? (
          <p className="text-sm text-zinc-400">No mutual aid agreements on file. <Link href="/iso/mutual-aid" className="text-red-600 hover:underline">Add agreements →</Link></p>
        ) : (
          <div className="flex flex-col gap-5">
            {(mutualAidAgreements ?? []).filter(a => a.active).map(a => {
              type MAAApp = { identifier: string; pump_gpm: number | null; tank_gal: number | null; hose_loads: { diameter_in: number; length_ft: number }[] }
              const apparatus = (a.apparatus ?? []) as MAAApp[]
              const expiring = a.expiration_date && new Date(a.expiration_date + 'T00:00:00') <= new Date(new Date().setDate(new Date().getDate() + 90))
              return (
                <div key={a.id}>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <p className="text-sm font-semibold text-zinc-900">{a.partner_department}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.agreement_type === 'automatic_aid' ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100 text-zinc-600'}`}>
                      {a.agreement_type === 'automatic_aid' ? 'Automatic Aid' : a.agreement_type === 'mutual_aid' ? 'Mutual Aid' : 'Other'}
                    </span>
                    {expiring && <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">Expiring Soon</span>}
                    {a.expiration_date && <span className="text-xs text-zinc-400">Expires {formatDate(a.expiration_date)}</span>}
                  </div>
                  {apparatus.length === 0 ? (
                    <p className="text-xs text-zinc-400">No apparatus recorded.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-zinc-400 border-b border-zinc-100">
                          <th className="pb-1.5 font-medium pr-4">Apparatus</th>
                          <th className="pb-1.5 font-medium pr-4">Pump (GPM)</th>
                          <th className="pb-1.5 font-medium pr-4">Tank (gal)</th>
                          <th className="pb-1.5 font-medium">Hose</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-50">
                        {apparatus.map((app, i) => (
                          <tr key={i}>
                            <td className="py-1.5 pr-4 font-medium text-zinc-800">{app.identifier || '—'}</td>
                            <td className="py-1.5 pr-4 text-zinc-600">{app.pump_gpm ?? '—'}</td>
                            <td className="py-1.5 pr-4 text-zinc-600">{app.tank_gal ?? '—'}</td>
                            <td className="py-1.5 text-zinc-500">
                              {(app.hose_loads ?? []).length === 0 ? '—' : app.hose_loads.map(h => `${h.length_ft}ft ${h.diameter_in}"`).join(', ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </section>
    </div>
  )
}
