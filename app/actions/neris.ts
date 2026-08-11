'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import { logError } from '@/lib/logger'
import { revalidatePath } from 'next/cache'
import { nerisValidateIncident, nerisSubmitIncident } from '@/lib/neris-api'
import { NERIS_ACTIONS_TAKEN, NERIS_PROPERTY_USE, NERIS_MEDICAL_DISPOSITION, NERIS_INCIDENT_TYPES } from '@/lib/neris-value-sets'

// Build leaf→full-code maps from value sets so old flat codes stored in DB
// (before parent-prefix was added) are upgraded transparently at payload time.
type NerisGroup = { group: string; codes: { code: string }[] }
function buildLeafMap(groups: NerisGroup[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const g of groups) {
    for (const item of g.codes) {
      const leaf = item.code.includes('||') ? item.code.split('||').pop()! : item.code
      if (!m.has(leaf)) m.set(leaf, item.code)
    }
  }
  return m
}
const actionsLeafMap = buildLeafMap(NERIS_ACTIONS_TAKEN as NerisGroup[])
const propertyUseLeafMap = buildLeafMap(NERIS_PROPERTY_USE as NerisGroup[])
const incidentTypesLeafMap = buildLeafMap(NERIS_INCIDENT_TYPES as NerisGroup[])

// Leaf codes that exist in multiple NERIS incident type groups — can't auto-resolve.
// User must re-select from the form so the full code is stored.
function buildAmbiguousLeafs(groups: NerisGroup[]): Set<string> {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const g of groups) {
    for (const item of g.codes) {
      const leaf = item.code.includes('||') ? item.code.split('||').pop()! : item.code
      if (seen.has(leaf)) dupes.add(leaf)
      else seen.add(leaf)
    }
  }
  return dupes
}
const ambiguousIncidentTypeLeafs = buildAmbiguousLeafs(NERIS_INCIDENT_TYPES as NerisGroup[])
function upgradeCode(code: string, map: Map<string, string>): string {
  if (!code || code.includes('||')) return code
  return map.get(code) ?? code
}
// Legacy actions_taken codes renamed or removed in NERIS API update.
// null = drop the code entirely (e.g. mutual aid is a separate NERIS field, not an action).
const LEGACY_ACTIONS: Record<string, string | null> = {
  INCIDENT_COMMAND:     'COMMAND_AND_CONTROL||ESTABLISH_INCIDENT_COMMAND',
  BLS_CARE:             'EMERGENCY_MEDICAL_CARE||PROVIDE_BASIC_LIFE_SUPPORT',
  ALS_CARE:             'EMERGENCY_MEDICAL_CARE||PROVIDE_ADVANCED_LIFE_SUPPORT',
  MUTUAL_AID_RECEIVED:  null,
  MUTUAL_AID_GIVEN:     null,
}
function upgradeAction(code: string): string | null {
  if (!code) return null
  if (code.includes('||')) return code
  if (Object.prototype.hasOwnProperty.call(LEGACY_ACTIONS, code)) return LEGACY_ACTIONS[code]
  return actionsLeafMap.get(code) ?? code
}
// Legacy transport_disposition values replaced in NERIS API update
const LEGACY_TRANSPORT: Record<string, string> = {
  NO_TREATMENT_REQUIRED: 'NO_TRANSPORT',
  TREATED_RELEASED: 'NO_TRANSPORT',
  TRANSPORTED_BLS: 'TRANSPORT_BY_EMS_UNIT',
  TRANSPORTED_ALS: 'TRANSPORT_BY_EMS_UNIT',
  PATIENT_REFUSED: 'PATIENT_REFUSED_TRANSPORT',
  MUTUAL_AID_TRANSPORT: 'OTHER_AGENCY_TRANSPORT',
}
const validTransportCodes = new Set(NERIS_MEDICAL_DISPOSITION.map((c: { code: string }) => c.code))
function upgradeTransport(code: string): string {
  if (!code) return code
  if (validTransportCodes.has(code)) return code
  return LEGACY_TRANSPORT[code] ?? code
}

async function getContext() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx) return null
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return {
    me: { id: ctx.personnelId, is_sys_admin: ctx.isSysAdmin },
    user_id: user?.id ?? null,
    department_id: ctx.departmentId,
    system_role: ctx.systemRole,
    isOfficerOrAbove: await hasPermission(ctx, 'manage_incidents'),
    isAdmin: await hasPermission(ctx, 'submit_neris'),
  }
}


