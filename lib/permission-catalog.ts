// Catalog of granular department permissions, plus the hardcoded starter role
// templates seeded into a department's own department_permission_groups table
// on first visit to /dept-admin/permission-groups. Same idiom as
// VEHICLE_CHECK_DEFAULTS (lib/vehicle-check-defaults.ts) and
// DEFAULT_ACCOUNTABILITY_LANES (lib/ics-roles.ts): a versioned, code-reviewed
// default that a department copies into its own row and then customizes
// independently. Deliberately not sys-admin-editable through any UI.
//
// legacyMinRole records what system_role tier each key behaves as TODAY, so
// lib/permissions.ts can derive a fallback for anyone with no permission
// group assigned (see legacySnapshot there) without a second, separately
// maintained mapping.

export interface PermissionCatalogEntry {
  key: string
  label: string
  category: string
  description?: string
  legacyMinRole: 'member' | 'officer' | 'admin'
}

export const PERMISSION_CATALOG: PermissionCatalogEntry[] = [
  // Department Administration — deliberately not "System Administration":
  // that phrase belongs to the platform-level sys-admin role (is_sys_admin),
  // which this feature has nothing to do with. Every key below is scoped to
  // one department.
  { key: 'manage_users', label: 'Manage Users', category: 'Department Administration', legacyMinRole: 'admin', description: 'Create and edit personnel within this department' },
  { key: 'manage_department_settings', label: 'Manage Department Settings', category: 'Department Administration', legacyMinRole: 'admin' },
  { key: 'post_update', label: 'Post Update', category: 'Department Administration', legacyMinRole: 'officer', description: 'Post announcements' },
  { key: 'moderate_announcements', label: 'Moderate Announcements', category: 'Department Administration', legacyMinRole: 'admin', description: 'Pin and delete any announcement' },
  { key: 'view_dashboards', label: 'View Dashboards', category: 'Department Administration', legacyMinRole: 'member' },
  { key: 'switch_station', label: 'Switch Station', category: 'Department Administration', legacyMinRole: 'member' },
  { key: 'unrestricted_transfer', label: 'Unrestricted Transfer', category: 'Department Administration', legacyMinRole: 'officer', description: 'Transfer equipment/apparatus across stations without restriction' },
  { key: 'access_dept_admin_hub', label: 'Access Dept Admin Hub', category: 'Department Administration', legacyMinRole: 'admin', description: 'View the Dept Admin hub page' },
  { key: 'manage_permission_groups', label: 'Manage Permission Groups', category: 'Department Administration', legacyMinRole: 'admin' },
  { key: 'manage_kiosk_devices', label: 'Manage Kiosk Devices', category: 'Department Administration', legacyMinRole: 'admin' },
  { key: 'manage_dept_setup', label: 'Manage Dept Setup', category: 'Department Administration', legacyMinRole: 'admin', description: 'Stations, apparatus, and equipment item setup wizard' },
  { key: 'manage_police_settings', label: 'Manage Police Settings', category: 'Department Administration', legacyMinRole: 'admin' },
  { key: 'access_officer_hub', label: 'Access Officer Hub', category: 'Department Administration', legacyMinRole: 'officer', description: 'View the Officer hub page' },
  { key: 'manage_pd_logs', label: 'Manage PD Logs', category: 'Department Administration', legacyMinRole: 'officer', description: 'Business checks and contact log entries' },

  // Personnel
  { key: 'add_personnel', label: 'Add Personnel', category: 'Personnel', legacyMinRole: 'officer', description: 'Add new members to the department roster' },
  { key: 'manage_personnel_roles', label: 'Manage Personnel Roles', category: 'Personnel', legacyMinRole: 'admin', description: 'Manage rank/title list' },
  { key: 'view_personnel_details', label: 'View Personnel Details', category: 'Personnel', legacyMinRole: 'officer' },
  { key: 'manage_attendance_settings', label: 'Manage Attendance Settings', category: 'Personnel', legacyMinRole: 'admin' },

  // Fleet
  { key: 'manage_apparatus', label: 'Manage Apparatus', category: 'Fleet', legacyMinRole: 'admin' },
  { key: 'perform_apparatus_check', label: 'Perform Apparatus Check', category: 'Fleet', legacyMinRole: 'member' },
  { key: 'change_apparatus_service_status', label: 'Change Apparatus Service Status', category: 'Fleet', legacyMinRole: 'officer' },
  { key: 'delete_completed_check_reports', label: 'Delete Completed Check Reports', category: 'Fleet', legacyMinRole: 'admin' },
  { key: 'manage_service_task', label: 'Manage Service Task', category: 'Fleet', legacyMinRole: 'officer' },
  { key: 'transfer_equipment', label: 'Transfer Equipment', category: 'Fleet', legacyMinRole: 'officer' },
  { key: 'manage_fuel_storage', label: 'Manage Fuel Storage', category: 'Fleet', legacyMinRole: 'admin' },
  { key: 'manage_inspection_settings', label: 'Manage Inspection Settings', category: 'Fleet', legacyMinRole: 'admin', description: 'Vehicle check items and inspection session settings' },
  { key: 'manage_inspection_sessions', label: 'Manage Inspection Sessions', category: 'Fleet', legacyMinRole: 'officer', description: 'Close, delete, and reconcile live inspection sessions' },
  { key: 'manage_fuel_log', label: 'Manage Fuel Log', category: 'Fleet', legacyMinRole: 'officer', description: 'Log and edit apparatus fuel entries' },

  // Equipment
  { key: 'manage_equipment_standard', label: 'Manage Standard Equipment', category: 'Equipment', legacyMinRole: 'admin' },
  { key: 'manage_equipment_ppe', label: 'Manage PPE Equipment', category: 'Equipment', legacyMinRole: 'admin' },
  { key: 'perform_standard_equipment_inspection', label: 'Perform Standard Equipment Inspection', category: 'Equipment', legacyMinRole: 'member' },
  { key: 'perform_ppe_inspection', label: 'Perform PPE Inspection', category: 'Equipment', legacyMinRole: 'member' },
  { key: 'manage_inventory', label: 'Manage Inventory', category: 'Equipment', legacyMinRole: 'officer' },

  // Training
  { key: 'manage_training_programs', label: 'Manage Training Programs', category: 'Training', legacyMinRole: 'admin' },
  { key: 'record_training_completion', label: 'Record Training Completion', category: 'Training', legacyMinRole: 'officer' },

  // Events / Attendance
  { key: 'manage_events', label: 'Manage Events', category: 'Events / Attendance', legacyMinRole: 'officer' },
  { key: 'delete_events', label: 'Delete Events', category: 'Events / Attendance', legacyMinRole: 'admin' },
  { key: 'approve_attendance', label: 'Approve Attendance', category: 'Events / Attendance', legacyMinRole: 'officer' },

  // Operations / Incidents
  { key: 'manage_incidents', label: 'Manage Incidents', category: 'Operations / Incidents', legacyMinRole: 'officer' },
  { key: 'submit_neris', label: 'Submit NERIS', category: 'Operations / Incidents', legacyMinRole: 'admin' },

  // Accountability / ICS
  { key: 'manage_accountability_boards', label: 'Manage Accountability Boards', category: 'Accountability / ICS', legacyMinRole: 'officer' },
  { key: 'manage_accountability_lanes', label: 'Manage Accountability Lanes', category: 'Accountability / ICS', legacyMinRole: 'admin' },
  { key: 'manage_ics_defaults', label: 'Manage ICS Defaults', category: 'Accountability / ICS', legacyMinRole: 'admin' },
  { key: 'close_ics_packets', label: 'Close ICS Packets', category: 'Accountability / ICS', legacyMinRole: 'officer' },
  { key: 'manage_ics_incidents', label: 'Manage ICS Incidents', category: 'Accountability / ICS', legacyMinRole: 'officer', description: 'Create ICS incidents, add/close participants, transfer command, open operational periods' },
  { key: 'delete_ics_incidents', label: 'Delete ICS Incidents', category: 'Accountability / ICS', legacyMinRole: 'admin' },
  { key: 'delete_accountability_boards', label: 'Delete Accountability Boards', category: 'Accountability / ICS', legacyMinRole: 'admin' },

  // ISO
  { key: 'manage_iso_data', label: 'Manage ISO Data', category: 'ISO', legacyMinRole: 'admin', description: 'Audit-ready ISO report settings' },
  { key: 'perform_iso_testing', label: 'Perform ISO Testing', category: 'ISO', legacyMinRole: 'officer', description: 'Hose/hydrant testing, mutual aid, and preplan data entry' },

  // Medical
  { key: 'manage_medical_inventory', label: 'Manage Medical Inventory', category: 'Medical', legacyMinRole: 'officer' },
  { key: 'dispense_controlled_substances', label: 'Dispense Controlled Substances', category: 'Medical', legacyMinRole: 'member' },
  { key: 'manage_medical_supply_setup', label: 'Manage Medical Supply Setup', category: 'Medical', legacyMinRole: 'admin', description: 'Supply types, storerooms, and medical inventory setup' },

  // Public Site / Inbox
  { key: 'manage_public_site', label: 'Manage Public Site', category: 'Public Site / Inbox', legacyMinRole: 'admin' },
  { key: 'manage_public_inbox', label: 'Manage Public Inbox', category: 'Public Site / Inbox', legacyMinRole: 'officer' },
  { key: 'review_burn_permits', label: 'Review Burn Permits', category: 'Public Site / Inbox', legacyMinRole: 'officer' },
]

