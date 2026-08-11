import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_TIMEZONE } from '@/lib/format-datetime'
import LogsClient from './LogsClient'

export default async function LogsPage() {
  const admin = createAdminClient()

  const { data: logs } = await admin
    .from('system_logs')
    .select('id, created_at, log_type, page, message, metadata, personnel_id, department_id, resolved, reply_message, replied_at, replied_by_personnel_id')
    .order('created_at', { ascending: false })

  const { data: personnel } = await admin
    .from('personnel')
    .select('id, first_name, last_name')

  const personnelMap = Object.fromEntries(
    (personnel ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`])
  )

  // Pull related public_feedback rows for user_report logs that reference one
  const feedbackIds = [...new Set(
    (logs ?? [])
      .map((l) => (l.metadata as Record<string, unknown> | null)?.feedback_id)
      .filter((id): id is string => typeof id === 'string')
  )]

  let feedbackMap: Record<string, {
    contact_email: string | null
    contact_name: string | null
    message: string
    feedback_type: string
    reply_message: string | null
    replied_at: string | null
    replied_by_name: string | null
    department_name: string | null
  }> = {}

  if (feedbackIds.length > 0) {
    const { data: feedbackRows } = await admin
      .from('public_feedback')
      .select('id, department_id, contact_email, contact_name, message, feedback_type, reply_message, replied_at, replied_by_personnel_id')
      .in('id', feedbackIds)

    const deptIds = [...new Set((feedbackRows ?? []).map((f) => f.department_id).filter(Boolean))]
    const { data: deptRows } = deptIds.length > 0
      ? await admin.from('departments').select('id, name').in('id', deptIds)
      : { data: [] as { id: string; name: string }[] }
    const deptMap = Object.fromEntries((deptRows ?? []).map((d) => [d.id, d.name]))

    feedbackMap = Object.fromEntries((feedbackRows ?? []).map((f) => [f.id, {
      contact_email: f.contact_email,
      contact_name: f.contact_name,
      message: f.message,
      feedback_type: f.feedback_type,
      reply_message: f.reply_message,
      replied_at: f.replied_at,
      replied_by_name: f.replied_by_personnel_id ? (personnelMap[f.replied_by_personnel_id] ?? null) : null,
      department_name: f.department_id ? (deptMap[f.department_id] ?? null) : null,
    }]))
  }

  // This is a sys-admin, system-wide page (all departments' logs) — there is
  // no single department context to resolve a timezone from, so fall back
  // to the system default rather than forcing a department lookup.
  return <LogsClient logs={logs ?? []} personnelMap={personnelMap} feedbackMap={feedbackMap} departmentTimezone={DEFAULT_TIMEZONE} />
}
