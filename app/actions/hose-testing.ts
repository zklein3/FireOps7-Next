'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { logError, logEvent } from '@/lib/logger'
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

export async function submitPublicHoseTestingFeedback(slug: string, formData: FormData) {
  const dept = await resolveDeptBySlug(slug)
  if (!dept || !dept.hose_testing_enabled) return { error: 'Hose testing is not currently enabled.' }

  const message = (formData.get('message') as string)?.trim()
  const report_type = formData.get('report_type') as string
  const reporter_name = (formData.get('reporter_name') as string)?.trim()

  if (!message) return { error: 'Please enter a message.' }

  await logEvent({
    log_type: 'user_report',
    page: `/hose-testing/${slug}`,
    message,
    department_id: dept.id,
    metadata: { report_type, reporter_name: reporter_name || null, department_name: dept.name, source: 'public_hose_testing' },
  })

  return { success: true }
}

// Full in-service roster — used by the Manage Hoses screen and Add Hose,
// which need every hose regardless of recent-test status. The Select-hoses
// screen additionally excludes recently-tested hoses via getHoseTestingLiveState
// below (kept separate so fixing a typo on a hose tested last week doesn't
// require it to reappear in the testing queue first).
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

// ─── Live selection state — polled (not Realtime: this page has no
// login/session, so there's no JWT for Realtime's postgres_changes auth,
// same reason the kiosk feature polls instead of subscribing). Combines two
// concerns in one round trip so both stay in sync every ~5s: (1) locks —
// prevent two concurrent public sessions from testing the same physical hose
// at once, and (2) which hoses were tested in the last 30 days, so they drop
// out of the testing queue for everyone without a page reload.
const LOCK_STALE_MINUTES = 30
const RECENT_TEST_EXCLUSION_DAYS = 30

export async function getHoseTestingLiveState(slug: string) {
  const dept = await resolveDeptBySlug(slug)
  if (!dept || !dept.hose_testing_enabled) return { locks: [], recentlyTestedHoseIds: [] }

  const adminClient = createAdminClient()
  const staleCutoff = new Date(Date.now() - LOCK_STALE_MINUTES * 60 * 1000).toISOString()
  await adminClient.from('hose_testing_locks').delete().eq('department_id', dept.id).lt('created_at', staleCutoff)

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - RECENT_TEST_EXCLUSION_DAYS)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const [{ data: locks }, { data: recentTests }] = await Promise.all([
    adminClient
      .from('hose_testing_locks')
      .select('hose_id, session_token, tester_name')
      .eq('department_id', dept.id),
    adminClient
      .from('hose_tests')
      .select('hose_id')
      .eq('department_id', dept.id)
      .gte('test_date', cutoffStr),
  ])

  return {
    locks: locks ?? [],
    recentlyTestedHoseIds: Array.from(new Set((recentTests ?? []).map(t => t.hose_id))),
  }
}

export async function claimHose(slug: string, hoseId: string, sessionToken: string, testerName: string) {
  const dept = await resolveDeptBySlug(slug)
  if (!dept || !dept.hose_testing_enabled) return { error: 'Hose testing is not currently enabled.' }

  const adminClient = createAdminClient()
  const staleCutoff = new Date(Date.now() - LOCK_STALE_MINUTES * 60 * 1000).toISOString()
  await adminClient.from('hose_testing_locks').delete().eq('department_id', dept.id).lt('created_at', staleCutoff)

  const { data: existing } = await adminClient
    .from('hose_testing_locks')
    .select('session_token, tester_name')
    .eq('hose_id', hoseId)
    .maybeSingle()

  if (existing && existing.session_token !== sessionToken) {
    return { error: `Already selected by ${existing.tester_name || 'another tester'}.` }
  }

  const { error: dbErr } = await adminClient
    .from('hose_testing_locks')
    .upsert(
      { department_id: dept.id, hose_id: hoseId, session_token: sessionToken, tester_name: testerName || null, created_at: new Date().toISOString() },
      { onConflict: 'hose_id' }
    )

  if (dbErr) { await logError(dbErr.message, `/hose-testing/${slug}`, { metadata: { hose_id: hoseId } }); return { error: dbErr.message } }
  return { success: true }
}

export async function releaseHose(slug: string, hoseId: string, sessionToken: string) {
  const dept = await resolveDeptBySlug(slug)
  if (!dept) return { error: 'Not found.' }

  const adminClient = createAdminClient()
  await adminClient
    .from('hose_testing_locks')
    .delete()
    .eq('hose_id', hoseId)
    .eq('session_token', sessionToken)

  return { success: true }
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

export async function setPublicHoseStatus(slug: string, hoseId: string, status: 'in_service' | 'out_of_service' | 'retired') {
  const dept = await resolveDeptBySlug(slug)
  if (!dept || !dept.hose_testing_enabled) return { error: 'Hose testing is not currently enabled.' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient
    .from('hoses')
    .update({ status })
    .eq('id', hoseId)
    .eq('department_id', dept.id)

  if (dbErr) { await logError(dbErr.message, `/hose-testing/${slug}`, { metadata: { hose_id: hoseId, status } }); return { error: dbErr.message } }

  if (status !== 'in_service') {
    await adminClient.from('hose_testing_locks').delete().eq('hose_id', hoseId)
  }

  revalidatePath(`/hose-testing/${slug}`)
  return { success: true }
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

  await adminClient
    .from('hose_testing_locks')
    .delete()
    .eq('department_id', dept.id)
    .in('hose_id', results.map(r => r.hose_id))

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
