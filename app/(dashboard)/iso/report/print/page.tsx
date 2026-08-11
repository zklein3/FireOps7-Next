import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import PrintReportClient from './PrintReportClient'

export default async function PrintReportPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>
}) {
  const { months: monthsParam } = await searchParams

  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  const { data: deptData } = await adminClient
    .from('departments')
    .select('name, module_iso, iso_audit_date, iso_auditor_name, iso_report_default_months, iso_report_sections')
    .eq('id', ctx.departmentId)
    .single()
  if (!deptData?.module_iso) redirect('/dashboard')

  const months = Math.min(Math.max(parseInt(monthsParam ?? '') || deptData.iso_report_default_months || 12, 6), 36)

  const department_id = ctx.departmentId
  const deptName = deptData.name ?? 'Fire Department'
  const isAdmin = await hasPermission(ctx, 'manage_iso_data')

  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const today = new Date()

  // ── Apparatus ──────────────────────────────────────────────────────────────
  const { data: allApparatus } = await adminClient
    .from('apparatus').select('id, unit_number, apparatus_name, make, model, model_year, exclude_from_iso')
    .eq('department_id', department_id).eq('active', true).order('unit_number')

  const { data: isoSpecs } = await adminClient
    .from('apparatus_iso_specs')
    .select('apparatus_id, pump_rating_gpm, tank_capacity_gal, foam_capacity_gal, aerial_length_ft, turning_radius_ft, gvwr_lbs, hose_loads')
    .eq('department_id', department_id)

  const { data: pumpTestsRaw } = await adminClient
    .from('apparatus_pump_tests').select('apparatus_id, test_date, passed')
    .eq('department_id', department_id).order('test_date', { ascending: false })

  const isoSpecMap = Object.fromEntries((isoSpecs ?? []).map(s => [s.apparatus_id, s]))
  const pumpTestMap: Record<string, { test_date: string; passed: boolean }> = {}
  for (const t of pumpTestsRaw ?? []) {
    if (!pumpTestMap[t.apparatus_id]) pumpTestMap[t.apparatus_id] = { test_date: t.test_date, passed: t.passed }
  }

  const isoApparatus = (allApparatus ?? []).filter(a => !a.exclude_from_iso).map(a => ({
    id: a.id,
    unit_number: a.unit_number,
    apparatus_name: a.apparatus_name,
    make: a.make,
    model: a.model,
    model_year: a.model_year,
    spec: isoSpecMap[a.id] ?? null,
    pumpTest: pumpTestMap[a.id] ?? null,
  }))

  // ── Hoses ─────────────────────────────────────────────────────────────────
  const { data: hoses } = await adminClient
    .from('hoses').select('id, hose_identifier, hose_type, diameter_in, length_ft, status')
    .eq('department_id', department_id).neq('status', 'retired')

  const { data: recentHoseTests } = await adminClient
    .from('hose_tests').select('hose_id, test_date, passed')
    .eq('department_id', department_id).gte('test_date', cutoffStr)
    .order('test_date', { ascending: false })

  const testedHoseIds = new Set((recentHoseTests ?? []).map(t => t.hose_id))
  const failedHoseIds = new Set((recentHoseTests ?? []).filter(t => !t.passed).map(t => t.hose_id))
  const activeHoses = (hoses ?? []).filter(h => h.status === 'in_service')

  // Hose inventory summary
  type HoseLoad = { diameter_in: number; length_ft: number }
  const ownedByDiam = new Map<number, number>()
  for (const h of hoses ?? []) {
    if (h.diameter_in && h.length_ft) ownedByDiam.set(h.diameter_in, (ownedByDiam.get(h.diameter_in) ?? 0) + h.length_ft)
  }
  const onTruckByDiam = new Map<number, number>()
  for (const spec of isoSpecs ?? []) {
    for (const load of (spec.hose_loads as HoseLoad[] | null) ?? []) {
      if (load.diameter_in && load.length_ft) onTruckByDiam.set(load.diameter_in, (onTruckByDiam.get(load.diameter_in) ?? 0) + load.length_ft)
    }
  }
  const allDiameters = [...new Set([...ownedByDiam.keys(), ...onTruckByDiam.keys()])].sort((a, b) => a - b)
  const hoseInventory = allDiameters.map(d => {
    const owned = ownedByDiam.get(d) ?? 0
    const onTruck = onTruckByDiam.get(d) ?? 0
    return { diameter: d, owned, onTruck, inStorage: owned - onTruck, gap: owned - onTruck < 0 }
  })

  // ── Hydrants ──────────────────────────────────────────────────────────────
  const { data: hydrants } = await adminClient
    .from('hydrants').select('id, hydrant_number, location_description, out_of_service')
    .eq('department_id', department_id)

  const { data: recentFlowTests } = await adminClient
    .from('hydrant_flow_tests').select('hydrant_id, test_date, flow_gpm')
    .eq('department_id', department_id).gte('test_date', cutoffStr)
    .order('test_date', { ascending: false })

  const testedHydrantIds = new Set((recentFlowTests ?? []).map(t => t.hydrant_id))
  const latestFlowMap: Record<string, { test_date: string; flow_gpm: number | null }> = {}
  for (const t of recentFlowTests ?? []) {
    if (!latestFlowMap[t.hydrant_id]) latestFlowMap[t.hydrant_id] = { test_date: t.test_date, flow_gpm: t.flow_gpm }
  }

  // ── Staffing ──────────────────────────────────────────────────────────────
  const { data: deptPersonnel } = await adminClient
    .from('department_personnel').select('system_role')
    .eq('department_id', department_id).eq('active', true)

  const staffing = {
    total: (deptPersonnel ?? []).length,
    admin: (deptPersonnel ?? []).filter(p => p.system_role === 'admin').length,
    officer: (deptPersonnel ?? []).filter(p => p.system_role === 'officer').length,
    member: (deptPersonnel ?? []).filter(p => p.system_role === 'member').length,
  }

  // ── Training hours ────────────────────────────────────────────────────────
  const { data: trainingEvents } = await adminClient
    .from('training_events').select('id, topic, event_date, hours')
    .eq('department_id', department_id).gte('event_date', cutoffStr)
    .order('event_date', { ascending: false })

  const trainingEventIds = (trainingEvents ?? []).map(e => e.id)
  const { data: trainingAttendance } = trainingEventIds.length > 0
    ? await adminClient.from('training_event_attendance')
        .select('event_id, personnel_id').in('event_id', trainingEventIds).eq('status', 'verified')
    : { data: [] as { event_id: string; personnel_id: string }[] }

  const attendeeIds = [...new Set((trainingAttendance ?? []).map(a => a.personnel_id))]
  const { data: attendeePersonnel } = attendeeIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', attendeeIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[] }

  const eventHoursMap = Object.fromEntries((trainingEvents ?? []).map(e => [e.id, parseFloat(e.hours) || 0]))
  const personnelNameMap = Object.fromEntries((attendeePersonnel ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))
  const hoursByPersonnel = new Map<string, number>()
  for (const a of trainingAttendance ?? []) {
    hoursByPersonnel.set(a.personnel_id, (hoursByPersonnel.get(a.personnel_id) ?? 0) + (eventHoursMap[a.event_id] ?? 0))
  }
  const trainingRoster = [...hoursByPersonnel.entries()]
    .map(([id, hours]) => ({ name: personnelNameMap[id] ?? '—', hours }))
    .sort((a, b) => b.hours - a.hours)
  const totalTrainingHours = (trainingEvents ?? []).reduce((s, e) => s + (parseFloat(e.hours) || 0), 0)

  // ── Certifications ────────────────────────────────────────────────────────
  const { data: certsRaw } = await adminClient
    .from('member_certifications').select('cert_name, expiration_date')
    .eq('department_id', department_id).eq('active', true)

  const certMap = new Map<string, { total: number; expired: number }>()
  for (const c of certsRaw ?? []) {
    const name = c.cert_name ?? 'Unknown'
    const isExpired = c.expiration_date ? new Date(c.expiration_date + 'T00:00:00') < today : false
    const e = certMap.get(name) ?? { total: 0, expired: 0 }
    certMap.set(name, { total: e.total + 1, expired: e.expired + (isExpired ? 1 : 0) })
  }
  const certSummary = [...certMap.entries()].map(([name, s]) => ({ name, ...s })).sort((a, b) => b.total - a.total)

  // ── Pre-plans ─────────────────────────────────────────────────────────────
  const { data: preplans } = await adminClient
    .from('iso_preplans').select('id, location_name, address, surveyed_date')
    .eq('department_id', department_id).order('location_name')

  // ── Response times ────────────────────────────────────────────────────────
  const { data: incidentsRaw } = await adminClient
    .from('incidents')
    .select('id, incident_number, incident_type, call_time, paged_at, first_on_scene_at, address, city')
    .eq('department_id', department_id)
    .gte('call_time', cutoffStr)
    .not('call_time', 'is', null)
    .not('first_on_scene_at', 'is', null)
    .order('call_time', { ascending: false })

  function diffMinutes(a: string, b: string): number {
    return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
  }

  const responseRuns = (incidentsRaw ?? []).map(i => ({
    incident_number: i.incident_number,
    incident_type: i.incident_type,
    call_time: i.call_time,
    address: [i.address, i.city].filter(Boolean).join(', ') || '—',
    dispatch_min: i.paged_at ? diffMinutes(i.call_time, i.paged_at) : null,
    response_min: diffMinutes(i.call_time, i.first_on_scene_at),
    travel_min: i.paged_at ? diffMinutes(i.paged_at, i.first_on_scene_at) : null,
  }))

  const avgResponseMin = responseRuns.length > 0
    ? Math.round(responseRuns.reduce((s, r) => s + r.response_min, 0) / responseRuns.length * 10) / 10
    : null
  const avgDispatchMin = responseRuns.filter(r => r.dispatch_min !== null).length > 0
    ? Math.round(responseRuns.filter(r => r.dispatch_min !== null).reduce((s, r) => s + r.dispatch_min!, 0) / responseRuns.filter(r => r.dispatch_min !== null).length * 10) / 10
    : null

  // ── Mutual aid ────────────────────────────────────────────────────────────
  const { data: mutualAid } = await adminClient
    .from('iso_mutual_aid_agreements')
    .select('id, partner_department, agreement_type, effective_date, expiration_date, active, apparatus')
    .eq('department_id', department_id).order('partner_department')

  return (
    <PrintReportClient
      deptName={deptName}
      months={months}
      generatedAt={new Date().toISOString()}
      apparatus={isoApparatus}
      staffing={staffing}
      hoseInventory={hoseInventory}
      activeHoses={activeHoses.map(h => ({
        id: h.id,
        hose_identifier: h.hose_identifier,
        hose_type: h.hose_type,
        diameter_in: h.diameter_in,
        length_ft: h.length_ft,
        tested: testedHoseIds.has(h.id),
        failed: failedHoseIds.has(h.id),
      }))}
      hydrants={(hydrants ?? []).map(h => ({
        id: h.id,
        hydrant_number: h.hydrant_number,
        location_description: h.location_description,
        out_of_service: h.out_of_service,
        tested: testedHydrantIds.has(h.id),
        last_flow: latestFlowMap[h.id] ?? null,
      }))}
      training={{ events: (trainingEvents ?? []).length, hours: totalTrainingHours, roster: trainingRoster }}
      certSummary={certSummary}
      preplans={preplans ?? []}
      mutualAid={(mutualAid ?? []).filter(a => a.active)}
      responseTimes={{ runs: responseRuns, avgResponseMin, avgDispatchMin, total: responseRuns.length }}
      departmentTimezone={ctx.departmentTimezone}
      departmentId={department_id}
      isAdmin={isAdmin}
      defaultAuditDate={deptData.iso_audit_date}
      defaultAuditorName={deptData.iso_auditor_name}
      defaultSections={deptData.iso_report_sections as Record<string, boolean>}
    />
  )
}
