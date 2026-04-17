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

  // Fetch cert types
  const { data: certTypes } = await adminClient
    .from('certification_types')
    .select('id, cert_name, issuing_body, does_expire, expiration_interval_months, is_structured_course, active')
    .eq('department_id', department_id)
    .order('cert_name')

  // Fetch units for all cert types
  const certTypeIds = (certTypes ?? []).map(c => c.id)
  const { data: units } = certTypeIds.length > 0
    ? await adminClient.from('certification_course_units').select('id, certification_type_id, unit_title, unit_description, required_hours, sort_order, active').in('certification_type_id', certTypeIds).order('sort_order')
    : { data: [] }

  // Fetch enrollments with personnel names
  const { data: enrollmentsRaw } = certTypeIds.length > 0
    ? await adminClient.from('course_enrollments').select('id, personnel_id, certification_type_id, status, enrolled_at').in('certification_type_id', certTypeIds).eq('department_id', department_id)
    : { data: [] }

  // Fetch pending progress submissions
  const enrollmentIds = (enrollmentsRaw ?? []).map(e => e.id)
  const { data: pendingProgress } = enrollmentIds.length > 0
    ? await adminClient.from('member_course_progress').select('id, enrollment_id, unit_id, personnel_id, hours_submitted, completed_date, notes, status, submitted_at').in('enrollment_id', enrollmentIds).eq('status', 'pending')
    : { data: [] }

  // Fetch personnel names for enrollments + pending progress
  const personnelIds = [...new Set([...(enrollmentsRaw ?? []).map(e => e.personnel_id), ...(pendingProgress ?? []).map(p => p.personnel_id)])]
  const { data: personnelRaw } = personnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', personnelIds)
    : { data: [] }
  const personnelNameMap = Object.fromEntries((personnelRaw ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  // Fetch all dept personnel for enrollment form
  const { data: deptPersonnel } = await adminClient
    .from('department_personnel')
    .select('personnel_id, personnel(id, first_name, last_name)')
    .eq('department_id', department_id)
    .eq('active', true)

  const allPersonnel = (deptPersonnel ?? []).map(p => ({
    id: (p.personnel as any)?.id ?? p.personnel_id,
    name: [(p.personnel as any)?.first_name, (p.personnel as any)?.last_name].filter(Boolean).join(' '),
  })).sort((a, b) => a.name.localeCompare(b.name))

  // Fetch recent training events
  const { data: trainingEvents } = await adminClient
    .from('training_events')
    .select('id, event_date, topic, hours, location, description')
    .eq('department_id', department_id)
    .order('event_date', { ascending: false })
    .limit(20)

  // Fetch attendance counts for training events
  const eventIds = (trainingEvents ?? []).map(e => e.id)
  const { data: attendanceCounts } = eventIds.length > 0
    ? await adminClient.from('training_event_attendance').select('event_id').in('event_id', eventIds)
    : { data: [] }
  const attendanceCountMap: Record<string, number> = {}
  ;(attendanceCounts ?? []).forEach(a => { attendanceCountMap[a.event_id] = (attendanceCountMap[a.event_id] ?? 0) + 1 })

  return (
    <TrainingAdminClient
      certTypes={certTypes ?? []}
      units={units ?? []}
      enrollments={(enrollmentsRaw ?? []).map(e => ({ ...e, name: personnelNameMap[e.personnel_id] ?? '—' }))}
      pendingProgress={(pendingProgress ?? []).map(p => ({ ...p, name: personnelNameMap[p.personnel_id] ?? '—' }))}
      allPersonnel={allPersonnel}
      trainingEvents={(trainingEvents ?? []).map(e => ({ ...e, attendance_count: attendanceCountMap[e.id] ?? 0 }))}
      departmentId={department_id}
    />
  )
}
