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
    personnelId: ctx.personnelId,
    officerName: `${ctx.firstName} ${ctx.lastName}`,
    department_id: ctx.departmentId,
    isOfficerOrAbove: await hasPermission(ctx, 'manage_pd_logs'),
    isAdmin: await hasPermission(ctx, 'manage_police_settings'),
  }
}

const DEFAULT_CONTACT_TYPES = ['Field Interview', 'Traffic Stop', 'Pedestrian Check', 'Business Contact', 'Follow-Up', 'Other']
const DEFAULT_ACTION_TAKEN_TYPES = ['Verbal Warning', 'Citation Issued', 'Arrest', 'Report Filed', 'No Action']

// ─── Contact Types (admin-configurable list) ──────────────────────────────
export async function ensurePdContactTypes(department_id: string) {
  const adminClient = createAdminClient()
  const { data: existing } = await adminClient.from('pd_contact_types').select('id').eq('department_id', department_id).limit(1)
  if (existing && existing.length > 0) return { seeded: false }
  // upsert + ignoreDuplicates (not insert) — the unique (department_id, label)
  // constraint means concurrent first-page-loads racing this seed can't both
  // succeed and create duplicate rows.
  const { error: dbErr } = await adminClient.from('pd_contact_types').upsert(
    DEFAULT_CONTACT_TYPES.map((label, i) => ({ department_id, label, sort_order: i, active: true })),
    { onConflict: 'department_id,label', ignoreDuplicates: true }
  )
  if (dbErr) { await logError(dbErr.message, '/dept-admin/police'); return { error: dbErr.message } }
  return { seeded: true }
}

export async function getPdContactTypes(department_id: string) {
  await ensurePdContactTypes(department_id)
  const adminClient = createAdminClient()
  const { data, error: dbErr } = await adminClient
    .from('pd_contact_types')
    .select('id, label, sort_order, active')
    .eq('department_id', department_id)
    .order('sort_order')
  if (dbErr) return { items: [], error: dbErr.message }
  return { items: data ?? [] }
}

export async function addPdContactType(departmentId: string, label: string) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admin only.' }
  if (!label.trim()) return { error: 'Label is required.' }
  const adminClient = createAdminClient()
  const { data: last } = await adminClient.from('pd_contact_types').select('sort_order').eq('department_id', departmentId).order('sort_order', { ascending: false }).limit(1)
  const sort_order = (last?.[0]?.sort_order ?? -1) + 1
  const { error: dbErr } = await adminClient.from('pd_contact_types').insert({ department_id: departmentId, label: label.trim(), sort_order, active: true })
  if (dbErr) {
    if (dbErr.code === '23505') return { error: 'A contact type with that label already exists.' }
    await logError(dbErr.message, '/dept-admin/police')
    return { error: dbErr.message }
  }
  revalidatePath('/dept-admin/police')
  return { success: true }
}

export async function updatePdContactType(id: string, label: string) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admin only.' }
  if (!label.trim()) return { error: 'Label is required.' }
  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('pd_contact_types').update({ label: label.trim() }).eq('id', id)
  if (dbErr) {
    if (dbErr.code === '23505') return { error: 'A contact type with that label already exists.' }
    await logError(dbErr.message, '/dept-admin/police')
    return { error: dbErr.message }
  }
  revalidatePath('/dept-admin/police')
  return { success: true }
}

export async function togglePdContactType(id: string, active: boolean) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admin only.' }
  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('pd_contact_types').update({ active }).eq('id', id)
  if (dbErr) { await logError(dbErr.message, '/dept-admin/police'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/police')
  return { success: true }
}

export async function reorderPdContactTypes(departmentId: string, orderedIds: string[]) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admin only.' }
  const adminClient = createAdminClient()
  await Promise.all(orderedIds.map((id, i) =>
    adminClient.from('pd_contact_types').update({ sort_order: i }).eq('id', id).eq('department_id', departmentId)
  ))
  revalidatePath('/dept-admin/police')
  return { success: true }
}

