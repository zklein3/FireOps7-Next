import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { getPermissionSnapshot } from '@/lib/permissions'
import AnnouncementsClient from './AnnouncementsClient'

export default async function AnnouncementsPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')
  const me = { id: ctx.personnelId, first_name: ctx.firstName, last_name: ctx.lastName }

  const departmentId = ctx.departmentId
  const permissions = await getPermissionSnapshot(ctx)
  const isOfficerOrAbove = permissions.post_update
  const isAdmin = permissions.moderate_announcements

  const [{ data: announcements }, { data: reads }] = await Promise.all([
    adminClient.from('announcements')
      .select('id, title, body, pinned, created_at, author_personnel_id')
      .eq('department_id', departmentId)
      .order('created_at', { ascending: false }),
    adminClient.from('announcement_reads')
      .select('announcement_id')
      .eq('personnel_id', me.id),
  ])

  // Fetch author names flat
  const authorIds = [...new Set((announcements ?? []).map(a => a.author_personnel_id))]
  const { data: authors } = authorIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', authorIds)
    : { data: [] }
  const authorMap = Object.fromEntries((authors ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`.trim()]))

  const readSet = new Set((reads ?? []).map(r => r.announcement_id))

  const items = (announcements ?? []).map(a => ({
    id: a.id,
    title: a.title,
    body: a.body,
    pinned: a.pinned,
    created_at: a.created_at,
    author_name: authorMap[a.author_personnel_id] ?? 'Unknown',
    read: readSet.has(a.id),
  }))

  return (
    <AnnouncementsClient
      announcements={items}
      isOfficerOrAbove={isOfficerOrAbove}
      isAdmin={isAdmin}
      departmentTimezone={ctx.departmentTimezone}
    />
  )
}
