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

  // My enrollments
  const { data: enrollments } = await adminClient
    .from('course_enrollments')
    .select('id, certification_type_id, status, enrolled_at')
    .eq('personnel_id', me.id)
    .eq('department_id', department_id)

  // Cert types for my enrollments
  const certTypeIds = [...new Set((enrollments ?? []).map(e => e.certification_type_id))]
  const { data: certTypes } = certTypeIds.length > 0
    ? await adminClient.from('certification_types').select('id, cert_name, issuing_body, does_expire, expiration_interval_months, is_structured_course').in('id', certTypeIds)
    : { data: [] }

  // Units for my enrolled courses
  const { data: units } = certTypeIds.length > 0
    ? await adminClient.from('certification_course_units').select('id, certification_type_id, unit_title, unit_description, required_hours, sort_order, active').in('certification_type_id', certTypeIds).eq('active', true).order('sort_order')
    : { data: [] }

  // My progress on these enrollments
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

  // My training event attendance
  const { data: myAttendance } = await adminClient
    .from('training_event_attendance')
    .select('event_id, logged_at')
    .eq('personnel_id', me.id)

  const attendedEventIds = new Set((myAttendance ?? []).map(a => a.event_id))

  // Training events I attended
  const { data: trainingEvents } = attendedEventIds.size > 0
    ? await adminClient.from('training_events').select('id, event_date, topic, hours, location').in('id', Array.from(attendedEventIds)).eq('department_id', department_id).order('event_date', { ascending: false }).limit(20)
    : { data: [] }

  return (
    <TrainingClient
      enrollments={enrollments ?? []}
      certTypes={certTypes ?? []}
      units={units ?? []}
      myProgress={myProgress ?? []}
      myCerts={myCerts ?? []}
      trainingEvents={trainingEvents ?? []}
      myName={`${me.first_name} ${me.last_name}`}
    />
  )
}
