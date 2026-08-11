'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

async function getContext() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return null
  return {
    me: { id: ctx.personnelId, is_sys_admin: ctx.isSysAdmin },
    department_id: ctx.departmentId,
    system_role: ctx.systemRole,
    isOfficerOrAbove: await hasPermission(ctx, 'perform_iso_testing'),
  }
}

// ─── Apparatus ISO specs ──────────────────────────────────────────────────────

export async function upsertApparatusIsoSpecs(formData: FormData) {
  const ctx = await getContext()
  if (!ctx || !ctx.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }

  const apparatus_id = formData.get('apparatus_id') as string

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient
    .from('apparatus_iso_specs')
    .upsert({
      apparatus_id,
      department_id: ctx.department_id,
      pump_rating_gpm: formData.get('pump_rating_gpm') ? parseInt(formData.get('pump_rating_gpm') as string) : null,
      tank_capacity_gal: formData.get('tank_capacity_gal') ? parseInt(formData.get('tank_capacity_gal') as string) : null,
      foam_capacity_gal: formData.get('foam_capacity_gal') ? parseInt(formData.get('foam_capacity_gal') as string) : null,
      aerial_length_ft: formData.get('aerial_length_ft') ? parseInt(formData.get('aerial_length_ft') as string) : null,
      turning_radius_ft: formData.get('turning_radius_ft') ? parseInt(formData.get('turning_radius_ft') as string) : null,
      gvwr_lbs: formData.get('gvwr_lbs') ? parseInt(formData.get('gvwr_lbs') as string) : null,
      hose_loads: (() => { try { return JSON.parse(formData.get('hose_loads') as string) } catch { return null } })(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'apparatus_id' })

  if (dbErr) {
    await logError(dbErr.message, 'upsertApparatusIsoSpecs', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  revalidatePath(`/apparatus/${apparatus_id}`)
  return { success: true }
}

// ─── Hose Test Session ────────────────────────────────────────────────────────

type HoseTestResult = {
  hose_id: string
  passed: boolean
  failure_reason: string | null
}

export async function submitHoseTestSession(
  test_date: string,
  test_pressure_psi: number,
  duration_min: number,
  results: HoseTestResult[]
) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }
  if (!results.length) return { error: 'No hoses to record.' }

  const adminClient = createAdminClient()
  const rows = results.map(r => ({
    hose_id: r.hose_id,
    department_id: ctx.department_id!,
    test_date,
    tested_by: ctx.me.id,
    test_pressure_psi,
    duration_min,
    passed: r.passed,
    failure_reason: r.failure_reason || null,
    notes: null,
  }))

  const { error: dbErr } = await adminClient.from('hose_tests').insert(rows)
  if (dbErr) {
    await logError(dbErr.message, 'submitHoseTestSession', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  revalidatePath('/iso/hoses')
  revalidatePath('/iso/report')
  return { success: true, count: rows.length }
}

// ─── Mutual Aid Agreements ───────────────────────────────────────────────────

type MAAApparatus = {
  identifier: string
  pump_gpm: number | null
  tank_gal: number | null
  hose_loads: { diameter_in: number; length_ft: number }[]
}

export async function createMutualAidAgreement(
  fields: {
    partner_department: string
    agreement_type: string
    effective_date: string | null
    expiration_date: string | null
    notes: string | null
    apparatus: MAAApparatus[]
  }
) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('iso_mutual_aid_agreements').insert({
    department_id: ctx.department_id,
    partner_department: fields.partner_department,
    agreement_type: fields.agreement_type,
    effective_date: fields.effective_date || null,
    expiration_date: fields.expiration_date || null,
    notes: fields.notes || null,
    apparatus: fields.apparatus,
    created_by: ctx.me.id,
  })
  if (dbErr) { await logError(dbErr.message, '/iso/mutual-aid'); return { error: dbErr.message } }
  revalidatePath('/iso/mutual-aid')
  revalidatePath('/iso/report')
  return { success: true }
}

export async function updateMutualAidAgreement(
  id: string,
  fields: {
    partner_department: string
    agreement_type: string
    effective_date: string | null
    expiration_date: string | null
    notes: string | null
    apparatus: MAAApparatus[]
  }
) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient
    .from('iso_mutual_aid_agreements')
    .update({
      partner_department: fields.partner_department,
      agreement_type: fields.agreement_type,
      effective_date: fields.effective_date || null,
      expiration_date: fields.expiration_date || null,
      notes: fields.notes || null,
      apparatus: fields.apparatus,
    })
    .eq('id', id)
    .eq('department_id', ctx.department_id)
  if (dbErr) { await logError(dbErr.message, '/iso/mutual-aid'); return { error: dbErr.message } }
  revalidatePath('/iso/mutual-aid')
  revalidatePath('/iso/report')
  return { success: true }
}

export async function toggleMutualAidAgreement(id: string, active: boolean) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient
    .from('iso_mutual_aid_agreements')
    .update({ active })
    .eq('id', id)
    .eq('department_id', ctx.department_id)
  if (dbErr) { await logError(dbErr.message, '/iso/mutual-aid'); return { error: dbErr.message } }
  revalidatePath('/iso/mutual-aid')
  revalidatePath('/iso/report')
  return { success: true }
}

