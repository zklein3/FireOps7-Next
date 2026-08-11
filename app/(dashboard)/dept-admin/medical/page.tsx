import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import MedicalAdminClient from './MedicalAdminClient'

export default async function MedicalAdminPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (!ctx.departmentId) redirect('/dashboard')
  if (!(await hasPermission(ctx, 'manage_medical_supply_setup'))) redirect('/dashboard')

  const { data: deptRow } = await adminClient.from('departments').select('module_medical, module_medical_controlled').eq('id', ctx.departmentId).single()
  if (!deptRow?.module_medical) redirect('/dept-admin')

  const department_id = ctx.departmentId

  const [
    { data: supplyTypes },
    { data: storerooms },
    { data: stations },
    { data: apparatusList },
  ] = await Promise.all([
    adminClient.from('medical_supply_types')
      .select('id, name, category, unit_of_measure, is_controlled, tracks_expiration, required_signatures, notes, active')
      .eq('department_id', department_id)
      .order('category')
      .order('name'),
    adminClient.from('medical_storerooms')
      .select('id, name, station_id, apparatus_id, compartment_id, notes, active')
      .eq('department_id', department_id)
      .order('name'),
    adminClient.from('stations')
      .select('id, station_name, station_number')
      .eq('department_id', department_id)
      .order('station_number'),
    adminClient.from('apparatus')
      .select('id, unit_number, apparatus_types(name)')
      .eq('department_id', department_id)
      .eq('active', true)
      .order('unit_number'),
  ])

  // Apparatus compartments for compartment-linked storeroom creation
  const apparatusIds = (apparatusList ?? []).map(a => a.id)
  const { data: apparatusCompartmentLinks } = apparatusIds.length > 0
    ? await adminClient.from('apparatus_compartments')
        .select('id, apparatus_id, compartment_name_id')
        .in('apparatus_id', apparatusIds)
        .eq('active', true)
    : { data: [] }
  const compartmentNameIds = [...new Set((apparatusCompartmentLinks ?? []).map(c => c.compartment_name_id))]
  const { data: compartmentNameRows } = compartmentNameIds.length > 0
    ? await adminClient.from('compartment_names').select('id, compartment_code, compartment_name, sort_order').in('id', compartmentNameIds)
    : { data: [] }
  const compartmentNameMap = Object.fromEntries((compartmentNameRows ?? []).map(c => [c.id, c]))
  const apparatusCompartments = (apparatusCompartmentLinks ?? []).map(c => ({
    id: c.id,
    apparatus_id: c.apparatus_id,
    compartment_code: compartmentNameMap[c.compartment_name_id]?.compartment_code ?? '—',
    compartment_name: compartmentNameMap[c.compartment_name_id]?.compartment_name ?? null,
    sort_order: compartmentNameMap[c.compartment_name_id]?.sort_order ?? 999,
  })).sort((a, b) => a.sort_order - b.sort_order)

  // Storeroom inventory (supply types assigned to each storeroom)
  const storeroomIds = (storerooms ?? []).map(s => s.id)
  const { data: storeroomInventory } = storeroomIds.length > 0
    ? await adminClient.from('medical_storeroom_inventory')
        .select('id, storeroom_id, supply_type_id, par_level')
        .in('storeroom_id', storeroomIds)
    : { data: [] }

  const apparatus = (apparatusList ?? []).map(a => ({
    id: a.id,
    unit_number: a.unit_number,
    type_name: (a.apparatus_types as any)?.name ?? null,
  }))

  // Bag templates
  const { data: bagTemplates } = await adminClient
    .from('medical_bag_templates')
    .select('id, name, description, active')
    .eq('department_id', department_id)
    .order('name')

  const templateIds = (bagTemplates ?? []).map(t => t.id)
  const [{ data: templateItems }, { data: bagDeployments }] = await Promise.all([
    templateIds.length > 0
      ? adminClient.from('medical_bag_template_items').select('id, template_id, supply_type_id, par_level').in('template_id', templateIds)
      : Promise.resolve({ data: [] }),
    adminClient.from('medical_storerooms')
      .select('id, name, apparatus_id, template_id, inventory_mode')
      .eq('department_id', department_id)
      .eq('active', true)
      .not('apparatus_id', 'is', null)
      .is('compartment_id', null),
  ])

  return (
    <MedicalAdminClient
      supplyTypes={supplyTypes ?? []}
      storerooms={storerooms ?? []}
      stations={stations ?? []}
      apparatus={apparatus}
      apparatusCompartments={apparatusCompartments}
      storeroomInventory={storeroomInventory ?? []}
      bagTemplates={bagTemplates ?? []}
      templateItems={templateItems ?? []}
      bagDeployments={bagDeployments ?? []}
      departmentId={department_id}
      moduleMedicalControlled={deptRow?.module_medical_controlled ?? false}
    />
  )
}
