'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'
import { DEFAULT_PERMISSION_TEMPLATES } from '@/lib/permission-catalog'

async function getContext() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return null
  const adminClient = createAdminClient()
  const { data: myself } = await adminClient
    .from('department_personnel')
    .select('permission_group_id')
    .eq('personnel_id', ctx.personnelId)
    .eq('department_id', ctx.departmentId ?? '')
    .eq('active', true)
    .maybeSingle()
  return {
    me: { id: ctx.personnelId, is_sys_admin: ctx.isSysAdmin },
    department_id: ctx.departmentId,
    isAdmin: await hasPermission(ctx, 'manage_permission_groups'),
    myGroupId: myself?.permission_group_id ?? null,
  }
}

// A dept admin editing the very group they're currently assigned to could
// strip their own access_dept_admin_hub/manage_permission_groups and lock
// themselves out with no self-service way back in — sys admin is the only
// recovery path at that point (see sysAdminSetPersonnelPermissionGroup in
// app/actions/users.ts). Block the save instead.
function wouldLockOutCaller(
  ctx: NonNullable<Awaited<ReturnType<typeof getContext>>>,
  groupId: string,
  permissions: Record<string, boolean>,
): boolean {
  if (ctx.me.is_sys_admin) return false
  if (ctx.myGroupId !== groupId) return false
  return !permissions.access_dept_admin_hub || !permissions.manage_permission_groups
}

// ─── Seed a department's own permission groups from the hardcoded starter
// templates on first touch — same lazy pattern as ensureVehicleCheckItems
// (app/actions/inspections.ts). No sys-admin table involved; the source is
// DEFAULT_PERMISSION_TEMPLATES in lib/permission-catalog.ts.
export async function ensurePermissionGroups(department_id: string) {
  const adminClient = createAdminClient()
  const { data: existing } = await adminClient
    .from('department_permission_groups')
    .select('id')
    .eq('department_id', department_id)
    .limit(1)
  if (existing && existing.length > 0) return { seeded: false }

  const inserts = DEFAULT_PERMISSION_TEMPLATES.map((t, i) => ({
    department_id,
    name: t.name,
    description: t.description ?? null,
    permissions: t.permissions,
    source_template_key: t.key,
    sort_order: i,
    active: true,
  }))
  const { error: dbErr } = await adminClient.from('department_permission_groups').insert(inserts)
  if (dbErr) { await logError(dbErr, '/dept-admin/permission-groups'); return { error: dbErr.message } }
  return { seeded: true }
}

// ─── Fetch groups for a department, seeding first if needed ───────────────────
export async function getPermissionGroups(department_id: string) {
  const adminClient = createAdminClient()
  await ensurePermissionGroups(department_id)
  const { data, error: dbErr } = await adminClient
    .from('department_permission_groups')
    .select('id, name, description, permissions, source_template_key, sort_order, active')
    .eq('department_id', department_id)
    .order('sort_order')
  if (dbErr) return { groups: [], error: dbErr.message }
  return { groups: data ?? [] }
}

