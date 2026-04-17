import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SysAdminDashboard from './SysAdminDashboard'

async function getDashboardData(departmentId: string, personnelId: string) {
  const adminClient = createAdminClient()

  const today = new Date().toISOString().split('T')[0]
  const next7 = new Date(); next7.setDate(next7.getDate() + 7)
  const next7str = next7.toISOString().split('T')[0]

  const [personnel, stations, apparatus, scba, pendingSetup, instances, trainingEvents] = await Promise.all([
    adminClient.from('department_personnel').select('id, system_role').eq('department_id', departmentId).eq('active', true).eq('signup_status', 'active'),
    adminClient.from('stations').select('id').eq('department_id', departmentId).eq('active', true),
    adminClient.from('apparatus').select('id').eq('department_id', departmentId).eq('active', true),
    adminClient.from('scba_bottles').select('id').eq('department_id', departmentId).eq('active', true).eq('retired', false),
    adminClient.from('department_personnel').select('id').eq('department_id', departmentId).in('signup_status', ['temp_password', 'profile_setup']),
    // Upcoming event instances (next 7 days)
    adminClient.from('event_instances')
      .select('id, series_id, event_date, start_time, location, status')
      .gte('event_date', today)
      .lte('event_date', next7str)
      .neq('status', 'cancelled')
      .order('event_date', { ascending: true })
      .limit(5),
    // Upcoming training events (next 7 days)
    adminClient.from('training_events')
      .select('id, event_date, start_time, topic, hours, location')
      .eq('department_id', departmentId)
      .gte('event_date', today)
      .lte('event_date', next7str)
      .order('event_date', { ascending: true })
      .limit(5),
  ])

  const personnelList = personnel.data ?? []

  // Fetch series titles for instances
  const seriesIds = [...new Set((instances.data ?? []).map(i => i.series_id))]
  const { data: seriesData } = seriesIds.length > 0
    ? await adminClient.from('event_series').select('id, title, event_type, department_id').in('id', seriesIds).eq('department_id', departmentId)
    : { data: [] }
  const seriesMap = Object.fromEntries((seriesData ?? []).map(s => [s.id, s]))

  // Filter instances to this dept only
  const deptInstances = (instances.data ?? []).filter(i => seriesMap[i.series_id])

  // My attendance for these instances
  const instanceIds = deptInstances.map(i => i.id)
  const { data: myAttendance } = instanceIds.length > 0
    ? await adminClient.from('event_attendance').select('instance_id, status').eq('personnel_id', personnelId).in('instance_id', instanceIds)
    : { data: [] }
  const myAttendanceMap = Object.fromEntries((myAttendance ?? []).map(a => [a.instance_id, a.status]))

  // My attendance for training events
  const trainingEventIds = (trainingEvents.data ?? []).map(e => e.id)
  const { data: myTrainingAttendance } = trainingEventIds.length > 0
    ? await adminClient.from('training_event_attendance').select('event_id, status').eq('personnel_id', personnelId).in('event_id', trainingEventIds)
    : { data: [] }
  const myTrainingAttendanceMap = Object.fromEntries((myTrainingAttendance ?? []).map(a => [a.event_id, a.status]))

  return {
    personnelTotal: personnelList.length,
    adminCount: personnelList.filter(p => p.system_role === 'admin').length,
    officerCount: personnelList.filter(p => p.system_role === 'officer').length,
    memberCount: personnelList.filter(p => p.system_role === 'member').length,
    stationCount: (stations.data ?? []).length,
    apparatusCount: (apparatus.data ?? []).length,
    scbaCount: (scba.data ?? []).length,
    pendingSetup: pendingSetup.data ?? [],
    upcomingEvents: deptInstances.map(i => ({
      id: i.id,
      title: seriesMap[i.series_id]?.title ?? '—',
      event_type: seriesMap[i.series_id]?.event_type ?? 'training',
      event_date: i.event_date,
      start_time: i.start_time,
      location: i.location,
      my_status: myAttendanceMap[i.id] ?? null,
    })),
    upcomingTraining: (trainingEvents.data ?? []).map(e => ({
      id: e.id,
      topic: e.topic,
      event_date: e.event_date,
      start_time: e.start_time,
      hours: e.hours,
      location: e.location,
      my_status: myTrainingAttendanceMap[e.id] ?? null,
    })),
  }
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  training: 'bg-blue-100 text-blue-700',
  meeting: 'bg-purple-100 text-purple-700',
  incident: 'bg-red-100 text-red-700',
  special: 'bg-green-100 text-green-700',
}
const EVENT_TYPE_LABELS: Record<string, string> = {
  training: 'Training', meeting: 'Meeting', incident: 'Incident', special: 'Special',
}
const ATTENDANCE_COLORS: Record<string, string> = {
  verified: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-700',
}

