'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'
import { VEHICLE_CHECK_DEFAULTS } from '@/lib/vehicle-check-defaults'

async function getContext() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return null
  return {
    me: { id: ctx.personnelId, is_sys_admin: ctx.isSysAdmin },
    department_id: ctx.departmentId,
    systemRole: ctx.systemRole,
    isAdmin: await hasPermission(ctx, 'manage_inspection_settings'),
    isOfficerOrAbove: await hasPermission(ctx, 'manage_inspection_sessions'),
    fullCtx: ctx,
  }
}

// ─── Create Inspection Template ───────────────────────────────────────────────
export async function createInspectionTemplate(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage inspection templates.' }
  const adminClient = createAdminClient()
  const item_id = formData.get('item_id') as string
  const template_name = formData.get('template_name') as string
  const template_description = formData.get('template_description') as string
  const department_id = formData.get('department_id') as string || ctx.department_id
  if (!item_id || !template_name) return { error: 'Item and template name are required.' }
  if (!department_id) return { error: 'Department not found.' }
  const { data, error } = await adminClient.from('item_inspection_templates').insert({
    item_id, department_id, template_name,
    template_description: template_description || null,
    active: true,
  }).select('id').single()
  if (error) { await logError(error.message, '/dept-admin/items'); return { error: error.message } }
  revalidatePath('/dept-admin/items')
  revalidatePath('/dept-admin/setup')
  return { success: true, template_id: data?.id }
}

// ─── Update Inspection Template ───────────────────────────────────────────────
export async function updateInspectionTemplate(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage inspection templates.' }
  const adminClient = createAdminClient()
  const id = formData.get('id') as string
  const template_name = formData.get('template_name') as string
  const template_description = formData.get('template_description') as string
  const item_id = formData.get('item_id') as string
  const active = formData.get('active') === 'true'

  const updateData: Record<string, any> = {
    template_name,
    template_description: template_description || null,
    active,
  }
  // Only update item_id if provided (allows reassigning to different item type)
  if (item_id) updateData.item_id = item_id

  const { error } = await adminClient.from('item_inspection_templates').update(updateData).eq('id', id)
  if (error) { await logError(error.message, '/dept-admin/items'); return { error: error.message } }
  revalidatePath('/dept-admin/items')
  revalidatePath('/dept-admin/setup')
  return { success: true }
}

// ─── Add Template Step ────────────────────────────────────────────────────────
export async function addTemplateStep(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage inspection steps.' }
  const adminClient = createAdminClient()
  const template_id = formData.get('template_id') as string
  const step_text = formData.get('step_text') as string
  const step_description = formData.get('step_description') as string
  const step_type = formData.get('step_type') as string
  const required = formData.get('required') === 'true'
  const fail_if_negative = formData.get('fail_if_negative') === 'true'
  const linked_item_type_id = formData.get('linked_item_type_id') as string
  const sort_order = formData.get('sort_order') as string
  if (!template_id || !step_text) return { error: 'Template and step text are required.' }
  let order = sort_order ? parseInt(sort_order) : 1
  if (!sort_order) {
    const { data: existing } = await adminClient
      .from('item_inspection_template_steps').select('sort_order')
      .eq('template_id', template_id).order('sort_order', { ascending: false }).limit(1)
    order = (existing?.[0]?.sort_order ?? 0) + 1
  }
  const { error } = await adminClient.from('item_inspection_template_steps').insert({
    template_id, step_text, step_description: step_description || null,
    step_type: step_type || 'BOOLEAN', response_type: step_type || 'BOOLEAN',
    required, fail_if_negative,
    linked_item_type_id: (step_type === 'ASSET_LINK' && linked_item_type_id) ? linked_item_type_id : null,
    sort_order: order, active: true,
  })
  if (error) { await logError(error.message, '/dept-admin/items'); return { error: error.message } }
  revalidatePath('/dept-admin/items')
  revalidatePath('/dept-admin/setup')
  return { success: true }
}

