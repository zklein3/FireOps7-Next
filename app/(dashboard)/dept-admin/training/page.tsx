import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import TrainingAdminClient from './TrainingAdminClient'

export default async function TrainingAdminPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) redirect('/login')

  const { data: myDeptList } = await adminClient.from('department_personnel').select('department_id, system_role').eq('personnel_id', me.id).eq('active', true)
  const myDept = myDeptList?.[0]
  if (!myDept || myDept.system_role !== 'admin') redirect('/dashboard')

  const department_id = myDept.department_id

  // Cert types
  const { data: certTypes } = await adminClient
    .from('certification_types')
    .select('id, cert_name, issuing_body, does_expire, expiration_interval_months, is_structured_course, active')
    .eq('department_id', department_id)
    .order('cert_name')

  // Units
  const certTypeIds = (certTypes ?? []).map(c => c.id)
  const { data: units } = certTypeIds.length > 0
    ? await adminClient.from('certification_course_units').select('id, certification_type_id, unit_title, unit_description, required_hours, sort_order, active').in('certification_type_id', certTypeIds).order('sort_order')
    : { data: [] }

  // Enrollments
  const { data: enrollmentsRaw } = certTypeIds.length > 0
    ? await adminClient.from('course_enrollments').select('id, personnel_id, certification_type_id, status, enrolled_at').in('certification_type_id', certTypeIds).eq('department_id', department_id)
    : { data: [] }

  // Pending course progress
  const enrollmentIds = (enrollmentsRaw ?? []).map(e => e.id)
  const { data: pendingProgress } = enrollmentIds.length > 0
    ? await adminClient.from('member_course_progress').select('id, enrollment_id, unit_id, personnel_id, hours_submitted, completed_date, notes, status, submitted_at').in('enrollment_id', enrollmentIds).eq('status', 'pending')
    : { data: [] }

  // Personnel names
  const personnelIds = [...new Set([...(enrollmentsRaw ?? []).map(e => e.personnel_id), ...(pendingProgress ?? []).map(p => p.personnel_id)])]
  const { data: personnelRaw } = personnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', personnelIds)
    : { data: [] }
  const personnelNameMap = Object.fromEntries((personnelRaw ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  // All dept personnel for forms
  const { data: deptPersonnel } = await adminClient
    .from('department_personnel')
    .select('personnel_id, personnel(id, first_name, last_name)')
    .eq('department_id', department_id)
    .eq('active', true)

  const allPersonnel = (deptPersonnel ?? []).map(p => ({
    id: (p.personnel as any)?.id ?? p.personnel_id,
    name: [(p.personnel as any)?.first_name, (p.personnel as any)?.last_name].filter(Boolean).join(' '),
  })).sort((a, b) => a.name.localeCompare(b.name))

  // Training events (last 30 + future 60)
  const past30 = new Date(); past30.setDate(past30.getDate() - 30)
  const future60 = new Date(); future60.setDate(future60.getDate() + 60)

  const { data: trainingEvents } = await adminClient
    .from('training_events')
    .select('id, event_date, start_time, topic, hours, location, description, requires_verification')
    .eq('department_id', department_id)
    .gte('event_date', past30.toISOString().split('T')[0])
    .lte('event_date', future60.toISOString().split('T')[0])
    .order('event_date', { ascending: false })

  // Attendance for training events
  const eventIds = (trainingEvents ?? []).map(e => e.id)
  const { data: allAttendance } = eventIds.length > 0
    ? await adminClient.from('training_event_attendance').select('id, event_id, personnel_id, status, submitted_at').in('event_id', eventIds)
    : { data: [] }

  // Personnel names for pending attendance
  const attendancePersonnelIds = [...new Set((allAttendance ?? []).filter(a => a.status === 'pending').map(a => a.personnel_id))]
  const { data: attendancePersonnelRaw } = attendancePersonnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', attendancePersonnelIds)
    : { data: [] }
  const attendanceNameMap = Object.fromEntries((attendancePersonnelRaw ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  // Build per-event attendance summary
  const attendanceByEvent = (allAttendance ?? []).reduce<Record<string, { verified: number; pending: { id: string; personnel_id: string; name: string; submitted_at: string }[] }>>((acc, a) => {
    if (!acc[a.event_id]) acc[a.event_id] = { verified: 0, pending: [] }
    if (a.status === 'verified') acc[a.event_id].verified++
    if (a.status === 'pending') acc[a.event_id].pending.push({ id: a.id, personnel_id: a.personnel_id, name: attendanceNameMap[a.personnel_id] ?? '—', submitted_at: a.submitted_at })
    return acc
  }, {})

  return (
    <TrainingAdminClient
      certTypes={certTypes ?? []}
      units={units ?? []}
      enrollments={(enrollmentsRaw ?? []).map(e => ({ ...e, name: personnelNameMap[e.personnel_id] ?? '—' }))}
      pendingProgress={(pendingProgress ?? []).map(p => ({ ...p, name: personnelNameMap[p.personnel_id] ?? '—' }))}
      allPersonnel={allPersonnel}
      trainingEvents={(trainingEvents ?? []).map(e => ({
        ...e,
        verified_count: attendanceByEvent[e.id]?.verified ?? 0,
        pending_attendance: attendanceByEvent[e.id]?.pending ?? [],
      }))}
      departmentId={department_id}
    />
  )
}