// ─── Pre-Plans ───────────────────────────────────────────────────────────────

export async function savePreplan(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }

  const id = (formData.get('id') as string) || null
  const location_name = (formData.get('location_name') as string)?.trim()
  const address = (formData.get('address') as string)?.trim() || null
  const surveyed_date = (formData.get('surveyed_date') as string) || null
  const notes = (formData.get('notes') as string)?.trim() || null
  const file = formData.get('document') as File | null

  if (!location_name) return { error: 'Location name is required.' }

  const adminClient = createAdminClient()
  let document_path: string | null = null

  if (file && file.size > 0) {
    const ext = file.name.split('.').pop() ?? 'pdf'
    const path = `preplans/${ctx.department_id}/${Date.now()}.${ext}`
    const { error: uploadErr } = await adminClient.storage
      .from('documents')
      .upload(path, file, { contentType: file.type || 'application/pdf' })
    if (uploadErr) { await logError(uploadErr.message, '/iso/preplans'); return { error: 'Document upload failed.' } }
    document_path = path
  }

  if (id) {
    const update: Record<string, unknown> = { location_name, address, surveyed_date, notes, updated_at: new Date().toISOString() }
    if (document_path) update.document_path = document_path
    const { error: dbErr } = await adminClient.from('iso_preplans').update(update).eq('id', id).eq('department_id', ctx.department_id)
    if (dbErr) { await logError(dbErr.message, '/iso/preplans'); return { error: dbErr.message } }
  } else {
    const { error: dbErr } = await adminClient.from('iso_preplans').insert({
      department_id: ctx.department_id, location_name, address, surveyed_date, notes,
      document_path, created_by: ctx.me.id,
    })
    if (dbErr) { await logError(dbErr.message, '/iso/preplans'); return { error: dbErr.message } }
  }

  revalidatePath('/iso/preplans')
  revalidatePath('/iso/report')
  return { success: true }
}

export async function deletePreplan(id: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }
  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('iso_preplans').delete().eq('id', id).eq('department_id', ctx.department_id)
  if (dbErr) { await logError(dbErr.message, '/iso/preplans'); return { error: dbErr.message } }
  revalidatePath('/iso/preplans')
  revalidatePath('/iso/report')
  return { success: true }
}

export async function getPreplanDocUrl(document_path: string): Promise<string | null> {
  const adminClient = createAdminClient()
  const { data } = await adminClient.storage.from('documents').createSignedUrl(document_path, 3600)
  return data?.signedUrl ?? null
}

// ─── Pump Tests ──────────────────────────────────────────────────────────────

