'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Check bottle status ──────────────────────────────────────────────────────
export async function checkBottle(bottleId: string) {
  const adminClient = createAdminClient()

  const { data: bottles } = await adminClient
    .from('fire_school_bottles')
    .select('*')
    .eq('bottle_id', bottleId.toUpperCase().trim())

  const bottle = bottles?.[0]
  if (!bottle) return { found: false }

  // Check active
  if (!bottle.active) {
    return { found: true, bottle, fillable: false, reason: 'Bottle is marked inactive.' }
  }

  const today = new Date()

  // Check requalification
  if (bottle.last_requal_date && bottle.requal_interval_years) {
    const requalDate = new Date(bottle.last_requal_date)
    requalDate.setFullYear(requalDate.getFullYear() + bottle.requal_interval_years)
    if (today > requalDate) {
      return {
        found: true, bottle, fillable: false,
        reason: `Requalification expired on ${requalDate.toLocaleDateString()}.`
      }
    }
  }

  // Check service life
  if (bottle.requires_service_life && bottle.manufacture_date && bottle.service_life_years) {
    const endOfLife = new Date(bottle.manufacture_date)
    endOfLife.setFullYear(endOfLife.getFullYear() + bottle.service_life_years)
    if (today > endOfLife) {
      return {
        found: true, bottle, fillable: false,
        reason: `Service life ended on ${endOfLife.toLocaleDateString()}.`
      }
    }
  }

  return { found: true, bottle, fillable: true, reason: null }
}

// ─── Log a fill ───────────────────────────────────────────────────────────────
export async function logFill(bottleId: string, notes?: string) {
  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('fire_school_fill_logs')
    .insert({
      bottle_id: bottleId,
      fill_result: 'Yes',
      notes: notes || null,
      filled_at: new Date().toISOString(),
    })

  if (error) return { error: error.message }

  revalidatePath('/fire-school')
  return { success: true }
}

// ─── Add bottle ───────────────────────────────────────────────────────────────
export async function addFireSchoolBottle(formData: FormData) {
  const adminClient = createAdminClient()

  const bottle_id = (formData.get('bottle_id') as string)?.toUpperCase().trim()
  const department_name = formData.get('department_name') as string
  const psi = formData.get('psi') as string
  const cylinder_type = formData.get('cylinder_type') as string
  const manufacture_date = formData.get('manufacture_date') as string
  const last_requal_date = formData.get('last_requal_date') as string
  const requal_interval_years = formData.get('requal_interval_years') as string
  const service_life_years = formData.get('service_life_years') as string
  const requires_service_life = formData.get('requires_service_life') === 'true'

  if (!bottle_id) return { error: 'Bottle ID is required.' }

  // Check if already exists
  const { data: existing } = await adminClient
    .from('fire_school_bottles')
    .select('id')
    .eq('bottle_id', bottle_id)

  if (existing?.[0]) return { error: `Bottle ${bottle_id} already exists in the system.` }

  const { error } = await adminClient
    .from('fire_school_bottles')
    .insert({
      bottle_id,
      department_name: department_name || null,
      psi: psi ? parseInt(psi) : null,
      cylinder_type: cylinder_type || null,
      manufacture_date: manufacture_date || null,
      last_requal_date: last_requal_date || null,
      requal_interval_years: requal_interval_years ? parseInt(requal_interval_years) : null,
      service_life_years: service_life_years ? parseInt(service_life_years) : null,
      requires_service_life,
      active: true,
    })

  if (error) return { error: error.message }

  revalidatePath('/fire-school/bottles')
  return { success: true }
}
