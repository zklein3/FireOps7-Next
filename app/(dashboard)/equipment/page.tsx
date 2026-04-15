import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function EquipmentPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meList } = await adminClient.from('personnel').select('id, is_sys_admin').eq('auth_user_id', user.id)
  const me = meList?.[0]
  if (!me) redirect('/login')

  const { data: myDeptList } = await adminClient.from('department_personnel').select('department_id, system_role').eq('personnel_id', me.id).eq('active', true)
  const myDept = myDeptList?.[0]
  if (!myDept) redirect('/dashboard')

  const isAdmin = myDept.system_role === 'admin' || me.is_sys_admin
  const isOfficerOrAbove = isAdmin || myDept.system_role === 'officer'

  // Fetch apparatus for this department
  const { data: apparatusRaw } = await adminClient
    .from('apparatus')
    .select('id, unit_number, apparatus_name, apparatus_type_id, station_id, active')
    .eq('department_id', myDept.department_id)
    .eq('active', true)
    .order('unit_number')

  const typeIds = (apparatusRaw ?? []).map(a => a.apparatus_type_id).filter(Boolean)
  const { data: typeData } = typeIds.length > 0
    ? await adminClient.from('apparatus_types').select('id, name').in('id', typeIds)
    : { data: [] }

  const stationIds = (apparatusRaw ?? []).map(a => a.station_id).filter(Boolean)
  const { data: stationData } = stationIds.length > 0
    ? await adminClient.from('stations').select('id, station_name, station_number').in('id', stationIds)
    : { data: [] }

  const typeMap = Object.fromEntries((typeData ?? []).map(t => [t.id, t.name]))
  const stationMap = Object.fromEntries((stationData ?? []).map(s => [s.id, s]))

  // Count items per apparatus via compartments
  const { data: compartments } = await adminClient
    .from('apparatus_compartments')
    .select('id, apparatus_id')
    .eq('active', true)

  const { data: locationStandards } = await adminClient
    .from('item_location_standards')
    .select('id, apparatus_compartment_id')
    .eq('active', true)

  const compartmentSet = new Set((compartments ?? []).map(c => c.id))
  const compartmentToApparatus = Object.fromEntries((compartments ?? []).map(c => [c.id, c.apparatus_id]))

  const itemCountMap: Record<string, number> = {}
  for (const ls of locationStandards ?? []) {
    const apparatusId = compartmentToApparatus[ls.apparatus_compartment_id]
    if (apparatusId) {
      itemCountMap[apparatusId] = (itemCountMap[apparatusId] ?? 0) + 1
    }
  }

  const apparatus = (apparatusRaw ?? []).map(a => ({
    id: a.id,
    unit_number: a.unit_number,
    apparatus_name: a.apparatus_name,
    type_name: a.apparatus_type_id ? (typeMap[a.apparatus_type_id] ?? null) : null,
    station: a.station_id ? (stationMap[a.station_id] ?? null) : null,
    item_count: itemCountMap[a.id] ?? 0,
  }))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Equipment</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Select an apparatus to view its equipment</p>
        </div>
      </div>

      {apparatus.length === 0 ? (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          No apparatus found for this department.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {apparatus.map(a => (
            <Link key={a.id} href={`/equipment/${a.id}`}
              className="rounded-xl bg-white border border-zinc-200 shadow-sm p-5 hover:border-red-300 hover:shadow-md transition-all group">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-3xl font-bold text-zinc-900 group-hover:text-red-700 transition-colors">
                    {a.unit_number}
                  </span>
                  {a.apparatus_name && (
                    <p className="text-sm font-medium text-zinc-700 mt-0.5">{a.apparatus_name}</p>
                  )}
                </div>
                <span className="text-xs font-medium text-red-600">{a.type_name ?? '—'}</span>
              </div>
              {a.station && (
                <p className="text-xs text-zinc-400 mb-3">
                  Station {a.station.station_number} — {a.station.station_name}
                </p>
              )}
              <div className="rounded-lg bg-zinc-50 px-3 py-2 flex items-center justify-between">
                <p className="text-xs text-zinc-500">Item Types Assigned</p>
                <p className="text-lg font-bold text-zinc-900">{a.item_count}</p>
              </div>
              <div className="mt-3 pt-3 border-t border-zinc-100 flex justify-end">
                <span className="text-xs font-semibold text-red-600 group-hover:text-red-800">View Equipment →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