// ─── Update Template Step ─────────────────────────────────────────────────────
export async function updateTemplateStep(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage inspection steps.' }
  const adminClient = createAdminClient()
  const id = formData.get('id') as string
  const step_text = formData.get('step_text') as string
  const step_description = formData.get('step_description') as string
  const step_type = formData.get('step_type') as string
  const required = formData.get('required') === 'true'
  const fail_if_negative = formData.get('fail_if_negative') === 'true'
  const linked_item_type_id = formData.get('linked_item_type_id') as string
  const active = formData.get('active') === 'true'
  const { error } = await adminClient.from('item_inspection_template_steps').update({
    step_text, step_description: step_description || null,
    step_type: step_type || 'BOOLEAN', response_type: step_type || 'BOOLEAN',
    required, fail_if_negative,
    linked_item_type_id: (step_type === 'ASSET_LINK' && linked_item_type_id) ? linked_item_type_id : null,
    active,
  }).eq('id', id)
  if (error) { await logError(error.message, '/dept-admin/items'); return { error: error.message } }
  revalidatePath('/dept-admin/items')
  revalidatePath('/dept-admin/setup')
  return { success: true }
}

// ─── Reorder Template Steps ───────────────────────────────────────────────────
export async function reorderTemplateSteps(idA: string, sortA: number, idB: string, sortB: number) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage inspection steps.' }
  const adminClient = createAdminClient()
  // Three-step swap to avoid unique constraint collision on (template_id, sort_order)
  const temp = 999999
  const ops: [string, number][] = [[idA, temp], [idB, sortA], [idA, sortB]]
  for (const [id, sort_order] of ops) {
    const { error } = await adminClient
      .from('item_inspection_template_steps')
      .update({ sort_order })
      .eq('id', id)
    if (error) { await logError(error.message, '/dept-admin/items'); return { error: error.message } }
  }
  revalidatePath('/dept-admin/items')
  return { success: true }
}

// ─── Delete Template Step ─────────────────────────────────────────────────────
export async function deleteTemplateStep(step_id: string) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage inspection steps.' }
  const adminClient = createAdminClient()
  const { error } = await adminClient.from('item_inspection_template_steps').update({ active: false }).eq('id', step_id)
  if (error) { await logError(error.message, '/dept-admin/items'); return { error: error.message } }
  revalidatePath('/dept-admin/items')
  revalidatePath('/dept-admin/setup')
  return { success: true }
}