export async function getPdContactTypeUsageCounts(department_id: string): Promise<Record<string, number>> {
  const adminClient = createAdminClient()
  const { data } = await adminClient.from('pd_contacts').select('contact_type_id').eq('department_id', department_id)
  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    if (!row.contact_type_id) continue
    counts[row.contact_type_id] = (counts[row.contact_type_id] ?? 0) + 1
  }
  return counts
}

export async function deletePdContactType(id: string) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admin only.' }
  const adminClient = createAdminClient()
  const { data: row, error: fetchErr } = await adminClient.from('pd_contact_types').select('department_id').eq('id', id).single()
  if (fetchErr || !row) return { error: 'Contact type not found.' }
  const { count, error: countErr } = await adminClient
    .from('pd_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('department_id', row.department_id)
    .eq('contact_type_id', id)
  if (countErr) { await logError(countErr.message, '/dept-admin/police'); return { error: countErr.message } }
  if ((count ?? 0) > 0) return { error: 'This contact type is used by existing contacts and cannot be deleted. Deactivate it instead.' }
  const { error: dbErr } = await adminClient.from('pd_contact_types').delete().eq('id', id)
  if (dbErr) { await logError(dbErr.message, '/dept-admin/police'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/police')
  return { success: true }
}

// ─── Action Taken Types (admin-configurable list) ─────────────────────────
export async function ensurePdActionTakenTypes(department_id: string) {
  const adminClient = createAdminClient()
  const { data: existing } = await adminClient.from('pd_action_taken_types').select('id').eq('department_id', department_id).limit(1)
  if (existing && existing.length > 0) return { seeded: false }
  const { error: dbErr } = await adminClient.from('pd_action_taken_types').upsert(
    DEFAULT_ACTION_TAKEN_TYPES.map((label, i) => ({ department_id, label, sort_order: i, active: true })),
    { onConflict: 'department_id,label', ignoreDuplicates: true }
  )
  if (dbErr) { await logError(dbErr.message, '/dept-admin/police'); return { error: dbErr.message } }
  return { seeded: true }
}

export async function getPdActionTakenTypes(department_id: string) {
  await ensurePdActionTakenTypes(department_id)
  const adminClient = createAdminClient()
  const { data, error: dbErr } = await adminClient
    .from('pd_action_taken_types')
    .select('id, label, sort_order, active')
    .eq('department_id', department_id)
    .order('sort_order')
  if (dbErr) return { items: [], error: dbErr.message }
  return { items: data ?? [] }
}

export async function addPdActionTakenType(departmentId: string, label: string) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admin only.' }
  if (!label.trim()) return { error: 'Label is required.' }
  const adminClient = createAdminClient()
  const { data: last } = await adminClient.from('pd_action_taken_types').select('sort_order').eq('department_id', departmentId).order('sort_order', { ascending: false }).limit(1)
  const sort_order = (last?.[0]?.sort_order ?? -1) + 1
  const { error: dbErr } = await adminClient.from('pd_action_taken_types').insert({ department_id: departmentId, label: label.trim(), sort_order, active: true })
  if (dbErr) {
    if (dbErr.code === '23505') return { error: 'An action taken type with that label already exists.' }
    await logError(dbErr.message, '/dept-admin/police')
    return { error: dbErr.message }
  }
  revalidatePath('/dept-admin/police')
  return { success: true }
}

export async function updatePdActionTakenType(id: string, label: string) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admin only.' }
  if (!label.trim()) return { error: 'Label is required.' }
  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('pd_action_taken_types').update({ label: label.trim() }).eq('id', id)
  if (dbErr) {
    if (dbErr.code === '23505') return { error: 'An action taken type with that label already exists.' }
    await logError(dbErr.message, '/dept-admin/police')
    return { error: dbErr.message }
  }
  revalidatePath('/dept-admin/police')
  return { success: true }
}

export async function togglePdActionTakenType(id: string, active: boolean) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admin only.' }
  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('pd_action_taken_types').update({ active }).eq('id', id)
  if (dbErr) { await logError(dbErr.message, '/dept-admin/police'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/police')
  return { success: true }
}

export async function reorderPdActionTakenTypes(departmentId: string, orderedIds: string[]) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admin only.' }
  const adminClient = createAdminClient()
  await Promise.all(orderedIds.map((id, i) =>
    adminClient.from('pd_action_taken_types').update({ sort_order: i }).eq('id', id).eq('department_id', departmentId)
  ))
  revalidatePath('/dept-admin/police')
  return { success: true }
}

