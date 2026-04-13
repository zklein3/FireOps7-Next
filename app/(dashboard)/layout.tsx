import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import Link from 'next/link'

async function getUserContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: personnel } = await supabase
    .from('personnel')
    .select('id, first_name, last_name, is_sys_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!personnel) return null

  const { data: deptPersonnel } = await supabase
    .from('department_personnel')
    .select('system_role, department_id, departments(name)')
    .eq('personnel_id', personnel.id)
    .eq('active', true)
    .single()

  return {
    ...personnel,
    system_role: deptPersonnel?.system_role ?? 'member',
    department_name: (deptPersonnel?.departments as any)?.name ?? null,
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUserContext()

  return (
    <div className="flex min-h-screen bg-zinc-100">
      {/* Sidebar */}
      <aside className="w-64 bg-red-800 text-white flex flex-col">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-red-700">
          <h1 className="text-xl font-bold tracking-tight">FireOps7</h1>
          {user?.department_name && (
            <p className="text-xs text-red-300 mt-0.5 truncate">{user.department_name}</p>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1 text-sm overflow-y-auto">

          {/* Main Section */}
          <NavItem href="/dashboard" label="Dashboard" />
          <NavItem href="/personnel" label="Personnel" />
          <NavItem href="/apparatus" label="Apparatus" />
          <NavItem href="/stations" label="Stations" />
          <NavItem href="/equipment" label="Equipment" />
          <NavItem href="/scba" label="SCBA" />

          {/* Dept Admin Section */}
          {(user?.system_role === 'admin' || user?.is_sys_admin) && (
            <>
              <div className="mt-4 mb-1 px-3 text-xs font-semibold text-red-300 uppercase tracking-wider">
                Dept Admin
              </div>
              <NavItem href="/dept-admin/personnel" label="Manage Personnel" />
            </>
          )}

          {/* Sys Admin Section */}
          {user?.is_sys_admin && (
            <>
              <div className="mt-4 mb-1 px-3 text-xs font-semibold text-red-300 uppercase tracking-wider">
                System Admin
              </div>
              <NavItem href="/admin/departments" label="Departments" />
              <NavItem href="/admin/users" label="Users" />
            </>
          )}
        </nav>

        {/* User Footer */}
        <div className="px-4 py-4 border-t border-red-700">
          <div className="mb-2">
            <p className="text-sm font-medium truncate">
              {user ? `${user.first_name} ${user.last_name}` : 'Unknown'}
            </p>
            <p className="text-xs text-red-300 capitalize">{user?.system_role ?? ''}</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="w-full rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 transition-colors text-left"
            >
              Sign Out
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">{children}</main>
    </div>
  )
}

function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center rounded-lg px-3 py-2 text-red-100 hover:bg-red-700 hover:text-white transition-colors"
    >
      {label}
    </Link>
  )
}
