import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import TrainingClient from './TrainingClient'
import HubCard from '@/components/HubCard'

export default async function TrainingPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  const me = { id: ctx.personnelId, first_name: ctx.firstName, last_name: ctx.lastName }
  const department_id = ctx.departmentId
  const isOfficerOrAbove = await hasPermission(ctx, 'record_training_completion')

  // My enrollments
  const { data: enrollments } = await adminClient
    .from('course_enrollments')
    .select('id, certification_type_id, status, enrolled_at, training_date, session_logged_at, session_status')
    .eq('personnel_id', me.id)
    .eq('department_id', department_id)

  // Cert types — all dept cert types (needed for event cert links too)
  const { data: certTypes } = await adminClient
    .from('certification_types')
    .select('id, cert_name, issuing_body, does_expire, expiration_interval_months, is_structured_course')
    .eq('department_id', department_id)
    .eq('active', true)

  // Units
  const allCertTypeIds = (certTypes ?? []).map(c => c.id)
  const { data: units } = allCertTypeIds.length > 0
    ? await adminClient.from('certification_course_units').select('id, certification_type_id, unit_title, unit_description, required_hours, sort_order, active').in('certification_type_id', allCertTypeIds).eq('active', true).order('sort_order')
    : { data: [] }

  // My progress
  const enrollmentIds = (enrollments ?? []).map(e => e.id)
  const { data: myProgress } = enrollmentIds.length > 0
    ? await adminClient.from('member_course_progress').select('id, enrollment_id, unit_id, status, hours_submitted, completed_date, submitted_at').in('enrollment_id', enrollmentIds)
    : { data: [] }

  // My certifications
  const { data: myCerts } = await adminClient
    .from('member_certifications')
    .select('id, cert_name, issuing_body, cert_number, issued_date, expiration_date, source, active, signature_url, signed_at')
    .eq('personnel_id', me.id)
    .eq('department_id', department_id)
    .eq('active', true)
    .order('cert_name')

  // All dept training events (last 30 days + future 60 days) for self-reporting
  const past30 = new Date(); past30.setDate(past30.getDate() - 30)
  const future60 = new Date(); future60.setDate(future60.getDate() + 60)

  const { data: allTrainingEvents } = await adminClient
    .from('training_events')
    .select('id, event_date, start_time, topic, hours, location, description, requires_verification, certification_type_id, event_instance_id')
    .eq('department_id', department_id)
    .eq('cancelled', false)
    .gte('event_date', past30.toISOString().split('T')[0])
    .lte('event_date', future60.toISOString().split('T')[0])
    .order('event_date', { ascending: false })

  // For linked events, fetch the parent event series title flat
  const linkedInstanceIds = (allTrainingEvents ?? []).filter(e => e.event_instance_id).map(e => e.event_instance_id as string)
  const { data: linkedInstances } = linkedInstanceIds.length > 0
    ? await adminClient.from('event_instances').select('id, series_id, title_override').in('id', linkedInstanceIds)
    : { data: [] }
  const linkedSeriesIds = (linkedInstances ?? []).map(i => i.series_id)
  const { data: linkedSeries } = linkedSeriesIds.length > 0
    ? await adminClient.from('event_series').select('id, title').in('id', linkedSeriesIds)
    : { data: [] }
  const seriesTitleMap = Object.fromEntries((linkedSeries ?? []).map(s => [s.id, s.title]))
  const instanceMap = Object.fromEntries((linkedInstances ?? []).map(i => [i.id, i]))
  const linkedEventTitles: Record<string, string> = {}
  for (const e of allTrainingEvents ?? []) {
    if (e.event_instance_id) {
      const inst = instanceMap[e.event_instance_id]
      if (inst) linkedEventTitles[e.id] = inst.title_override ?? seriesTitleMap[inst.series_id] ?? ''
    }
  }

  // My attendance records for these events
  const allEventIds = (allTrainingEvents ?? []).map(e => e.id)
  const { data: myAttendanceRaw } = allEventIds.length > 0
    ? await adminClient
        .from('training_event_attendance')
        .select('id, event_id, status, submitted_at, signed_at, signature_url')
        .eq('personnel_id', me.id)
        .in('event_id', allEventIds)
    : { data: [] }

  const myAttendanceMap = Object.fromEntries((myAttendanceRaw ?? []).map(a => [a.event_id, a]))

  // Officer: all attendance for all events with member names
  type OfficerAttendanceRecord = { id: string; event_id: string; personnel_id: string; status: string; signed_at: string | null; signature_url: string | null; member_name: string }
  let officerAttendance: OfficerAttendanceRecord[] = []
  if (isOfficerOrAbove && allEventIds.length > 0) {
    const { data: allAttRaw } = await adminClient
      .from('training_event_attendance')
      .select('id, event_id, personnel_id, status, signed_at, signature_url')
      .in('event_id', allEventIds)
    const pIds = [...new Set((allAttRaw ?? []).map((a: { personnel_id: string }) => a.personnel_id))]
    const { data: pList } = pIds.length > 0
      ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', pIds)
      : { data: [] }
    const pMap = Object.fromEntries((pList ?? []).map((p: { id: string; first_name: string; last_name: string }) => [p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()]))
    officerAttendance = (allAttRaw ?? []).map((a: { id: string; event_id: string; personnel_id: string; status: string; signed_at: string | null; signature_url: string | null }) => ({
      ...a,
      member_name: pMap[a.personnel_id] ?? 'Unknown',
    }))
  }

  // My outside training submissions (all statuses — member sees their own history)
  const { data: mySubmissions } = await adminClient
    .from('training_submissions')
    .select('id, topic, course_date, hours, provider, location, status, purpose, nremt_category, approved_purpose, approved_nremt_category, reviewer_notes, submitted_at')
    .eq('personnel_id', me.id)
    .eq('department_id', department_id)
    .order('course_date', { ascending: false })

  // Count expiring certs (within 90 days)
  const today = new Date()
  const in90 = new Date(); in90.setDate(today.getDate() + 90)
  const expiringCount = (myCerts ?? []).filter(c => {
    if (!c.expiration_date) return false
    const exp = new Date(c.expiration_date + 'T00:00:00')
    return exp >= today && exp <= in90
  }).length

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-6">
        <HubCard
          title="Events"
          description="Department training events and attendance sign-in"
          href="/events"
        />
        <HubCard
          title="My Certifications"
          description="Active certs and expiration status"
          href="/training#certs"
          stat={expiringCount > 0 ? expiringCount : null}
          statLabel="Expiring Soon"
          alert={expiringCount > 0}
        />
        {isOfficerOrAbove && (
          <HubCard
            title="Print Training Card"
            description="Printable member training record"
            href={`/print/member-training?personnel_id=${me.id}`}
          />
        )}
      </div>
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
        linkedEventTitles={linkedEventTitles}
        myPersonnelId={me.id}
        myName={`${me.first_name} ${me.last_name}`}
        isOfficerOrAbove={isOfficerOrAbove}
        officerAttendance={officerAttendance}
        mySubmissions={mySubmissions ?? []}
      />
    </div>
  )
}
