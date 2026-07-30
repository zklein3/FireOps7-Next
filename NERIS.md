# NERIS Compliance Reference

**Current build status:** UNBLOCKED. Auth confirmed as OAuth2 client_credentials (2026-05-13, Conor Brady). Generate `client_id` + `client_secret` under the "Integrations" tab in NERIS web app. See knowledge base: https://neris.fsri.org/articles#integrations

**Compatibility Badge Criteria (confirmed by FSRI):**
1. `POST /incident` → 200-series response
2. `PUT` or `PATCH /incident` on a previously POSTed incident → 200-series response
3. `PUT` or `PATCH /entity` to update an entity record → 200-series response
4. `POST /entity` to create a station, OR `POST /entity` to create a unit for a station → 200-series response

All 4 must use **OAuth2 client_credentials** auth — this is required for production enrollment.

**Source:** https://github.com/ulfsri/neris-framework
**API (Production):** https://api.neris.fsri.org/v1 — Swagger: /docs | Redoc: /redoc
**API (Test):** https://api-test.neris.fsri.org/v1
**Helpdesk:** https://neris.atlassian.net/servicedesk/customer/portals

---

## What NERIS Is

NERIS (National Emergency Response Information System) is replacing NFIRS as the national fire incident reporting standard. Departments submit incident data via REST API. Third-party software like FireOps7 can integrate directly. Most fields are submitted by the dept/vendor; some (`computed: true`) are auto-populated by NERIS from geographic data.

---

## Incident Modules

Schema files live in `/core_schemas/modules/csv/incident/` in the repo. Modules are conditional — only the relevant ones activate per incident type.

| Module File | When Active |
|---|---|
| `core_mod_incident.csv` | Every incident |
| `mod_fire.csv` | Incident type includes fire |
| `mod_medical.csv` | Medical incidents |
| `mod_rescue_ff.csv` | FF rescue involved |
| `mod_rescue_nonff.csv` | Civilian rescue involved |
| `mod_hazard.csv` | Hazmat incidents |
| `mod_exposure.csv` | Exposures |
| `mod_emerging_hazard.csv` | EV/solar/emerging hazards |
| `mod_risk_reduction.csv` | Risk reduction activities |

---

## Incident Type Codes

NERIS uses numeric codes from `type_incident.csv` (similar to NFIRS). FireOps7 currently uses fire/rescue/standby/mutual_aid/special/other — these need to map to NERIS codes.

| Category | Codes |
|---|---|
| Structure Fire | 111–123 |
| Transportation Fire | 130–138 |
| Outside Fire | 140–173 |
| Rescue / EMS | 300–365 |
| Hazmat | 400–431 |
| Public Service / Assist | 480–555 |
| Good Intent (cancelled, wrong location) | 600–672 |
| False Alarm / Alarm System | 641, 700–751 |
| Disaster / Weather | 800–815 |

---

## Gap Analysis — FireOps7 vs NERIS Core Fields

| Field | FireOps7 Now | NERIS Requirement |
|---|---|---|
| Incident type | fire/rescue/standby/mutual_aid/special/other | Numeric code from `type_incident.csv` |
| Address | Text field | Text + WGS84 lat/lng (NERIS geocodes if coords not submitted) |
| Property use | ❌ Missing | Code from `type_location_use.csv` |
| Actions taken | ❌ Missing | Multi-select from `type_action_tactic.csv` |
| Mutual aid | Direction + dept name | `type_aid.csv` + `type_aid_direction.csv` codes |
| Displaced persons | ❌ Missing | Integer count |
| Apparatus / units | ✅ With timestamps | Also needs response mode (`type_response_mode.csv`) |
| Narrative | ✅ Text | Same |
| Fire module fields | Basic (cause, dollar loss, injuries) | Arrival condition, building damage, suppression method, floor/room of origin |
| NERIS submitted flag | ✅ `neris_reported` checkbox | Replace with actual API submission confirmation |

---

## Key Value Set Files (dropdowns to build)

All live in `/core_schemas/value_sets/csv/` in the repo.