// ─── Submit Inspection ────────────────────────────────────────────────────────
export async function submitInspection(payload: {
  apparatus_id: string
  compartment_id: string
  personnel_id: string
  department_id: string
  inspector_name: string
  inspection_session_id?: string
  session_compartment_id?: string
  asset_inspections: {
    asset_id: string
    template_id: string
    responses: {
      step_id: string
      boolean_value?: boolean
      numeric_value?: number
      text_value?: string
      linked_asset_id?: string
    }[]
  }[]
  presence_checks: {
    location_standard_id: string
    item_id: string
    present: boolean
    actual_quantity?: number
    notes?: string
  }[]
  medication_checks?: {
    storeroom_id: string
    storeroom_inventory_id: string
    supply_type_id: string
    supply_type_name?: string
    present: boolean
    actual_quantity?: number
    expiration_status?: 'confirmed' | 'expiring_soon' | 'expired' | 'not_applicable'
    notes?: string
  }[]
}) {
  const adminClient = createAdminClient()

  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!(await hasPermission(ctx.fullCtx, 'perform_standard_equipment_inspection'))) {
    return { error: 'You do not have permission to submit inspections.' }
  }

  const now = new Date().toISOString()

  try {
    for (const inspection of payload.asset_inspections) {
      const stepIds = inspection.responses.map(r => r.step_id)
      const { data: stepData } = await adminClient
        .from('item_inspection_template_steps')
        .select('id, fail_if_negative')
        .in('id', stepIds)

      const failStepIds = new Set((stepData ?? []).filter(s => s.fail_if_negative).map(s => s.id))
      const hasFail = inspection.responses.some(r =>
        failStepIds.has(r.step_id) && r.boolean_value === false
      )
      const overall_result = hasFail ? 'FAIL' : 'PASS'

      const { data: logData, error: dbErr } = await adminClient
        .from('item_asset_inspection_logs')
        .insert({
          asset_id: inspection.asset_id,
          template_id: inspection.template_id,
          department_id: payload.department_id,
          inspected_at: now,
          overall_result,
          inspected_by_personnel_id: payload.personnel_id,
          inspected_by_name: payload.inspector_name,
          apparatus_id: payload.apparatus_id || null,
          compartment_id: payload.compartment_id || null,
          inspection_session_id: payload.inspection_session_id || null,
        })
        .select('id')
        .single()

      if (dbErr) {
        await logError(dbErr.message, '/inspections/run')
        return { error: dbErr.message }
      }

      const stepInserts = inspection.responses.map(r => ({
        inspection_log_id: logData.id,
        template_step_id: r.step_id,
        boolean_value: r.boolean_value ?? null,
        numeric_value: r.numeric_value ?? null,
        text_value: r.text_value ?? r.linked_asset_id ?? null,
        notes: null,
      }))

      if (stepInserts.length > 0) {
        const { error: stepsErr } = await adminClient
          .from('item_asset_inspection_log_steps')
          .insert(stepInserts)
        if (stepsErr) {
          await logError(stepsErr.message, '/inspections/run')
          return { error: stepsErr.message }
        }
      }
    }

    // Store presence check results
    if (payload.presence_checks.length > 0) {
      const presenceInserts = payload.presence_checks.map(pc => ({
        department_id: payload.department_id,
        apparatus_id: payload.apparatus_id,
        compartment_id: payload.compartment_id || null,
        location_standard_id: pc.location_standard_id || null,
        item_id: pc.item_id,
        inspected_at: now,
        inspected_by_personnel_id: payload.personnel_id,
        inspected_by_name: payload.inspector_name,
        present: pc.present,
        actual_quantity: pc.actual_quantity ?? null,
        notes: pc.notes ?? null,
      }))
      const { error: presenceErr } = await adminClient
        .from('compartment_presence_check_logs')
        .insert(presenceInserts)
      if (presenceErr) {
        await logError(presenceErr.message, '/inspections/run')
        return { error: presenceErr.message }
      }
    }

    // Store medication check results
    if (payload.medication_checks && payload.medication_checks.length > 0) {
      const [{ data: apparatusRow }, { data: compartmentRow }, { data: storeroomRows }] = await Promise.all([
        adminClient.from('apparatus').select('unit_number').eq('id', payload.apparatus_id).single(),
        adminClient.from('apparatus_compartments').select('compartment_name_id').eq('id', payload.compartment_id).single(),
        adminClient.from('medical_storerooms').select('id, name').in(
          'id', [...new Set(payload.medication_checks.map(mc => mc.storeroom_id))]
        ),
      ])
      let compartmentCode: string | null = null
      if (compartmentRow?.compartment_name_id) {
        const { data: nameRow } = await adminClient
          .from('compartment_names')
          .select('compartment_code')
          .eq('id', compartmentRow.compartment_name_id)
          .single()
        compartmentCode = nameRow?.compartment_code ?? null
      }
      const storeroomNameById = new Map((storeroomRows ?? []).map(s => [s.id, s.name]))

      const medicationInserts = payload.medication_checks.map(mc => ({
        department_id: payload.department_id,
        storeroom_id: mc.storeroom_id,
        storeroom_name: storeroomNameById.get(mc.storeroom_id) ?? null,
        storeroom_inventory_id: mc.storeroom_inventory_id,
        supply_type_id: mc.supply_type_id,
        supply_type_name: mc.supply_type_name ?? null,
        apparatus_id: payload.apparatus_id,
        apparatus_name: apparatusRow?.unit_number ?? null,
        compartment_id: payload.compartment_id,
        compartment_name: compartmentCode,
        inspection_session_id: payload.inspection_session_id || null,
        inspected_at: now,
        inspected_by_personnel_id: payload.personnel_id,
        inspected_by_name: payload.inspector_name,
        present: mc.present,
        actual_quantity: mc.actual_quantity ?? null,
        expiration_status: mc.expiration_status ?? null,
        notes: mc.notes ?? null,
      }))
      const { error: medicationErr } = await adminClient
        .from('medical_supply_presence_check_logs')
        .insert(medicationInserts)
      if (medicationErr) {
        await logError(medicationErr.message, '/inspections/run')
        return { error: medicationErr.message }
      }
    }

    if (payload.session_compartment_id) {
      const completeRes = await completeCompartmentInSession(payload.session_compartment_id)
      if (completeRes?.error) {
        await logError(completeRes.error, '/inspections/run')
        return { error: completeRes.error }
      }
    }

    revalidatePath('/inspections', 'layout')
    return { success: true }
  } catch (e: any) {
    await logError(e?.message ?? 'Unknown error', '/inspections/run')
    return { error: e?.message ?? 'Submission failed.' }
  }
}

