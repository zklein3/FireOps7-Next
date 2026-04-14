import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SysAdminDashboard from './SysAdminDashboard'

async function getDashboardData(departmentId: string) {
  const adminClient = createAdminClient()

  const [personnel, stations, apparatus, scba, pendingSetup] = await Promise.all([
    adminClient.from('department_personnel').select('id, system_role').eq('department_id', departmentId).eq('active', true).eq('signup_status', 'active'),
    adminClient.from('stations').select('id').eq('department_id', departmentId).eq('active', true),
    adminClient.from('apparatus').select('id').eq('department_id', departmentId).eq('active', true),
    adminClient.from('scba_bottles').select('id').eq('department_id', departmentId).eq('active', true).eq('retired', false),
    adminClient.from('department_personnel').select('id').eq('department_id', departmentId).in('signup_status', ['temp_password', 'profile_setup']),
  ])

  const personnelList = personnel.data ?? []

  return {
    personnelTotal: personnelList.length,
    adminCount: personnelList.filter(p => p.system_role === 'admin').length,
    officerCount: personnelList.filter(p => p.system_role === 'officer').length,
    memberCount: personnelList.filter(p => p.system_role === 'member').length,
    stationCount: (stations.data ?? []).length,
    apparatusCount: (apparatus.data ?? []).length,
    scbaCount: (scba.data ?? []).length,
    pendingSetup: pendingSetup.data ?? [],
  }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient
    .from('personnel')
    .select('id, first_name, last_name, is_sys_admin')
    .eq('auth_user_id', user.id)

  const me = meList?.[0]
  if (!me) redirect('/login')

  // ── Sys Admin → show sys admin dashboard ─────────────────────────────────
  if (me.is_sys_admin) {
    return <SysAdminDashboard />
  }

  // ── Regular user → show department dashboard ──────────────────────────────
  const { data: myDeptList } = await adminClient
    .from('department_personnel')
    .select('department_id, system_role, departments(name)')
    .eq('personnel_id', me.id)
    .eq('active', true)

  const myDept = myDeptList?.[0]
  if (!myDept) redirect('/login')

  const departmentId = myDept.department_id
  const departmentName = (myDept.departments as any)?.name ?? 'Your Department'
  const systemRole = myDept.system_role
  const isAdmin = systemRole === 'admin'

  const data = await getDashboardData(departmentId)

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">
          {greeting()}, {me.first_name || 'there'}
        </h1>
        <p className="text-sm text-zinc-500 mt-1">{departmentName}</p>
      </div>

      {isAdmin && data.pendingSetup.length > 0 && (
        <div className="mb-6 rounded-xl bg-yellow-50 border border-yellow-200 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-yellow-800">
              {data.pendingSetup.length} user{data.pendingSetup.length !== 1 ? 's' : ''} haven&apos;t completed account setup
            </p>
            <p className="text-xs text-yellow-600 mt-0.5">They need to log in and set their password and profile.</p>
          </div>
          <Link href="/dept-admin/personnel" className="text-xs font-semibold text-yellow-800 hover:underline whitespace-nowrap ml-4">
            View Personnel →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
        <StatCard label="Active Personnel" value={data.personnelTotal} href="/personnel"
          sub={`${data.adminCount} admin · ${data.officerCount} officer · ${data.memberCount} member`} />
        <StatCard label="Stations" value={data.stationCount} href="/stations" />
        <StatCard label="Apparatus" value={data.apparatusCount} href="/apparatus" />
        <StatCard label="SCBA Bottles" value={data.scbaCount} href="/scba" />
      </div>

      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-6">
        <h2 className="text-base font-semibold text-zinc-900 mb-4">Quick Links</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <QuickLink href="/personnel" label="Personnel" desc="View department roster" />
          <QuickLink href="/apparatus" label="Apparatus" desc="Manage vehicles" />
          <QuickLink href="/stations" label="Stations" desc="Station locations" />
          <QuickLink href="/equipment" label="Equipment" desc="Track equipment" />
          <QuickLink href="/scba" label="SCBA" desc="Bottle tracking" />
          {isAdmin && <QuickLink href="/dept-admin/personnel" label="Manage Personnel" desc="Add or update members" />}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, href, sub }: { label: string; value: number; href: string; sub?: string }) {
  return (
    <Link href={href} className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5 hover:border-red-300 hover:shadow-md transition-all group">
      <p className="text-sm font-medium text-zinc-500 group-hover:text-red-600 transition-colors">{label}</p>
      <p className="text-4xl font-bold text-zinc-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-2">{sub}</p>}
    </Link>
  )
}

function QuickLink({ href, label, desc }: { href: string; label: string; desc: string }) {
  return (
    <Link href={href} className="rounded-lg border border-zinc-200 px-4 py-3 hover:border-red-300 hover:bg-red-50 transition-all group">
      <p className="text-sm font-semibold text-zinc-800 group-hover:text-red-700">{label}</p>
      <p className="text-xs text-zinc-400 mt-0.5">{desc}</p>
    </Link>
  )
}
