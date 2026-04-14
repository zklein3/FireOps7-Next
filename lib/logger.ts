import { createAdminClient } from '@/lib/supabase/admin'

interface LogEntry {
  log_type: 'error' | 'user_report' | 'info'
  page?: string
  message: string
  metadata?: Record<string, any>
  personnel_id?: string
  department_id?: string
}

export async function logEvent(entry: LogEntry) {
  try {
    const adminClient = createAdminClient()
    await adminClient.from('system_logs').insert(entry)
  } catch {
    // Never let logging break the app
    console.error('Failed to write to system_logs:', entry)
  }
}

export async function logError(
  error: unknown,
  page: string,
  context?: { personnel_id?: string; department_id?: string; metadata?: Record<string, any> }
) {
  const message = error instanceof Error ? error.message : String(error)
  await logEvent({
    log_type: 'error',
    page,
    message,
    ...context,
  })
}
