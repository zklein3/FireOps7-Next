'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

async function getContext() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return null
  return {
    me: { id: ctx.personnelId, is_sys_admin: ctx.isSysAdmin },
    department_id: ctx.departmentId,
    system_role: ctx.systemRole,
    fullCtx: ctx,
  }
}

export async function createAnnouncement(formData: FormData) {
  const ctx = await getContext()
  if (!ctx || !ctx.department_id) return { error: 'Unauthorized' }
  if (!(await hasPermission(ctx.fullCtx, 'post_update'))) return { error: 'Unauthorized' }

  const title = (formData.get('title') as string)?.trim()
  const body = (formData.get('body') as string)?.trim()
  if (!title || !body) return { error: 'Title and body are required' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('announcements').insert({
    department_id: ctx.department_id,
    author_personnel_id: ctx.me.id,
    title,
    body,
  })
  if (dbErr) {
    await logError(dbErr, 'createAnnouncement')
    return { error: 'Failed to create announcement' }
  }

  revalidatePath('/announcements')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteAnnouncement(id: string) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Unauthorized' }
  if (!(await hasPermission(ctx.fullCtx, 'moderate_announcements'))) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('announcements').delete().eq('id', id)
  if (dbErr) {
    await logError(dbErr, 'deleteAnnouncement')
    return { error: 'Failed to delete announcement' }
  }

  revalidatePath('/announcements')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function pinAnnouncement(id: string, pinned: boolean) {
  const ctx = await getContext()
  if (!ctx) return { error: 'Unauthorized' }
  if (!(await hasPermission(ctx.fullCtx, 'moderate_announcements'))) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('announcements').update({ pinned }).eq('id', id)
  if (dbErr) {
    await logError(dbErr, 'pinAnnouncement')
    return { error: 'Failed to update announcement' }
  }

  revalidatePath('/announcements')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function markAnnouncementRead(announcementId: string) {
  const ctx = await getContext()
  if (!ctx || !ctx.me.id) return { error: 'Unauthorized' }

  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient.from('announcement_reads').upsert({
    announcement_id: announcementId,
    personnel_id: ctx.me.id,
  }, { onConflict: 'announcement_id,personnel_id', ignoreDuplicates: true })
  if (dbErr) {
    await logError(dbErr, 'markAnnouncementRead')
    return { error: 'Failed to mark as read' }
  }

  revalidatePath('/announcements')
  revalidatePath('/dashboard')
  return { success: true }
}
