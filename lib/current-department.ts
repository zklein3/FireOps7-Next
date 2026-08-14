import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SELECTED_DEPARTMENT_COOKIE, SYS_ADMIN_SENTINEL } from '@/lib/auth-cookies'
import { DEFAULT_TIMEZONE } from '@/lib/format-datetime'

export type CurrentDepartmentContext = {
  personnelId: string
  firstName: string
  lastName: string
  isSysAdmin: boolean
  departmentId: string | null
  departmentName: string | null
  departmentType: string
  departmentTimezone: string
  systemRole: string | null
  hasMultipleDepartments: boolean
  // True when the user has more than one viewing option (departments and/or
  // sys admin) but the SELECTED_DEPARTMENT_COOKIE doesn't resolve to a valid
  // choice yet — caller should send them to /select-department.
  selectionPending: boolean
}

/**
 * Resolves the personnel record + their *currently selected* department,
 * honoring the SELECTED_DEPARTMENT_COOKIE for users with multiple active
 * department memberships. Falls back to the sole membership for everyone else.
 * Returns null if there's no authenticated user or personnel record.
 *
 * Wrapped in React's per-request cache() -- this used to run its own
 * auth.getUser() network round trip plus 2 DB queries independently in both
 * the dashboard layout and (redundantly) in nearly every page.tsx on top of
 * it, on every single page load. cache() means every caller within the same
 * request gets the same already-computed result instead of re-fetching; it
 * resets cleanly per-request, so there's no cross-user staleness risk.
 *
 * Uses getSession() (local JWT signature check, no network call) rather than
 * getUser() (re-verifies with Supabase's Auth server every time) -- safe here
 * specifically because middleware.ts already ran the real, network-verified
 * getUser() check on this exact request and would have redirected away on
 * failure before this ever runs. This is not "verify once at login and trust
 * forever" -- middleware re-verifies on every single request/navigation, same
 * as before. This just avoids doing that same verification a second time for
 * the request middleware already cleared.
 */
export const getCurrentDepartmentContext = cache(async (): Promise<CurrentDepartmentContext | null> => {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return null

  const adminClient = createAdminClient()
  const { data: meList } = await adminClient
    .from('personnel')
    .select('id, first_name, last_name, is_sys_admin')
    .eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) return null

  const { data: deptList } = await adminClient
    .from('department_personnel')
    .select('system_role, department_id, departments(name, department_type, timezone)')
    .eq('personnel_id', me.id)
    .eq('active', true)

  const isSysAdmin = me.is_sys_admin ?? false
  // Sys admin gets an extra "viewing option" alongside their real department
  // memberships, picked via /select-department like any other department.
  const totalOptions = (deptList?.length ?? 0) + (isSysAdmin ? 1 : 0)

  let dept = deptList?.[0]
  let selectionPending = false
  let viewingAsSysAdmin = isSysAdmin && (deptList?.length ?? 0) === 0

  if (totalOptions > 1) {
    const cookieStore = await cookies()
    const selectedId = cookieStore.get(SELECTED_DEPARTMENT_COOKIE)?.value
    if (isSysAdmin && selectedId === SYS_ADMIN_SENTINEL) {
      dept = undefined
      viewingAsSysAdmin = true
    } else {
      dept = deptList?.find((d) => d.department_id === selectedId)
      // No fallback here — an unmatched cookie with multiple options means
      // the caller must send the user to /select-department, not guess.
      if (!dept) selectionPending = true
      viewingAsSysAdmin = false
    }
  }

  return {
    personnelId: me.id,
    firstName: me.first_name,
    lastName: me.last_name,
    isSysAdmin,
    departmentId: viewingAsSysAdmin ? null : dept?.department_id ?? null,
    departmentName: (dept?.departments as any)?.name ?? null,
    departmentType: (dept?.departments as any)?.department_type ?? 'fire',
    departmentTimezone: (dept?.departments as any)?.timezone ?? DEFAULT_TIMEZONE,
    systemRole: dept?.system_role ?? null,
    hasMultipleDepartments: totalOptions > 1,
    selectionPending,
  }
})
