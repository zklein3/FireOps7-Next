// Shared resource "kind" vocabulary — usable across fire, police, and EM, unlike
// apparatus_types (a department's own fire inventory categorization, no NIMS tiering).
// A resource on the live board or an ICS 204 line is Kind + optional Type tier
// (I-IV, NIMS capability rating) — "Other" falls back to free text.
export const RESOURCE_KINDS = [
  'Engine',
  'Truck / Aerial',
  'Tender / Tanker',
  'Brush / Wildland',
  'Rescue',
  'Ambulance / Medic',
  'Battalion / Command Vehicle',
  'Patrol Unit',
  'K9 Unit',
  'SWAT / Tactical',
  'Helicopter / Air Unit',
  'Dozer / Heavy Equipment',
  'Shelter / Support',
] as const

export const RESOURCE_TYPE_TIERS = ['I', 'II', 'III', 'IV'] as const