export type PermissionKey = typeof PERMISSION_CATALOG[number]['key']

export const PERMISSION_CATEGORIES = [...new Set(PERMISSION_CATALOG.map(e => e.category))]

function allWithMinRole(...roles: Array<'member' | 'officer' | 'admin'>): Record<string, boolean> {
  return Object.fromEntries(PERMISSION_CATALOG.map(e => [e.key, roles.includes(e.legacyMinRole)]))
}

export interface PermissionTemplateDefault {
  key: string
  name: string
  description?: string
  permissions: Record<string, boolean>
}

// Hardcoded starter roles, lazily seeded into a department's own
// department_permission_groups on first visit — see ensurePermissionGroups
// in app/actions/permissions.ts. Editing these is a code change, not a
// runtime admin action for anyone, sys admin included.
export const DEFAULT_PERMISSION_TEMPLATES: PermissionTemplateDefault[] = [
  {
    key: 'chief',
    name: 'Chief',
    description: 'Full access to every department capability.',
    permissions: allWithMinRole('member', 'officer', 'admin'),
  },
  {
    key: 'officer',
    name: 'Officer',
    description: 'Officer-level access plus everything members can do.',
    permissions: allWithMinRole('member', 'officer'),
  },
  {
    key: 'firefighter',
    name: 'Firefighter',
    description: 'Baseline member-level access.',
    permissions: allWithMinRole('member'),
  },
]
