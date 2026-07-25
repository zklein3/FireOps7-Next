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

## Emergency Management (EM) Vertical — FUTURE, noted 2026-07-25

- New `department_type` value: `emergency_management` — same small community as an existing fire/police pilot (e.g. Yutan/Winslow), not a separate customer
- Intent: EM becomes a home for functions that currently live awkwardly inside the fire or police verticals because there's nowhere else to put them (e.g. anything spanning both — mutual aid coordination, community-wide incident command, resource/asset tracking that isn't apparatus-specific, public alerting)
- Framing: a small town's EM director is often the same person wearing a fire or police hat too — this isn't a new market, it's unbundling functionality that's currently mis-homed under `fire` or `law_enforcement` into its own department-type context
- Not scoped yet — no specific function list decided on which pieces move out of police/fire first. Revisit once a concrete EM pilot contact exists (parallel to how Terry's Yutan PD pilot drove the `law_enforcement` build-out) rather than guessing at EM-specific schema now

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

**Core concept:**
- When opened, pulls existing data already in the system — incident details, personnel roster, apparatus assignments
- No re-entering data that already exists
- Built-in form fill instructions alongside each field — members know what goes where and why
- Each ICS position has guidance on responsibilities and what to document

**ICS Forms to support:**
- ICS 201 — Incident Briefing
- ICS 202 — Incident Objectives
- ICS 203 — Organization Assignment List (pulls from personnel roster)
- ICS 204 — Assignment List (pulls from apparatus assignments)
- ICS 205 — Incident Radio Communications Plan
- ICS 206 — Medical Plan
- ICS 207 — Incident Organization Chart (visual org chart)
- ICS 214 — Activity Log

**Connection to existing modules:**
- Incidents module — ICS positions assigned per incident (IC, Safety Officer, Ops Chief, etc.)
- Training module — ICS 100/200/300/400 are just certification types already supported
- Personnel profiles — show ICS qualifications, only show qualified personnel for each role when building command chart

**Key design rules:**
- Module is off until turned on — never visible by default
- Always pulls existing data in — never ask for what's already there
- Instructions built into every form field — no guessing required
- Printable ICS chart for command post use

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
