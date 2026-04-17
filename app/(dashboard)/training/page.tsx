import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import TrainingClient from './TrainingClient'

export default async function TrainingPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient.from('personnel').select('id, first_name, last_name, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) redirect('/login')

  const { data: myDeptList } = await adminClient.from('department_personnel').select('department_id, system_role').eq('personnel_id', me.id).eq('active', true)
  const myDept = myDeptList?.[0]
  if (!myDept) redirect('/dashboard')

  const department_id = myDept.department_id
  const isOfficerOrAbove = myDept.system_role === 'admin' || myDept.system_role === 'officer'

  // My enrollments
  const { data: enrollments } = await adminClient
    .from('course_enrollments')
    .select('id, certification_type_id, status, enrolled_at')
    .eq('personnel_id', me.id)
    .eq('department_id', department_id)

  // Cert types
  const certTypeIds = [...new Set((enrollments ?? []).map(e => e.certification_type_id))]
  const { data: certTypes } = certTypeIds.length > 0
    ? await adminClient.from('certification_types').select('id, cert_name, issuing_body, does_expire, expiration_interval_months, is_structured_course').in('id', certTypeIds)
    : { data: [] }

  // Units
  const { data: units } = certTypeIds.length > 0
    ? await adminClient.from('certification_course_units').select('id, certification_type_id, unit_title, unit_description, required_hours, sort_order, active').in('certification_type_id', certTypeIds).eq('active', true).order('sort_order')
    : { data: [] }

  // My progress
  const enrollmentIds = (enrollments ?? []).map(e => e.id)
  const { data: myProgress } = enrollmentIds.length > 0
    ? await adminClient.from('member_course_progress').select('id, enrollment_id, unit_id, status, hours_submitted, completed_date, submitted_at').in('enrollment_id', enrollmentIds)
    : { data: [] }

  // My certifications
  const { data: myCerts } = await adminClient
    .from('member_certifications')
    .select('id, cert_name, issuing_body, cert_number, issued_date, expiration_date, source, active')
    .eq('personnel_id', me.id)
    .eq('department_id', department_id)
    .eq('active', true)
    .order('cert_name')

  // All dept training events (last 30 days + future 60 days) for self-reporting
  const past30 = new Date(); past30.setDate(past30.getDate() - 30)
  const future60 = new Date(); future60.setDate(future60.getDate() + 60)

  const { data: allTrainingEvents } = await adminClient
    .from('training_events')
    .select('id, event_date, start_time, topic, hours, location, description, requires_verification')
    .eq('department_id', department_id)
    .gte('event_date', past30.toISOString().split('T')[0])
    .lte('event_date', future60.toISOString().split('T')[0])
    .order('event_date', { ascending: false })

  // My attendance records for these events
  const allEventIds = (allTrainingEvents ?? []).map(e => e.id)
  const { data: myAttendanceRaw } = allEventIds.length > 0
    ? await adminClient
        .from('training_event_attendance')
        .select('id, event_id, status, submitted_at')
        .eq('personnel_id', me.id)
        .in('event_id', allEventIds)
    : { data: [] }

  const myAttendanceMap = Object.fromEntries((myAttendanceRaw ?? []).map(a => [a.event_id, a]))

  return (
    <TrainingClient
      enrollments={enrollments ?? []}
      certTypes={certTypes ?? []}
      units={units ?? []}
      myProgress={myProgress ?? []}
      myCerts={myCerts ?? []}
      trainingEvents={(allTrainingEvents ?? []).map(e => ({
        ...e,
        my_attendance: myAttendanceMap[e.id] ?? null,
      }))}
      myPersonnelId={me.id}
      myName={`${me.first_name} ${me.last_name}`}
      isOfficerOrAbove={isOfficerOrAbove}
    />
  )
}