function formatTime(t: string | null) {
  if (!t) return null
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
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

  if (me.is_sys_admin) return <SysAdminDashboard />

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

  const data = await getDashboardData(departmentId, me.id)

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const hasUpcoming = data.upcomingEvents.length > 0 || data.upcomingTraining.length > 0

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

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
        <StatCard label="Active Personnel" value={data.personnelTotal} href="/personnel"
          sub={`${data.adminCount} admin · ${data.officerCount} officer · ${data.memberCount} member`} />
        <StatCard label="Stations" value={data.stationCount} href="/stations" />
        <StatCard label="Apparatus" value={data.apparatusCount} href="/apparatus" />
        <StatCard label="SCBA Bottles" value={data.scbaCount} href="/scba" />
      </div>

      {/* Upcoming Events — next 7 days */}
      {hasUpcoming && (
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden mb-5">
          <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Upcoming This Week</h2>
            <div className="flex gap-3">
              <Link href="/events" className="text-xs font-semibold text-red-600 hover:text-red-800">Events →</Link>
              <Link href="/training" className="text-xs font-semibold text-red-600 hover:text-red-800">Training →</Link>
            </div>
          </div>
          <div className="divide-y divide-zinc-100">
            {/* Scheduled events */}
            {data.upcomingEvents.map(evt => (
              <Link key={evt.id} href="/events" className="flex items-center px-5 py-3 gap-3 hover:bg-zinc-50 transition-colors">
                <div className="shrink-0 text-center w-10">
                  <p className="text-xs font-semibold text-zinc-400 uppercase">
                    {new Date(evt.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                  </p>
                  <p className="text-lg font-bold text-zinc-900 leading-none">
                    {new Date(evt.event_date + 'T00:00:00').getDate()}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-900 truncate">{evt.title}</p>
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium shrink-0 ${EVENT_TYPE_COLORS[evt.event_type]}`}>
                      {EVENT_TYPE_LABELS[evt.event_type]}
                    </span>
                  </div>
                  <div className="flex gap-2 text-xs text-zinc-400 mt-0.5">
                    {evt.start_time && <span>{formatTime(evt.start_time)}</span>}
                    {evt.location && <span>📍 {evt.location}</span>}
                  </div>
                </div>
                {evt.my_status && (
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium shrink-0 ${ATTENDANCE_COLORS[evt.my_status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                    {evt.my_status.charAt(0).toUpperCase() + evt.my_status.slice(1)}
                  </span>
                )}
              </Link>
            ))}

            {/* Training events */}
            {data.upcomingTraining.map(evt => (
              <Link key={evt.id} href="/training" className="flex items-center px-5 py-3 gap-3 hover:bg-zinc-50 transition-colors">
                <div className="shrink-0 text-center w-10">
                  <p className="text-xs font-semibold text-zinc-400 uppercase">
                    {new Date(evt.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                  </p>
                  <p className="text-lg font-bold text-zinc-900 leading-none">
                    {new Date(evt.event_date + 'T00:00:00').getDate()}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-900 truncate">{evt.topic}</p>
                    <span className="text-xs rounded-full px-2 py-0.5 font-medium shrink-0 bg-blue-100 text-blue-700">Training</span>
                  </div>
                  <div className="flex gap-2 text-xs text-zinc-400 mt-0.5">
                    {evt.start_time && <span>{formatTime(evt.start_time)}</span>}
                    {evt.hours && <span>{evt.hours}h</span>}
                    {evt.location && <span>📍 {evt.location}</span>}
                  </div>
                </div>
                {evt.my_status && (
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium shrink-0 ${ATTENDANCE_COLORS[evt.my_status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                    {evt.my_status.charAt(0).toUpperCase() + evt.my_status.slice(1)}
                  </span>
                )}
              </Link>
            ))}

            {/* Nothing in either */}
            {data.upcomingEvents.length === 0 && data.upcomingTraining.length === 0 && (
              <div className="px-5 py-6 text-center text-sm text-zinc-400">No events scheduled this week.</div>
            )}
          </div>
        </div>
      )}

      {/* No upcoming — show a smaller placeholder */}
      {!hasUpcoming && (
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 px-5 py-5 mb-5 flex items-center justify-between">
          <p className="text-sm text-zinc-400">No events scheduled this week.</p>
          <div className="flex gap-3">
            <Link href="/events" className="text-xs font-semibold text-red-600 hover:text-red-800">Events →</Link>
            <Link href="/training" className="text-xs font-semibold text-red-600 hover:text-red-800">Training →</Link>
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-6">
        <h2 className="text-base font-semibold text-zinc-900 mb-4">Quick Links</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <QuickLink href="/personnel" label="Personnel" desc="View department roster" />
          <QuickLink href="/apparatus" label="Apparatus" desc="Manage vehicles" />
          <QuickLink href="/events" label="Events" desc="Log attendance" />
          <QuickLink href="/training" label="Training" desc="Courses & certifications" />
          <QuickLink href="/inspections" label="Inspections" desc="Run equipment checks" />
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