| File | Used For |
|---|---|
| `type_incident.csv` | Incident type codes |
| `type_location_use.csv` | Property use (residential, commercial, etc.) |
| `type_action_tactic.csv` | Actions taken on scene |
| `type_aid.csv` | Aid type |
| `type_aid_direction.csv` | Aid given vs received |
| `type_fire_cause_in.csv` | Inside fire cause |
| `type_fire_cause_out.csv` | Outside fire cause |
| `type_fire_condition_arrival.csv` | Fire conditions on arrival |
| `type_fire_bldg_damage.csv` | Building damage extent |
| `type_suppress_appliance.csv` | Suppression method/appliance |
| `type_response_mode.csv` | Emergency vs non-emergency response |
| `type_casualty.csv` | Casualty type |
| `type_casualty_cause.csv` | Cause of casualty |

---

## Build Plan

1. ✅ **Locations module** — `base.location_use.use_type` (property use), `base.displacement_count` (displaced persons), `base.location.street/postal_code` — confirmed from openapi.json 2026-05-15, wired into payload builder
2. **Fire module** — `mod_fire.csv` fields: arrival condition, building damage, cause, suppression method, floor/room of origin — field names need verification against openapi.json
3. **Unit response timing** — `enroute_at`/`on_scene_at` field names unverified, stripped from payload
4. **Narrative** — top-level key unknown, stripped from payload
5. **Medical / rescue / hazmat** — module field names unverified, stripped from payload
6. **Nebraska-specific** — check with Nebraska State Fire Marshal for any state-layer requirements on top of NERIS core

## Confirmed Field Names (from openapi.json, api-test.neris.fsri.org)

