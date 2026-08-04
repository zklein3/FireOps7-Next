# Business Strategy & Platform Expansion

Session notes captured 2026-06-26. Forward-looking roadmap — not yet built. See `HISTORY.md` for what's actually shipped.

---

## MuniOps — Parent Brand Concept

- `municipal-hub.com` — parent brand domain, purchasing 2026-06-29
- Parent brand sits above FireOps7 and future vertical products
- Think Intuit (QuickBooks, TurboTax) — one company, multiple focused products
- FireOps7 stays exactly as is — it's the fire vertical, already branded
- PoliceOps — law enforcement vertical, next to build
- Public Works, Municipal Admin — future verticals
- Single login portal at MuniOps — user selects department context on login
- Same database, same auth system, same core logic underneath — different skin per department type

## Department Type Toggle

- Add `department_type` field to `departments` table
  - `fire` — current FireOps7 experience, no changes
  - `law_enforcement` — police-specific modules, forms, nav
  - `public_works` — future
  - `municipal` — future, sees everything
- UI adapts based on department type — police chief sees police tools, fire admin sees fire tools
- Module/feature flag system already partially built (`module_operations`, `module_iso`) — extend it to support department type
- No duplication of the database or codebase needed

## Emergency Management (EM) Vertical — FUTURE, noted 2026-07-25, expanded 2026-07-26

