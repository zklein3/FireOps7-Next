import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import HosesClient from './HosesClient'

export default async function HosesPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  // Module gate — Bundle B required
  const { data: deptFlags } = await adminClient.from('departments').select('module_iso').eq('id', ctx.departmentId).single()
  if (!deptFlags?.module_iso) redirect('/dashboard')

  const department_id = ctx.departmentId
  const isOfficerOrAbove = await hasPermission(ctx, 'perform_iso_testing')

  // Fetch hoses
  const { data: hosesRaw } = await adminClient
    .from('hoses')
    .select('id, hose_identifier, hose_type, diameter_in, length_ft, manufacturer, serial_number, year_placed_in_service, status, notes, apparatus_id')
    .eq('department_id', department_id)
    .order('hose_identifier')

  // Fetch apparatus for assignment dropdown and name lookup
  const { data: deptApparatus } = await adminClient
    .from('apparatus')
    .select('id, unit_number')
    .eq('department_id', department_id)
    .eq('active', true)
    .order('unit_number')

  const apparatusMap = Object.fromEntries((deptApparatus ?? []).map(a => [a.id, a.unit_number]))

  // Fetch all hose tests
  const hoseIds = (hosesRaw ?? []).map(h => h.id)
  const { data: testsRaw } = hoseIds.length > 0
    ? await adminClient
        .from('hose_tests')
        .select('id, hose_id, test_date, tested_by, test_pressure_psi, duration_min, passed, failure_reason, notes')
        .in('hose_id', hoseIds)
        .order('test_date', { ascending: false })
    : { data: [] as any[] }

  // Fetch tester names
  const testerIds = [...new Set((testsRaw ?? []).map(t => t.tested_by).filter(Boolean))]
  const { data: testersRaw } = testerIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', testerIds)
    : { data: [] as any[] }
  const testerNameMap = Object.fromEntries((testersRaw ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  // Group tests by hose
  const testsByHose: Record<string, any[]> = {}
  for (const t of testsRaw ?? []) {
    if (!testsByHose[t.hose_id]) testsByHose[t.hose_id] = []
    testsByHose[t.hose_id]!.push({
      id: t.id,
      test_date: t.test_date,
      tested_by_name: t.tested_by ? (testerNameMap[t.tested_by] ?? null) : null,
      test_pressure_psi: t.test_pressure_psi,
      duration_min: t.duration_min,
      passed: t.passed,
      failure_reason: t.failure_reason,
      notes: t.notes,
    })
  }

  const hoses = (hosesRaw ?? []).map(h => ({
    ...h,
    apparatus_unit: h.apparatus_id ? (apparatusMap[h.apparatus_id] ?? null) : null,
    tests: testsByHose[h.id] ?? [],
  }))

  return (
    <HosesClient
      hoses={hoses}
      deptApparatus={deptApparatus ?? []}
      isOfficerOrAbove={isOfficerOrAbove}
    />
  )
}
