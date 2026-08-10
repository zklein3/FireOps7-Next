import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(ctx, 'record_training_completion'))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // document_url paths are stored as `${department_id}/${personnel_id}/${filename}` —
  // verify the requested file actually belongs to the caller's department.
  const [ownerDeptId] = path.split('/')
  if (!ctx.isSysAdmin && ownerDeptId !== ctx.departmentId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const adminClient = createAdminClient()
  const { data, error } = await adminClient.storage.from('training-docs').createSignedUrl(path, 60)
  if (error || !data) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  return NextResponse.redirect(data.signedUrl)
}
