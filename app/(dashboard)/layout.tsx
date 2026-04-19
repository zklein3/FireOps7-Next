import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import Link from 'next/link'
import FeedbackButton from '@/components/FeedbackButton'
import MobileSidebar from '@/components/MobileSidebar'

async function getUserContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data: meList } = await adminClient.from('personnel').select('id, first_name, last_name, is_sys_admin').eq('auth_user_id', user.id)
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
  const isOfficerOrAbove = isDeptAdmin || systemRole === 'officer'

  const navItems = isSysAdmin ? [
    { href: '/dashboard', label: 'Overview' },
  ] : [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/personnel', label: 'Personnel' },
    { href: '/apparatus', label: 'Apparatus' },
    { href: '/stations', label: 'Stations' },
    { href: '/equipment', label: 'Equipment' },
    { href: '/inspections', label: 'Inspections' },
    { href: '/events', label: 'Events' },
    { href: '/training', label: 'Training' },
    { href: '/incidents', label: 'Incidents' },
    ...(isOfficerOrAbove ? [{ href: '/reports/inventory', label: 'Reports' }] : []),
  ]

  const adminNavItems = isSysAdmin ? [
    { href: '/admin/departments', label: 'Departments' },
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/logs', label: 'System Logs' },
  ] : isDeptAdmin ? [
    { href: '/dept-admin/personnel', label: 'Manage Personnel' },
    { href: '/dept-admin/compartments', label: 'Compartments' },
    { href: '/dept-admin/items', label: 'Items' },
    { href: '/dept-admin/attendance', label: 'Attendance Settings' },
    { href: '/dept-admin/training', label: 'Training' },
  ] : []

  const adminLabel = isSysAdmin ? 'System Admin' : 'Dept Admin'

  const userInfo = {
    name: user ? `${user.first_name} ${user.last_name}` : 'Unknown',
    role: isSysAdmin ? 'System Admin' : systemRole ?? '',
    departmentName: user?.department_name ?? (isSysAdmin ? 'System Administrator' : null),
  }

  return (
    <div className="flex min-h-screen bg-zinc-100">
      <aside className="hidden md:flex w-64 bg-red-800 text-white flex-col shrink-0">
        <SidebarContent navItems={navItems} adminNavItems={adminNavItems} adminLabel={adminLabel} userInfo={userInfo} isSysAdmin={isSysAdmin} isDeptAdmin={isDeptAdmin} />
      </aside>
      <MobileSidebar navItems={navItems} adminNavItems={adminNavItems} adminLabel={adminLabel} userInfo={userInfo} isSysAdmin={isSysAdmin} />
      <main className="flex-1 pt-20 px-4 pb-4 sm:pt-0 sm:p-6 lg:p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

function SidebarContent({ navItems, adminNavItems, adminLabel, userInfo, isSysAdmin, isDeptAdmin }: {
  navItems: { href: string; label: string }[]
  adminNavItems: { href: string; label: string }[]
  adminLabel: string
  userInfo: { name: string; role: string; departmentName: string | null }
  isSysAdmin: boolean
  isDeptAdmin: boolean
}) {
  return (
    <>
      <div className="px-6 py-5 border-b border-red-700">
        <h1 className="text-xl font-bold tracking-tight">FireOps7</h1>
        {userInfo.departmentName && <p className="text-xs text-red-300 mt-0.5 truncate">{userInfo.departmentName}</p>}
      </div>
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 text-sm overflow-y-auto">
        {navItems.map(item => <NavItem key={item.href} href={item.href} label={item.label} />)}
        {adminNavItems.length > 0 && (
          <>
            <div className="mt-4 mb-1 px-3 text-xs font-semibold text-red-300 uppercase tracking-wider">{adminLabel}</div>
            {adminNavItems.map(item => <NavItem key={item.href} href={item.href} label={item.label} />)}
          </>
        )}
      </nav>
      <div className="px-4 py-4 border-t border-red-700 flex flex-col gap-2">
        <div className="mb-1">
          <p className="text-sm font-medium truncate">{userInfo.name}</p>
          <p className="text-xs text-red-300 capitalize">{userInfo.role}</p>
        </div>
        <FeedbackButton />
        <form action={signOut}>
          <button type="submit" className="w-full rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 transition-colors text-left">
            Sign Out
          </button>
        </form>
      </div>
    </>
  )
}

function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center rounded-lg px-3 py-2 text-red-100 hover:bg-red-700 hover:text-white transition-colors">
      {label}
    </Link>
  )
}

export { SidebarContent }
