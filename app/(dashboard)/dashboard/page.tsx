import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { getPermissionSnapshot } from '@/lib/permissions'
import SysAdminDashboard from './SysAdminDashboard'
import DashboardAnnouncementBanner from './DashboardAnnouncementBanner'
import HubCard from '@/components/HubCard'
import HelpText from '@/components/HelpText'

async function getUnreadAnnouncements(departmentId: string, personnelId: string) {
  const adminClient = createAdminClient()
  const [{ data: announcements }, { data: reads }] = await Promise.all([
    adminClient.from('announcements')
      .select('id, title, body, pinned, created_at, author_personnel_id')
      .eq('department_id', departmentId)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
    adminClient.from('announcement_reads')
      .select('announcement_id')
      .eq('personnel_id', personnelId),
  ])
  const readSet = new Set((reads ?? []).map(r => r.announcement_id))
  return (announcements ?? []).filter(a => !readSet.has(a.id))
}

async function getPendingInboxCounts(departmentId: string) {
  const adminClient = createAdminClient()
  const [{ count: permits }, { count: records }] = await Promise.all([
    adminClient.from('burn_permits')
      .select('id', { count: 'exact', head: true })
      .eq('department_id', departmentId)
      .eq('status', 'pending'),
    adminClient.from('public_record_requests')
      .select('id', { count: 'exact', head: true })
      .eq('department_id', departmentId)
      .eq('status', 'pending'),
  ])
  return { permits: permits ?? 0, records: records ?? 0 }
}