// ─── Create a new group — blank, or duplicated from an existing group's
// current checkboxes (duplicateFromId), never from a template directly
// (that's what seeding already does).
export async function createPermissionGroup(department_id: string, name: string, duplicateFromId?: string) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage permission groups.' }
  if (!name.trim()) return { error: 'Name is required.' }

  const adminClient = createAdminClient()
  let permissions: Record<string, boolean> = {}
  if (duplicateFromId) {
    const { data: source } = await adminClient
      .from('department_permission_groups')
      .select('permissions')
      .eq('id', duplicateFromId)
      .eq('department_id', department_id)
      .maybeSingle()
    if (source) permissions = source.permissions
  }

  const { data: last } = await adminClient
    .from('department_permission_groups')
    .select('sort_order')
    .eq('department_id', department_id)
    .order('sort_order', { ascending: false })
    .limit(1)
  const sort_order = (last?.[0]?.sort_order ?? 0) + 1

  const { data: created, error: dbErr } = await adminClient
    .from('department_permission_groups')
    .insert({ department_id, name: name.trim(), permissions, source_template_key: null, sort_order, active: true })
    .select('id')
    .single()
  if (dbErr) { await logError(dbErr, '/dept-admin/permission-groups'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/permission-groups')
  return { success: true, id: created.id }
}

// ─── Rename / describe ──────────────────────────────────────────────────────
export async function updatePermissionGroupMeta(groupId: string, name: string, description: string | null) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage permission groups.' }
  if (!name.trim()) return { error: 'Name is required.' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient
    .from('department_permission_groups')
    .update({ name: name.trim(), description })
    .eq('id', groupId)
    .eq('department_id', ctx.department_id)
  if (dbErr) { await logError(dbErr, '/dept-admin/permission-groups'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/permission-groups')
  return { success: true }
}

// ─── Bulk-save a group's checkboxes — one round trip for the whole
// checklist rather than one server action per checkbox.
export async function savePermissionGroup(groupId: string, permissions: Record<string, boolean>) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage permission groups.' }
  if (wouldLockOutCaller(ctx, groupId, permissions)) {
    return { error: "You can't remove your own Access Dept Admin Hub or Manage Permission Groups from this group — doing so would lock you out with no way back in yourself. Have another admin make this change, or keep both checked on your own group." }
  }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient
    .from('department_permission_groups')
    .update({ permissions })
    .eq('id', groupId)
    .eq('department_id', ctx.department_id)
  if (dbErr) { await logError(dbErr, '/dept-admin/permission-groups'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/permission-groups')
  return { success: true }
}

// ─── Deactivate/reactivate — never a hard delete, same idiom as
// vehicle_check_items and item_inspection_template_steps.
export async function togglePermissionGroup(groupId: string, active: boolean) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage permission groups.' }
  if (!active && !ctx.me.is_sys_admin && ctx.myGroupId === groupId) {
    return { error: "You can't deactivate your own currently-assigned group — doing so could lock you out. Have another admin make this change." }
  }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient
    .from('department_permission_groups')
    .update({ active })
    .eq('id', groupId)
    .eq('department_id', ctx.department_id)
  if (dbErr) { await logError(dbErr, '/dept-admin/permission-groups'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/permission-groups')
  return { success: true }
}

// ─── Reset a group back to its source template — re-reads the CURRENT
// DEFAULT_PERMISSION_TEMPLATES entry, not the department's stale seed-time
// snapshot, so a later code update to the starter template can be pulled in
// on demand.
export async function resetPermissionGroupToTemplate(groupId: string) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage permission groups.' }

  const adminClient = createAdminClient()
  const { data: group } = await adminClient
    .from('department_permission_groups')
    .select('source_template_key')
    .eq('id', groupId)
    .eq('department_id', ctx.department_id)
    .maybeSingle()
  if (!group?.source_template_key) return { error: 'This group has no default to reset to.' }

  const template = DEFAULT_PERMISSION_TEMPLATES.find(t => t.key === group.source_template_key)
  if (!template) return { error: 'The source template no longer exists.' }
  if (wouldLockOutCaller(ctx, groupId, template.permissions)) {
    return { error: "Resetting this group to its default would remove your own Access Dept Admin Hub or Manage Permission Groups and lock you out. Have another admin make this change." }
  }

  const { error: dbErr } = await adminClient
    .from('department_permission_groups')
    .update({ permissions: template.permissions })
    .eq('id', groupId)
  if (dbErr) { await logError(dbErr, '/dept-admin/permission-groups'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/permission-groups')
  return { success: true }
}

// ─── Assign (or clear) a person's permission group. Nullable — clearing
// falls back to their system_role-derived legacy behavior, unchanged.
export async function updatePersonnelPermissionGroup(department_personnel_id: string, permission_group_id: string | null) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can manage permission groups.' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient
    .from('department_personnel')
    .update({ permission_group_id })
    .eq('id', department_personnel_id)
    .eq('department_id', ctx.department_id)
  if (dbErr) { await logError(dbErr, '/dept-admin/permission-groups'); return { error: dbErr.message } }
  revalidatePath('/dept-admin/personnel')
  revalidatePath('/dept-admin/permission-groups')
  return { success: true }
}