- New `department_type` value: `emergency_management` — same small community as an existing fire/police pilot (e.g. Yutan/Winslow), not a separate customer
- Intent: EM becomes a home for functions that currently live awkwardly inside the fire or police verticals because there's nowhere else to put them (e.g. anything spanning both — mutual aid coordination, community-wide incident command, resource/asset tracking that isn't apparatus-specific, public alerting)
- Framing: a small town's EM director is often the same person wearing a fire or police hat too — this isn't a new market, it's unbundling functionality that's currently mis-homed under `fire` or `law_enforcement` into its own department-type context
- Not scoped yet in code — no specific function list decided on which pieces move out of police/fire first, no nav/UI built. `department_type` schema value added 2026-07-26 (see "Schema — added ahead of pilot" below) so a dept can be flagged EM whenever needed, without any EM-specific tables/forms yet. Revisit the actual build once a concrete EM pilot contact exists (parallel to how Terry's Yutan PD pilot drove the `law_enforcement` build-out) rather than guessing at EM-specific schema now

### Candidate EM functions (brainstormed 2026-07-26, none scoped/built)

The ICS module (see below) is the anchor because it's a national standard (FEMA/NIMS) rather than one town's preference — same reasoning applies to the rest of this list, so these are safe to eventually schema out without a live pilot dictating field-level shape, unlike the police contact/business-check forms which correctly waited for Terry's actual paper forms:

- **EOC Activation tracking** — activation level (monitoring/partial/full), operational periods, staffing pattern, activation/deactivation timestamps. Pairs with ICS 214 activity logs.
- **Situation Reports (SitRep)** — periodic structured status updates during an incident (weather, resources committed, priorities, next operational period). Standard NIMS format, reuses existing incident data.
- **Local Emergency/Disaster Declaration** — declaration date, authority, scope, expiration/renewal — the legal trigger that unlocks mutual aid and state/federal resources.
- **Preliminary Damage Assessment (PDA)** — FEMA-standard fields for residential/commercial/public damage counts and dollar estimates, feeds a declaration request. Could reuse the existing photo-upload + Claude-parse pattern from outside training submissions.
- **Shelter Management** — shelter locations, capacity, open/closed status, resident check-in — near-direct reuse of the kiosk/QR check-in system already built for stations (§Use Case B in CLAUDE.md).
- **Mutual Aid Resource Requests (EMAC-style)** — request/offer tracking for resources beyond local capacity. `iso_mutual_aid_agreements` already exists; this would be the "activate an agreement during a real event" counterpart.
- **After-Action Report / Improvement Plan (AAR/IP)** — standard HSEEP format: what happened, what worked, corrective actions with owners/due dates.
- **Exercise Tracking (HSEEP)** — tabletop/functional/full-scale exercises logged against ICS cert types already supported (100/200/300/400) — essentially the training module with an HSEEP-shaped record type.
- **EM Duty Officer Roster** — who's on-call for EM this week/month, simple on-call schedule for after-hours activation.
- **LEOP builds** (Local Emergency Operations Plan) — the standing planning document EM directors maintain (base plan + functional/hazard-specific annexes). Build it with the same dynamic form/section-builder pattern as the inspection template builder ("Forms as a Product" above) rather than a static upload — sections, versioning, and review/renewal dates as structured data instead of a single PDF nobody updates.
- **Document shares** — the general capability of sharing a document (LEOP, an annex, an SOP) with another department, not an EM-only feature but confirmed as needed for EM first. Same Supabase storage pattern already used elsewhere (photo uploads, asset documents) plus a sharing grant — likely the same shape as the `ics_incident_agencies` interoperability grant below (owning dept controls who gets read access), so the two features should share one grant mechanism rather than inventing a second one.
- Confirmed direction (2026-07-29): unlike the rest of this list, EM gets a **full build-out**, not just a stubbed department type — Fire and Police get their own verticals built out already/in progress, EM is the third leg of that, sequenced the same way (wait for a real pilot to prioritize which pieces first), not treated as an afterthought.

### Schema — added ahead of pilot (2026-07-26)

- `departments.department_type` check constraint (`departments_department_type_check`) extended to include `emergency_management` — migration applied directly 2026-07-26. Schema-only, no UI to select it yet (same as today: `createDepartment` doesn't expose `department_type` at all, existing non-fire depts were set via direct SQL, e.g. Yutan PD). `department-theme.ts` and nav gating already default any non-`fire` type to the navy/MuniOps treatment, so an EM dept would render reasonably (stripped nav, generic branding) with zero further code changes the moment one is created.
- Deliberately stopped here — no EM-specific tables, no nav additions, no forms. Add pieces from the candidate list above incrementally once a real EM pilot defines which ones actually matter first.

## Terry's Yutan Police Pilot Plan

- Terry is a friend — fire department member AND police chief of Yutan
- Already in the system under Valley Fire as admin
- Yutan Police Department created 2026-06-26 — Terry + zklein3@gmail.com both admin (see CLAUDE.md "IMMEDIATE NEXT")
- He logs in, selects police context, sees only police-relevant tools
- Goal: have a working shell ready before he even delivers the forms — done; police gets a stripped nav + navy theme, but no police-specific modules yet

**Current tooling & competitive context (2026-06-26):**
- Terry currently runs Yutan PD's forms through **Connecteam** — a generic frontline workforce/shift app, not a police RMS. He finds the UI difficult and the system limiting.
- He referenced **Sleuth Systems** (legacy small/mid-agency CAD/RMS vendor, est. 1984) as his frame of reference for "real" police software — confirms police workflows center on **contact/incident reports as primary documents**, not recurring checklists. Inspections are barely used in police work, unlike fire.
- He wants to bring this to the **City of Yutan** for potential adoption — this is a sales opportunity, not just a personal pilot.
- **Two concrete gaps to close before the city pitch:**
  1. **Time clock function** — municipal HR/payroll will care about this. Likely belongs on the shared core platform (not gated behind `department_type`), since fire also wants paid/volunteer hour tracking.
  2. **Import/export (CSV at minimum)** — so the city doesn't feel like historical Connecteam data is orphaned in a switch. A full Connecteam integration is probably unnecessary; CSV in/out should suffice.
- Forms are expected from Terry ~late June 2026. Don't guess at police schema until they arrive — his forms will define the actual field-level shape of a contact report vs. an incident report.
- Likely schema approach once forms arrive: keep shared core tables (personnel, departments, training/certs, announcements, events) as-is; give police its own primary report tables rather than reusing `incidents`/`incident_fire_details` — a traffic stop or contact report isn't an "incident" in the fire 911-response sense. Some pages may need to be rebuilt police-specific rather than themed, per Terry's described UI/feel expectations.
- **UI shell built 2026-06-28** — PD dashboard now has big `HubCard`-style quick action tiles (Business Check, Contact Form, Traffic Stop) all pointing at a generic `/forms/[slug]` "Coming Soon" placeholder. Dept Setup/Personnel/Apparatus/Inspections removed from the police quick-link set (those stay behind Dept Admin → already has Apparatus via Equipment Setup). Events + Fuel Log kept. **Still needed once Terry's forms arrive:** a dedicated table per form type (not a shared/generic JSONB table — each form has distinct fields, e.g. traffic stop needs citation/violation codes, business check needs property/owner info), then swap the `/forms/[slug]` placeholder for the real page per form.
- **Contact Form requirement from Terry (2026-06-28, relayed by Zach, not yet a finished spec):** officer logs an address + the individuals involved; pulling up an address again should show recent prior contacts there (e.g. last 5) with everyone involved each time, so the officer can see "barking dog complaint x3" vs. realize this is actually escalating. Also needs the reverse lookup — search a person's name, see every address they've been logged at across all contacts.
  - Proposed schema (not yet built): `police_addresses` (one row per unique address, dept-scoped) + `police_persons` (one row per individual) + `police_contacts` (the log entry — address_id, narrative/type, date, officer) + `police_contact_persons` (junction, many-to-many between a contact and the people involved). Each visit to an address is its own `police_contacts` row, not an overwrite — history is just "all contacts where address_id = X."
  - Open question for Terry: does his form capture anything besides name to identify a person (DOB, license #)? Name-only matching risks either duplicate person records (safe but defeats the cross-reference) or wrongly merging two different people with the same name. Until that's answered, lean toward officer-confirmed "possible match" suggestions rather than auto-linking by name.
  - **Address card UI (2026-06-28):** top-level card per address shows the contact history (date + responding officer per row) and a deduped list of names involved across all of it — not broken down by which name goes with which visit at this level. Selecting a specific contact row drills into that visit's full detail; selecting a name drills into that person's appearances (at this address, or system-wide via the reverse lookup). Two-level summary→detail pattern, same underlying tables, just filtered differently.
  - `police_persons` / `police_addresses` could become shared identity tables that Traffic Stop and Business Check also reference later, instead of each form maintaining its own person/address list — this is different from the generic-shared-table anti-pattern since it's identity data, not form content.
- **DB tables migrated 2026-06-29 (Business Check + Contact Log):**
  - `pd_business_checks` — After Hours Business Check Log: `officer_id`, `check_date`, `time_arrived`, `time_cleared`, `business_name`, `address`, `check_type` (routine/alarm_response/owner_request/follow_up), exterior findings (`doors_secure`, `windows_secure`, `lights_as_expected`, `suspicious_activity`), interior check (`interior_check`, `interior_authorized_by`, `interior_findings`), alarm (`alarm_status`, `owner_notified`, `owner_name`, `owner_notified_time`), `disposition` (all_secure/report_filed/follow_up_required/other), `notes`
  - `pd_contact_logs` — Daytime Contact/Field Interview Log: `officer_id`, `contact_date`, `contact_time`, `location`, contact person (`first_name`, `last_name`, `dob`, `address`, `phone`), `reason`, `contact_type` (field_interview/traffic_stop/pedestrian_check/business_contact/follow_up/other), `action_taken`, `report_number`, `notes`
  - Design principle: minimal input — officer auto-fills from logged-in user, date defaults to today, checkboxes for findings, dropdowns for disposition
  - Both tables created ahead of the address/person junction-table plan above — these are standalone for now; not yet wired to `police_addresses`/`police_persons` cross-reference since that schema isn't built
  - **Business Check shipped 2026-06-29** — `/forms/business-check` replaces the placeholder. Built as a two-tier flow: a "Routine Round" cover sheet (`pd_businesses` admin-managed list, card-based multiselect with search, Started time required/manual, Ended time auto-stamped on submit) creates one `pd_business_checks` row per business defaulting to all-secure; officers can open an in-form detail sheet per selected business before submitting to document a finding (exterior/interior findings, alarm, owner contact, disposition, `secured_on_departure`) without leaving the round. A "+ Manual Entry" path covers ad hoc checks outside a round. `round_id` groups businesses checked together for history display.
  - **Still needed:** Contact Log (`pd_contact_logs`) actions file + UI, and the contact-log "recent prior contacts at this address" / reverse name lookup feature described above

## Forms as a Product

- Small municipalities paying $5,000+ to put a form in a database
- FireOps7's inspection template builder is already essentially a dynamic form builder
- Police contact reports, internal memos, use of force forms = same pattern as inspection checklists
- Build Terry's actual Yutan city forms into the system as the demo
- Scanned form or photo → build it digitally → huge value proposition
- Form management is the horizontal feature that works across ALL department types

## Multi-Department Login Flow — NEEDS TO BE BUILT

- Current flow assumes one person = one department (works for 99% of users)
- New flow needed:
  - User logs in with email + password as normal
  - System checks how many departments they belong to
  - One department → straight to dashboard (no change)
  - Multiple departments → show department selector screen
  - User picks context → session scopes to that department
- `department_personnel` table already supports multiple rows per person
- Just the login/session flow needs updating

## ICS Module — Incident Command System

Off by default — explicitly inactive until admin toggles it on per department. No clutter for departments not ready for it — only appears when enabled. Activated via department module toggle in admin settings.

**Cross-vertical requirement (discussed 2026-07-26):** fire, police, and EM all need ICS — it can't be built as a feature bolted onto fire's `incidents` table, or nested in the fire-only Operations hub (hidden entirely for non-fire depts). It has to be its own core-platform module. Confirmed 2026-07-29: build ICS from the ground up as its own module. Conceptually/thematically it's rooted in the EM vertical (EM's whole job is cross-agency coordination, and it's where the fullest experience eventually lives) — but that's a documentation/product-narrative frame, not a technical dependency. See "Backend ownership" below.

**Architecture:**
- New `module_ics` flag (doesn't exist yet — not the same as `module_iso`, which is the unrelated Insurance Services Office rating module). Toggled per-department like `module_medical`/`module_iso` today, independent of `department_type` — fire, police, EM, or municipal can each turn it on separately.
- Nav: its own top-level entry (or small "Command" hub), shown purely on `module_ics`, not nested under Operations.
- New `ics_incidents` table, department-owned, standing alone — does NOT require a linked fire `incidents` row. Optional `linked_incident_id` so a fire dept still gets auto-pull convenience when a real incident exists, but it's never a hard dependency (police/EM won't have one).
- Build sequencing decision (2026-07-29): build the full ICS data model first, then wire in access points per section (a link from the accountability board, a link from the incident page, a standalone entry point for police/EM) — rather than half-building ICS logic scattered across existing pages before the core model is solid.

**Backend ownership (clarified 2026-07-29):** the tables are department-neutral — every ICS table just has a generic `department_id` FK, same as `incidents`/`apparatus`/`department_personnel`. Nothing requires an EM department row to exist; a fire or police dept with `module_ics` on creates and owns its own `ics_incidents` rows directly. "EM owns it" means code organization (e.g. a shared `app/actions/ics.ts`, not nested under a police- or fire-specific folder) and product narrative (documented as EM's flagship feature in STRATEGY.md) — not a schema constraint. Fire and Police get full read/write on their own incidents, not a stripped-down guest view into "EM's" data.

**Operational model — ICS forms are a backup to live data, not a primary entry point (clarified 2026-07-29):** on a routine call, nothing ICS-shaped gets touched at all. ICS only comes into play when an incident runs long enough to justify the paperwork — filled out after the fact ("on the back side" of a normal incident), then daily/per-shift if it keeps going. Concretely:
- An incident does not get one ICS record — it gets one **per operational period**, created only when someone opens one.
- **Opening a period is a snapshot-and-copy from the accountability board, not a live link** — same mechanic already proven by `accountability_par_checks.snapshot` (a jsonb capture of "lane→names at time of check"), just editable afterward instead of a frozen audit blob. At open time: current `accountability_entries` (personnel_id/raw_name/raw_dept, `ics_role`, lane) copy into that period's own assignment rows — now independently editable without touching the live board or retroactively changing an already-finalized prior period. Current `incident_apparatus`/`apparatus` + `incident_mutual_aid.apparatus_description` copy the same way into that period's resource rows. `accountability_boards.objectives`/`.safety_message`/`.weather` pre-fill as editable text — a starting point, not a permanent sync.
- **ICS 214 doesn't get copied** — `accountability_activity_log` is already a chronological timestamped feed; a period's 214 is a straight read filtered to that period's time window, plus room for supplementary ICS-specific notes. History shouldn't be editable after the fact.

**Form-by-form gather points (Fire side, mapped against the real schema 2026-07-29):**
- **ICS 211 — Check-In List:** a real, mostly-free snapshot — direct pull from `accountability_entries.checked_in_at`, no new gather logic. Per-shift/per-period, continuously updated. This is the one to build first.
- **ICS 201 — Incident Briefing:** mostly a snapshot too (`incidents` type/address/times/narrative, `incident_apparatus`+`apparatus`, `incident_personnel`), but taken once near the start rather than per period. Gap: no map/sketch field anywhere (address only, no lat/long) — stays manual.
- **ICS 202/203/204/207 — the actual planning documents, NOT snapshots.** In real NIMS use these represent the **plan for the upcoming operational period**, built in the Planning Meeting using the current 211 as reference material — not a record of what already happened. This is where the real gap lives:
  - **Blocked on shift assignments not existing yet.** Without a duty roster, there's no data source for "who's expected for Period 2" — the accountability board only knows who's checked in *right now*. Period 2's 203/204 has to start as a blank, hand-typed plan until shift assignments exist to answer that. Scoping decision needed before a real build: accept retrospective-only for v1, or treat this as the forcing function to build shift assignments first.
  - **204 also needs a resource-planning concept that doesn't exist yet.** Real ICS resource planning is Kind + Type-tier + Quantity (e.g. "2 Engines, a Truck, a Medic, a patrol unit") — a *need*, independent of which specific unit fills it — not a link to a specific `apparatus` row. Checked `apparatus_types`: it's just `name`+`sort_order`, dept-scoped fire-only inventory categorization, no NIMS Type I–IV tiering, and police/EM have no equivalent table at all. Needs a new shared "resource kind" vocabulary usable across all three verticals (apparatus_types can seed the fire subset), with a resource-need row (kind/type/quantity/status: requested→staged→assigned) that only *optionally* links to a real `apparatus` row once a specific unit is actually dispatched — same two-tier linked-or-raw-text pattern as everywhere else in this design.
- **ICS 205 — Radio Communications Plan:** real gap, nothing to gather — no channel/frequency table anywhere in the schema. Would need dept-level default channels (same "configure once, reuse per incident" pattern as Vehicle Check Items) plus per-incident assignment.
- **ICS 206 — Medical Plan:** real gap — `medical_storerooms`/`medical_supply_types` are inventory, not an incident medical plan (nearest hospital, ambulance service, aid station). Same dept-default-then-override pattern as 205 would fit.
- **ICS 214 — Activity Log:** continuous feed, not a snapshot — see operational model above.

**Accountability board gains a "NIMS mode" (2026-07-29):** same cheap mechanism already proven by `is_active_violence` (a boolean on `accountability_boards` that just unlocks an extra role list + banner in `AccountabilityBoard.tsx` — nothing structural). A `nims_mode` flag the same way unlocks resource-need entries (kind/type/quantity/status) alongside the personnel entries the board already tracks — this is what makes the board double as the live staging/assignment tool during the incident, with ICS 211 just being a formatted report off of it. Everything else (202/203/204/205/206/207/214-as-a-finished-record) stays a separate, full ICS module — not crammed into the board's UI.

**Interoperability — responding/mutual-aid agencies (ad hoc, per-incident):**
- `ics_incident_agencies` join table (`ics_incident_id`, `department_id`, `added_by`, `added_at`, `status`, `closed_at`, `closed_by`). When an agency is dispatched, an admin on the incident searches all departments on the platform and adds them to that specific ICS incident — no standing relationship required, though `iso_mutual_aid_agreements` partners can be surfaced as quick-add suggestions.
- Once added, that department's real roster/apparatus become selectable for ICS 203/204 instead of free text.
- **Session/visibility wrinkle:** the added department's members are logged into their own department context, not the owning dept's — they need a "Shared With Your Department" list on their own dashboard showing ICS incidents where their dept appears in `ics_incident_agencies`, rather than a full department-context switch.
- **Access level:** view the incident + self-log their own ICS 214 activity entries for their assigned position (mirrors existing event/training self check-in). Cannot close anyone else's portion or the incident itself.

**Standing jurisdiction — EM oversight (2026-07-29, distinct from the ad hoc grant above) — SHIPPED ✅ (admin UI 2026-07-30):**
- `department_jurisdictions` table (`parent_department_id`, `child_department_id`) — e.g. County EM as parent, Winslow Fire and Yutan PD as children. Sys-admin configured via a new **Jurisdiction** tab on `/admin/dept/[id]` (`JurisdictionTab.tsx`, `addJurisdiction`/`removeJurisdiction` in `app/actions/departments.ts`) — standing, not per-incident, deliberately not self-service by either side.
- **Scoped strictly to interoperability tables** — `ics_incidents` (+ children), `iso_mutual_aid_agreements`, LEOP documents, and general document shares. Zero visibility or access into a child department's personnel, training, non-ICS incidents, inventory, or apparatus records. EM is a peer collaborator on the shared interoperability layer, not an overseer of the department — EM is not "the boss."
- **Admin-level edit rights within that scope** (not read-only — corrected from an earlier read-only default). EM can edit ICS forms, mutual aid agreements, LEOP, and shared documents for departments in its jurisdiction, same as if they were a participant.
- **"Should consult" handled as audit-trail visibility, not a hard approval gate.** Every edit made by a non-owning department shows who made it and when (e.g. "Edited by Cass County EM — 2026-07-29") — no approval workflow, just transparency so the owning department always sees EM's fingerprints on their own document.
- This is separate from, and does not require, a Transfer of Command — jurisdiction never grants command authority, only standing edit access to the shared documents.

**Transfer of Command (2026-07-29) — SHIPPED ✅ (UI 2026-07-30):** a real NIMS concept — command formally passing from the initial IC to another department (e.g. County EM taking over once a county emergency is declared), logged rather than implicit. UI lives on the ICS incident page under Participating Departments — owner-only, picks another active participant, confirms, calls the existing `transferCommand` action.
- `ics_incidents` has a mutable **current owning department**, not a permanent value fixed at creation.
- `ics_command_transfers` log (`from_department_id`, `to_department_id`, `transferred_at`, `transferred_by`, notes) — every handoff is a timestamped record.
- Whoever currently owns it has full authority (edit, close, grant access). The previous owner drops to the same access level a granted/invited department has — still involved, no longer in command.

**Per-agency close lifecycle (2026-07-29):** owner and invited/granted agencies collapse into one "participant" concept, each with independent status.
- Every department involved in an incident — the one that opened it, plus any added via `ics_incident_agencies` — is a participant with its own `status` (active/closed), `closed_at`, `closed_by`. Each closes *their own* portion (their personnel/resource entries, their activity log contributions, their piece of the forms) whenever they're done, independent of the others.
- The incident's overall status is **derived, not set directly** — stays open while any participant is active, flips to closed automatically when the last active participant closes theirs.
- EM's standing jurisdiction access sits outside this lifecycle — can reopen the incident or edit data even after every agency has closed out and the derived status is closed, since that grant isn't tied to being an active participant.

**Personnel and equipment — always available regardless of any of the above:**
- ICS 203 (org assignment) and ICS 204 (resources/equipment, new `ics_incident_resources` table) both use the same two-tier shape:
  - Linked to a real record — `department_personnel`/`apparatus` from the owning dept, or from an added dept once granted access
  - OR raw `name`/`description` + `raw_agency` free text — always available, no dependency on the grant system, covers any outside agency, ad hoc volunteer, or piece of equipment nobody bothered to formally add. (`incident_mutual_aid.apparatus_description` already does exactly this for outside apparatus today — direct precedent.)
- The grant/jurisdiction system only upgrades free text into a structured picker when it applies — it never gates the baseline ability to just type a name or a piece of equipment onto the incident.

**ICS Forms to support:** 201, 202, 203, 204, 205, 206, 207, 211, 214 (211 added 2026-07-29 — see gather points above).

**Connection to existing modules:**
- Incidents module — optional link only, fire depts get auto-pull convenience; police/EM incidents stand alone
- Accountability boards — source of truth for 211/214 and (via NIMS mode) the live staging/assignment tool; ICS periods snapshot from it, never the reverse
- Training module — ICS 100/200/300/400 are just certification types already supported
- Personnel profiles — show ICS qualifications, only show qualified personnel for each role when building command chart
- ISO mutual aid agreements — surfaced as quick-add suggestions when adding an agency to an incident, not a requirement

**Key design rules:**
- Module is off until turned on — never visible by default
- Always pulls existing data in where a link exists — never ask for what's already there
- Never gate manual entry (people or equipment) behind the department-grant/jurisdiction system — raw text is always the fallback
- Instructions built into every form field — no guessing required
- Printable ICS chart for command post use
- Not scoped for actual build yet — this is architecture only, captured ahead of a real pilot per the same reasoning as the rest of the EM vertical above. A lot has converged here (2026-07-26 through 2026-07-29) — this is close to build-ready, but shift assignments (needed for real 203/204 forward planning) and the resource-kind vocabulary (needed for 204) are the two pieces most likely to need their own design pass before writing schema.

### Build session 2026-07-30 — SHIPPED ✅

Everything above this note was architecture. This session actually built the module:

- **Core ICS module** — `module_ics` flag, `ics_incidents` (mutable owning department for Transfer of Command), `ics_operational_periods`, `ics_incident_participants` (per-agency close lifecycle, derived incident status), `ics_assignments`/`ics_resources` (203/204, snapshot-then-editable), `/ics` pages, "Open ICS Packet" entry point from an accountability board.
- **Accountability board — NIMS Mode + Active Violence** — both toggles moved to the page header; each mode ensures its own lane profile (built-in preset, dept-customizable in Dept Admin → Accountability, three tabs: Default/ICS/Active Violence); empty off-mode lanes hide themselves, occupied ones never do; live lane renaming; lane delete (blocked if occupied or has 214 history).
- **ICS 211 + 214** — 211 is a live, unfiltered read of the board's check-in list. 214 got a "Log 214" button that stamps current positions (optionally lane-scoped, for a supervisor logging just their own unit) plus a manual-note merge — blank notes just log the stamp.
- **Equipment/resource tracker** — `accountability_resources`, two-tier (own apparatus or raw description), crew attachment via `accountability_entries.resource_id`, moving a resource cascades to its attached crew, moving a person individually detaches them (deliberate split support). Resource-kind vocabulary (`lib/resource-kinds.ts`) shared across verticals + optional NIMS Type I–IV tier.
- **Shift assignments** — `department_shifts` + `department_personnel.shift_id`, deliberately just a standing "who's on this shift" assignment, not a rotation-calendar engine (real fire shift patterns vary too much to model generically). ICS 203 gets a "Pre-fill from shift roster" button — the actual fix for the forward-planning gap.
- **ICS 205/206** — `department_radio_channels` / `department_medical_plan_contacts` (Dept Admin → ICS Defaults), snapshotted into `ics_radio_channels`/`ics_medical_plan_entries` per period, same pattern as 203/204.
- **Jurisdiction admin UI** — `/admin/dept/[id]` → Jurisdiction tab, sys-admin only, add/remove child departments.
- **Transfer of Command UI** — button on the ICS incident page, owner-only, picks another active participant.
- **Not built**: LEOP builder, general document sharing. Both are genuinely large net-new features (LEOP needs the inspection-template-builder-style section/versioning system; document sharing needs a documents table + the same grant shape as `ics_incident_agencies`) — deliberately not attempted in this pass rather than half-building them.

### Accountability board cleanup — SHIPPED ✅ (2026-08-04)

Flagged 2026-08-03 while testing guest access — `/accountability` listed every board a department had ever created, forever, with no delete and no real archive.

Built per the design captured here: **Archive** is a reversible state distinct from Closed (`accountability_boards.archived_at`, migration `add_accountability_board_archived_at`) — requires the board be closed first, hidden from the default list but fully viewable/reportable via a collapsed "Archived (N)" section (`ArchivedBoardsSection.tsx`), same instinct as `neris_issue_dismissed`. **Delete** is real and permanent, admin-only, requires closed status, and is blocked with a clear message if an `ics_incidents` row still links to the board via `linked_accountability_board_id` (that FK has no cascade, by design) — every other child table (`accountability_entries`/`resources`/`lanes`/`par_checks`/`activity_log`) already cascaded via FK, so no manual cleanup needed in code. `BoardCleanupActions.tsx` is the shared Archive/Restore + confirm-then-Delete control, used on both the board list and the board's own header. Reopening a board clears any archive too, since active+archived would otherwise show the same board in both sections.

## Infrastructure & Scaling Plan

- Stay on Supabase free + Vercel free until first paying department
- Upgrade trigger: NERIS goes live with a real department OR first paying customer
- Vercel Pro ($20/mo) + Supabase Pro ($25/mo) = $50/mo for production-grade setup
- Long term: AWS RDS PostgreSQL for enterprise-grade data security
- Architecture is fully portable — just a connection string change
- Independent backups: weekly pg_dump to Google Drive or Backblaze B2 (see `CLAUDE.md` — already shipped to B2)
- Future feature: customer-facing data export (trust builder for departments)

(See `CLAUDE.md` "Infrastructure & Business Roadmap" for the current-state version of this — that section is authoritative for what's actually live.)

## Native App Roadmap

- PWA first — `manifest.json` + service worker (shipped, see `CLAUDE.md`)
- Capacitor next — wraps existing Next.js site in native shell (in progress, see `NATIVE.md`)
- Push notifications — key feature, alerts members for new incidents, events, cert expirations

## Mobile Brainstorming Workflow

- claude.ai on phone → brainstorm ideas on the go
- Claude Desktop on laptop → finds phone conversations via account sync
- Ask Desktop to summarize and push to `CLAUDE.md` / `STRATEGY.md`
- Keeps ideas captured without stopping workflow

## Next Dev Priorities (strategy-level)

1. PWA support — shipped, see `CLAUDE.md`
2. Multi-department login flow — shipped 2026-06-26, see `CLAUDE.md` "IMMEDIATE NEXT"
3. Department type toggle — shipped 2026-06-26 (`department_type` column + nav/theme gating)
4. Terry's Yutan Police pilot — department + admin access created 2026-06-26; his actual forms not yet delivered/built
5. ICS module — off by default, pulls existing data, built-in instructions
6. Capacitor Android build — in progress, see `NATIVE.md` / `ANDROID_HANDOFF.md`
7. MuniOps parent brand site — when ready to market
