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
    department_id: ctx.departmentId,
    isOfficerOrAbove: await hasPermission(ctx, 'manage_pd_logs'),
  }
}

export async function addBusiness(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can manage the business list.' }
  const adminClient = createAdminClient()

  const name = formData.get('name') as string
  const address = formData.get('address') as string
  if (!name) return { error: 'Business name is required.' }

  const { error } = await adminClient.from('pd_businesses').insert({
    department_id: ctx.department_id,
    name,
    address: address || null,
  })

  if (error) { await logError(error.message, '/forms/business-check'); return { error: error.message } }
  revalidatePath('/forms/business-check')
  return { success: true }
}

export async function updateBusiness(id: string, formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can manage the business list.' }
  const adminClient = createAdminClient()

  const name = formData.get('name') as string
  const address = formData.get('address') as string
  if (!name) return { error: 'Business name is required.' }

  const { error } = await adminClient
    .from('pd_businesses')
    .update({ name, address: address || null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('department_id', ctx.department_id!)

  if (error) { await logError(error.message, '/forms/business-check'); return { error: error.message } }
  revalidatePath('/forms/business-check')
  return { success: true }
}

export async function setBusinessActive(id: string, active: boolean) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can manage the business list.' }
  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('pd_businesses')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('department_id', ctx.department_id!)

  if (error) { await logError(error.message, '/forms/business-check'); return { error: error.message } }
  revalidatePath('/forms/business-check')
  return { success: true }
}

export async function deleteBusiness(id: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can manage the business list.' }
  const adminClient = createAdminClient()

  const { error } = await adminClient.from('pd_businesses').delete().eq('id', id).eq('department_id', ctx.department_id!)
  if (error) { await logError(error.message, '/forms/business-check'); return { error: error.message } }
  revalidatePath('/forms/business-check')
  return { success: true }
}
