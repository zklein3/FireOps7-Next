export const ICS_COMMAND_ROLES = [
  { value: 'ic', label: 'Incident Commander' },
  { value: 'safety_officer', label: 'Safety Officer' },
  { value: 'pio', label: 'Public Information Officer' },
  { value: 'liaison_officer', label: 'Liaison Officer' },
  { value: 'operations_chief', label: 'Operations Section Chief' },
  { value: 'planning_chief', label: 'Planning Section Chief' },
  { value: 'logistics_chief', label: 'Logistics Section Chief' },
  { value: 'finance_chief', label: 'Finance/Admin Section Chief' },
] as const

// Standard NIMS Medical Branch + Rescue Task Force positions used for
// Active Shooter/Hostile Event Response (ASHER) and other mass-casualty events.
// Only offered when a board is flagged as an active violence event.
export const ICS_ACTIVE_VIOLENCE_ROLES = [
  { value: 'rescue_task_force_leader', label: 'Rescue Task Force Leader' },
  { value: 'triage_officer', label: 'Triage Officer' },
  { value: 'treatment_officer', label: 'Treatment Officer' },
  { value: 'transportation_officer', label: 'Transportation Officer' },
] as const

// Lane profiles ensured (additively — existing lanes are never touched or removed)
// when a board is switched into each mode. Fire's own department defaults
// (`accountability_lane_templates`) are the baseline for a board with neither
// mode on — these only apply on top of whatever's already there.
export const ICS_MODE_LANES = ['Staging', 'Command']
export const ACTIVE_VIOLENCE_LANES = ['Staging', 'Command', 'Rescue Task Force', 'Triage', 'Treatment', 'Transport']

export const ALL_ICS_ROLES = [...ICS_COMMAND_ROLES, ...ICS_ACTIVE_VIOLENCE_ROLES]
export const ALL_ICS_ROLE_VALUES = ALL_ICS_ROLES.map(r => r.value)

export function icsRoleLabel(value: string | null): string | null {
  if (!value) return null
  return ALL_ICS_ROLES.find(r => r.value === value)?.label ?? value
}
