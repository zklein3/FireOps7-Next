import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { getVehicleCheckItems } from '@/app/actions/inspections'
import DeptInspectionSettingsClient from './DeptInspectionSettingsClient'
import VehicleCheckItemsClient from './VehicleCheckItemsClient'

export default async function DeptInspectionSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const activeTab = tab === 'vehicle' ? 'vehicle' : 'session'

  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (!ctx.departmentId) redirect('/dashboard')
  if (!(await hasPermission(ctx, 'manage_inspection_settings'))) redirect('/dashboard')

  const { data: deptList } = await adminClient
    .from('departments')
    .select('inspection_session_duration_hours')
    .eq('id', ctx.departmentId)
  const dept = deptList?.[0]

  const { items: vehicleCheckItems } = await getVehicleCheckItems(ctx.departmentId)

  return (
    <div className="pt-20 px-4 pb-4 sm:pt-0 sm:p-6 lg:p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Inspection Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">Configure inspection sessions and vehicle check items for your department.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 mb-6">
        <a
          href="/dept-admin/inspections?tab=session"
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'session'
              ? 'border-red-600 text-red-700'
              : 'border-transparent text-zinc-500 hover:text-zinc-700'
          }`}
        >
          Session Settings
        </a>
        <a
          href="/dept-admin/inspections?tab=vehicle"
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'vehicle'
              ? 'border-red-600 text-red-700'
              : 'border-transparent text-zinc-500 hover:text-zinc-700'
          }`}
        >
          Vehicle Check Items
        </a>
      </div>

      {activeTab === 'session' && (
        <DeptInspectionSettingsClient
          departmentId={ctx.departmentId}
          inspection_session_duration_hours={dept?.inspection_session_duration_hours ?? 12}
        />
      )}

      {activeTab === 'vehicle' && (
        <VehicleCheckItemsClient
          departmentId={ctx.departmentId}
          initialItems={vehicleCheckItems}
        />
      )}
    </div>
  )
}