// ─── Save NERIS report (upsert) ───────────────────────────────────────────────
export async function saveNerisReport(incident_id: string, data: {
  neris_incident_type?: string | null
  property_use?: string | null
  property_normal_use?: string | null
  neris_narrative?: string | null
  impediment_narrative?: string | null
  actions_taken?: string[]
  no_action_reason?: string | null
  displaced_persons?: number | null
  outside_fire_acres?: number | null
  fire_condition_arrival?: string | null
  building_damage?: string | null
  suppression_appliance?: string[]
  floor_of_origin?: number | null
  room_of_origin?: string | null
  smoke_alarm?: string | null
  fire_alarm?: string | null
  other_alarm?: string | null
  fire_suppression_system?: string | null
  water_supply?: string | null
  investigation_needed?: string | null
  investigation_types?: string[]
  fire_cause_code?: string | null
  involves_mutual_aid?: boolean
  aid_call_time?: string | null
  aid_on_scene_at?: string | null
  aid_in_service_at?: string | null
  aid_type?: string | null
  aid_direction?: string | null
  // Unified persons — rescue + medical per person
  incident_persons?: {
    person_type: string; rescue_performed_by: string; rescue_mode: string;
    rescue_actions: string[]; rescue_impediments: string[]; presence_known: string;
    entrapped: boolean; vehicle_type: string; safety_device: string;
    casualty_type: string; casualty_cause: string;
    evaluation_care: string; improved_status: string; disposition: string
  }[] | null
  // Hazmat module
  hazsit_disposition?: string | null
  hazsit_evacuated?: number | null
  chemical_name?: string | null
  chemical_dot_class?: string | null
  chemical_release_occurred?: boolean | null
  vehicles_involved?: number | null
}) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can save NERIS reports.' }
  const department_id = ctx.department_id
  if (!department_id) return { error: 'Department not found.' }
  const adminClient = createAdminClient()

  const { data: existing } = await adminClient
    .from('incident_neris')
    .select('id, neris_status')
    .eq('incident_id', incident_id)
  const record = existing?.[0]

  if (record?.neris_status === 'submitted') {
    return { error: 'This report has already been submitted to NERIS and cannot be edited.' }
  }

  const payload = {
    ...data,
    updated_at: new Date().toISOString(),
  }

  let dbErr
  if (record) {
    const { error } = await adminClient
      .from('incident_neris')
      .update(payload)
      .eq('id', record.id)
    dbErr = error
  } else {
    const { error } = await adminClient
      .from('incident_neris')
      .insert({ incident_id, department_id, neris_status: 'draft', ...payload })
    dbErr = error
  }

  if (dbErr) { await logError(dbErr.message, '/incidents/neris'); return { error: dbErr.message } }
  revalidatePath(`/incidents/${incident_id}`)
  revalidatePath(`/incidents/${incident_id}/neris`)
  return { success: true }
}

// ─── Save response mode per apparatus ────────────────────────────────────────
export async function saveApparatusResponseMode(
  apparatus_incident_id: string,
  response_mode: string,
  staffing_count?: number | null,
  notes?: string | null,
) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can set response mode.' }
  const adminClient = createAdminClient()
  const updates: Record<string, string | number | null> = { response_mode: response_mode || null }
  if (staffing_count !== undefined) updates.staffing_count = staffing_count
  if (notes !== undefined) updates.notes = notes || null
  const { error: dbErr } = await adminClient
    .from('incident_apparatus')
    .update(updates)
    .eq('id', apparatus_incident_id)
  if (dbErr) { await logError(dbErr.message, '/incidents/neris'); return { error: dbErr.message } }
  return { success: true }
}

// ─── Reopen report for editing ───────────────────────────────────────────────
export async function reopenNerisReport(incident_id: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can reopen NERIS reports.' }
  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient
    .from('incident_neris')
    .update({ completed_by: null, completed_at: null, updated_at: new Date().toISOString() })
    .eq('incident_id', incident_id)
  if (dbErr) { await logError(dbErr.message, '/incidents/neris'); return { error: dbErr.message } }
  revalidatePath(`/incidents/${incident_id}`)
  revalidatePath(`/incidents/${incident_id}/neris`)
  return { success: true }
}

