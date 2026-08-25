import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import SetupFlowClient from './SetupFlowClient'

export default async function SetupPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (!ctx.departmentId) redirect('/dashboard')
  if (!(await hasPermission(ctx, 'manage_dept_setup'))) redirect('/dashboard')

  const department_id = ctx.departmentId

  // Fetch department name
  const { data: deptData } = await adminClient
    .from('departments')
    .select('id, name, module_iso, module_medical')
    .eq('id', department_id)
    .single()
  const department = { id: deptData?.id ?? department_id, name: deptData?.name ?? 'Your Department' }

  const { data: medicalSupplyTypes } = deptData?.module_medical
    ? await adminClient
        .from('medical_supply_types')
        .select('id, name, category, unit_of_measure')
        .eq('department_id', department_id)
        .eq('active', true)
        .order('name')
    : { data: [] }

  // Parallel fetches for all setup data
  const [
    { data: stations },
    { data: apparatusRaw },
    { data: apparatusTypes },
    { data: compartmentsRaw },
    { data: assignmentsRaw },
    { data: apparatusForCompartments },
    { data: categories },
    { data: items },
    { data: deptPersonnelRaw },
    { data: roles },
  ] = await Promise.all([
    adminClient.from('stations')
      .select('id, station_number, station_name, address_line_1, city, state, postal_code, active, notes')
      .eq('department_id', department_id)
      .order('station_number'),
    adminClient.from('apparatus')
      .select('id, unit_number, apparatus_name, make, model, model_year, vin, license_plate, active, in_service_date, apparatus_type_id, station_id')
      .eq('department_id', department_id)
      .order('unit_number'),
    adminClient.from('apparatus_types')
      .select('id, name, sort_order')
      .eq('active', true)
      .order('sort_order'),
    adminClient.from('compartment_names')
      .select('id, compartment_code, compartment_name, sort_order, active')
      .eq('department_id', department_id)
      .order('sort_order', { ascending: true, nullsFirst: false }),
    adminClient.from('apparatus_compartments')
      .select('compartment_name_id, apparatus_id')
      .eq('active', true),
    adminClient.from('apparatus')
      .select('id, unit_number, apparatus_name')
      .eq('department_id', department_id)
      .eq('active', true)
      .order('unit_number'),
    adminClient.from('item_categories')
      .select('id, category_name, active, sort_order')
      .eq('department_id', department_id)
      .order('sort_order'),
    adminClient.from('items')
      .select('id, item_name, item_description, category_id, tracks_quantity, tracks_assets, requires_presence_check, requires_inspection, tracks_expiration, active')
      .eq('department_id', department_id)
      .order('item_name'),
    adminClient.from('department_personnel')
      .select('id, system_role, signup_status, active, employee_number, hire_date, role_id, personnel_id')
      .eq('department_id', department_id)
      .order('system_role'),
    adminClient.from('personnel_roles')
      .select('id, name, is_officer, sort_order')
      .eq('active', true)
      .order('sort_order'),
  ])

  // Build apparatus with type + station lookups
  const typeMap = Object.fromEntries((apparatusTypes ?? []).map(t => [t.id, t.name]))
  const stationMap = Object.fromEntries((stations ?? []).map(s => [s.id, s]))
  const apparatus = (apparatusRaw ?? []).map(a => ({
    ...a,
    type_name: a.apparatus_type_id ? (typeMap[a.apparatus_type_id] ?? null) : null,
    station: a.station_id ? (stationMap[a.station_id] ?? null) : null,
  }))

  // Build compartment assignment maps
  const usageMap: Record<string, number> = {}
  const assignmentMap: Record<string, string[]> = {}
  for (const a of assignmentsRaw ?? []) {
    usageMap[a.compartment_name_id] = (usageMap[a.compartment_name_id] ?? 0) + 1
    if (!assignmentMap[a.compartment_name_id]) assignmentMap[a.compartment_name_id] = []
    assignmentMap[a.compartment_name_id].push(a.apparatus_id)
  }

  // Fetch personnel names (sequential — needs IDs first)
  const personnelIds = (deptPersonnelRaw ?? []).map(dp => dp.personnel_id).filter(Boolean)
  const { data: personnelData } = personnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name, email, signup_status').in('id', personnelIds)
    : { data: [] }
  const personnelMap = Object.fromEntries((personnelData ?? []).map(p => [p.id, p]))
  const roleMap = Object.fromEntries((roles ?? []).map(r => [r.id, r]))
  const personnel = (deptPersonnelRaw ?? []).map(dp => ({
    id: dp.id,
    system_role: dp.system_role,
    signup_status: dp.signup_status,
    active: dp.active,
    employee_number: dp.employee_number,
    hire_date: dp.hire_date,
    role_id: dp.role_id,
    personnel_id: dp.personnel_id,
    personnel: personnelMap[dp.personnel_id] ?? null,
    personnel_roles: dp.role_id ? (roleMap[dp.role_id] ?? null) : null,
  }))

  // Fetch assets for tracks_assets items
  const assetItemIds = (items ?? []).filter(i => i.tracks_assets).map(i => i.id)
  const [{ data: assets }, { data: customFieldDefsRaw }] = await Promise.all([
    assetItemIds.length > 0
      ? adminClient.from('item_assets')
          .select('id, item_id, asset_tag, serial_number, in_service_date, status, active, notes, apparatus_id, custom_field_values')
          .eq('department_id', department_id)
          .in('item_id', assetItemIds)
          .order('asset_tag')
      : Promise.resolve({ data: [] }),
    adminClient.from('item_custom_field_definitions')
      .select('id, item_id, field_label, field_order')
      .eq('department_id', department_id)
      .order('field_order'),
  ])

  // Group custom field defs by item_id
  const customFieldDefs: Record<string, { id: string; item_id: string; field_label: string; field_order: number }[]> = {}
  for (const def of customFieldDefsRaw ?? []) {
    if (!customFieldDefs[def.item_id]) customFieldDefs[def.item_id] = []
    customFieldDefs[def.item_id].push(def)
  }

  // Fetch inspection templates + steps for inspectable items
  const inspectionItemIds = (items ?? []).filter(i => i.requires_inspection).map(i => i.id)
  const { data: templates } = inspectionItemIds.length > 0
    ? await adminClient
        .from('item_inspection_templates')
        .select('id, item_id, template_name, template_description, active')
        .eq('department_id', department_id)
        .in('item_id', inspectionItemIds)
        .order('template_name')
    : { data: [] }

  const templateIds = (templates ?? []).map(t => t.id)
  const { data: steps } = templateIds.length > 0
    ? await adminClient
        .from('item_inspection_template_steps')
        .select('id, template_id, step_text, step_type, required, fail_if_negative, sort_order, active')
        .in('template_id', templateIds)
        .eq('active', true)
        .order('sort_order')
    : { data: [] }

  return (
    <SetupFlowClient
      department={department}
      stations={stations ?? []}
      apparatus={apparatus}
      apparatusTypes={apparatusTypes ?? []}
      personnel={personnel}
      roles={roles ?? []}
      compartments={compartmentsRaw ?? []}
      usageMap={usageMap}
      assignmentMap={assignmentMap}
      apparatusForCompartments={apparatusForCompartments ?? []}
      categories={categories ?? []}
      items={items ?? []}
      assets={assets ?? []}
      templates={templates ?? []}
      steps={steps ?? []}
      departmentId={department_id}
      moduleIso={deptData?.module_iso ?? false}
      customFieldDefs={customFieldDefs}
      medicalSupplyTypes={medicalSupplyTypes ?? []}
    />
  )
}