// ─── Get or Create Inspection Session ─────────────────────────────────────────
export async function getOrCreateInspectionSession(apparatus_id: string) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Department not found.' }

  const now = new Date().toISOString()

  // Read department's configured session duration
  const { data: deptList } = await adminClient
    .from('departments')
    .select('inspection_session_duration_hours')
    .eq('id', ctx.department_id)
  const durationHours = deptList?.[0]?.inspection_session_duration_hours ?? 12

  const { data: existing } = await adminClient
    .from('inspection_sessions')
    .select('*')
    .eq('apparatus_id', apparatus_id)
    .eq('department_id', ctx.department_id)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)

  let session = existing?.[0] ?? null

  if (session && session.expires_at < now) {
    await adminClient.from('inspection_sessions').update({ status: 'expired' }).eq('id', session.id)
    session = null
  }

  if (!session) {
    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString()
    const { data: newSession, error: sessionErr } = await adminClient
      .from('inspection_sessions')
      .insert({ apparatus_id, department_id: ctx.department_id, started_by: user.id, expires_at: expiresAt })
      .select('*')
      .single()
    if (sessionErr) { await logError(sessionErr.message, '/inspections/apparatus'); return { error: sessionErr.message } }
    session = newSession

    const { data: compartments } = await adminClient
      .from('apparatus_compartments')
      .select('id')
      .eq('apparatus_id', apparatus_id)

    if (compartments && compartments.length > 0) {
      const { error: compErr } = await adminClient
        .from('inspection_session_compartments')
        .insert(compartments.map(c => ({ session_id: session.id, compartment_id: c.id })))
      if (compErr) { await logError(compErr.message, '/inspections/apparatus'); return { error: compErr.message } }
    }
  }

  return { session, ...(await fetchSessionCompartments(session.id, adminClient, ctx.department_id)) }
}

