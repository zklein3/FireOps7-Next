import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission, getPermissionSnapshot } from '@/lib/permissions'
import HubCard from '@/components/HubCard'

export default async function OfficerPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  if (!(await hasPermission(ctx, 'access_officer_hub'))) redirect('/dashboard')
  if (ctx.departmentType !== 'fire') redirect('/dashboard')

  const { data: deptFlags } = await adminClient
    .from('departments')
    .select('module_iso, module_medical, public_site_enabled')
    .eq('id', ctx.departmentId)
    .single()

  const moduleIso = deptFlags?.module_iso ?? false
  const moduleMedical = deptFlags?.module_medical ?? false
  const publicSiteEnabled = deptFlags?.public_site_enabled ?? false
  const perms = await getPermissionSnapshot(ctx)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Officer</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Everything officer+ in one place — operations, reports, and pending items</p>
      </div>

      <div className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Operations</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {perms.manage_events && (
            <HubCard
              title="Manage Events"
              description="Edit, bulk-log attendance, approve excuses, close events"
              href="/dept-admin/events"
            />
          )}
          {perms.manage_accountability_boards && (
            <HubCard
              title="Accountability"
              description="Scan cards, assign lanes, run PAR checks"
              href="/accountability"
            />
          )}
          {moduleIso && perms.perform_iso_testing && (
            <HubCard
              title="Hose Testing Session"
              description="Bulk NFPA 1962 hose service test session"
              href="/iso/hoses/session"
            />
          )}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Reports</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {perms.manage_incidents && (
            <HubCard title="Run Report" description="Incident run sheets — filter and print" href="/reports/run-report" />
          )}
          {perms.approve_attendance && (
            <HubCard title="Attendance" description="Department-wide event attendance records" href="/reports/attendance" />
          )}
          {perms.record_training_completion && (
            <HubCard title="Training" description="Training participation and certification status" href="/reports/training" />
          )}
          {perms.manage_inspection_sessions && (
            <HubCard title="Inspections" description="Equipment inspection history and compliance" href="/reports/inspections" />
          )}
          {perms.manage_inventory && (
            <HubCard title="Inventory Status" description="Equipment inventory levels and asset tracking" href="/reports/inventory-status" />
          )}
          {perms.manage_inventory && (
            <HubCard title="Inventory Log" description="Asset inspection history by apparatus" href="/reports/inventory" />
          )}
          {perms.manage_inventory && (
            <HubCard title="Movement Log" description="Department-wide asset movement log" href="/equipment/movement-log" />
          )}
          {perms.manage_fuel_log && (
            <HubCard title="Fuel Report" description="Apparatus fuel usage and cost tracking" href="/reports/fuel" />
          )}
          {moduleMedical && perms.manage_medical_inventory && (
            <HubCard title="Medical Supplies" description="Stock levels, consumption, and expiring lots" href="/reports/medical" />
          )}
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Inbox</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {publicSiteEnabled && perms.review_burn_permits && (
            <HubCard title="Burn Permits" description="Review and approve pending permit applications" href="/inbox?tab=permits" />
          )}
          {publicSiteEnabled && perms.manage_public_inbox && (
            <HubCard title="Records Requests" description="Public records requests awaiting review" href="/inbox?tab=records" />
          )}
          {moduleMedical && perms.manage_medical_inventory && (
            <HubCard title="Restock" description="Reorder requests and expiring lot alerts" href="/inbox?tab=restock" />
          )}
          {perms.manage_public_inbox && (
            <HubCard title="Feedback" description="Member feedback submissions" href="/inbox?tab=feedback" />
          )}
        </div>
      </div>
    </div>
  )
}