export async function savePumpTest(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }

  const apparatus_id = formData.get('apparatus_id') as string
  const test_date = formData.get('test_date') as string
  const vendor = (formData.get('vendor') as string)?.trim()
  const passed = formData.get('passed') === 'true'
  const notes = (formData.get('notes') as string)?.trim() || null
  const file = formData.get('document') as File | null

  if (!apparatus_id || !test_date || !vendor) return { error: 'Date and vendor are required.' }

  const adminClient = createAdminClient()
  let document_path: string | null = null

  if (file && file.size > 0) {
    const ext = file.name.split('.').pop() ?? 'pdf'
    const path = `pump-tests/${apparatus_id}/${Date.now()}.${ext}`
    const { error: uploadErr } = await adminClient.storage
      .from('documents')
      .upload(path, file, { contentType: file.type || 'application/pdf' })
    if (uploadErr) {
      await logError(uploadErr.message, '/apparatus')
      return { error: 'Document upload failed.' }
    }
    document_path = path
  }

  const { error: dbErr } = await adminClient
    .from('apparatus_pump_tests')
    .insert({
      apparatus_id,
      department_id: ctx.department_id,
      test_date,
      vendor,
      passed,
      notes,
      document_path,
      logged_by_personnel_id: ctx.me.id,
    })

  if (dbErr) {
    await logError(dbErr.message, '/apparatus')
    return { error: dbErr.message }
  }

  revalidatePath(`/apparatus/${apparatus_id}`)
  return { success: true }
}

export async function getPumpTestDocUrl(document_path: string): Promise<string | null> {
  const adminClient = createAdminClient()
  const { data } = await adminClient.storage
    .from('documents')
    .createSignedUrl(document_path, 3600)
  return data?.signedUrl ?? null
}

// ─── Hoses ────────────────────────────────────────────────────────────────────

