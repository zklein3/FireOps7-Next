import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import Image from 'next/image'
import HubCard from '@/components/HubCard'
import FuelStorageToggle from './FuelStorageToggle'

export default async function DeptAdminPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (!ctx.departmentId) redirect('/dashboard')
  if (!(await hasPermission(ctx, 'access_dept_admin_hub'))) redirect('/dashboard')

  const departmentId = ctx.departmentId
  const isFireDept = ctx.departmentType === 'fire'
  const isPoliceDept = ctx.departmentType === 'law_enforcement'

  const [
    { data: deptFlags },
    { count: activeMemberCount },
    { count: pendingSetupCount },
  ] = await Promise.all([
    adminClient.from('departments')
      .select('module_iso, module_neris, module_medical, module_fuel_storage, module_ics, public_site_enabled')
      .eq('id', departmentId)
      .single(),
    adminClient.from('department_personnel')
      .select('id', { count: 'exact', head: true })
      .eq('department_id', departmentId)
      .eq('active', true),
    adminClient.from('department_personnel')
      .select('id', { count: 'exact', head: true })
      .eq('department_id', departmentId)
      .in('signup_status', ['temp_password', 'profile_setup']),
  ])

  const moduleIso = (deptFlags as any)?.module_iso ?? false
  const moduleNeris = (deptFlags as any)?.module_neris ?? false
  const moduleMedical = (deptFlags as any)?.module_medical ?? false
  const moduleIcs = (deptFlags as any)?.module_ics ?? false
  const moduleFuelStorage = (deptFlags as any)?.module_fuel_storage ?? false
  const publicSiteEnabled = (deptFlags as any)?.public_site_enabled ?? false
  const hasPendingSetup = (pendingSetupCount ?? 0) > 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Dept Admin</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Department configuration and management</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <HubCard
          title="Personnel"
          description="Manage members, roles, and account setup"
          href="/dept-admin/personnel"
          stat={activeMemberCount ?? undefined}
          statLabel={hasPendingSetup ? `${pendingSetupCount} pending setup` : 'Active Members'}
          alert={hasPendingSetup}
        />
        <HubCard
          title="Permission Groups"
          description="Customize what each role can do"
          href="/dept-admin/permission-groups"
        />
        <HubCard
          title="Department Settings"
          description="Timezone and display preferences"
          href="/dept-admin/settings"
        />
        <HubCard
          title="Events"
          description="Manage attendance, approvals, and event settings"
          href="/dept-admin/events"
        />
        <HubCard
          title="Attendance Settings"
          description="Excuse types and participation requirements"
          href="/dept-admin/attendance"
        />
        {moduleMedical && (
          <HubCard
            title="Medical"
            description="Supply types, storerooms, and medical inventory setup"
            href="/dept-admin/medical"
          />
        )}
        <HubCard
          title="Training & Certs"
          description="Certification types, courses, and training setup"
          href="/dept-admin/training"
        />
        <HubCard
          title="Accountability"
          description="Configure accountability lanes — default, ICS/NIMS Mode, and Active Violence profiles"
          href="/dept-admin/accountability"
        />
        {moduleIcs && (
          <HubCard
            title="ICS Defaults"
            description="Default radio channels (ICS 205) and medical plan contacts (ICS 206), copied into every new operational period"
            href="/dept-admin/ics-defaults"
          />
        )}
        <HubCard
          title="Kiosk Devices"
          description="Set up a station tablet for scan-in/scan-out presence tracking"
          href="/dept-admin/kiosk"
        />
        <HubCard
          title="Dept Setup"
          description="Stations, apparatus, personnel roles, and equipment items"
          href="/dept-admin/setup"
        />
        <HubCard
          title="Inspections"
          description="Vehicle check items and inspection session settings"
          href="/dept-admin/inspections"
        />
        {isPoliceDept && (
          <HubCard
            title="Police Settings"
            description="Contact types, action-taken options, and case numbering"
            href="/dept-admin/police"
          />
        )}
        {moduleIso && (
          <HubCard
            title="ISO"
            description="Hose inventory, hydrants, mutual aid, and ISO report"
            href="/iso"
          />
        )}
        {isFireDept && moduleNeris && (
          <HubCard
            title="NERIS Settings"
            description="Incident reporting configuration"
            href="/dept-admin/neris"
          />
        )}
        {publicSiteEnabled && (
          <HubCard
            title="Public Site"
            description="Burn permits and public records inbox"
            href="/dept-admin/public-inbox"
          />
        )}
        {moduleFuelStorage && (
          <HubCard
            title="Fuel Tanks"
            description="Manage on-site storage tanks and fuel deliveries"
            href="/dept-admin/fuel-tanks"
          />
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-zinc-700 mb-3">Department Features</h2>
        <FuelStorageToggle enabled={moduleFuelStorage} />
      </div>

      {/* NERIS promo — fire depts only, shown only when module is not yet enabled */}
      {isFireDept && !moduleNeris && (
        <div className="mt-8 rounded-2xl bg-zinc-950 border border-zinc-800 px-6 py-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <Image
            src="/NERIS_Data_Exchange_Compatible__SealV1.png"
            alt="NERIS V1 Data Exchange Compatible"
            width={72}
            height={72}
            className="shrink-0 rounded-full"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-500 mb-1">Available for Your Department</p>
            <h2 className="text-base font-bold text-white mb-1">Submit Incidents Directly to NERIS</h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              FireOps7 is NERIS V1 Data Exchange Compatible — your department can submit incident reports directly
              to the National Emergency Response Information System without leaving FireOps7.
              Contact us to enable NERIS integration for your department.
            </p>
            <p className="text-xs text-zinc-600 mt-2">
              The NERIS V1 badge indicates technical compatibility only and does not imply endorsement by NERIS or FSRI.
            </p>
          </div>
          <a
            href="mailto:zklein3@gmail.com?subject=NERIS Integration Request"
            className="shrink-0 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors whitespace-nowrap"
          >
            Contact Us
          </a>
        </div>
      )}
    </div>
  )
}