async function fetchSessionCompartments(session_id: string, adminClient: ReturnType<typeof createAdminClient>, department_id?: string) {
  const { data: rows } = await adminClient
    .from('inspection_session_compartments')
    .select('*')
    .eq('session_id', session_id)

  const compartmentIds = (rows ?? []).map(r => r.compartment_id)
  const { data: compLinks } = compartmentIds.length > 0
    ? await adminClient.from('apparatus_compartments').select('id, compartment_name_id').in('id', compartmentIds)
    : { data: [] }

  // Medication expiring/expired indicator per compartment
  let expiringCompartmentIds = new Set<string>()
  if (department_id && compartmentIds.length > 0) {
    const { data: deptRow } = await adminClient.from('departments').select('module_medical').eq('id', department_id).single()
    if (deptRow?.module_medical) {
      const { data: rooms } = await adminClient
        .from('medical_storerooms')
        .select('id, compartment_id')
        .in('compartment_id', compartmentIds)
        .eq('active', true)
      const roomIds = (rooms ?? []).map(r => r.id)
      const { data: invRows } = roomIds.length > 0
        ? await adminClient.from('medical_storeroom_inventory').select('id, storeroom_id').in('storeroom_id', roomIds)
        : { data: [] }
      const invIds = (invRows ?? []).map(i => i.id)
      const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      const { data: lots } = invIds.length > 0
        ? await adminClient
            .from('medical_stock_lots')
            .select('storeroom_inventory_id, expiration_date')
            .in('storeroom_inventory_id', invIds)
            .eq('active', true)
            .gt('quantity_remaining', 0)
            .lte('expiration_date', soon.toISOString().slice(0, 10))
        : { data: [] }
      const expiringInvIds = new Set((lots ?? []).map(l => l.storeroom_inventory_id))
      const expiringRoomIds = new Set((invRows ?? []).filter(i => expiringInvIds.has(i.id)).map(i => i.storeroom_id))
      expiringCompartmentIds = new Set((rooms ?? []).filter(r => expiringRoomIds.has(r.id)).map(r => r.compartment_id))
    }
  }

  const nameIds = [...new Set((compLinks ?? []).map(c => c.compartment_name_id).filter(Boolean))]
  const { data: names } = nameIds.length > 0
    ? await adminClient.from('compartment_names').select('id, compartment_name').in('id', nameIds)
    : { data: [] }

  const nameMap = new Map((names ?? []).map(n => [n.id, n.compartment_name]))
  const linkMap = new Map((compLinks ?? []).map(c => [c.id, c]))

  const userIds = [...new Set((rows ?? []).flatMap(r => [r.claimed_by, r.completed_by, r.released_by]).filter(Boolean))]
  let personnelMap = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: personnel } = await adminClient
      .from('personnel')
      .select('auth_user_id, first_name, last_name')
      .in('auth_user_id', userIds)
    personnelMap = new Map((personnel ?? []).map(p => [p.auth_user_id, `${p.first_name} ${p.last_name}`]))
  }

  const compartments = (rows ?? []).map(r => {
    const link = linkMap.get(r.compartment_id)
    return {
      ...r,
      compartment_name: link ? (nameMap.get(link.compartment_name_id) ?? 'Unknown') : 'Unknown',
      claimed_by_name: r.claimed_by ? (personnelMap.get(r.claimed_by) ?? 'Unknown') : null,
      completed_by_name: r.completed_by ? (personnelMap.get(r.completed_by) ?? 'Unknown') : null,
      medication_expiring: expiringCompartmentIds.has(r.compartment_id),
    }
  })

  return { compartments }
}

// ─── Claim Compartment ─────────────────────────────────────────────────────────
export async function claimCompartment(session_compartment_id: string) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: existing } = await adminClient
    .from('inspection_session_compartments')
    .select('status, claimed_by')
    .eq('id', session_compartment_id)
    .single()

  if (existing?.status === 'completed') return { error: 'Compartment is already completed.' }
  if (existing?.status === 'in_progress' && existing.claimed_by !== user.id) {
    return { error: 'Compartment is already claimed by another user.' }
  }
  // Already claimed by this user — let them re-enter without updating claim
  if (existing?.status === 'in_progress' && existing.claimed_by === user.id) {
    return { success: true }
  }

  const { error: dbErr } = await adminClient
    .from('inspection_session_compartments')
    .update({ status: 'in_progress', claimed_by: user.id, claimed_at: new Date().toISOString() })
    .eq('id', session_compartment_id)

  if (dbErr) { await logError(dbErr.message, '/inspections/apparatus'); return { error: dbErr.message } }
  return { success: true }
}

// ─── Reopen Completed Compartment (officer/admin) ─────────────────────────────
export async function reopenCompartment(session_compartment_id: string) {
  const adminClient = createAdminClient()

  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!ctx.isOfficerOrAbove) {
    return { error: 'Only officers and admins can reopen compartments.' }
  }

  const { data: row, error: dbErr } = await adminClient
    .from('inspection_session_compartments')
    .update({ status: 'pending', claimed_by: null, claimed_at: null, completed_by: null, completed_at: null })
    .eq('id', session_compartment_id)
    .select('session_id')
    .single()

  if (dbErr) { await logError(dbErr.message, '/inspections/apparatus'); return { error: dbErr.message } }

  // If the session was marked completed, reopen it too
  await adminClient
    .from('inspection_sessions')
    .update({ status: 'in_progress', completed_at: null })
    .eq('id', row.session_id)
    .eq('status', 'completed')

  revalidatePath('/inspections', 'layout')
  return { success: true }
}

