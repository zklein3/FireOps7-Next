import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { getPermissionSnapshot } from '@/lib/permissions'
import HubCard from '@/components/HubCard'

export default async function ReportsPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  const reportPermissions = await getPermissionSnapshot(ctx)

  const { data: deptRow } = await adminClient.from('departments').select('module_medical').eq('id', ctx.departmentId).single()
  const moduleMedical = deptRow?.module_medical ?? false

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Reports</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Activity, compliance, and department reports</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <HubCard
          title="My Activity"
          description="Your attendance history and personal records"
          href="/reports/my-activity"
        />
        {reportPermissions.manage_incidents && (
          <HubCard
            title="Run Report"
            description="Incident run sheets — filter by date and type, print any incident"
            href="/reports/run-report"
          />
        )}
        {reportPermissions.manage_inventory && (
          <HubCard
            title="Asset Roster"
            description="Department-wide tracked asset inventory and status"
            href="/equipment/assets"
          />
        )}
        {reportPermissions.approve_attendance && (
          <HubCard
            title="Attendance"
            description="Department-wide event attendance records"
            href="/reports/attendance"
          />
        )}
        {reportPermissions.record_training_completion && (
          <HubCard
            title="Training"
            description="Training participation and certification status"
            href="/reports/training"
          />
        )}
        {reportPermissions.manage_inspection_sessions && (
          <HubCard
            title="Inspections"
            description="Equipment inspection history and compliance"
            href="/reports/inspections"
          />
        )}
        {reportPermissions.manage_inventory && (
          <HubCard
            title="Inventory Status"
            description="Equipment inventory levels and asset tracking"
            href="/reports/inventory-status"
          />
        )}
        {reportPermissions.manage_inventory && (
          <HubCard
            title="Inventory Log"
            description="Asset inspection history and movement log by apparatus"
            href="/reports/inventory"
          />
        )}
        {reportPermissions.manage_fuel_log && (
          <HubCard
            title="Fuel Report"
            description="Apparatus fuel usage and cost tracking"
            href="/reports/fuel"
          />
        )}
        {moduleMedical && reportPermissions.manage_medical_inventory && (
          <HubCard
            title="Medical Supplies"
            description="Stock levels, consumption summary, and expiring lots"
            href="/reports/medical"
          />
        )}
      </div>
    </div>
  )
}
