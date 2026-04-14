import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import Link from 'next/link'
import FeedbackButton from '@/components/FeedbackButton'

async function getUserContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
    .select('system_role, department_id, departments(name)')
    .eq('personnel_id', me.id)
    .eq('active', true)

  const dept = deptList?.[0]

  return {
    ...me,
    system_role: dept?.system_role ?? null,
    department_name: (dept?.departments as any)?.name ?? null,
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUserContext()
  const isSysAdmin = user?.is_sys_admin ?? false
  const systemRole = user?.system_role ?? null
  const isDeptAdmin = systemRole === 'admin'

  return (
    <div className="flex min-h-screen bg-zinc-100">
      <aside className="w-64 bg-red-800 text-white flex flex-col">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-red-700">
          <h1 className="text-xl font-bold tracking-tight">FireOps7</h1>
          {user?.department_name ? (
            <p className="text-xs text-red-300 mt-0.5 truncate">{user.department_name}</p>
          ) : isSysAdmin ? (
            <p className="text-xs text-red-300 mt-0.5">System Administrator</p>
          ) : null}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1 text-sm overflow-y-auto">

          {/* Regular dept user nav */}
          {!isSysAdmin && (
            <>
              <NavItem href="/dashboard" label="Dashboard" />
              <NavItem href="/personnel" label="Personnel" />
              <NavItem href="/apparatus" label="Apparatus" />
              <NavItem href="/stations" label="Stations" />
              <NavItem href="/equipment" label="Equipment" />
              <NavItem href="/scba" label="SCBA" />
            </>
          )}

          {/* Sys admin nav */}
          {isSysAdmin && (
            <>
              <NavItem href="/dashboard" label="Overview" />
              <div className="mt-4 mb-1 px-3 text-xs font-semibold text-red-300 uppercase tracking-wider">
                System Admin
              </div>
              <NavItem href="/admin/departments" label="Departments" />
              <NavItem href="/admin/users" label="Users" />
              <NavItem href="/admin/logs" label="System Logs" />
            </>
          )}

          {/* Dept Admin section */}
          {!isSysAdmin && isDeptAdmin && (
            <>
              <div className="mt-4 mb-1 px-3 text-xs font-semibold text-red-300 uppercase tracking-wider">
                Dept Admin
              </div>
              <NavItem href="/dept-admin/personnel" label="Manage Personnel" />
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-red-700 flex flex-col gap-2">
          <div className="mb-1">
            <p className="text-sm font-medium truncate">
              {user ? `${user.first_name} ${user.last_name}` : 'Unknown'}
            </p>
            <p className="text-xs text-red-300 capitalize">
              {isSysAdmin ? 'System Admin' : systemRole ?? ''}
            </p>
          </div>

          {/* Feedback button — available to all users */}
          <FeedbackButton />

          <form action={signOut}>
            <button type="submit"
              className="w-full rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 transition-colors text-left">
              Sign Out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto">{children}</main>
    </div>
  )
}

function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href}
      className="flex items-center rounded-lg px-3 py-2 text-red-100 hover:bg-red-700 hover:text-white transition-colors">
      {label}
    </Link>
  )
}