| NERIS Field | Path in Payload | FireOps7 Source | Confirmed |
|---|---|---|---|
| Incident type | `incident_types[].type` | `incident_neris.neris_incident_type` | ✅ 2026-05-13 |
| Actions taken | `actions_tactics.action_noaction.actions[]` | `incident_neris.actions_taken[]` | ✅ 2026-05-13 |
| No-action reason | `actions_tactics.action_noaction.noaction_type` | `incident_neris.no_action_reason` | ✅ corrected 2026-07-30 — field is `noaction_type`, not `reason` (was wrong since 2026-05-13, never actually hit this code path in a live submission until now); closed enum `CANCELLED \| NO_INCIDENT_FOUND \| STAGED_STANDBY`, confirmed against live openapi.json. Not for medical/transport outcomes (e.g. "patient refused transport" — that's `medical_details[].transport_disposition = PATIENT_REFUSED_TRANSPORT`, a real action was taken). |
| State | `base.location.state` + `dispatch.location.state` | `incidents.state` | ✅ 2026-05-13 |
| Street address | `base.location.street` | `incidents.address` | ✅ 2026-05-15 |
| Postal code | `base.location.postal_code` | `incidents.zip` | ✅ 2026-05-15 |
| Property use | `base.location_use.use_type` | `incident_neris.property_use` | ✅ 2026-05-15 |
| Displaced persons | `base.displacement_count` | `incident_neris.displaced_persons` | ✅ 2026-05-15 |
| Fire module key | `fire_detail` | — | ✅ 2026-05-15 |
| Fire type discriminator | `fire_detail.location_detail.type` | "STRUCTURE" or "OUTSIDE" based on incident type | ✅ 2026-05-15 |
| Condition on arrival | `fire_detail.location_detail.arrival_condition` | `incident_neris.fire_condition_arrival` | ✅ 2026-05-15 |
| Building damage | `fire_detail.location_detail.damage_type` | `incident_neris.building_damage` | ✅ 2026-05-15 |
| Fire cause | `fire_detail.location_detail.cause` | `incident_neris.fire_cause_code` | ✅ 2026-05-15 |
| Floor of origin | `fire_detail.location_detail.floor_of_origin` | `incident_neris.floor_of_origin` | ✅ 2026-05-15 |
| Room of origin | `fire_detail.location_detail.room_of_origin_type` | `incident_neris.room_of_origin` | ✅ 2026-05-15 |
| Acres burned | `fire_detail.location_detail.acres_burned` | `incident_neris.outside_fire_acres` | ✅ 2026-05-15 |
| Suppression appliances | `fire_detail.suppression_appliances[]` | `incident_neris.suppression_appliance[]` | ✅ 2026-05-15 |
| Outcome narrative | `base.outcome_narrative` | `incident_neris.neris_narrative` (falls back to `incidents.narrative`) | ✅ 2026-05-15 |
| Impediment narrative | `base.impediment_narrative` | `incident_neris.impediment_narrative` | ✅ 2026-05-15 |
| Unit enroute time | unknown | `incident_apparatus.enroute_at` | ❌ Unconfirmed |
| Unit on-scene time | unknown | `incident_apparatus.on_scene_at` | ❌ Unconfirmed |

---

## Requirements Mapping

- Phase 1 mapper lives in `lib/neris-requirements.ts`
- It evaluates FireOps7 cover sheet data, `incident_neris`, apparatus, personnel, and mutual aid rows into:
  - active NERIS modules
  - missing required/conditional fields
  - blocked fields FireOps7 does not collect yet
  - computed fields NERIS should derive
  - local completion vs API validation readiness
- `/incidents/[id]/neris` shows a compact read-only summary from this mapper.
- Next phase: expand the summary into section-level checklist navigation and use FSRI validation errors to refine the rules.

---

## Phase 3 Data Gap Inventory

| NERIS Field | Applies When | FireOps7 Source | Status | Proposed Storage |
|---|---|---|---|---|
| Unit staffing at dispatch | Unit response exists | Not collected per unit | Missing | `incident_apparatus.staffing_count` |
| Outside fire acres burned | Grass, wildland, other outside fires | Not collected | Missing | `incident_neris.outside_fire_acres` |
| No-action reason | No actions taken, cancelled, false alarm, good intent | Not collected | Missing | `incident_neris.no_action_reason` |
| Incident latitude/longitude | Every incident if available | Address only | Partial/API-confirm-needed | Future `incidents` lat/lng fields or location table |
| Displacement cause | Incidents with displaced persons | Displaced count only | Partial/API-confirm-needed | Future `incident_neris.displacement_cause` |
| Medical transport details | Medical incidents | Basic disposition only | Partial/API-confirm-needed | Future medical subrecord |
| Station/unit NERIS IDs | Compatibility and production entity sync | Not collected | Missing | Future station/apparatus NERIS columns |

Phase 3 migration file: `supabase/neris_phase3_data_gaps.sql`.

---

## Vendor Integration Architecture

NERIS uses a two-sided enrollment model — FireOps7 is the **vendor**, departments are the **enrollers**.

### Step 1 — FireOps7 gets a Vendor Client ID (one-time)
- Register FireOps7 as a vendor with FSRI via the helpdesk: https://neris.atlassian.net/servicedesk/customer/portals
- **✅ DONE — Ticket: HLPDSK-31956 (Conor Brady, FSRI)**
- **FireOps7 Vendor ID (test): `VN03615504`** — Vendor Admin access
- **FSRI Test Department: `FD35049607`** — use this for all dev/compatibility work
- Welcome email sent to zklein3@outlook.com with portal login + temp password
- After logging into https://app-test.neris.fsri.org — verify whether certified vendor auth uses HTTP Basic auth or OAuth2 client credentials
- Store common values as: `NERIS_VENDOR_ID`, `NERIS_TEST_DEPT_ID`, `NERIS_USE_TEST=true`
- If OAuth2 is required, also store: `NERIS_AUTH_MODE=oauth`, `NERIS_CLIENT_ID`, `NERIS_CLIENT_SECRET`
- If Basic auth is approved, also store: `NERIS_AUTH_MODE=basic`, `NERIS_VENDOR_PASSWORD`
- This is a single credential set for the entire FireOps7 platform — not per-department
- Local smoke test after credentials are saved:
  - Set `NERIS_USE_TEST=true`
  - Run `npm run neris:smoke`
  - Expected OAuth success: token request OK, then entity fetch OK for the FSRI test department
  - Expected Basic success: entity fetch OK for the FSRI test department
- Current FSRI question: Zachary asked Conor Brady whether HTTP Basic auth is acceptable for certified vendor integration or OAuth2 client credentials are required

### Compatibility Badge Requirements (must complete after receiving Client ID)
1. Enroll with the FSRI Fire Department (test dept) — Request Enrollment for NERIS Compatibility Badge
2. POST a valid incident from that integration connection
3. PUT/PATCH an update to that incident using its UID
4. POST a new station to the FSRI Fire Department
5. POST a unit to that created station
6. Submit compatibility check request — Request Compatibility Check
- Software passing these steps is considered **Version 1 Data Exchange Compatible**

### Station Required Fields (POST)
- `station_id` — agency NERIS ID + "S" + 3-digit number (e.g. `[NERIS_ID]S001`)
- `station_address_1`, `station_city`, `station_state`, `station_zip`
- `station_point` — WGS84 coordinates (lat/lng)
- `station_staffing` — minimum staffing at station level

### Unit Required Fields (POST)
- `station_unit_id_1` — unit's CAD designation
- `station_unit_staffing` — minimum staffing required to dispatch
- `station_unit_capability` — type classification (value set TBD)

### Test Strategy
- Create a dedicated NERIS test department in FireOps7 with fully NERIS-compliant data
- Use the test API (`api-test.neris.fsri.org/v1`) to validate the full push path end-to-end before compatibility submission
- Test flow: FireOps7 test dept → incidents/stations/units → NERIS test API → verify response → then submit against FSRI Fire Dept for badge
- All submissions for the compatibility check target the **FSRI Fire Department** (their test dept), not a real department

### Step 2 — Each department enrolls FireOps7 (per-department, done by dept admin)
1. Dept admin logs into NERIS at https://app.neris.fsri.org
2. Select **Enrollments** from the left menu
3. Enter FireOps7's **Client ID** (not their NERIS ID)
4. Select **Enroll Integration** → confirm permissions popup
5. FireOps7 now has API access to that department's data

**Permissions granted per enrollment:**
- View, create, and modify incident data for their entity
- View and modify entity attributes (location, stations, staffing, units)

### FireOps7 implementation notes
- Store the FireOps7 Client ID / API credentials in `.env.local` and Vercel env vars (not per-department)
- Each department that has enrolled will be accessible via the API — scope submissions by department
- Departments can revoke access at any time by deleting the enrollment in NERIS

### Alternatives
- **Self-report option**: Departments can get their own NERIS credentials and submit directly without a vendor. FireOps7 could support this as a fallback (store dept-level API key in `departments` table), but vendor enrollment is the cleaner long-term path.

---

## Special Incident Modifiers

Special incident modifiers are temporary NERIS additions that allow agencies to tag incidents associated with major national or international events. They are applied alongside the standard incident type — they do not replace it.

**How to submit:** The modifier field name and payload structure are TBD pending API docs from FSRI. When confirmed, add to `buildNerisPayload` in `app/actions/neris.ts` and expose as a checkbox/toggle on the NERIS data entry form (`/incidents/[id]/neris`).

---

### FIFA World Cup 2026

**Modifier:** `WORLD_CUP_2026` (value TBD — confirm exact enum with FSRI)
**Active:** June–July 2026 (tournament window)
**Source:** NERIS Special Incident Modifier Guidance — FIFA World Cup 2026 (FSRI, 2026)

**Purpose:** Identifies incidents directly or indirectly associated with FIFA World Cup 2026 activities — games, watch parties, celebrations, crowd gatherings, and public safety standbys. Used to measure operational impacts, resource demands, and community effects at a national level.

#### When to Apply

| Incident Type | Apply When |
|---|---|
| **Medical** | Incident occurs at or is directly tied to a sanctioned World Cup facility or event — heat emergencies at outdoor viewing events, alcohol-related medical calls, crowd surge injuries, stampedes, spectator injuries, field intrusions, medical from celebratory crowd behavior, or EMS standbys for large gatherings |
| **Law Enforcement Assist** | Crowd control, riot/disorderly crowd, public safety standbys, security incidents, civil disturbances from celebrations or protests, large-scale crowd management |
| **Fire & Rescue** | Celebratory fires (fireworks, outdoor grills), vehicle fires in event parking areas, rescue incidents at fan zones or gathering locations, MVA inside match parking area |

**Examples where it applies:**
- Patient with heat emergency at a designated fan fest
- Crowd rush injury after a match-winning goal
- Ambulance unit on standby for a large event gathering
- Car fire in an official World Cup parking lot
- Unit staged for suspicious package at event venue

#### When NOT to Apply

Do not add the modifier if there is no reasonable connection between the incident and World Cup activities. Geographic proximity to an event alone does not qualify — there must be a direct link.

**Examples where it does NOT apply:**
- Routine medical call in a residential neighborhood with no World Cup connection
- MVA near an event venue but unrelated to the World Cup
- House fire from unattended food while occupants watched the game on TV
- Medical emergency in a restaurant where the patient happens to be wearing a World Cup shirt

**Key principle:** If the World Cup event, gathering, celebration, or associated activity *contributed to the need for emergency response*, apply the modifier. If the connection is incidental or the incident would have happened regardless, do not apply it.

---

## Notes

- NERIS ID is epoch milliseconds of incident start time (system-generated, not dept-assigned)
- Departments keep their own internal incident number separately
- `computed: true` fields are auto-populated by NERIS from geo/parcel data — don't need to submit those
- ResponseRack is an example of an already-enrolled vendor — same model FireOps7 will follow
