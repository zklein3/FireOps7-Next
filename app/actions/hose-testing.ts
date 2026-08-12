'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

// Non-user access point for NFPA 1962 hose testing — no login required, same
// idiom as app/actions/fire-school.ts. Scoped per-department via a slug in
// the URL (/hose-testing/[slug]), reusing departments.public_slug — the same
// slug the citizen-facing public site uses — rather than a second slug
// system. Deliberately its own flag (hose_testing_enabled), independent of
// public_site_enabled: a department should be able to turn this on without
// standing up a citizen-facing site, and vice versa.

async function resolveDeptBySlug(slug: string) {
  const adminClient = createAdminClient()
  const { data: dept } = await adminClient
    .from('departments')
    .select('id, name, hose_testing_enabled')
    .eq('public_slug', slug)
    .maybeSingle()
  return dept
}

export async function getPublicHoseTestingContext(slug: string) {
  const dept = await resolveDeptBySlug(slug)
  if (!dept || !dept.hose_testing_enabled) return { enabled: false, departmentName: null, departmentId: null }
  return { enabled: true, departmentName: dept.name, departmentId: dept.id }
}

export async function listPublicHoses(slug: string) {
  const dept = await resolveDeptBySlug(slug)
  if (!dept || !dept.hose_testing_enabled) return []

  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('hoses')
    .select('id, hose_identifier, hose_type, diameter_in, length_ft, status')
    .eq('department_id', dept.id)
    .eq('status', 'in_service')
    .order('hose_identifier')

  return data ?? []
}

export async function addPublicHose(slug: string, formData: FormData) {
  const dept = await resolveDeptBySlug(slug)
  if (!dept || !dept.hose_testing_enabled) return { error: 'Hose testing is not currently enabled.' }

  const hose_identifier = (formData.get('hose_identifier') as string)?.trim()
  const hose_type = formData.get('hose_type') as string
  const diameter_in = formData.get('diameter_in') as string
  const length_ft = formData.get('length_ft') as string

  if (!hose_identifier) return { error: 'Hose ID is required.' }
  if (!hose_type) return { error: 'Hose type is required.' }
  if (!diameter_in || !length_ft) return { error: 'Diameter and length are required.' }

  const adminClient = createAdminClient()

  const { data: existing } = await adminClient
    .from('hoses')
    .select('id')
    .eq('department_id', dept.id)
    .eq('hose_identifier', hose_identifier)
    .maybeSingle()
  if (existing) return { error: `Hose ${hose_identifier} already exists.` }

  const { data: hose, error: dbErr } = await adminClient
    .from('hoses')
    .insert({
      department_id: dept.id,
      hose_identifier,
      hose_type,
      diameter_in: parseFloat(diameter_in),
      length_ft: parseInt(length_ft),
      status: 'in_service',
    })
    .select('id, hose_identifier, hose_type, diameter_in, length_ft, status')
    .single()

  if (dbErr) { await logError(dbErr.message, `/hose-testing/${slug}`, { metadata: { hose_identifier } }); return { error: dbErr.message } }

  revalidatePath(`/hose-testing/${slug}`)
  return { success: true, hose }
}

export async function editPublicHose(slug: string, hoseId: string, formData: FormData) {
  const dept = await resolveDeptBySlug(slug)
  if (!dept || !dept.hose_testing_enabled) return { error: 'Hose testing is not currently enabled.' }

  const hose_identifier = (formData.get('hose_identifier') as string)?.trim()
  const hose_type = formData.get('hose_type') as string
  const diameter_in = formData.get('diameter_in') as string
  const length_ft = formData.get('length_ft') as string

  if (!hose_identifier) return { error: 'Hose ID is required.' }
  if (!hose_type) return { error: 'Hose type is required.' }
  if (!diameter_in || !length_ft) return { error: 'Diameter and length are required.' }

  const adminClient = createAdminClient()

  const { data: existing } = await adminClient
    .from('hoses')
    .select('id')
    .eq('department_id', dept.id)
    .eq('hose_identifier', hose_identifier)
    .neq('id', hoseId)
    .maybeSingle()
  if (existing) return { error: `Hose ${hose_identifier} already exists.` }

  const { data: hose, error: dbErr } = await adminClient
    .from('hoses')
    .update({
      hose_identifier,
      hose_type,
      diameter_in: parseFloat(diameter_in),
      length_ft: parseInt(length_ft),
    })
    .eq('id', hoseId)
    .eq('department_id', dept.id)
    .select('id, hose_identifier, hose_type, diameter_in, length_ft, status')
    .single()

  if (dbErr) { await logError(dbErr.message, `/hose-testing/${slug}`, { metadata: { hose_id: hoseId, hose_identifier } }); return { error: dbErr.message } }

  revalidatePath(`/hose-testing/${slug}`)
  return { success: true, hose }
}

