import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import TrainingReportClient from './TrainingReportClient'

export type CertRow = {
  id: string
  personnel_id: string
  member_name: string
  cert_name: string
  issuing_body: string | null
  cert_number: string | null
  issued_date: string | null
  expiration_date: string | null
  source: string
  does_expire: boolean
  certification_type_id: string | null
}

export type EnrollmentRow = {
  id: string
  personnel_id: string
  member_name: string
  cert_name: string
  enrollment_status: string
  enrolled_at: string | null
  units_total: number
  units_completed: number
  units_verified: number
}

export type TrainingAttendanceRow = {
  id: string
  personnel_id: string
  member_name: string
  event_id: string
  event_date: string
  topic: string
  hours: number | null
  location: string | null
  status: string
}

export default async function TrainingReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; personnelId?: string; certTypeId?: string; expiryDays?: string }>
}) {
  const { from, to, personnelId, certTypeId, expiryDays } = await searchParams

  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient
    .from('personnel')
    .select('id, is_sys_admin')
    .eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) redirect('/login')

  const { data: myDeptList } = await adminClient
    .from('department_personnel')
    .select('department_id, system_role')
    .eq('personnel_id', me.id)
    .eq('active', true)
  const myDept = myDeptList?.[0]
  if (!myDept) redirect('/dashboard')

  const { system_role, department_id } = myDept
  if (system_role === 'member' && !me.is_sys_admin) redirect('/dashboard')

  const defaultTo = new Date()
  const defaultFrom = new Date()
  defaultFrom.setFullYear(defaultFrom.getFullYear() - 1)

  const dateFrom = from ?? defaultFrom.toISOString().split('T')[0]
  const dateTo = to ?? defaultTo.toISOString().split('T')[0]

  // All active dept personnel
  const { data: deptPersonnelList } = await adminClient
    .from('department_personnel')
    .select('personnel_id')
    .eq('department_id', department_id)
    .eq('active', true)

  const allPersonnelIds = (deptPersonnelList ?? []).map(p => p.personnel_id)

  const { data: personnelData } = allPersonnelIds.length > 0
    ? await adminClient
        .from('personnel')
        .select('id, first_name, last_name')
        .in('id', allPersonnelIds)
        .order('last_name')
    : { data: [] as { id: string; first_name: string; last_name: string }[] }

  const personnelNameMap = Object.fromEntries(
    (personnelData ?? []).map(p => [p.id, `${p.last_name}, ${p.first_name}`])
  )

  // Cert types for this dept
  const { data: certTypes } = await adminClient
    .from('certification_types')
    .select('id, cert_name, does_expire, is_structured_course')
    .eq('department_id', department_id)
    .eq('active', true)
    .order('cert_name')

  const certTypeMap = Object.fromEntries((certTypes ?? []).map(c => [c.id, c]))
  const allCertTypeIds = (certTypes ?? []).map(c => c.id)

  // Units per cert type (for progress counts)
  const { data: units } = allCertTypeIds.length > 0
    ? await adminClient
        .from('certification_course_units')
        .select('id, certification_type_id')
        .in('certification_type_id', allCertTypeIds)
        .eq('active', true)
    : { data: [] as { id: string; certification_type_id: string }[] }

  const unitCountByType: Record<string, number> = {}
  for (const u of units ?? []) {
    unitCountByType[u.certification_type_id] = (unitCountByType[u.certification_type_id] ?? 0) + 1
  }

  const scopePersonnelIds = personnelId
    ? (allPersonnelIds.includes(personnelId) ? [personnelId] : [''])
    : allPersonnelIds.length > 0 ? allPersonnelIds : ['']

  // Member certifications — issued in date range
  let certsQuery = adminClient
    .from('member_certifications')
    .select('id, personnel_id, cert_name, issuing_body, cert_number, issued_date, expiration_date, source, certification_type_id')
    .eq('department_id', department_id)
    .eq('active', true)
    .in('personnel_id', scopePersonnelIds)
    .order('issued_date', { ascending: false })

  if (from || to) {
    certsQuery = certsQuery.gte('issued_date', dateFrom).lte('issued_date', dateTo)
  }
  if (certTypeId) certsQuery = certsQuery.eq('certification_type_id', certTypeId)

  const { data: certsRaw } = await certsQuery

  const certs: CertRow[] = (certsRaw ?? []).map(c => ({
    id: c.id,
    personnel_id: c.personnel_id,
    member_name: personnelNameMap[c.personnel_id] ?? '—',
    cert_name: c.cert_name ?? '—',
    issuing_body: c.issuing_body ?? null,
    cert_number: c.cert_number ?? null,
    issued_date: c.issued_date ?? null,
    expiration_date: c.expiration_date ?? null,
    source: c.source ?? '—',
    does_expire: c.certification_type_id ? (certTypeMap[c.certification_type_id]?.does_expire ?? true) : true,
    certification_type_id: c.certification_type_id ?? null,
  }))

  // Course enrollments — all active/completed for dept
  let enrollQuery = adminClient
    .from('course_enrollments')
    .select('id, personnel_id, certification_type_id, status, enrolled_at')
    .eq('department_id', department_id)
    .in('status', ['active', 'completed'])
    .in('personnel_id', scopePersonnelIds)

  if (certTypeId) enrollQuery = enrollQuery.eq('certification_type_id', certTypeId)
  else if (allCertTypeIds.length > 0) enrollQuery = enrollQuery.in('certification_type_id', allCertTypeIds)

  const { data: enrollmentsRaw } = await enrollQuery

  const enrollmentIds = (enrollmentsRaw ?? []).map(e => e.id)
  const { data: progressRaw } = enrollmentIds.length > 0
    ? await adminClient
        .from('member_course_progress')
        .select('enrollment_id, status')
        .in('enrollment_id', enrollmentIds)
    : { data: [] as { enrollment_id: string; status: string }[] }

  const progressByEnrollment: Record<string, { status: string }[]> = {}
  for (const p of progressRaw ?? []) {
    if (!progressByEnrollment[p.enrollment_id]) progressByEnrollment[p.enrollment_id] = []
    progressByEnrollment[p.enrollment_id]!.push(p)
  }

  const enrollments: EnrollmentRow[] = (enrollmentsRaw ?? []).map(e => {
    const certType = certTypeMap[e.certification_type_id]
    const progress = progressByEnrollment[e.id] ?? []
    return {
      id: e.id,
      personnel_id: e.personnel_id,
      member_name: personnelNameMap[e.personnel_id] ?? '—',
      cert_name: certType?.cert_name ?? '—',
      enrollment_status: e.status,
      enrolled_at: e.enrolled_at ?? null,
      units_total: unitCountByType[e.certification_type_id] ?? 0,
      units_completed: progress.filter(p => p.status === 'verified' || p.status === 'pending').length,
      units_verified: progress.filter(p => p.status === 'verified').length,
    }
  })

  // Training events in date range
  const { data: eventsRaw } = await adminClient
    .from('training_events')
    .select('id, event_date, topic, hours, location')
    .eq('department_id', department_id)
    .gte('event_date', dateFrom)
    .lte('event_date', dateTo)
    .order('event_date', { ascending: false })

  const eventIds = (eventsRaw ?? []).map(e => e.id)
  const eventMap = Object.fromEntries((eventsRaw ?? []).map(e => [e.id, e]))

  const { data: attendanceRaw } = eventIds.length > 0
    ? await adminClient
        .from('training_event_attendance')
        .select('id, event_id, personnel_id, status')
        .in('event_id', eventIds)
        .in('personnel_id', scopePersonnelIds)
    : { data: [] as { id: string; event_id: string; personnel_id: string; status: string }[] }

  const trainingAttendance: TrainingAttendanceRow[] = (attendanceRaw ?? [])
    .map(a => {
      const ev = eventMap[a.event_id]
      return {
        id: a.id,
        personnel_id: a.personnel_id,
        member_name: personnelNameMap[a.personnel_id] ?? '—',
        event_id: a.event_id,
        event_date: ev?.event_date ?? '',
        topic: ev?.topic ?? '—',
        hours: ev?.hours ?? null,
        location: ev?.location ?? null,
        status: a.status ?? '—',
      }
    })
    .sort((a, b) => b.event_date.localeCompare(a.event_date))

  const personnelDropdown = (personnelData ?? []).map(p => ({
    id: p.id,
    name: `${p.last_name}, ${p.first_name}`,
  }))

  const certTypeDropdown = (certTypes ?? []).map(c => ({
    id: c.id,
    name: c.cert_name,
  }))

  return (
    <TrainingReportClient
      certs={certs}
      enrollments={enrollments}
      trainingAttendance={trainingAttendance}
      personnelList={personnelDropdown}
      certTypeList={certTypeDropdown}
      dateFrom={dateFrom}
      dateTo={dateTo}
      selectedPersonnelId={personnelId ?? null}
      selectedCertTypeId={certTypeId ?? null}
      expiryDays={expiryDays ? parseInt(expiryDays, 10) : 90}
    />
  )
}
