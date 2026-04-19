'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { logError } from '@/lib/logger'

export async function resolveLog(id: string) {
  try {
    const admin = createAdminClient()
    const { error: dbErr } = await admin
      .from('system_logs')
      .update({ resolved: true })
      .eq('id', id)
    if (dbErr) throw dbErr
    revalidatePath('/admin/logs')
  } catch (err) {
    await logError(err, '/admin/logs')
    return { error: 'Failed to resolve log.' }
  }
}

export async function resolveAllLogs(logType?: string) {
  try {
    const admin = createAdminClient()
    let query = admin
      .from('system_logs')
      .update({ resolved: true })
      .eq('resolved', false)
    if (logType) query = query.eq('log_type', logType)
    const { error: dbErr } = await query
    if (dbErr) throw dbErr
    revalidatePath('/admin/logs')
  } catch (err) {
    await logError(err, '/admin/logs')
    return { error: 'Failed to resolve logs.' }
  }
}
