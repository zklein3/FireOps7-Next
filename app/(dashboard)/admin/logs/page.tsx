import { createAdminClient } from '@/lib/supabase/admin'
import LogsClient from './LogsClient'

export default async function LogsPage() {
  const admin = createAdminClient()

  const { data: logs } = await admin
    .from('system_logs')
    .select('id, created_at, log_type, page, message, metadata, personnel_id, department_id, resolved')
    .order('created_at', { ascending: false })

  const { data: personnel } = await admin
    .from('personnel')
    .select('id, first_name, last_name')

  const personnelMap = Object.fromEntries(
    (personnel ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`])
  )

  return <LogsClient logs={logs ?? []} personnelMap={personnelMap} />
}