// action_type_id IS a foreign key (pd_contact_actions.action_type_id), so usage
// is counted by id via the junction table, scoped to this department's contacts.
export async function getPdActionTakenUsageCounts(department_id: string): Promise<Record<string, number>> {
  const adminClient = createAdminClient()
  const { data: contacts } = await adminClient.from('pd_contacts').select('id').eq('department_id', department_id)
  const contactIds = (contacts ?? []).map(c => c.id)
  if (contactIds.length === 0) return {}
  const { data } = await adminClient.from('pd_contact_actions').select('action_type_id').in('contact_id', contactIds)
  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.action_type_id] = (counts[row.action_type_id] ?? 0) + 1
  }
  return counts
}

export async function deletePdActionTakenType(id: string) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admin only.' }
  const adminClient = createAdminClient()
  const { data: row, error: fetchErr } = await adminClient.from('pd_action_taken_types').select('department_id').eq('id', id).single()
  if (fetchErr || !row) return { error: 'Action taken type not found.' }
  const { count, error: countErr } = await adminClient
    .from('pd_contact_actions')
    .select('contact_id', { count: 'exact', head: true })
    .eq('action_type_id', id)
  if (countErr) { await logError(countErr.message, '/dept-admin/police'); return { error: countErr.message } }
  if ((count ?? 0) > 0) return { error: 'This action is used by existing contacts and cannot be deleted. Deactivate it instead.' }
  const { error: dbErr } = await adminClient.from('pd_action_taken_types').delete().eq('id', id)
  if (dbErr) { await logError(dbErr.message, '/dept-admin/police'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/police')
  return { success: true }
}

// ─── Case numbering ────────────────────────────────────────────────────────
export async function getPdCaseNumberSettings(department_id: string) {
  const adminClient = createAdminClient()
  const { data, error: dbErr } = await adminClient
    .from('departments')
    .select('pd_case_number_mode, pd_case_number_prefix')
    .eq('id', department_id)
    .single()
  if (dbErr || !data) return { mode: 'manual' as const, prefix: null }
  return { mode: (data.pd_case_number_mode as 'auto' | 'manual') ?? 'manual', prefix: data.pd_case_number_prefix as string | null }
}

export async function updatePdCaseNumberSettings(departmentId: string, mode: 'auto' | 'manual', prefix: string | null) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admin only.' }
  if (mode === 'auto' && !prefix?.trim()) return { error: 'A prefix is required for auto-numbering.' }
  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient
    .from('departments')
    .update({ pd_case_number_mode: mode, pd_case_number_prefix: prefix?.trim() || null })
    .eq('id', departmentId)
  if (dbErr) { await logError(dbErr.message, '/dept-admin/police'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/police')
  return { success: true }
}

// Generates the next case number for a department in 'auto' mode, e.g. YPD26-0001.
// Returns null when the department is in 'manual' mode (officer types their own).
export async function generatePdCaseNumber(department_id: string): Promise<string | null> {
  const { mode, prefix } = await getPdCaseNumberSettings(department_id)
  if (mode !== 'auto' || !prefix) return null
  const adminClient = createAdminClient()
  const year = new Date().getFullYear()
  const { data: seq, error: dbErr } = await adminClient.rpc('increment_pd_contact_counter', { p_department_id: department_id, p_year: year })
  if (dbErr || seq == null) { await logError(dbErr?.message ?? 'counter rpc failed', '/forms/contact'); return null }
  const yy = String(year).slice(-2)
  return `${prefix}${yy}-${String(seq).padStart(4, '0')}`
}

// Officer-triggered case number assignment — called when the officer taps
// "Assign Case Number" on the Contact form. Not every contact needs one, so
// this is opt-in per contact rather than automatic on every save.
export async function assignPdCaseNumber() {
  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Not authorized.' }
  const caseNumber = await generatePdCaseNumber(ctx.department_id)
  if (!caseNumber) return { error: 'Case numbering is not set to Auto for this department.' }
  return { caseNumber }
}

// Returns the current sequence value for this department/year (0 if no counter row exists yet,
// meaning the next auto-generated number will be 0001).
export async function getPdCaseNumberCounter(department_id: string, year: number): Promise<number> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('pd_contact_number_counters')
    .select('seq')
    .eq('department_id', department_id)
    .eq('year', year)
    .maybeSingle()
  return data?.seq ?? 0
}

// Admin sets the starting number so the next contact logged gets `nextNumber`.
// Useful when a department already issued case numbers by hand earlier in the
// year before switching this dept to auto mode.
export async function setPdCaseNumberStart(departmentId: string, year: number, nextNumber: number) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Admin only.' }
  if (!Number.isInteger(nextNumber) || nextNumber < 1) return { error: 'Enter a whole number of 1 or greater.' }
  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient
    .from('pd_contact_number_counters')
    .upsert({ department_id: departmentId, year, seq: nextNumber - 1 }, { onConflict: 'department_id,year' })
  if (dbErr) { await logError(dbErr.message, '/dept-admin/police'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/police')
  return { success: true }
}

type PersonInput = {
  person_id?: string
  first_name: string
  last_name: string
  dob?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  is_dangerous?: boolean
  danger_reason?: string | null
}

// Resolves an address into an address_id, creating a new pd_addresses row
// if the officer typed a new one rather than picking an existing match. If an
// existing address was selected but the officer corrected city/state/zip on
// the Contact form, those corrections are written back to the pd_addresses row.
async function resolveAddress(
  adminClient: ReturnType<typeof createAdminClient>,
  department_id: string,
  address_id: string | null,
  addressText: string | null,
  city: string | null,
  state: string | null,
  zip: string | null
): Promise<{ address_id: string | null; address: string | null; city: string | null; state: string | null; zip: string | null; error?: string }> {
  if (address_id) {
    const { data, error } = await adminClient.from('pd_addresses').select('id, address, city, state, zip').eq('id', address_id).eq('department_id', department_id).single()
    if (error || !data) return { address_id: null, address: addressText, city, state, zip, error: 'Selected address not found.' }
    const updates: Record<string, string> = {}
    if (city) updates.city = city
    if (state) updates.state = state
    if (zip) updates.zip = zip
    if (Object.keys(updates).length > 0) {
      await adminClient.from('pd_addresses').update(updates).eq('id', address_id)
    }
    return { address_id: data.id, address: data.address, city: city || data.city, state: state || data.state, zip: zip || data.zip }
  }
  if (addressText && addressText.trim()) {
    const { data, error } = await adminClient.from('pd_addresses').insert({ department_id, address: addressText.trim(), city, state, zip }).select('id, address, city, state, zip').single()
    if (error || !data) return { address_id: null, address: addressText, city, state, zip, error: error?.message }
    return { address_id: data.id, address: data.address, city: data.city, state: data.state, zip: data.zip }
  }
  return { address_id: null, address: null, city: null, state: null, zip: null }
}

// Resolves a list of person inputs into person_ids, creating new pd_persons
// rows for any that don't reference an existing person_id.
async function resolvePersons(
  adminClient: ReturnType<typeof createAdminClient>,
  department_id: string,
  persons: PersonInput[]
): Promise<{ personIds: string[]; error?: string }> {
  const personIds: string[] = []
  for (const p of persons) {
    if (p.person_id) {
      personIds.push(p.person_id)
      // Existing person selected from search — let the officer fill in or
      // correct DOB/phone/address right on the Contact form instead of only
      // being able to set these when creating a brand-new person record.
      const updates: Record<string, string> = {}
      if (p.dob) updates.dob = p.dob
      if (p.phone) updates.phone = p.phone
      if (p.address) updates.address = p.address
      if (p.city) updates.city = p.city
      if (p.state) updates.state = p.state
      if (p.zip) updates.zip = p.zip
      if (Object.keys(updates).length > 0) {
        await adminClient.from('pd_persons').update(updates).eq('id', p.person_id).eq('department_id', department_id)
      }
      continue
    }
    if (!p.first_name?.trim() || !p.last_name?.trim()) continue
    if (!p.dob) return { personIds, error: `DOB is required for new person ${p.first_name} ${p.last_name}.` }
    const { data, error } = await adminClient
      .from('pd_persons')
      .insert({
        department_id,
        first_name: p.first_name.trim(),
        last_name: p.last_name.trim(),
        dob: p.dob || null,
        phone: p.phone || null,
        address: p.address || null,
        city: p.city || null,
        state: p.state || null,
        zip: p.zip || null,
        is_dangerous: p.is_dangerous ?? false,
        danger_reason: p.is_dangerous ? (p.danger_reason || null) : null,
      })
      .select('id')
      .single()
    if (error || !data) return { personIds, error: error?.message }
    personIds.push(data.id)
  }
  return { personIds }
}

function contactFieldsFromForm(formData: FormData) {
  return {
    contact_date: formData.get('contact_date') as string,
    contact_time: (formData.get('contact_time') as string) || null,
    location_detail: (formData.get('location_detail') as string) || null,
    contact_type_id: (formData.get('contact_type_id') as string) || null,
    report_number: (formData.get('report_number') as string) || null,
    narrative: (formData.get('narrative') as string) || null,
  }
}

function actionTypeIdsFromForm(formData: FormData): string[] {
  const raw = formData.get('action_type_ids') as string
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

async function syncContactActions(adminClient: ReturnType<typeof createAdminClient>, contactId: string, actionTypeIds: string[]) {
  const { error: deleteErr } = await adminClient.from('pd_contact_actions').delete().eq('contact_id', contactId)
  if (deleteErr) { await logError(deleteErr.message, '/police', { metadata: { contactId } }); return { error: deleteErr.message } }
  if (actionTypeIds.length > 0) {
    const { error: insertErr } = await adminClient.from('pd_contact_actions').insert(
      actionTypeIds.map(action_type_id => ({ contact_id: contactId, action_type_id }))
    )
    if (insertErr) { await logError(insertErr.message, '/police', { metadata: { contactId } }); return { error: insertErr.message } }
  }
  return {}
}

export async function createContact(formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.department_id) return { error: 'Not authorized.' }
  const adminClient = createAdminClient()

  const fields = contactFieldsFromForm(formData)
  if (!fields.contact_date) return { error: 'Date is required.' }

  const address_id = (formData.get('address_id') as string) || null
  const addressText = (formData.get('address') as string) || null
  const city = (formData.get('city') as string) || null
  const state = (formData.get('state') as string) || null
  const zip = (formData.get('zip') as string) || null
  const personsRaw = formData.get('persons') as string
  let persons: PersonInput[] = []
  if (personsRaw) {
    try { persons = JSON.parse(personsRaw) } catch { /* ignore malformed input */ }
  }
  const actionTypeIds = actionTypeIdsFromForm(formData)

  const addressResult = await resolveAddress(adminClient, ctx.department_id, address_id, addressText, city, state, zip)
  if (addressResult.error) { await logError(addressResult.error, '/forms/contact'); return { error: addressResult.error } }

  const personsResult = await resolvePersons(adminClient, ctx.department_id, persons)
  if (personsResult.error) { await logError(personsResult.error, '/forms/contact'); return { error: personsResult.error } }

  // Not every contact warrants a case number — the officer must explicitly
  // tap "Assign Case Number" on the form (assignPdCaseNumber) rather than one
  // being silently generated for every save.
  const { data: contact, error } = await adminClient.from('pd_contacts').insert({
    department_id: ctx.department_id,
    officer_id: ctx.personnelId,
    officer_name: ctx.officerName,
    address_id: addressResult.address_id,
    address: addressResult.address,
    city: addressResult.city,
    state: addressResult.state,
    zip: addressResult.zip,
    ...fields,
  }).select('id').single()

  if (error || !contact) { await logError(error?.message ?? 'insert failed', '/forms/contact'); return { error: error?.message ?? 'Failed to save contact.' } }

  if (personsResult.personIds.length > 0) {
    const { error: linkError } = await adminClient.from('pd_contact_persons').insert(
      personsResult.personIds.map(person_id => ({ contact_id: contact.id, person_id }))
    )
    if (linkError) { await logError(linkError.message, '/forms/contact'); return { error: linkError.message } }
  }

  const actionsResult = await syncContactActions(adminClient, contact.id, actionTypeIds)
  if (actionsResult.error) { await logError(actionsResult.error, '/forms/contact'); return { error: actionsResult.error } }

  revalidatePath('/forms/contact')
  return { success: true }
}

export async function updateContact(id: string, formData: FormData) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can edit contacts.' }
  const adminClient = createAdminClient()

  const fields = contactFieldsFromForm(formData)
  if (!fields.contact_date) return { error: 'Date is required.' }

  const address_id = (formData.get('address_id') as string) || null
  const addressText = (formData.get('address') as string) || null
  const city = (formData.get('city') as string) || null
  const state = (formData.get('state') as string) || null
  const zip = (formData.get('zip') as string) || null
  const personsRaw = formData.get('persons') as string
  let persons: PersonInput[] = []
  if (personsRaw) {
    try { persons = JSON.parse(personsRaw) } catch { /* ignore malformed input */ }
  }
  const actionTypeIds = actionTypeIdsFromForm(formData)

  const addressResult = await resolveAddress(adminClient, ctx.department_id!, address_id, addressText, city, state, zip)
  if (addressResult.error) { await logError(addressResult.error, '/forms/contact'); return { error: addressResult.error } }

  const personsResult = await resolvePersons(adminClient, ctx.department_id!, persons)
  if (personsResult.error) { await logError(personsResult.error, '/forms/contact'); return { error: personsResult.error } }

  const { error } = await adminClient
    .from('pd_contacts')
    .update({
      address_id: addressResult.address_id,
      address: addressResult.address,
      city: addressResult.city,
      state: addressResult.state,
      zip: addressResult.zip,
      ...fields,
    })
    .eq('id', id)
    .eq('department_id', ctx.department_id!)

  if (error) { await logError(error.message, '/forms/contact'); return { error: error.message } }

  const { error: deleteLinksError } = await adminClient.from('pd_contact_persons').delete().eq('contact_id', id)
  if (deleteLinksError) { await logError(deleteLinksError.message, '/forms/contact'); return { error: deleteLinksError.message } }

  if (personsResult.personIds.length > 0) {
    const { error: linkError } = await adminClient.from('pd_contact_persons').insert(
      personsResult.personIds.map(person_id => ({ contact_id: id, person_id }))
    )
    if (linkError) { await logError(linkError.message, '/forms/contact'); return { error: linkError.message } }
  }

  const actionsResult = await syncContactActions(adminClient, id, actionTypeIds)
  if (actionsResult.error) { await logError(actionsResult.error, '/forms/contact'); return { error: actionsResult.error } }

  revalidatePath('/forms/contact')
  return { success: true }
}

export async function deleteContact(id: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can delete contacts.' }
  const adminClient = createAdminClient()
  const { error } = await adminClient.from('pd_contacts').delete().eq('id', id).eq('department_id', ctx.department_id!)
  if (error) { await logError(error.message, '/forms/contact'); return { error: error.message } }
  revalidatePath('/forms/contact')
  return { success: true }
}

// ─── Officer safety flag ──────────────────────────────────────────────────
// Lives on the person, not the contact — once someone is flagged, every
// past and future contact involving them should surface the warning.
export async function updatePersonDangerFlag(personId: string, isDangerous: boolean, reason: string | null) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can set an officer safety flag.' }
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('pd_persons')
    .update({
      is_dangerous: isDangerous,
      danger_reason: isDangerous ? (reason || null) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', personId)
    .eq('department_id', ctx.department_id!)
  if (error) { await logError(error.message, '/forms/contact'); return { error: error.message } }
  revalidatePath('/forms/contact')
  return { success: true }
}
