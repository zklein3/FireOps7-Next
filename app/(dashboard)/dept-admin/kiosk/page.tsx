import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { listKioskDevices } from '@/app/actions/kiosk'
import KioskDevicesClient from './KioskDevicesClient'

export default async function KioskDevicesPage() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (!ctx.departmentId) redirect('/dashboard')
  if (!(await hasPermission(ctx, 'manage_kiosk_devices'))) redirect('/dashboard')

  const result = await listKioskDevices()

  return (
    <div className="max-w-lg">
      <KioskDevicesClient devices={result.devices ?? []} />
    </div>
  )
}
