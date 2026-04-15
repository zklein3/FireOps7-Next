import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ItemsClient from './ItemsClient'

export default async function ItemsPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) redirect('/login')

  const { data: myDeptList } = await adminClient
    .from('department_personnel')
    .select('department_id, system_role, departments(name)')
    .eq('personnel_id', me.id)
    .eq('active', true)

  const myDept = myDeptList?.[0]
  if (!myDept || (myDept.system_role !== 'admin' && !me.is_sys_admin)) redirect('/dashboard')

  const department_id = myDept.department_id
  const department_name = (myDept.departments as any)?.name ?? 'Your Department'

  const { data: categories } = await adminClient
    .from('item_categories')
    .select('id, category_name, requires_inspection, active, sort_order')
    .eq('department_id', department_id)
    .order('sort_order')

  const { data: items } = await adminClient
    .from('items')
    .select('id, item_name, item_description, category_id, tracks_quantity, requires_presence_check, requires_inspection, active')
    .eq('department_id', department_id)
    .order('item_name')

  return (
    <ItemsClient
      categories={categories ?? []}
      items={items ?? []}
      departmentName={department_name}
      departmentId={department_id}
    />
  )
}