// ─── Complete Compartment ──────────────────────────────────────────────────────
export async function completeCompartmentInSession(session_compartment_id: string) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const now = new Date().toISOString()

  const { data: row, error: fetchErr } = await adminClient
    .from('inspection_session_compartments')
    .update({ status: 'completed', completed_by: user.id, completed_at: now })
    .eq('id', session_compartment_id)
    .select('session_id')
    .single()

  if (fetchErr) { await logError(fetchErr.message, '/inspections/apparatus'); return { error: fetchErr.message } }

  const { data: remaining } = await adminClient
    .from('inspection_session_compartments')
    .select('id')
    .eq('session_id', row.session_id)
    .neq('status', 'completed')

  if (!remaining || remaining.length === 0) {
    await adminClient
      .from('inspection_sessions')
      .update({ status: 'completed', completed_at: now })
      .eq('id', row.session_id)
  }

  revalidatePath('/inspections', 'layout')
  return { success: true }
}

// ─── Release Compartment (officer/admin) ──────────────────────────────────────
export async function releaseCompartment(session_compartment_id: string) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!ctx.isOfficerOrAbove) {
    return { error: 'Only officers and admins can release compartments.' }
  }

  const { error: dbErr } = await adminClient
    .from('inspection_session_compartments')
    .update({
      status: 'pending',
      claimed_by: null,
      claimed_at: null,
      released_by: user.id,
      released_at: new Date().toISOString(),
    })
    .eq('id', session_compartment_id)
    .eq('status', 'in_progress')

  if (dbErr) { await logError(dbErr.message, '/inspections/apparatus'); return { error: dbErr.message } }
  revalidatePath('/inspections', 'layout')
  return { success: true }
}

// ─── Session Reconciliation ───────────────────────────────────────────────────
export async function getSessionReconciliation(session_id: string, apparatus_id: string) {
  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Not authenticated.' }
  const adminClient = createAdminClient()

  // Only reconcile compartments that were actually completed this session
  const { data: completedComps } = await adminClient
    .from('inspection_session_compartments')
    .select('compartment_id')
    .eq('session_id', session_id)
    .eq('status', 'completed')

  const completedCompIds = (completedComps ?? []).map(c => c.compartment_id)
  if (completedCompIds.length === 0) return { unaccounted: [] }

  // Item types expected in those compartments
  const { data: standards } = await adminClient
    .from('item_location_standards')
    .select('item_id')
    .in('apparatus_compartment_id', completedCompIds)
    .eq('active', true)

  const scopedItemIds = [...new Set((standards ?? []).map(s => s.item_id))]
  if (scopedItemIds.length === 0) return { unaccounted: [] }

  // Assets of those item types assigned to this apparatus
  const { data: assignedAssets } = await adminClient
    .from('item_assets')
    .select('id, asset_tag, serial_number, item_id')
    .eq('apparatus_id', apparatus_id)
    .eq('active', true)
    .in('item_id', scopedItemIds)

  if (!assignedAssets || assignedAssets.length === 0) return { unaccounted: [] }

  // Assets confirmed during this session
  const { data: inspectedLogs } = await adminClient
    .from('item_asset_inspection_logs')
    .select('asset_id')
    .eq('inspection_session_id', session_id)

  const inspectedIds = new Set((inspectedLogs ?? []).map(l => l.asset_id))
  const unaccounted = assignedAssets.filter(a => !inspectedIds.has(a.id))

  if (unaccounted.length === 0) return { unaccounted: [] }

  const itemIds = [...new Set(unaccounted.map(a => a.item_id))]
  const { data: items } = await adminClient
    .from('items')
    .select('id, item_name')
    .in('id', itemIds)
  const itemMap = new Map((items ?? []).map(i => [i.id, i.item_name]))

  return {
    unaccounted: unaccounted.map(a => ({
      id: a.id,
      asset_tag: a.asset_tag,
      serial_number: a.serial_number as string | null,
      item_name: itemMap.get(a.item_id) ?? 'Unknown',
    })),
  }
}