export async function createHose(formData: FormData) {
  const ctx = await getContext()
  if (!ctx || !ctx.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('hoses').insert({
    department_id: ctx.department_id,
    apparatus_id: (formData.get('apparatus_id') as string) || null,
    hose_identifier: (formData.get('hose_identifier') as string)?.trim(),
    hose_type: formData.get('hose_type') as string,
    diameter_in: parseFloat(formData.get('diameter_in') as string),
    length_ft: parseInt(formData.get('length_ft') as string),
    manufacturer: (formData.get('manufacturer') as string)?.trim() || null,
    serial_number: (formData.get('serial_number') as string)?.trim() || null,
    year_placed_in_service: formData.get('year_placed_in_service') ? parseInt(formData.get('year_placed_in_service') as string) : null,
    status: 'in_service',
    notes: (formData.get('notes') as string)?.trim() || null,
  })

  if (dbErr) {
    await logError(dbErr.message, 'createHose', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  revalidatePath('/iso/hoses')
  return { success: true }
}

export async function updateHose(formData: FormData) {
  const ctx = await getContext()
  if (!ctx || !ctx.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }

  const hose_id = formData.get('hose_id') as string
  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('hoses').update({
    apparatus_id: (formData.get('apparatus_id') as string) || null,
    hose_identifier: (formData.get('hose_identifier') as string)?.trim(),
    hose_type: formData.get('hose_type') as string,
    diameter_in: parseFloat(formData.get('diameter_in') as string),
    length_ft: parseInt(formData.get('length_ft') as string),
    manufacturer: (formData.get('manufacturer') as string)?.trim() || null,
    serial_number: (formData.get('serial_number') as string)?.trim() || null,
    year_placed_in_service: formData.get('year_placed_in_service') ? parseInt(formData.get('year_placed_in_service') as string) : null,
    status: formData.get('status') as string,
    notes: (formData.get('notes') as string)?.trim() || null,
    updated_at: new Date().toISOString(),
  }).eq('id', hose_id).eq('department_id', ctx.department_id)

  if (dbErr) {
    await logError(dbErr.message, 'updateHose', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  revalidatePath('/iso/hoses')
  return { success: true }
}

export async function addHoseTest(formData: FormData) {
  const ctx = await getContext()
  if (!ctx || !ctx.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('hose_tests').insert({
    hose_id: formData.get('hose_id') as string,
    department_id: ctx.department_id,
    test_date: formData.get('test_date') as string,
    tested_by: ctx.me.id,
    test_pressure_psi: parseInt(formData.get('test_pressure_psi') as string),
    duration_min: parseInt(formData.get('duration_min') as string) || 3,
    passed: formData.get('passed') === 'true',
    failure_reason: (formData.get('failure_reason') as string)?.trim() || null,
    notes: (formData.get('notes') as string)?.trim() || null,
  })

  if (dbErr) {
    await logError(dbErr.message, 'addHoseTest', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  revalidatePath('/iso/hoses')
  return { success: true }
}

// ─── Hydrants ─────────────────────────────────────────────────────────────────

export async function createHydrant(formData: FormData) {
  const ctx = await getContext()
  if (!ctx || !ctx.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('hydrants').insert({
    department_id: ctx.department_id,
    hydrant_number: (formData.get('hydrant_number') as string)?.trim(),
    location_description: (formData.get('location_description') as string)?.trim(),
    street_address: (formData.get('street_address') as string)?.trim() || null,
    lat: formData.get('lat') ? parseFloat(formData.get('lat') as string) : null,
    lng: formData.get('lng') ? parseFloat(formData.get('lng') as string) : null,
    owner: (formData.get('owner') as string)?.trim() || null,
    hydrant_type: (formData.get('hydrant_type') as string) || null,
    main_size_in: formData.get('main_size_in') ? parseFloat(formData.get('main_size_in') as string) : null,
    out_of_service: false,
    notes: (formData.get('notes') as string)?.trim() || null,
  })

  if (dbErr) {
    await logError(dbErr.message, 'createHydrant', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  revalidatePath('/iso/hydrants')
  return { success: true }
}

export async function updateHydrant(formData: FormData) {
  const ctx = await getContext()
  if (!ctx || !ctx.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }

  const hydrant_id = formData.get('hydrant_id') as string
  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('hydrants').update({
    hydrant_number: (formData.get('hydrant_number') as string)?.trim(),
    location_description: (formData.get('location_description') as string)?.trim(),
    street_address: (formData.get('street_address') as string)?.trim() || null,
    lat: formData.get('lat') ? parseFloat(formData.get('lat') as string) : null,
    lng: formData.get('lng') ? parseFloat(formData.get('lng') as string) : null,
    owner: (formData.get('owner') as string)?.trim() || null,
    hydrant_type: (formData.get('hydrant_type') as string) || null,
    main_size_in: formData.get('main_size_in') ? parseFloat(formData.get('main_size_in') as string) : null,
    out_of_service: formData.get('out_of_service') === 'true',
    notes: (formData.get('notes') as string)?.trim() || null,
    updated_at: new Date().toISOString(),
  }).eq('id', hydrant_id).eq('department_id', ctx.department_id)

  if (dbErr) {
    await logError(dbErr.message, 'updateHydrant', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  revalidatePath('/iso/hydrants')
  return { success: true }
}

export async function addHydrantFlowTest(formData: FormData) {
  const ctx = await getContext()
  if (!ctx || !ctx.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('hydrant_flow_tests').insert({
    hydrant_id: formData.get('hydrant_id') as string,
    department_id: ctx.department_id,
    test_date: formData.get('test_date') as string,
    tested_by: ctx.me.id,
    static_pressure_psi: parseInt(formData.get('static_pressure_psi') as string),
    residual_pressure_psi: parseInt(formData.get('residual_pressure_psi') as string),
    flow_gpm: parseInt(formData.get('flow_gpm') as string),
    pitot_reading_psi: formData.get('pitot_reading_psi') ? parseFloat(formData.get('pitot_reading_psi') as string) : null,
    nozzle_diameter_in: formData.get('nozzle_diameter_in') ? parseFloat(formData.get('nozzle_diameter_in') as string) : null,
    notes: (formData.get('notes') as string)?.trim() || null,
  })

  if (dbErr) {
    await logError(dbErr.message, 'addHydrantFlowTest', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  revalidatePath('/iso/hydrants')
  return { success: true }
}

// ─── Mutual Aid ───────────────────────────────────────────────────────────────

export async function addMutualAid(formData: FormData) {
  const ctx = await getContext()
  if (!ctx || !ctx.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }

  const incident_id = formData.get('incident_id') as string
  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('incident_mutual_aid').insert({
    incident_id,
    department_id: ctx.department_id,
    external_department_name: (formData.get('external_department_name') as string)?.trim(),
    role: formData.get('role') as string,
    apparatus_description: (formData.get('apparatus_description') as string)?.trim() || null,
    personnel_count: formData.get('personnel_count') ? parseInt(formData.get('personnel_count') as string) : null,
    arrival_time: (formData.get('arrival_time') as string) || null,
    departure_time: (formData.get('departure_time') as string) || null,
    notes: (formData.get('notes') as string)?.trim() || null,
  })

  if (dbErr) {
    await logError(dbErr.message, 'addMutualAid', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  revalidatePath(`/incidents/${incident_id}`)
  return { success: true }
}

export async function updateMutualAid(mutualAidId: string, formData: FormData) {
  const ctx = await getContext()
  if (!ctx || !ctx.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }

  const incident_id = formData.get('incident_id') as string
  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient
    .from('incident_mutual_aid')
    .update({
      external_department_name: (formData.get('external_department_name') as string)?.trim(),
      role: formData.get('role') as string,
      apparatus_description: (formData.get('apparatus_description') as string)?.trim() || null,
      personnel_count: formData.get('personnel_count') ? parseInt(formData.get('personnel_count') as string) : null,
      arrival_time: (formData.get('arrival_time') as string) || null,
      departure_time: (formData.get('departure_time') as string) || null,
      notes: (formData.get('notes') as string)?.trim() || null,
    })
    .eq('id', mutualAidId)
    .eq('department_id', ctx.department_id)

  if (dbErr) {
    await logError(dbErr.message, 'updateMutualAid', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  revalidatePath(`/incidents/${incident_id}`)
  return { success: true }
}

export async function removeMutualAid(mutualAidId: string, incidentId: string) {
  const ctx = await getContext()
  if (!ctx || !ctx.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient
    .from('incident_mutual_aid')
    .delete()
    .eq('id', mutualAidId)
    .eq('department_id', ctx.department_id)

  if (dbErr) {
    await logError(dbErr.message, 'removeMutualAid', { personnel_id: ctx.me.id })
    return { error: dbErr.message }
  }

  revalidatePath(`/incidents/${incidentId}`)
  return { success: true }
}

// ─── Remove Hose ──────────────────────────────────────────────────────────────
export async function removeHose(hoseId: string) {
  const ctx = await getContext()
  if (!ctx || !ctx.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }
  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient
    .from('hoses')
    .update({ active: false })
    .eq('id', hoseId)
    .eq('department_id', ctx.department_id)
  if (dbErr) { await logError(dbErr, '/iso/hoses'); return { error: dbErr.message } }
  revalidatePath('/iso/hoses')
  return { success: true }
}

// ─── Remove Hydrant ───────────────────────────────────────────────────────────
export async function removeHydrant(hydrantId: string) {
  const ctx = await getContext()
  if (!ctx || !ctx.isOfficerOrAbove || !ctx.department_id) return { error: 'Unauthorized' }
  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient
    .from('hydrants')
    .update({ active: false })
    .eq('id', hydrantId)
    .eq('department_id', ctx.department_id)
  if (dbErr) { await logError(dbErr, '/iso/hydrants'); return { error: dbErr.message } }
  revalidatePath('/iso/hydrants')
  return { success: true }
}
