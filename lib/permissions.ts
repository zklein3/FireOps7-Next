import { createAdminClient } from '@/lib/supabase/admin'
import type { CurrentDepartmentContext } from '@/lib/current-department'
import { PERMISSION_CATALOG, type PermissionKey } from '@/lib/permission-catalog'

// The resolver chokepoint for the new granular permission-group system.
//
// Not imported by any real gate yet (Phase 1) — see CLAUDE.md "IMMEDIATE
// NEXT" for the phased rollout. Every call site currently gating on
// ctx.systemRole/ctx.isSysAdmin keeps doing so unchanged until it's
// individually migrated to call this instead.

export type PermissionSnapshot = Record<PermissionKey, boolean>

const ROLE_RANK = { member: 0, officer: 1, admin: 2 } as const

// What system_role tier grants each key today — derived once here from
// PERMISSION_CATALOG's legacyMinRole rather than hand-maintained separately,
// so it can't drift out of sync with the catalog.
function legacySnapshot(systemRole: string | null): PermissionSnapshot {
  const rank = ROLE_RANK[(systemRole ?? 'member') as keyof typeof ROLE_RANK] ?? 0
  return Object.fromEntries(
    PERMISSION_CATALOG.map(e => [e.key, rank >= ROLE_RANK[e.legacyMinRole]])
  ) as PermissionSnapshot
}

// One DB round trip per request/action — call once and pass the snapshot
// around rather than calling hasPermission() repeatedly against fresh
// queries in the same request.
export async function getPermissionSnapshot(ctx: CurrentDepartmentContext): Promise<PermissionSnapshot> {
  if (ctx.isSysAdmin) {
    // Sys admin is the platform/developer-level bypass — same as everywhere
    // else in the app, unrelated to department permission groups.
    return Object.fromEntries(PERMISSION_CATALOG.map(e => [e.key, true])) as PermissionSnapshot
  }

  const legacy = legacySnapshot(ctx.systemRole)
  if (!ctx.departmentId) return legacy

  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('department_personnel')
    .select('permission_group_id, department_permission_groups(permissions, active)')
    .eq('personnel_id', ctx.personnelId)
    .eq('department_id', ctx.departmentId)
    .eq('active', true)
    .maybeSingle()

  // Cast through any, same convention as lib/current-department.ts's nested
  // `departments(...)` select — the untyped Supabase client can't infer this
  // is a to-one relationship from department_personnel.permission_group_id.
  const group = (data?.department_permission_groups as any) as
    { permissions: Record<string, boolean>; active: boolean } | null
  if (!group?.active) return legacy

  // Per-key merge: an explicit value in the group's stored permissions wins;
  // a key the group's JSONB doesn't have yet (added to the catalog after
  // this group was last saved) falls through to legacy for that key only —
  // never silently denies a capability a legacy-role user would still have.
  const merged = { ...legacy }
  for (const key of Object.keys(merged) as PermissionKey[]) {
    if (key in group.permissions) merged[key] = !!group.permissions[key]
  }
  return merged
}

export function checkPermission(snapshot: PermissionSnapshot, key: PermissionKey): boolean {
  return !!snapshot[key]
}

// Sugar for a single ad-hoc check inside an action or page. Prefer
// getPermissionSnapshot() directly when checking more than one key in the
// same request.
export async function hasPermission(ctx: CurrentDepartmentContext, key: PermissionKey): Promise<boolean> {
  return checkPermission(await getPermissionSnapshot(ctx), key)
}

// For actions that authorize against a resource's own department (e.g. a burn
// permit or public feedback submission's department_id) rather than the
// caller's currently-selected department — a multi-dept admin or sys admin
// acting on a resource outside their currently-selected department must still
// be checked against THAT resource's department, not ctx.departmentId. Looks
// up the caller's real system_role for targetDepartmentId fresh rather than
// trusting whatever's in the caller's session-selected ctx.
export async function hasPermissionForDepartment(
  personnelId: string,
  isSysAdmin: boolean,
  targetDepartmentId: string,
  key: PermissionKey,
): Promise<boolean> {
  if (isSysAdmin) return true
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('department_personnel')
    .select('system_role')
    .eq('personnel_id', personnelId)
    .eq('department_id', targetDepartmentId)
    .eq('active', true)
    .maybeSingle()

  // Not an active member of the target department at all (never joined, or
  // removed) — must never fall through to legacySnapshot(null)'s member-tier
  // default, which would otherwise grant every legacyMinRole:'member' key.
  if (!data) return false

  return hasPermission(
    {
      personnelId, isSysAdmin, departmentId: targetDepartmentId, systemRole: data.system_role,
      firstName: '', lastName: '', departmentName: null, departmentType: 'fire', departmentTimezone: 'UTC',
      hasMultipleDepartments: false, selectionPending: false,
    },
    key,
  )
}