// ─── Vehicle Check: Seed defaults for dept ────────────────────────────────────
export async function ensureVehicleCheckItems(department_id: string) {
  const adminClient = createAdminClient()
  const { data: existing } = await adminClient
    .from('vehicle_check_items')
    .select('id')
    .eq('department_id', department_id)
    .limit(1)
  if (existing && existing.length > 0) return { seeded: false }
  const inserts = VEHICLE_CHECK_DEFAULTS.map(item => ({ ...item, department_id }))
  const { error: dbErr } = await adminClient.from('vehicle_check_items').insert(inserts)
  if (dbErr) { await logError(dbErr.message, '/dept-admin/inspections'); return { error: dbErr.message } }
  return { seeded: true }
}

// ─── Vehicle Check: Fetch items for dept ──────────────────────────────────────
export async function getVehicleCheckItems(department_id: string) {
  const adminClient = createAdminClient()
  await ensureVehicleCheckItems(department_id)
  const { data, error: dbErr } = await adminClient
    .from('vehicle_check_items')
    .select('id, label, group_name, sort_order, has_amount_field, requires_air_brakes, active, instructions')
    .eq('department_id', department_id)
    .order('group_name')
    .order('sort_order')
  if (dbErr) return { items: [], error: dbErr.message }
  return { items: data ?? [] }
}

// ─── Vehicle Check: Submit ─────────────────────────────────────────────────────
export async function submitVehicleCheck(payload: {
  apparatus_id: string
  department_id: string
  personnel_id: string
  odometer?: number | null
  engine_hours?: number | null
  notes?: string
  results: { item_id: string; result: 'ok' | 'issue' | 'na'; amount_added?: string; notes?: string }[]
}) {
  const adminClient = createAdminClient()
  const ctx = await getContext()
  if (!ctx) return { error: 'Not authenticated.' }
  if (!(await hasPermission(ctx.fullCtx, 'perform_apparatus_check'))) {
    return { error: 'You do not have permission to submit vehicle checks.' }
  }

  const { data: inspection, error: inspErr } = await adminClient
    .from('vehicle_inspections')
    .insert({
      apparatus_id: payload.apparatus_id,
      department_id: payload.department_id,
      inspected_by: payload.personnel_id,
      odometer: payload.odometer ?? null,
      engine_hours: payload.engine_hours ?? null,
      notes: payload.notes ?? null,
      status: 'completed',
    })
    .select('id')
    .single()

  if (inspErr) { await logError(inspErr.message, '/inspections/vehicle-check'); return { error: inspErr.message } }

  if (payload.results.length > 0) {
    const { error: resErr } = await adminClient.from('vehicle_inspection_results').insert(
      payload.results.map(r => ({
        inspection_id: inspection.id,
        item_id: r.item_id,
        result: r.result,
        amount_added: r.amount_added ?? null,
        notes: r.notes ?? null,
      }))
    )
    if (resErr) { await logError(resErr.message, '/inspections/vehicle-check'); return { error: resErr.message } }
  }

  revalidatePath('/inspections')
  return { success: true, inspection_id: inspection.id }
}