async function getDashboardData(departmentId: string, personnelId: string) {
  const adminClient = createAdminClient()

  const today = new Date().toISOString().split('T')[0]
  // 8 days, not 7 — a plain 7-day window sits exactly on the Monday-to-Monday boundary, so a
  // recurring Monday event viewed on a Monday would flicker in/out depending on rounding. 8
  // days guarantees "next Monday" is always inside the window.
  const next8 = new Date(); next8.setDate(next8.getDate() + 8)
  const next8str = next8.toISOString().split('T')[0]
  const next365 = new Date(); next365.setDate(next365.getDate() + 365)
  const next365str = next365.toISOString().split('T')[0]

  const [pendingSetup, seriesRows, trainingEvents] = await Promise.all([
    adminClient.from('department_personnel')
      .select('id')
      .eq('department_id', departmentId)
      .in('signup_status', ['temp_password', 'profile_setup']),
    adminClient.from('event_series')
      .select('id, title, event_type')
      .eq('department_id', departmentId),
    adminClient.from('training_events')
      .select('id, event_date, start_time, topic, hours, location, event_instance_id')
      .eq('department_id', departmentId)
      .gte('event_date', today)
      .lte('event_date', next8str)
      .order('event_date', { ascending: true })
      .limit(5),
  ])

  const seriesMap = Object.fromEntries((seriesRows.data ?? []).map(s => [s.id, s]))
  const deptSeriesIds = (seriesRows.data ?? []).map(s => s.id)

  const { data: instanceData } = deptSeriesIds.length > 0
    ? await adminClient.from('event_instances')
      .select('id, series_id, event_date, start_time, location, status, title_override')
      .in('series_id', deptSeriesIds)
      .gte('event_date', today)
      .lte('event_date', next365str)
      .neq('status', 'cancelled')
      .order('event_date', { ascending: true })
      .limit(50)
    : { data: [] }

  const deptInstances = (instanceData ?? [])
    .filter(i => {
      const isSpecial = seriesMap[i.series_id]?.event_type === 'special'
      if (!isSpecial && i.event_date > next8str) return false
      return true
    })
    .slice(0, 5)

  const instanceIds = deptInstances.map(i => i.id)
  const { data: myAttendance } = instanceIds.length > 0
    ? await adminClient.from('event_attendance').select('instance_id, status').eq('personnel_id', personnelId).in('instance_id', instanceIds)
    : { data: [] }
  const myAttendanceMap = Object.fromEntries((myAttendance ?? []).map(a => [a.instance_id, a.status]))

  // Training events linked to an event instance already shown above are the same event, just
  // fetched from a different table — drop them here so it doesn't appear twice in this ticker.
  const shownInstanceIds = new Set(instanceIds)
  const standaloneTrainingEvents = (trainingEvents.data ?? []).filter(
    e => !e.event_instance_id || !shownInstanceIds.has(e.event_instance_id)
  )

  const trainingEventIds = standaloneTrainingEvents.map(e => e.id)
  const { data: myTrainingAttendance } = trainingEventIds.length > 0
    ? await adminClient.from('training_event_attendance').select('event_id, status').eq('personnel_id', personnelId).in('event_id', trainingEventIds)
    : { data: [] }
  const myTrainingAttendanceMap = Object.fromEntries((myTrainingAttendance ?? []).map(a => [a.event_id, a.status]))

  return {
    pendingSetup: pendingSetup.data ?? [],
    upcomingEvents: deptInstances.map(i => ({
      id: i.id,
      title: i.title_override ?? seriesMap[i.series_id]?.title ?? '—',
      event_type: seriesMap[i.series_id]?.event_type ?? 'training',
      event_date: i.event_date,
      start_time: i.start_time,
      location: i.location,
      my_status: myAttendanceMap[i.id] ?? null,
    })),
    upcomingTraining: standaloneTrainingEvents.map(e => ({
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
  meeting:  'bg-purple-100 text-purple-700',
  incident: 'bg-red-100 text-red-700',
  special:  'bg-green-100 text-green-700',
}
const EVENT_TYPE_LABELS: Record<string, string> = {
  training: 'Training', meeting: 'Meeting', incident: 'Incident', special: 'Special',
}
const ATTENDANCE_COLORS: Record<string, string> = {
  present:  'bg-green-100 text-green-700',
  pending:  'bg-yellow-100 text-yellow-700',
  absent:   'bg-red-100 text-red-700',
  excused:  'bg-blue-100 text-blue-700',
}

function formatTime(t: string | null) {
  if (!t) return null
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}


export default async function DashboardPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')

  if (ctx.selectionPending) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)

  if (ctx.isSysAdmin && !ctx.departmentId) return <SysAdminDashboard />

  if (!ctx.departmentId) redirect('/login')

  // Fetch dept info separately
  const { data: deptData } = await adminClient
    .from('departments')
    .select('name, public_slug, public_site_enabled')
    .eq('id', ctx.departmentId)
    .single()

  const departmentId = ctx.departmentId
  const departmentName = deptData?.name ?? 'Your Department'
  const publicSiteUrl = deptData?.public_site_enabled && deptData?.public_slug
    ? `/dept/${deptData.public_slug}`
    : null
  const dashboardPermissions = await getPermissionSnapshot(ctx)
  const isAdmin = dashboardPermissions.access_dept_admin_hub
  const isOfficerOrAbove = dashboardPermissions.access_officer_hub || isAdmin

  const [data, unreadAnnouncements, pendingInbox] = await Promise.all([
    getDashboardData(departmentId, ctx.personnelId),
    getUnreadAnnouncements(departmentId, ctx.personnelId),
    isOfficerOrAbove ? getPendingInboxCounts(departmentId) : Promise.resolve({ permits: 0, records: 0 }),
  ])

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const hasUpcoming = data.upcomingEvents.length > 0 || data.upcomingTraining.length > 0

  const isFireDept = ctx.departmentType === 'fire'

  // Role-adaptive quick links — fire departments
  const fireQuickLinks = isAdmin ? [
    { href: '/dept-admin/setup',  label: 'Dept Setup',   desc: 'Configure your department' },
    { href: '/personnel',         label: 'Personnel',    desc: 'Department roster' },
    { href: '/apparatus',         label: 'Apparatus',    desc: 'Vehicles and units' },
    { href: '/events',            label: 'Events',       desc: 'Log attendance' },
    { href: '/inspections',       label: 'Inspections',  desc: 'Run equipment checks' },
    { href: '/fuel',              label: 'Fuel Log',     desc: 'Log apparatus fuel' },
  ] : isOfficerOrAbove ? [
    { href: '/personnel',         label: 'Personnel',    desc: 'Department roster' },
    { href: '/apparatus',         label: 'Apparatus',    desc: 'Vehicles and units' },
    { href: '/events',            label: 'Events',       desc: 'Log attendance' },
    { href: '/inspections',       label: 'Inspections',  desc: 'Run equipment checks' },
    { href: '/fuel',              label: 'Fuel Log',     desc: 'Log apparatus fuel' },
    { href: '/reports/attendance', label: 'Reports',    desc: 'Attendance & activity' },
  ] : [
    { href: '/events',            label: 'Events',       desc: 'Log attendance' },
    { href: '/training',          label: 'Certifications', desc: 'Courses & certifications' },
    { href: '/inspections',       label: 'Inspections',  desc: 'Run equipment checks' },
    { href: '/fuel',              label: 'Fuel Log',     desc: 'Log apparatus fuel' },
    { href: '/reports/my-activity', label: 'My Activity', desc: 'Your attendance & records' },
    { href: '/personnel',         label: 'Personnel',    desc: 'Department roster' },
  ]

  // Role-adaptive quick links — non-fire (e.g. police) departments.
  // Dept Setup, Personnel, and Apparatus management live behind the Dept Admin
  // menu for these depts, not in member-facing quick links. Inspections isn't
  // relevant outside the fire/apparatus workflow.
  const nonFireQuickLinks = isOfficerOrAbove ? [
    { href: '/events',            label: 'Events',        desc: 'Log attendance' },
    { href: '/fuel',               label: 'Fuel Log',      desc: 'Log vehicle fuel' },
    { href: '/forms/business-check', label: 'Business Check', desc: 'Log a business check' },
    { href: '/forms/contact',      label: 'Contact Form',  desc: 'Document a field contact' },
    { href: '/forms/traffic-stop', label: 'Traffic Stop',  desc: 'Log a traffic stop' },
    { href: '/reports',            label: 'Reports',       desc: 'Attendance & activity' },
  ] : [
    { href: '/events',            label: 'Events',        desc: 'Log attendance' },
    { href: '/fuel',               label: 'Fuel Log',      desc: 'Log vehicle fuel' },
    { href: '/forms/business-check', label: 'Business Check', desc: 'Log a business check' },
    { href: '/forms/contact',      label: 'Contact Form',  desc: 'Document a field contact' },
    { href: '/forms/traffic-stop', label: 'Traffic Stop',  desc: 'Log a traffic stop' },
    { href: '/training',           label: 'Certifications', desc: 'Courses & certifications' },
    { href: '/reports/my-activity', label: 'My Activity',  desc: 'Your attendance & records' },
  ]

  const quickLinks = isFireDept ? fireQuickLinks : nonFireQuickLinks

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">
          {greeting()}, {ctx.firstName || 'there'}
        </h1>
        <p className="text-sm text-zinc-500 mt-1">{departmentName}</p>
      </div>

      <HelpText className="mb-4">
        This is your starting point — upcoming events you're eligible for, unread announcements, and quick links to
        the pages you use most. Tap the <strong>?</strong> button anytime to toggle tips like this one, or visit the
        Help Center for a full searchable guide.
      </HelpText>

      {/* Admin: public site preview link */}
      {isAdmin && publicSiteUrl && (
        <div className="mb-4 rounded-xl bg-white border border-zinc-200 px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-800">Your Public Site is Live</p>
            <p className="text-xs text-zinc-400 mt-0.5">fireops7.com{publicSiteUrl}</p>
          </div>
          <a
            href={publicSiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs font-semibold text-red-600 hover:text-red-800 transition-colors ml-4"
          >
            Preview ↗
          </a>
        </div>
      )}

      {/* Officer+: pending inbox banner */}
      {isOfficerOrAbove && (pendingInbox.permits + pendingInbox.records) > 0 && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-red-800">
              {pendingInbox.permits + pendingInbox.records} pending inbox item{(pendingInbox.permits + pendingInbox.records) !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              {[
                pendingInbox.permits > 0 ? `${pendingInbox.permits} burn permit${pendingInbox.permits !== 1 ? 's' : ''}` : null,
                pendingInbox.records > 0 ? `${pendingInbox.records} records request${pendingInbox.records !== 1 ? 's' : ''}` : null,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
          <Link href="/inbox" className="shrink-0 text-xs font-semibold text-red-700 hover:text-red-900 transition-colors ml-4">
            Review →
          </Link>
        </div>
      )}

      {/* Admin: pending setup banner */}
      {isAdmin && data.pendingSetup.length > 0 && (
        <div className="mb-6 rounded-xl bg-yellow-50 border border-yellow-200 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-yellow-800">
              {data.pendingSetup.length} user{data.pendingSetup.length !== 1 ? 's' : ''}{' '}haven&apos;t completed account setup
            </p>
            <p className="text-xs text-yellow-600 mt-0.5">They need to log in and set their password and profile.</p>
          </div>
          <Link href="/dept-admin/setup" className="text-xs font-semibold text-yellow-800 hover:underline whitespace-nowrap ml-4">
            Dept Setup →
          </Link>
        </div>
      )}

      {/* Upcoming Events */}
      {hasUpcoming ? (
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden mb-5">
          <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Upcoming This Week</h2>
            <div className="flex gap-3">
              <Link href="/events" className="text-xs font-semibold text-red-600 hover:text-red-800">Events →</Link>
              <Link href="/training" className="text-xs font-semibold text-red-600 hover:text-red-800">Training →</Link>
            </div>
          </div>
          <div className="divide-y divide-zinc-100">
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
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium shrink-0 ${EVENT_TYPE_COLORS[evt.event_type] ?? 'bg-zinc-100 text-zinc-600'}`}>
                      {EVENT_TYPE_LABELS[evt.event_type] ?? evt.event_type}
                    </span>
                  </div>
                  <div className="flex gap-2 text-xs text-zinc-400 mt-0.5">
                    {evt.start_time && <span>{formatTime(evt.start_time)}</span>}
                    {evt.location && <span>· {evt.location}</span>}
                  </div>
                </div>
                {evt.my_status && (
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium shrink-0 ${ATTENDANCE_COLORS[evt.my_status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                    {evt.my_status.charAt(0).toUpperCase() + evt.my_status.slice(1)}
                  </span>
                )}
              </Link>
            ))}
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
                    {evt.hours && <span>· {evt.hours}h</span>}
                    {evt.location && <span>· {evt.location}</span>}
                  </div>
                </div>
                {evt.my_status && (
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium shrink-0 ${ATTENDANCE_COLORS[evt.my_status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                    {evt.my_status.charAt(0).toUpperCase() + evt.my_status.slice(1)}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 px-5 py-5 mb-5 flex items-center justify-between">
          <p className="text-sm text-zinc-400">No events scheduled this week.</p>
          <div className="flex gap-3">
            <Link href="/events" className="text-xs font-semibold text-red-600 hover:text-red-800">Events →</Link>
            <Link href="/training" className="text-xs font-semibold text-red-600 hover:text-red-800">Training →</Link>
          </div>
        </div>
      )}

      {/* Unread Announcements */}
      {unreadAnnouncements.length > 0 && (
        <DashboardAnnouncementBanner
          announcements={unreadAnnouncements}
          personnelId={ctx.personnelId}
        />
      )}

      {/* Quick Links */}
      {isFireDept ? (
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5">
          <h2 className="text-sm font-semibold text-zinc-900 mb-3">Quick Links</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {quickLinks.map(link => (
              <Link key={link.href} href={link.href}
                className="rounded-lg border border-zinc-200 px-4 py-3 hover:border-red-300 hover:bg-red-50 transition-all group">
                <p className="text-sm font-semibold text-zinc-800 group-hover:text-red-700">{link.label}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{link.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 mb-3">Quick Links</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {quickLinks.map(link => (
              <HubCard key={link.href} href={link.href} title={link.label} description={link.desc} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
