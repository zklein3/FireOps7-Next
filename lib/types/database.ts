// ─── Departments ────────────────────────────────────────────────────────────
export interface Department {
  id: string
  name: string
  code: string | null
  active: boolean
  created_at: string
}

// ─── Stations ────────────────────────────────────────────────────────────────
export interface Station {
  id: string
  department_id: string
  station_number: string | null
  station_name: string
  address_line_1: string | null
  address_line_2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── Apparatus ───────────────────────────────────────────────────────────────
export interface ApparatusType {
  id: string
  name: string
  sort_order: number
  active: boolean
}

export interface Apparatus {
  id: string
  department_id: string
  station_id: string | null
  apparatus_type_id: string | null
  unit_number: string
  apparatus_name: string | null
  make: string | null
  model: string | null
  model_year: number | null
  vin: string | null
  license_plate: string | null
  active: boolean
  in_service_date: string | null
  out_of_service_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CompartmentName {
  id: string
  department_id: string
  compartment_code: string
  compartment_name: string | null
  sort_order: number | null
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ApparatusCompartment {
  id: string
  apparatus_id: string
  compartment_name_id: string
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── Personnel ───────────────────────────────────────────────────────────────
export type SignupStatus = 'awaiting_approval' | 'active' | 'denied' | 'temp_password'
export type SystemRole = 'admin' | 'officer' | 'member'

export interface Personnel {
  id: string
  first_name: string
  last_name: string
  display_name: string | null
  email: string
  phone: string | null
  auth_user_id: string | null
  is_sys_admin: boolean
  signup_status: SignupStatus
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  created_at: string
  updated_at: string
}

export interface PersonnelRole {
  id: string
  name: string
  sort_order: number
  active: boolean
  is_officer: boolean
}

export interface DepartmentPersonnel {
  id: string
  personnel_id: string
  department_id: string
  role_id: string | null
  employee_number: string | null
  hire_date: string | null
  separation_date: string | null
  active: boolean
  signup_status: SignupStatus
  system_role: SystemRole
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── Equipment / Items ───────────────────────────────────────────────────────
export interface ItemCategory {
  id: string
  department_id: string
  category_name: string
  category_type: string | null
  requires_inspection: boolean
  active: boolean
  sort_order: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Item {
  id: string
  department_id: string
  category_id: string
  item_name: string
  item_description: string | null
  tracks_quantity: boolean
  tracks_assets: boolean
  requires_presence_check: boolean
  tracks_expiration: boolean
  requires_inspection: boolean
  requires_maintenance: boolean
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export type AssetStatus = 'IN SERVICE' | 'OUT OF SERVICE' | 'MAINTENANCE' | 'RETIRED'

export interface ItemAsset {
  id: string
  department_id: string
  item_id: string
  apparatus_compartment_id: string | null
  asset_tag: string | null
  serial_number: string | null
  in_service_date: string | null
  out_of_service_date: string | null
  active: boolean
  status: AssetStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ItemLocationStandard {
  id: string
  apparatus_compartment_id: string
  item_id: string
  expected_quantity: number
  minimum_quantity: number | null
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── Inspections ─────────────────────────────────────────────────────────────
export type ResponseType = 'BOOLEAN' | 'SHORT_TEXT' | 'LONG_TEXT' | 'NUMERIC'
export type InspectionResult = 'PASS' | 'FAIL' | 'OUT OF SERVICE'

export interface ItemInspectionTemplate {
  id: string
  department_id: string
  item_id: string
  template_name: string
  template_description: string | null
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ItemInspectionTemplateStep {
  id: string
  template_id: string
  step_text: string
  step_description: string | null
  response_type: ResponseType
  required: boolean
  fail_if_negative: boolean
  sort_order: number
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ItemAssetInspectionLog {
  id: string
  asset_id: string
  template_id: string
  inspected_at: string
  overall_result: InspectionResult
  inspected_by_personnel_id: string | null
  inspected_by_name: string | null
  notes: string | null
  created_at: string
}

export interface ItemAssetInspectionLogStep {
  id: string
  inspection_log_id: string
  template_step_id: string
  boolean_value: boolean | null
  text_value: string | null
  numeric_value: number | null
  notes: string | null
  created_at: string
}

// ─── SCBA (Department) ───────────────────────────────────────────────────────
export type CylinderMaterial = 'steel' | 'aluminum' | 'composite'
export type FillResult = 'FILLED' | 'PARTIAL' | 'FAILED'
export type MaintenanceType = 'INSPECTION' | 'REQUALIFICATION' | 'REPAIR' | 'OUT_OF_SERVICE' | 'RETURN_TO_SERVICE' | 'HYDRO_TEST' | 'OTHER'
export type MaintenanceResult = 'PASS' | 'FAIL' | 'COMPLETED' | 'REMOVED_FROM_SERVICE' | 'RETURNED_TO_SERVICE'

export interface ScbaCylinderSpec {
  id: string
  spec_code: string
  display_name: string
  material_type: CylinderMaterial
  dot_spec: string | null
  special_permit: string | null
  requal_interval_years: number
  service_life_years: number | null
  requires_service_life: boolean
  active: boolean
  sort_order: number | null
  created_at: string
  updated_at: string
}

export interface ScbaBottle {
  id: string
  department_id: string
  item_label: string
  psi: 2216 | 4500
  rated_duration_minutes: 30 | 45 | 60
  cylinder_spec_id: string
  manufacture_date: string | null
  last_requal_date: string | null
  in_service_date: string | null
  active: boolean
  retired: boolean
  retirement_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ScbaFillLog {
  id: string
  bottle_id: string
  filled_at: string
  fill_result: FillResult | null
  filled_by_name: string | null
  fill_location: string | null
  notes: string | null
  created_at: string
}

export interface ScbaMaintenanceLog {
  id: string
  bottle_id: string
  maintenance_at: string
  maintenance_type: MaintenanceType
  result: MaintenanceResult | null
  performed_by_name: string | null
  vendor_name: string | null
  notes: string | null
  created_at: string
}

// ─── Fire School ─────────────────────────────────────────────────────────────
export interface FireSchoolBottle {
  id: string
  bottle_id: string
  department_name: string | null
  psi: number | null
  active: boolean
  cylinder_type: string | null
  manufacture_date: string | null
  last_requal_date: string | null
  requal_interval_years: number | null
  service_life_years: number | null
  requires_service_life: boolean | null
  status_reason: string | null
  created_at: string
  updated_at: string
}

export interface FireSchoolFillLog {
  id: string
  bottle_id: string
  fill_result: string
  notes: string | null
  filled_at: string
}
