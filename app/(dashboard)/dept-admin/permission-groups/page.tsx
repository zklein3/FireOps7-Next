import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { getPermissionGroups } from '@/app/actions/permissions'
import PermissionGroupsClient from './PermissionGroupsClient'

export default async function PermissionGroupsPage() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (!ctx.departmentId) redirect('/dashboard')
  if (!(await hasPermission(ctx, 'manage_permission_groups'))) redirect('/dashboard')

  const { groups } = await getPermissionGroups(ctx.departmentId)

  return (
    <div className="pt-20 px-4 pb-4 sm:pt-0 sm:p-6 lg:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Permission Groups</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Customize what each role can do. Departments start with Chief, Officer, and Firefighter — rename, extend, or add your own.
        </p>
      </div>

      <PermissionGroupsClient departmentId={ctx.departmentId} initialGroups={groups} />
    </div>
  )
}