// Get state from incident — uses dedicated state field, falls back to parsing address for old records.
function getIncidentState(incident: any): string | null {
  if (incident.state) return incident.state
  if (!incident.address) return null
  const withZip = incident.address.match(/,\s*([A-Z]{2})\s+\d{5}/)
  if (withZip) return withZip[1]
  const withoutZip = incident.address.match(/,\s*([A-Z]{2})\s*$/)
  return withoutZip?.[1] ?? null
}

// ─── Shared payload builder — used by both preview and submit ─────────────────
// Payload structure confirmed against live NERIS test API during badge test (2026-05-13).
// locations module field names confirmed from openapi.json (2026-05-15):
//   base.location = { state, street, postal_code }
//   base.location_use.use_type = property use code (pipe-delimited e.g. "RESIDENTIAL||...")
//   base.displacement_count = integer
// Module field names (fire/medical/hazmat/rescue) still need verification.
function buildNerisPayload(
  incident: any,
  neris: any,
  apparatus: any[],
  personnelByApparatus: Map<string, number>,
  unitNumberMap: Record<string, string>,
  nerisEntityId: string,
): Record<string, unknown> {
  const state = getIncidentState(incident)

  // Build location object — include address components if available
  const location: Record<string, unknown> = {}
  if (state) location.state = state
  if (incident.address) location.street = incident.address
  if (incident.zip) location.postal_code = incident.zip

  // Build base object
  const base: Record<string, unknown> = {
    department_neris_id: nerisEntityId,
    incident_number: incident.incident_number ?? incident.id,
    location,
  }

  // ── Locations module (confirmed 2026-05-15) ──────────────────────────────
  if (neris?.property_use) {
    base.location_use = { use_type: upgradeCode(neris.property_use, propertyUseLeafMap) }
  }
  if (neris?.displaced_persons != null && neris.displaced_persons > 0) {
    base.displacement_count = neris.displaced_persons
  }

  const payload: Record<string, unknown> = {
    base,
    dispatch: {
      internal_id: incident.incident_number ?? incident.id,
      call_create: incident.call_time ?? `${incident.incident_date}T00:00:00Z`,
      call_answered: incident.call_time ?? `${incident.incident_date}T00:00:00Z`,
      call_arrival: incident.call_time ?? `${incident.incident_date}T00:00:00Z`,
      location,
      // TODO(api-review): verify unit_response timing field names against NERIS openapi.json
      unit_responses: apparatus.map((a: any) => ({
        reported_id_unit: unitNumberMap[a.apparatus_id] ?? a.apparatus_id,
      })),
    },
    incident_types: neris.neris_incident_type
      ? [{ type: upgradeCode(neris.neris_incident_type, incidentTypesLeafMap) }]
      : [],
  }

  // Actions taken — action_noaction is a discriminated union on 'type'
  if (neris.actions_taken?.length > 0) {
    payload.actions_tactics = {
      action_noaction: {
        type: 'ACTION',
        actions: (neris.actions_taken as string[]).map(upgradeAction).filter((a): a is string => a !== null),
      },
    }
  } else if (neris.no_action_reason) {
    payload.actions_tactics = {
      action_noaction: {
        type: 'NOACTION',
        // Field confirmed against live openapi.json 2026-07-30 — NERIS calls this
        // noaction_type, not "reason", and it's a closed enum (CANCELLED /
        // NO_INCIDENT_FOUND / STAGED_STANDBY), not free text. The UI now only
        // lets an officer pick one of those three, so this value is always valid.
        noaction_type: neris.no_action_reason,
      },
    }
  }

  // ── Fire module ──────────────────────────────────────────────────────────────
  // location_detail is discriminated by type: "STRUCTURE", "OUTSIDE", or "VEHICLE"
  const incidentTypeStr: string = neris?.neris_incident_type ?? ''
  const isFire = incidentTypeStr.startsWith('FIRE') || incident?.incident_type === 'fire'
  if (isFire) {
    const outsideSubtypes = ['grass', 'wildland', 'other_fire']
    const isOutside = incidentTypeStr.includes('OUTSIDE_FIRE') ||
      outsideSubtypes.includes(incident?.fire_subtype ?? '')
    const isTransportationFire = incidentTypeStr.includes('TRANSPORTATION_FIRE') ||
      (incident?.fire_subtype === 'vehicle' && !incidentTypeStr)

    const locationDetail: Record<string, unknown> = {
      type: (isOutside || isTransportationFire) ? 'OUTSIDE' : 'STRUCTURE',
    }

    if (isOutside) {
      if (neris?.fire_cause_code) locationDetail.cause = neris.fire_cause_code
      if (neris?.outside_fire_acres != null) locationDetail.acres_burned = neris.outside_fire_acres
    } else if (isTransportationFire) {
      if (neris?.fire_cause_code) locationDetail.cause = neris.fire_cause_code
    } else {
      if (neris?.fire_condition_arrival) locationDetail.arrival_condition = neris.fire_condition_arrival
      if (neris?.building_damage) locationDetail.damage_type = neris.building_damage
      if (neris?.fire_cause_code) locationDetail.cause = neris.fire_cause_code
      if (neris?.floor_of_origin != null) locationDetail.floor_of_origin = neris.floor_of_origin
      if (neris?.room_of_origin) locationDetail.room_of_origin_type = neris.room_of_origin
    }

    const fireDetail: Record<string, unknown> = {
      location_detail: locationDetail,
    }

    if (neris?.suppression_appliance?.length > 0) {
      fireDetail.suppression_appliances = neris.suppression_appliance
    }
    if (!isTransportationFire) {
      if (neris?.smoke_alarm) payload.smoke_alarm = { presence: { type: neris.smoke_alarm } }
      if (neris?.fire_alarm) payload.fire_alarm = { presence: { type: neris.fire_alarm } }
      if (neris?.other_alarm) payload.other_alarm = { presence: { type: neris.other_alarm } }
      if (neris?.fire_suppression_system) payload.fire_suppression = { presence: { type: neris.fire_suppression_system } }
    }
    if (neris?.water_supply) fireDetail.water_supply = neris.water_supply
    fireDetail.investigation_needed = neris?.investigation_needed || 'NO'
    fireDetail.investigation_types = neris?.investigation_types ?? []

    payload.fire_detail = fireDetail
  }

  // ── Narrative fields (confirmed 2026-05-15) ──────────────────────────────────
  // outcome_narrative = NERIS-specific narrative, falls back to cover sheet narrative
  // impediment_narrative = optional obstacles field
  const outcomeNarrative = neris?.neris_narrative || incident?.narrative || null
  if (outcomeNarrative) base.outcome_narrative = outcomeNarrative
  if (neris?.impediment_narrative) base.impediment_narrative = neris.impediment_narrative

  // TODO(api-review): unit_responses timing — enroute_at/on_scene_at field names unverified

  // ── Rescue module (CasualtyRescuePayload per person) ────────────────────────
  const FF_RESCUE_TYPES = new Set(['RESCUED_BY_FIREFIGHTER', 'RESCUED_BY_FF_RIT', 'EVAC_ASSISTED_BY_FIREFIGHTER'])
  const persons = neris?.incident_persons ?? []

  const casualties = persons.filter((p: any) => p.record_type === 'casualty' || (!p.record_type && (p.rescue_performed_by || p.casualty_type) && !p.evaluation_care))
  const rescuePersons = casualties.filter((p: any) =>
    p.rescue_performed_by && p.rescue_performed_by !== 'NO_RESCUE_NEEDED'
  )
  if (rescuePersons.length > 0) {
    payload.casualty_rescues = rescuePersons.map((p: any) => {
      const isFfRescue = FF_RESCUE_TYPES.has(p.rescue_performed_by)

      // Build rescue sub-object
      let ffrescue_or_nonffrescue: Record<string, unknown>
      if (isFfRescue) {
        // RemovalPayload for REMOVAL_FROM_STRUCTURE, NonremovalPayload for everything else
        const removalOrNon = p.rescue_mode === 'REMOVAL_FROM_STRUCTURE'
          ? { type: 'REMOVAL_FROM_STRUCTURE' }
          : { type: p.rescue_mode || 'OTHER' }

        ffrescue_or_nonffrescue = {
          type: p.rescue_performed_by,
          removal_or_nonremoval: removalOrNon,
          ...(p.rescue_actions?.length > 0 && { actions: p.rescue_actions }),
          ...(p.rescue_impediments?.length > 0 && { impediments: p.rescue_impediments }),
        }
      } else {
        ffrescue_or_nonffrescue = { type: p.rescue_performed_by }
      }

      const rescue: Record<string, unknown> = { ffrescue_or_nonffrescue }
      if (p.person_type === 'NONFF' && p.presence_known) rescue.presence_known = { type: p.presence_known }

      // Build casualty sub-object
      let casualty: Record<string, unknown> | undefined
      if (p.casualty_type) {
        casualty = {
          injury_or_noninjury: { type: p.casualty_type },
        }
      }

      const person: Record<string, unknown> = {
        type: p.person_type || 'NONFF',
        rescue,
        ...(casualty && { casualty }),
      }

      if (p.person_type === 'FF' && p.rescue_performed_by === 'RESCUED_BY_FF_RIT') {
        rescue.mayday = { mayday: true }
      }

      return person
    })
  }

  // ── Medical module (MedicalPayload per person) ───────────────────────────────
  const medicalPersons = persons.filter((p: any) => p.record_type === 'patient' || (!p.record_type && p.evaluation_care))
  if (medicalPersons.length > 0) {
    payload.medical_details = medicalPersons.map((p: any) => {
      const patient: Record<string, unknown> = {
        patient_care_evaluation: p.evaluation_care,
      }
      if (p.improved_status) patient.patient_status = p.improved_status
      if (p.disposition) patient.transport_disposition = upgradeTransport(p.disposition)
      return patient
    })
  }

  // ── Hazmat module (HazsitPayload) ─────────────────────────────────────────────
  // TODO(api-review): hazsit sub-field names need verification against spec
  if (neris?.hazsit_disposition) {
    const hazmat: Record<string, unknown> = {
      hazsit_disposition: neris.hazsit_disposition,
    }
    if (neris?.hazsit_evacuated != null) hazmat.evacuated_count = neris.hazsit_evacuated
    if (neris?.chemical_name) hazmat.chemical_name = neris.chemical_name
    if (neris?.chemical_dot_class) hazmat.dot_class = neris.chemical_dot_class
    if (neris?.chemical_release_occurred != null) hazmat.release_occurred = neris.chemical_release_occurred
    if (neris?.vehicles_involved != null) hazmat.vehicles_involved = neris.vehicles_involved
    payload.hazsit_detail = hazmat
  }

  return payload
}

