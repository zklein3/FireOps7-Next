'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logError } from '@/lib/logger'

async function assertSysAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Session expired.')
  const admin = createAdminClient()
  const { data: me } = await admin.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_sys_admin) throw new Error('Unauthorized.')
  return me.id as string
}

export async function resolveLog(id: string) {
  try {
    await assertSysAdmin()
    const admin = createAdminClient()
    const { error: dbErr } = await admin
      .from('system_logs')
      .update({ resolved: true })
      .eq('id', id)
    if (dbErr) throw dbErr
    revalidatePath('/admin/logs')
  } catch (err) {
    await logError(err, '/admin/logs')
    return { error: err instanceof Error ? err.message : 'Failed to resolve log.' }
  }
}

// ─── Reply to a user_report log — shows up in that member's own /inbox,
// no threading (they can't reply back through this channel; if they want to
// follow up, they submit a new report the same way they submitted this one).
export async function replyToUserReport(id: string, replyMessage: string) {
  try {
    const myId = await assertSysAdmin()
    const message = replyMessage.trim()
    if (!message) return { error: 'Reply message is required.' }

    const admin = createAdminClient()
    const { error: dbErr } = await admin
      .from('system_logs')
      .update({
        reply_message: message,
        replied_at: new Date().toISOString(),
        replied_by_personnel_id: myId,
        resolved: true,
      })
      .eq('id', id)
    if (dbErr) throw dbErr
    revalidatePath('/admin/logs')
    revalidatePath('/inbox')
    return { success: true }
  } catch (err) {
    await logError(err, '/admin/logs')
    return { error: err instanceof Error ? err.message : 'Failed to send reply.' }
  }
}

export async function setSystemSetting(key: string, value: string) {
  const admin = createAdminClient()
  const { error: dbErr } = await admin
    .from('system_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() })
  if (dbErr) { await logError(dbErr.message, '/admin/departments', { metadata: { key } }); return { error: dbErr.message } }
  revalidatePath('/admin/departments')
  revalidatePath('/fire-school')
  return { success: true }
}

export async function submitFireSchoolInquiry(formData: FormData) {
  const name = (formData.get('name') as string)?.trim()
  const dept = (formData.get('dept') as string)?.trim()
  const email = (formData.get('email') as string)?.trim()
  const message = (formData.get('message') as string)?.trim()

  if (!name || !message) return { error: 'Name and message are required.' }

  const admin = createAdminClient()
  const { error: dbErr } = await admin
    .from('system_logs')
    .insert({
      log_type: 'fire_school_inquiry',
      message: `Fire School Inquiry\nFrom: ${name}${dept ? ` — ${dept}` : ''}${email ? ` (${email})` : ''}\n\n${message}`,
      resolved: false,
    })

  if (dbErr) { await logError(dbErr.message, '/fire-school', { metadata: { name, email } }); return { error: 'Failed to submit. Please try again.' } }
  return { success: true }
}

export async function resolveAllLogs(logType?: string) {
  try {
    await assertSysAdmin()
    const admin = createAdminClient()
    // user_report rows always resolve through replyToUserReport (so the
    // submitter gets a response) — never bulk-resolved silently here.
    let query = admin
      .from('system_logs')
      .update({ resolved: true })
      .eq('resolved', false)
      .neq('log_type', 'user_report')
    if (logType) query = query.eq('log_type', logType)
    const { error: dbErr } = await query
    if (dbErr) throw dbErr
    revalidatePath('/admin/logs')
  } catch (err) {
    await logError(err, '/admin/logs')
    return { error: 'Failed to resolve logs.' }
  }
}