// ─── Vehicle Check: History for apparatus ─────────────────────────────────────
export async function getVehicleCheckHistory(apparatus_id: string, limit = 10) {
  const adminClient = createAdminClient()
  const { data, error: dbErr } = await adminClient
    .from('vehicle_inspections')
    .select('id, inspected_at, odometer, engine_hours, notes, inspected_by')
    .eq('apparatus_id', apparatus_id)
    .order('inspected_at', { ascending: false })
    .limit(limit)
  if (dbErr) return { history: [] }

  const personnelIds = [...new Set((data ?? []).map(r => r.inspected_by))]
  const { data: personnel } = personnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', personnelIds)
    : { data: [] }
  const pMap = new Map((personnel ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  return {
    history: (data ?? []).map(r => ({
      ...r,
      inspector_name: pMap.get(r.inspected_by) ?? 'Unknown',
    })),
  }
}

// ─── Vehicle Check Admin: Add item ────────────────────────────────────────────
export async function addVehicleCheckItem(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage vehicle check items.' }
  const adminClient = createAdminClient()
  const department_id = ctx.department_id
  if (!department_id) return { error: 'Department not found.' }

  const label = (formData.get('label') as string)?.trim()
  const group_name = (formData.get('group_name') as string)?.trim()
  const has_amount_field = formData.get('has_amount_field') === 'true'
  const requires_air_brakes = formData.get('requires_air_brakes') === 'true'
  const instructions = (formData.get('instructions') as string)?.trim() || null
  if (!label || !group_name) return { error: 'Label and group are required.' }

  const { data: last } = await adminClient
    .from('vehicle_check_items')
    .select('sort_order')
    .eq('department_id', department_id)
    .eq('group_name', group_name)
    .order('sort_order', { ascending: false })
    .limit(1)
  const sort_order = (last?.[0]?.sort_order ?? 0) + 1

  const { error: dbErr } = await adminClient.from('vehicle_check_items').insert({
    department_id, label, group_name, sort_order, has_amount_field, requires_air_brakes, instructions, active: true,
  })
  if (dbErr) { await logError(dbErr.message, '/dept-admin/inspections'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/inspections')
  return { success: true }
}

// ─── Vehicle Check Admin: Update item ─────────────────────────────────────────
export async function updateVehicleCheckItem(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage vehicle check items.' }
  const adminClient = createAdminClient()
  const id = formData.get('id') as string
  const label = (formData.get('label') as string)?.trim()
  const group_name = (formData.get('group_name') as string)?.trim()
  const has_amount_field = formData.get('has_amount_field') === 'true'
  const requires_air_brakes = formData.get('requires_air_brakes') === 'true'
  const instructions = (formData.get('instructions') as string)?.trim() || null
  const active = formData.get('active') !== 'false'
  if (!id || !label || !group_name) return { error: 'Invalid item.' }

  const { error: dbErr } = await adminClient
    .from('vehicle_check_items')
    .update({ label, group_name, has_amount_field, requires_air_brakes, instructions, active })
    .eq('id', id)
  if (dbErr) { await logError(dbErr.message, '/dept-admin/inspections'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/inspections')
  return { success: true }
}

// ─── Vehicle Check Admin: Toggle active ───────────────────────────────────────
export async function toggleVehicleCheckItem(id: string, active: boolean) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage vehicle check items.' }
  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient
    .from('vehicle_check_items')
    .update({ active })
    .eq('id', id)
  if (dbErr) { await logError(dbErr.message, '/dept-admin/inspections'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/inspections')
  return { success: true }
}

// ─── Vehicle Check Admin: Reset to defaults ───────────────────────────────────
export async function resetVehicleCheckItemsToDefaults(department_id: string) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can reset vehicle check items.' }
  const adminClient = createAdminClient()
  await adminClient.from('vehicle_check_items').delete().eq('department_id', department_id)
  const inserts = VEHICLE_CHECK_DEFAULTS.map(item => ({ ...item, department_id }))
  const { error: dbErr } = await adminClient.from('vehicle_check_items').insert(inserts)
  if (dbErr) { await logError(dbErr.message, '/dept-admin/inspections'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/inspections')
  return { success: true }
}

// ─── Close Session (officer/admin) ────────────────────────────────────────────
export async function closeInspectionSession(session_id: string) {
  const ctx = await getContext()
  const adminClient = createAdminClient()

  if (!ctx?.isOfficerOrAbove) {
    return { error: 'Only officers and admins can close sessions.' }
  }

  const { error: dbErr } = await adminClient
    .from('inspection_sessions')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', session_id)

  if (dbErr) { await logError(dbErr.message, '/inspections/apparatus'); return { error: dbErr.message } }
  revalidatePath('/inspections', 'layout')
  return { success: true }
}

// ─── Delete Session (officer/admin) — used when cancelling with 0 completed ──
export async function deleteInspectionSession(session_id: string) {
  const ctx = await getContext()
  const adminClient = createAdminClient()

  if (!ctx?.isOfficerOrAbove) {
    return { error: 'Only officers and admins can cancel sessions.' }
  }

  // CASCADE on session_id FK removes inspection_session_compartments rows automatically
  const { error: dbErr } = await adminClient
    .from('inspection_sessions')
    .delete()
    .eq('id', session_id)

  if (dbErr) { await logError(dbErr.message, '/inspections/apparatus'); return { error: dbErr.message } }
  revalidatePath('/inspections', 'layout')
  return { success: true }
}
