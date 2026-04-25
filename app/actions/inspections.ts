'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

async function getContext() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) return null
  const { data: myDeptList } = await adminClient.from('department_personnel').select('department_id, system_role').eq('personnel_id', me.id).eq('active', true)
  const myDept = myDeptList?.[0]
  return {
    me,
    department_id: myDept?.department_id ?? null,
    isAdmin: myDept?.system_role === 'admin' || me.is_sys_admin,
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
  return { success: true }
}

// ─── Submit Inspection ────────────────────────────────────────────────────────
export async function submitInspection(payload: {
  apparatus_id: string
  compartment_id: string
  personnel_id: string
  department_id: string
  inspector_name: string
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
}) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

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
          inspected_at: now,
          overall_result,
          inspected_by_personnel_id: payload.personnel_id,
          inspected_by_name: payload.inspector_name,
          apparatus_id: payload.apparatus_id || null,
          compartment_id: payload.compartment_id || null,
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

    revalidatePath('/inspections')
    return { success: true }
  } catch (e: any) {
    await logError(e?.message ?? 'Unknown error', '/inspections/run')
    return { error: e?.message ?? 'Submission failed.' }
  }
}
