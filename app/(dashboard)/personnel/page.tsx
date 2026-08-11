import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { getPermissionSnapshot } from '@/lib/permissions'
import { getPermissionGroups } from '@/app/actions/permissions'
import PersonnelAddForm from './PersonnelAddForm'
import HelpText from '@/components/HelpText'

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export default async function PersonnelPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  const permissions = await getPermissionSnapshot(ctx)
  const canAddPersonnel = permissions.add_personnel
  const canViewPersonnelDetails = permissions.view_personnel_details

  // Fetch roster — flat, no nested joins, include hire_date for my card
  const { data: rosterRaw } = await adminClient
    .from('department_personnel')
    .select('id, system_role, active, employee_number, hire_date, personnel_id, role_id')
    .eq('department_id', ctx.departmentId)
    .eq('active', true)
    .order('system_role')

  const personnelIds = (rosterRaw ?? []).map(r => r.personnel_id).filter(Boolean)
  const roleIds = (rosterRaw ?? []).map(r => r.role_id).filter(Boolean)

  const [
    { data: personnelData },
    { data: roleData },
    { data: allRoles },
    permissionGroupsResult,
  ] = await Promise.all([
    personnelIds.length > 0
      ? adminClient.from('personnel').select('id, first_name, last_name, email, phone').in('id', personnelIds)
      : Promise.resolve({ data: [] }),
    roleIds.length > 0
      ? adminClient.from('personnel_roles').select('id, name, is_officer').in('id', roleIds)
      : Promise.resolve({ data: [] }),
    canAddPersonnel
      ? adminClient.from('personnel_roles').select('id, name, is_officer, sort_order').eq('active', true).order('sort_order')
      : Promise.resolve({ data: [] }),
    canAddPersonnel
      ? getPermissionGroups(ctx.departmentId)
      : Promise.resolve({ groups: [] }),
  ])
  const permissionGroups = (permissionGroupsResult.groups ?? []).filter(g => g.active)

  const personnelMap = Object.fromEntries((personnelData ?? []).map(p => [p.id, p]))
  const roleMap = Object.fromEntries((roleData ?? []).map(r => [r.id, r]))

  const roleOrder: Record<string, number> = { admin: 0, officer: 1, member: 2 }
  const rows = (rosterRaw ?? [])
    .sort((a, b) => (roleOrder[a.system_role] ?? 9) - (roleOrder[b.system_role] ?? 9))
    .map(record => {
      const p = personnelMap[record.personnel_id]
      const isMe = record.personnel_id === ctx.personnelId
      const personnelId = p?.id ?? record.personnel_id
      const name = p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : '—'
      const initials = p
        ? [p.first_name?.[0], p.last_name?.[0]].filter(Boolean).join('').toUpperCase()
        : '?'
      const title = record.role_id ? (roleMap[record.role_id]?.name ?? null) : null
      const phone = p?.phone ?? null
      const email = p?.email ?? null
      const empNum = record.employee_number ?? null
      const hireDate = record.hire_date ?? null
      return { record, isMe, personnelId, name, initials, title, phone, email, empNum, hireDate }
    })

  const myRow = rows.find(r => r.isMe)
  const otherRows = rows.filter(r => !r.isMe)

  return (
    <div>
      {canAddPersonnel ? (
        <PersonnelAddForm roles={allRoles ?? []} permissionGroups={permissionGroups} />
      ) : (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900">Personnel</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Department roster and member profiles</p>
        </div>
      )}

      <p className="text-sm text-zinc-500 mb-4">
        {rows.length} active member{rows.length !== 1 ? 's' : ''}
      </p>
      <HelpText className="mb-4">
        "Edit Profile" on your own card updates your contact info yourself, anytime. "View Profile" on someone
        else's card is read-only — reach out to them directly, or an officer, for changes to their record.
      </HelpText>

      {/* Current user — full-width card */}
      {myRow && (
        <div className="mb-6 rounded-xl bg-white shadow-sm border border-zinc-200 p-5">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-14 h-14 rounded-full bg-red-700 flex items-center justify-center text-white text-xl font-bold">
              {myRow.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-xl font-bold text-zinc-900 leading-tight">
                    {myRow.name}
                    <span className="ml-2 text-sm font-normal text-zinc-400">(you)</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      myRow.record.system_role === 'admin'   ? 'bg-red-100 text-red-700' :
                      myRow.record.system_role === 'officer' ? 'bg-blue-100 text-blue-700' :
                                                               'bg-zinc-100 text-zinc-600'
                    }`}>
                      {myRow.record.system_role.charAt(0).toUpperCase() + myRow.record.system_role.slice(1)}
                    </span>
                    {myRow.title && <span className="text-sm text-zinc-500">{myRow.title}</span>}
                  </div>
                </div>
                <Link
                  href={`/personnel/${myRow.personnelId}`}
                  className="shrink-0 text-xs font-semibold text-red-600 hover:text-red-800 transition-colors"
                >
                  Edit Profile →
                </Link>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-zinc-500">
                {myRow.empNum && (
                  <span><span className="text-zinc-400 text-xs">Emp #</span> {myRow.empNum}</span>
                )}
                {myRow.hireDate && (
                  <span><span className="text-zinc-400 text-xs">Hired</span> {formatDate(myRow.hireDate)}</span>
                )}
                {myRow.phone && <span>{myRow.phone}</span>}
                {myRow.email && <span className="truncate max-w-xs">{myRow.email}</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rest of the roster */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {otherRows.map(({ record, personnelId, name, initials, title, phone, empNum }) => (
          <div key={record.id} className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-600 text-sm font-bold">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-zinc-900 truncate">{name}</p>
                  <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    record.system_role === 'admin'   ? 'bg-red-100 text-red-700' :
                    record.system_role === 'officer' ? 'bg-blue-100 text-blue-700' :
                                                       'bg-zinc-100 text-zinc-600'
                  }`}>
                    {record.system_role.charAt(0).toUpperCase() + record.system_role.slice(1)}
                  </span>
                </div>
                {title && <p className="text-sm text-zinc-500 truncate mt-0.5">{title}</p>}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
              {phone && <span>{phone}</span>}
              {empNum && <span className="text-zinc-400">#{empNum}</span>}
            </div>

            {canViewPersonnelDetails && (
              <Link
                href={`/personnel/${personnelId}`}
                className="mt-auto text-xs font-semibold text-red-600 hover:text-red-800"
              >
                View Profile →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