// ─── Preview payload (no submission) ─────────────────────────────────────────
export async function previewNerisPayload(incident_id: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can preview the NERIS payload.' }
  const department_id = ctx.department_id
  if (!department_id) return { error: 'Department not found.' }
  const adminClient = createAdminClient()

  const { data: incList } = await adminClient.from('incidents').select('*').eq('id', incident_id).eq('department_id', department_id)
  const incident = incList?.[0]
  if (!incident) return { error: 'Incident not found.' }

  const { data: nerisList } = await adminClient.from('incident_neris').select('*').eq('incident_id', incident_id)
  const neris = nerisList?.[0] ?? {}

  let { data: apparatus, error: apparatusError } = await adminClient
    .from('incident_apparatus')
    .select('id, apparatus_id, role, response_mode, staffing_count, notes, paged_at, on_scene_at, leaving_scene_at, available_at')
    .eq('incident_id', incident_id)
  if (apparatusError) {
    const fallback = await adminClient.from('incident_apparatus').select('id, apparatus_id, role, paged_at, on_scene_at, leaving_scene_at, available_at').eq('incident_id', incident_id)
    apparatus = (fallback.data ?? []).map((a: any) => ({ ...a, response_mode: null, staffing_count: null }))
  }

  const apparatusIds = (apparatus ?? []).map((a: any) => a.apparatus_id).filter(Boolean)
  const { data: apparatusPersonnel } = apparatusIds.length > 0
    ? await adminClient.from('incident_personnel').select('apparatus_id, status').eq('incident_id', incident_id).in('apparatus_id', apparatusIds)
    : { data: [] }
  const personnelByApparatus = new Map<string, number>()
  for (const row of apparatusPersonnel ?? []) {
    if (!row.apparatus_id || row.status === 'absent') continue
    personnelByApparatus.set(row.apparatus_id, (personnelByApparatus.get(row.apparatus_id) ?? 0) + 1)
  }
  const { data: apparatusNames } = apparatusIds.length > 0
    ? await adminClient.from('apparatus').select('id, unit_number').in('id', apparatusIds)
    : { data: [] }
  const unitNumberMap = Object.fromEntries((apparatusNames ?? []).map((a: any) => [a.id, a.unit_number]))

  const { data: deptList } = await adminClient.from('departments').select('neris_entity_id').eq('id', department_id)
  const nerisEntityId = deptList?.[0]?.neris_entity_id ?? 'PREVIEW'

  const payload = buildNerisPayload(incident, neris, apparatus ?? [], personnelByApparatus, unitNumberMap, nerisEntityId)
  return { payload }
}

