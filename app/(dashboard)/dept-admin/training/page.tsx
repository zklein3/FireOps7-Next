import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import TrainingAdminClient from './TrainingAdminClient'

export default async function TrainingAdminPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (!ctx.departmentId || (ctx.systemRole !== 'admin' && ctx.systemRole !== 'officer')) redirect('/dashboard')

  const isAdmin = ctx.systemRole === 'admin'
  const department_id = ctx.departmentId

  // Cert types
  const { data: certTypes } = await adminClient
    .from('certification_types')
    .select('id, cert_name, issuing_body, does_expire, expiration_interval_months, is_structured_course, show_on_run_report, active')
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

  // Pending simple cert sessions (no units, member logged session)
  const { data: pendingSessionsRaw } = certTypeIds.length > 0
    ? await adminClient
        .from('course_enrollments')
        .select('id, personnel_id, certification_type_id, training_date, session_logged_at')
        .in('certification_type_id', certTypeIds)
        .eq('department_id', department_id)
        .eq('session_status', 'pending')
    : { data: [] }

  // Personnel names
  const personnelIds = [...new Set([...(enrollmentsRaw ?? []).map(e => e.personnel_id), ...(pendingProgress ?? []).map(p => p.personnel_id), ...(pendingSessionsRaw ?? []).map(p => p.personnel_id)])]
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

  // Member certifications — all records for the dept
  const { data: memberCertsRaw } = await adminClient
    .from('member_certifications')
    .select('id, personnel_id, cert_name, issuing_body, cert_number, issued_date, expiration_date, source, notes, active')
    .eq('department_id', department_id)
    .order('cert_name')

  const certPersonnelIds = [...new Set((memberCertsRaw ?? []).map(c => c.personnel_id))]
  const { data: certPersonnelRaw } = certPersonnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', certPersonnelIds)
    : { data: [] }
  const certPersonnelNameMap = Object.fromEntries((certPersonnelRaw ?? []).map(p => [p.id, `${p.last_name}, ${p.first_name}`]))

  const memberCerts = (memberCertsRaw ?? []).map(c => ({
    ...c,
    name: certPersonnelNameMap[c.personnel_id] ?? '—',
  })).sort((a, b) => a.name.localeCompare(b.name))

  // Training events (last 30 + future 60)
  const past30 = new Date(); past30.setDate(past30.getDate() - 30)
  const future60 = new Date(); future60.setDate(future60.getDate() + 60)

  const { data: trainingEvents } = await adminClient
    .from('training_events')
    .select('id, event_date, start_time, topic, hours, location, description, instructor, requires_verification, event_instance_id')
    .eq('department_id', department_id)
    .eq('cancelled', false)
    .gte('event_date', past30.toISOString().split('T')[0])
    .lte('event_date', future60.toISOString().split('T')[0])
    .order('event_date', { ascending: false })

  // Linked event titles for training events attached to dept events
  const linkedInstanceIds = (trainingEvents ?? []).filter(e => e.event_instance_id).map(e => e.event_instance_id as string)
  const { data: linkedInstances } = linkedInstanceIds.length > 0
    ? await adminClient.from('event_instances').select('id, series_id, title_override').in('id', linkedInstanceIds)
    : { data: [] }
  const linkedSeriesIds = (linkedInstances ?? []).map(i => i.series_id)
  const { data: linkedSeries } = linkedSeriesIds.length > 0
    ? await adminClient.from('event_series').select('id, title').in('id', linkedSeriesIds)
    : { data: [] }
  const adminSeriesTitleMap = Object.fromEntries((linkedSeries ?? []).map(s => [s.id, s.title]))
  const adminInstanceMap = Object.fromEntries((linkedInstances ?? []).map(i => [i.id, i]))
  const adminLinkedEventTitles: Record<string, string> = {}
  for (const e of trainingEvents ?? []) {
    if (e.event_instance_id) {
      const inst = adminInstanceMap[e.event_instance_id]
      if (inst) adminLinkedEventTitles[e.id] = inst.title_override ?? adminSeriesTitleMap[inst.series_id] ?? ''
    }
  }

  // Attendance for training events (include signature fields)
  const eventIds = (trainingEvents ?? []).map(e => e.id)
  const { data: allAttendance } = eventIds.length > 0
    ? await adminClient.from('training_event_attendance').select('id, event_id, personnel_id, status, submitted_at, signed_at, signature_url').in('event_id', eventIds)
    : { data: [] }

  // Personnel names for ALL attendance records
  const attendancePersonnelIds = [...new Set((allAttendance ?? []).map(a => a.personnel_id))]
  const { data: attendancePersonnelRaw } = attendancePersonnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', attendancePersonnelIds)
    : { data: [] }
  const attendanceNameMap = Object.fromEntries((attendancePersonnelRaw ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  // Build per-event attendance summary
  const attendanceByEvent = (allAttendance ?? []).reduce<Record<string, {
    verified: number; signed: number
    pending: { id: string; personnel_id: string; name: string; submitted_at: string }[]
    all: { id: string; personnel_id: string; name: string; status: string; signed_at: string | null }[]
  }>>((acc, a) => {
    if (!acc[a.event_id]) acc[a.event_id] = { verified: 0, signed: 0, pending: [], all: [] }
    if (a.status === 'verified') acc[a.event_id].verified++
    if (a.signed_at) acc[a.event_id].signed++
    if (a.status === 'pending') acc[a.event_id].pending.push({ id: a.id, personnel_id: a.personnel_id, name: attendanceNameMap[a.personnel_id] ?? '—', submitted_at: a.submitted_at })
    acc[a.event_id].all.push({ id: a.id, personnel_id: a.personnel_id, name: attendanceNameMap[a.personnel_id] ?? '—', status: a.status, signed_at: a.signed_at ?? null })
    return acc
  }, {})

  // Training submissions (outside classes logged by members)
  const { data: submissionsRaw } = await adminClient
    .from('training_submissions')
    .select('id, personnel_id, topic, course_date, hours, provider, location, notes, document_url, purpose, nremt_category, status, submitted_at, reviewer_notes')
    .eq('department_id', department_id)
    .order('submitted_at', { ascending: false })

  const submissionPersonnelIds = [...new Set((submissionsRaw ?? []).map(s => s.personnel_id))]
  const { data: submissionPersonnelRaw } = submissionPersonnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', submissionPersonnelIds)
    : { data: [] }
  const submissionNameMap = Object.fromEntries((submissionPersonnelRaw ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`]))

  const submissions = (submissionsRaw ?? []).map(s => ({
    ...s,
    member_name: submissionNameMap[s.personnel_id] ?? '—',
  }))

  return (
    <TrainingAdminClient
      certTypes={certTypes ?? []}
      units={units ?? []}
      enrollments={(enrollmentsRaw ?? []).map(e => ({ ...e, name: personnelNameMap[e.personnel_id] ?? '—' }))}
      pendingProgress={(pendingProgress ?? []).map(p => ({ ...p, name: personnelNameMap[p.personnel_id] ?? '—' }))}
      pendingSessions={(pendingSessionsRaw ?? []).map(s => ({ ...s, name: personnelNameMap[s.personnel_id] ?? '—' }))}
      allPersonnel={allPersonnel}
      trainingEvents={(trainingEvents ?? []).map(e => ({
        ...e,
        verified_count: attendanceByEvent[e.id]?.verified ?? 0,
        signed_count: attendanceByEvent[e.id]?.signed ?? 0,
        pending_attendance: attendanceByEvent[e.id]?.pending ?? [],
        all_attendance: attendanceByEvent[e.id]?.all ?? [],
      }))}
      linkedEventTitles={adminLinkedEventTitles}
      memberCerts={memberCerts}
      submissions={submissions}
      isAdmin={isAdmin}
      departmentId={department_id}
      departmentTimezone={ctx.departmentTimezone}
    />
  )
}