type HoseTestResult = {
  hose_id: string
  passed: boolean
  failure_reason: string | null
}

export async function submitPublicHoseTestSession(
  slug: string,
  testerName: string,
  test_date: string,
  test_pressure_psi: number,
  duration_min: number,
  results: HoseTestResult[]
) {
  const dept = await resolveDeptBySlug(slug)
  if (!dept || !dept.hose_testing_enabled) return { error: 'Hose testing is not currently enabled.' }
  if (!testerName.trim()) return { error: 'Tester name is required.' }
  if (!results.length) return { error: 'No hoses to record.' }

  const adminClient = createAdminClient()
  const rows = results.map(r => ({
    hose_id: r.hose_id,
    department_id: dept.id,
    test_date,
    tested_by: null,
    tested_by_name: testerName.trim(),
    test_pressure_psi,
    duration_min,
    passed: r.passed,
    failure_reason: r.failure_reason || null,
    notes: null,
  }))

  const { error: dbErr } = await adminClient.from('hose_tests').insert(rows)
  if (dbErr) { await logError(dbErr.message, `/hose-testing/${slug}`, { metadata: { testerName } }); return { error: dbErr.message } }

  revalidatePath(`/hose-testing/${slug}`)
  return { success: true, count: rows.length }
}

// ─── Dept Admin: self-service enable/configure ─────────────────────────────

export async function getHoseTestingConfig() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx?.departmentId) return null
  if (!(await hasPermission(ctx, 'manage_department_settings'))) return null

  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('departments')
    .select('hose_testing_enabled, public_slug')
    .eq('id', ctx.departmentId)
    .single()

  return data
}

export async function setHoseTestingConfig(enabled: boolean, slug: string | null) {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!(await hasPermission(ctx, 'manage_department_settings'))) return { error: 'Only admins can update department settings.' }
  if (!ctx.departmentId) return { error: 'No department selected.' }

  const adminClient = createAdminClient()

  const { data: current } = await adminClient
    .from('departments')
    .select('public_slug')
    .eq('id', ctx.departmentId)
    .single()

  // A slug is required to enable, but never silently overwrite one already
  // in use by the citizen-facing public site (burn permits, etc.) — that's
  // sys-admin managed separately and shouldn't be clobbered from here.
  const cleanSlug = slug?.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || null
  if (enabled && !current?.public_slug && !cleanSlug) {
    return { error: 'A URL slug is required to enable public hose testing.' }
  }

  const update: { hose_testing_enabled: boolean; public_slug?: string } = { hose_testing_enabled: enabled }
  if (!current?.public_slug && cleanSlug) update.public_slug = cleanSlug

  const { error: dbErr } = await adminClient
    .from('departments')
    .update(update)
    .eq('id', ctx.departmentId)

  if (dbErr) {
    if (dbErr.code === '23505') return { error: 'That slug is already in use by another department.' }
    await logError(dbErr.message, '/dept-admin/settings', { department_id: ctx.departmentId })
    return { error: dbErr.message }
  }

  revalidatePath('/dept-admin/settings')
  return { success: true, slug: update.public_slug ?? current?.public_slug ?? null }
}