// ─── Submit report to NERIS API ───────────────────────────────────────────────
export async function submitToNeris(incident_id: string) {
  const ctx = await getContext()
  if (!ctx?.isAdmin) return { error: 'Only admins can submit to NERIS.' }
  const department_id = ctx.department_id
  if (!department_id) return { error: 'Department not found.' }
  const adminClient = createAdminClient()

  // Fetch department's NERIS entity ID
  const { data: deptList } = await adminClient
    .from('departments')
    .select('neris_entity_id')
    .eq('id', department_id)
  const nerisEntityId = deptList?.[0]?.neris_entity_id
  if (!nerisEntityId) return { error: 'This department does not have a NERIS entity ID configured. Contact your system administrator.' }

  // Fetch incident
  const { data: incList } = await adminClient
    .from('incidents')
    .select('*')
    .eq('id', incident_id)
    .eq('department_id', department_id)
  const incident = incList?.[0]
  if (!incident) return { error: 'Incident not found.' }

  // Fetch NERIS record
  const { data: nerisList } = await adminClient
    .from('incident_neris')
    .select('*')
    .eq('incident_id', incident_id)
  const neris = nerisList?.[0]
  if (!neris) return { error: 'NERIS report not found. Save the report first.' }
  if (neris.neris_status === 'submitted') return { error: 'Already submitted to NERIS.' }
  if (!neris.completed_at) return { error: 'Mark the report as ready before submitting.' }
  if (!neris.neris_incident_type) return { error: 'NERIS incident type is required before submitting.' }
  if (!neris.neris_incident_type.includes('||') && ambiguousIncidentTypeLeafs.has(neris.neris_incident_type)) {
    const msg = `NERIS submit blocked — ambiguous incident type "${neris.neris_incident_type}" matches multiple categories. Re-select from the form dropdown.`
    await logError(msg, '/incidents/neris/validate', { department_id: department_id ?? undefined, metadata: { incident_id } })
    return { error: `The incident type "${neris.neris_incident_type}" matches multiple NERIS categories. Open the NERIS report, re-select the correct incident type from the dropdown (choose the specific category — e.g. Medical / Injury or Hazardous Non-Chemical), save, then submit.` }
  }
  if (!getIncidentState(incident)) return { error: 'Incident must have a State set before submitting to NERIS. Edit the incident and fill in the City, State, and Zip fields.' }

  // Fetch apparatus
  let { data: apparatus, error: apparatusError } = await adminClient
    .from('incident_apparatus')
    .select('id, apparatus_id, role, response_mode, staffing_count, notes, paged_at, on_scene_at, leaving_scene_at, available_at')
    .eq('incident_id', incident_id)
  if (apparatusError) {
    const fallback = await adminClient
      .from('incident_apparatus')
      .select('id, apparatus_id, role, paged_at, on_scene_at, leaving_scene_at, available_at')
      .eq('incident_id', incident_id)

    apparatus = (fallback.data ?? []).map((a: any) => ({
      ...a,
      response_mode: null,
      staffing_count: null,
    }))
  }
  const apparatusIds = (apparatus ?? []).map((a: any) => a.apparatus_id).filter(Boolean)
  const { data: apparatusPersonnel } = apparatusIds.length > 0
    ? await adminClient
      .from('incident_personnel')
      .select('apparatus_id, status')
      .eq('incident_id', incident_id)
      .in('apparatus_id', apparatusIds)
    : { data: [] }
  const personnelByApparatus = new Map<string, number>()
  for (const row of apparatusPersonnel ?? []) {
    if (!row.apparatus_id || row.status === 'absent') continue
    personnelByApparatus.set(row.apparatus_id, (personnelByApparatus.get(row.apparatus_id) ?? 0) + 1)
  }
  const { data: apparatusNames } = apparatusIds.length > 0
    ? await adminClient.from('apparatus').select('id, unit_number').in('id', apparatusIds)
    : { data: [] }
  const unitNumberMap = Object.fromEntries((apparatusNames ?? []).map((a: any) => [a.id, a.unit_number]))

  // Fetch mutual aid
  const { data: mutualAid } = await adminClient
    .from('incident_mutual_aid')
    .select('*')
    .eq('incident_id', incident_id)

  const payload = buildNerisPayload(incident, neris, apparatus ?? [], personnelByApparatus, unitNumberMap, nerisEntityId)

  // Validate first
  let validation: { ok: boolean; error?: string }
  try {
    validation = await nerisValidateIncident(nerisEntityId, payload)
  } catch (err: any) {
    await logError(err.message, '/incidents/neris/validate', { metadata: { incident_id } })
    return { error: `NERIS connection failed: ${err.message}` }
  }
  if (!validation.ok) {
    await Promise.all([
      adminClient.from('incident_neris').update({
        neris_status: 'error',
        neris_last_error: `Validation failed: ${validation.error}`,
        updated_at: new Date().toISOString(),
      }).eq('incident_id', incident_id),
      logError(`NERIS validation failed: ${validation.error}`, '/incidents/neris/validate', { metadata: { incident_id } }),
    ])
    return { error: `NERIS validation failed: ${validation.error}` }
  }

  // Submit
  let nerisId: string
  try {
    const result = await nerisSubmitIncident(nerisEntityId, payload)
    nerisId = result.neris_id
  } catch (err: any) {
    await logError(err.message, '/incidents/neris/submit', { metadata: { incident_id } })
    await adminClient.from('incident_neris').update({
      neris_status: 'error',
      neris_last_error: err.message,
      updated_at: new Date().toISOString(),
    }).eq('incident_id', incident_id)
    return { error: err.message }
  }

  // Update local record
  const { error: dbErr } = await adminClient
    .from('incident_neris')
    .update({
      neris_status: 'submitted',
      neris_submission_id: nerisId,
      neris_submitted_at: new Date().toISOString(),
      neris_last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('incident_id', incident_id)
  if (dbErr) { await logError(dbErr.message, '/incidents/neris/submit', { metadata: { incident_id } }); return { error: dbErr.message } }

  // Submission succeeded — auto-resolve any earlier NERIS error logs tied to this incident
  // so the sys-admin Error Logs list doesn't keep flagging a problem that's now fixed.
  await adminClient.from('system_logs')
    .update({ resolved: true })
    .eq('resolved', false)
    .ilike('page', '%neris%')
    .contains('metadata', { incident_id })

  await adminClient.from('incidents').update({ neris_reported: true, status: 'finalized' }).eq('id', incident_id)

  // Create signature requests for all non-absent personnel on this incident
  const { data: sigPersonnel } = await adminClient
    .from('incident_personnel')
    .select('personnel_id')
    .eq('incident_id', incident_id)
    .neq('status', 'absent')
    .not('personnel_id', 'is', null)
  if (sigPersonnel && sigPersonnel.length > 0) {
    await adminClient.from('incident_signatures').upsert(
      sigPersonnel.map((p: any) => ({ incident_id, personnel_id: p.personnel_id, department_id })),
      { onConflict: 'incident_id,personnel_id', ignoreDuplicates: true }
    )
  }

  revalidatePath(`/incidents/${incident_id}`)
  revalidatePath(`/incidents/${incident_id}/neris`)
  return { success: true, neris_id: nerisId }
}

// ─── Mark report complete ─────────────────────────────────────────────────────
export async function markNerisComplete(incident_id: string) {
  const ctx = await getContext()
  if (!ctx?.isOfficerOrAbove) return { error: 'Only officers and admins can complete NERIS reports.' }
  const adminClient = createAdminClient()
  const { error: dbErr } = await adminClient
    .from('incident_neris')
    .update({
      neris_status: 'draft',
      completed_by: ctx.user_id,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('incident_id', incident_id)
  if (dbErr) { await logError(dbErr.message, '/incidents/neris'); return { error: dbErr.message } }
  revalidatePath(`/incidents/${incident_id}`)
  revalidatePath(`/incidents/${incident_id}/neris`)
  return { success: true }
}
