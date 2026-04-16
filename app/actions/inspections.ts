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
    item_id,
    department_id,
    template_name,
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
  const active = formData.get('active') === 'true'

  const { error } = await adminClient.from('item_inspection_templates').update({
    template_name,
    template_description: template_description || null,
    active,
  }).eq('id', id)

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

  // Get next sort order if not provided
  let order = sort_order ? parseInt(sort_order) : 1
  if (!sort_order) {
    const { data: existing } = await adminClient
      .from('item_inspection_template_steps')
      .select('sort_order')
      .eq('template_id', template_id)
      .order('sort_order', { ascending: false })
      .limit(1)
    order = (existing?.[0]?.sort_order ?? 0) + 1
  }

  const { error } = await adminClient.from('item_inspection_template_steps').insert({
    template_id,
    step_text,
    step_description: step_description || null,
    step_type: step_type || 'BOOLEAN',
    response_type: step_type || 'BOOLEAN',
    required,
    fail_if_negative,
    linked_item_type_id: (step_type === 'ASSET_LINK' && linked_item_type_id) ? linked_item_type_id : null,
    sort_order: order,
    active: true,
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
    step_text,
    step_description: step_description || null,
    step_type: step_type || 'BOOLEAN',
    response_type: step_type || 'BOOLEAN',
    required,
    fail_if_negative,
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
  const { error } = await adminClient.from('item_inspection_template_steps').delete().eq('id', step_id)

  if (error) { await logError(error.message, '/dept-admin/items'); return { error: error.message } }
  revalidatePath('/dept-admin/items')
  return { success: true }
}
