# FireOps7 — Reference (Historical / Pull When Needed)

## What's Built & Working ✅
- Full auth flow + middleware routing
- Role-aware sidebar + mobile hamburger drawer
- Sys admin dashboard — department cards with stats
- Sys admin — Departments, Users, System Logs (full log viewer with resolve/resolve-all, tab filters, metadata expand, show-resolved toggle)
- Sys admin dept drill-in — `/admin/dept/[id]` tabbed
- Dept Admin — Manage Personnel, Compartments, Items, Attendance Settings
- Personnel roster + profile (role-based editing, change password)
- Apparatus list + detail (edit, compartment assign/remove)
- Stations list + detail
- Compartment names management + assignment to apparatus
- Equipment pages — `/equipment` + `/equipment/[id]` (quantity item view, assign/remove)
- Item management — 3 tabs: Categories, Items (with asset expansion), Assets
- Asset tracking — create/edit assets, linked asset flag, has_linked_asset + linked_item_type_id
- Inspection template builder — create templates per item type, add/edit/delete steps, reassign to different item type
- Inspection run UI — `/inspections` select apparatus+compartment → `/inspections/run` checklist with asset picker, presence checks, all step types, submit logs to DB (apparatus_id, compartment_id, presence checks all persisted)
- Multi-asset inspection — `expected_quantity` on asset-tracked items drives N inspection slots per item type; each slot gets its own asset picker (cross-slot deduplication) + full checklist; each submits a separate inspection log row
- Daily Check mode — `/inspections` → compartment → "Daily Check" button → presence-only run (present/missing + qty for all items, no checklist); `?mode=presence` param; QR-ready for future scan landing
- Member activity report (`/reports/my-activity`) — self-view: attendance (present/excused/absent/pending counts + table), inspections (pass/fail counts + table), incidents (count + table); date range filter; all roles
- Inspection report (`/reports/inspections`) — flat table with asset inspection rows (PASS/FAIL + step detail) and presence check rows (Present/Missing); filters: date range, apparatus, inspector, pass/fail toggle; expandable rows show all step responses; asset tag click drills into per-asset history; printable
- Inventory Reports — `/reports/inventory` — apparatus cards, date range filter, flagged item reference cards, window.print() print view; linked from apparatus detail page
- Equipment move — Move button on each item in equipment detail → modal to pick any apparatus + compartment, single-step reassign (cross-truck supported)
- Equipment quantity edit — click quantity number inline to edit expected count; officers/admins only; asset items show "assets" label, quantity items show "expected"
- Attendance module — fully built including verification queue (approve/reject with reason, approve all)
- Training module — DB migrated, cert types + course units, enrollments, member progress + verification, direct cert entry, training events with self-report + officer log + verification queue
- Incident log module — DB migrated, manual entry, apparatus + per-unit times, personnel with POV support, fire details, officer verification + finalize flow
- Sys admin dept drill-in — mobile layout fixed (responsive grid forms)
- Incident new form — paged/in-service times auto-fill from apparatus entries
- Dashboard with real data + upcoming events/training this week with personal attendance status
- Error logging + email notifications
- FeedbackButton with React Portal
- Mobile header overlap fixed, input text color fixed
- Fire School — QR scanning fully working
- Vercel deployed + fireops7.com DNS configured

## What's Placeholder / Not Yet Built
- Training/cert report — officer/admin, filterable by member + cert type + date range, printable ← next build
- Attendance report — officer/admin, participation rates, printable
- QR code system (see QR design section below)
- ISO audit sections — hose logs, apparatus specs, hydrant flows, mutual aid (see ISO section below)
- Inspection schedule settings (daily/weekly/monthly per dept)
- Supabase auth allowed URLs for custom domain
- Resend from address → custom domain

## User Roles & Permissions

### signup_status values
| Status | Redirect |
|---|---|
| `temp_password` | /change-password |
| `profile_setup` | /profile-setup |
| `active` | /dashboard |
| `awaiting_approval` | /pending |
| `denied` | /denied |

### User Roles
| Field | Table | Purpose |
|---|---|---|
| `is_sys_admin` | `personnel` | Global — all departments, no dept record needed |
| `system_role` | `department_personnel` | `admin / officer / member` within dept |
| `department_id` | `department_personnel` | Scopes all data to their department |

### Permission Matrix
| Action | Member | Officer | Admin | Sys Admin |
|---|---|---|---|---|
| View roster/stations/apparatus/equipment | ✅ | ✅ | ✅ | ✅ |
| Run inspections | ✅ | ✅ | ✅ | ✅ |
| Submit training/certification progress | ✅ | ✅ | ✅ | ✅ |
| Log own attendance (within window) | ✅ | ✅ | ✅ | ✅ |
| Edit own profile | ✅ | ✅ | ✅ | ✅ |
| Verify/approve attendance | ❌ | ✅ | ✅ | ✅ |
| Create events / bulk log attendance | ❌ | ✅ | ✅ | ✅ |
| Log retroactive attendance | ❌ | ✅ | ✅ | ✅ |
| Create/log incidents | ❌ | ✅ | ✅ | ✅ |
| Edit anyone's basic info | ❌ | ✅ | ✅ | ✅ |
| Edit apparatus/station info | ❌ | ✅ | ✅ | ✅ |
| Assign items to compartments | ❌ | ✅ | ✅ | ✅ |
| Add/deactivate apparatus/stations | ❌ | ❌ | ✅ | ✅ |
| Manage compartments/items/categories/assets | ❌ | ❌ | ✅ | ✅ |
| Add/manage personnel | ❌ | ❌ | ✅ | ✅ |
| Create certification types + courses | ❌ | ❌ | ✅ | ✅ |
| Enroll members in certification courses | ❌ | ❌ | ✅ | ✅ |
| Set participation requirements | ❌ | ❌ | ✅ | ✅ |
| Define excuse types | ❌ | ❌ | ✅ | ✅ |
| Generate/print QR labels | ❌ | ❌ | ✅ | ✅ |

## Attendance Module Detail

### DB Tables
- `excuse_types` — department defined excuse reasons
- `participation_requirements` — minimum % thresholds per event type
- `event_series` — recurring event definitions
- `event_instances` — individual occurrences generated from series
- `event_attendance` — attendance records per member per instance

### Key Rules
- `requires_verification` defaults to TRUE on all events — admin consciously opts out
- Self-report window: 12 hours from event start time (members only)
- Officer/admin can log retroactively at any time, no restriction
- Warning banner shown when editing past events with existing attendance records
- Members see only own attendance; dept-level aggregates on dashboard

## QR + Compartment Page + Inspection Session — DESIGN (to build)

### Core Principles
- Scanning is ADDITIVE — never required. Every page works without it
- Manual navigation always available everywhere
- Two scan modes: phone camera outside app, in-app scanner
- QR codes use human-readable codes, not UUIDs — app looks up UUID internally

### Human-Readable Code Format
- Apparatus: unit number (e.g. `ENGINE-32`, `TANKER-1`)
- Compartment: apparatus + code (e.g. `ENGINE-32-D1`, `ENGINE-32-P1`)
- Asset: asset tag (e.g. `CHAINSAW-1`, `SAP-1`)
- SCBA bottle: bottle ID (e.g. `B-0001`) — already in use

### DB Changes Needed
- Add `qr_code` text field to `apparatus`, `apparatus_compartments`, `item_assets`
- Add `inspection_session_id` UUID to `item_asset_inspection_logs` — groups all compartment submissions from one weekly sweep into one session
- Admin can type human-readable code OR scan existing manufacturer QR to associate

### Two Scan Modes
**Mode 1 — Phone camera outside app:**
- QR encodes URL: `https://www.fireops7.com/scan?type=compartment&code=ENGINE-32-D1`
- Not logged in → redirected to login → after auth → back to `/scan` → resolves → redirects
- Logged in → `/scan` looks up code → redirects to destination

**Mode 2 — In-app scanner:**
- User already logged in, taps scan button on relevant page
- BarcodeDetector/getUserMedia (already working in Fire School — extract to reusable `QRScanner` component)
- Reads QR, navigates internally — no redirect needed

### New Routes & Pages

| Route | Purpose |
|---|---|
| `/equipment/[apparatus_id]/[compartment_id]` | Compartment page — QR scan landing |
| `/inspections/apparatus/[id]` | Weekly inspection session — full apparatus sweep |
| `/scan` | QR lookup + auth redirect |

### Compartment Page (`/equipment/[apparatus_id]/[compartment_id]`)
- Header: apparatus name + compartment name/code
- Item list: each item with expected quantity, current asset status
- Three action buttons:
  - **Verify Present** — lightweight presence-check-only flow (no asset checklists); logs to `compartment_presence_check_logs`; designed for daily shift checks. Already available from `/inspections` → "Daily Check" button; QR scan will pre-fill apparatus + compartment via `?mode=presence`
  - **Start Inspection** — launches existing inspection run pre-filled with apparatus + compartment (skips selection screen)
  - **View History** — recent inspection logs for this compartment
- Accessible via QR scan or manual nav from apparatus detail page

### Weekly Inspection Session (`/inspections/apparatus/[id]`)
- Shows all compartments for the apparatus as a checklist (incomplete by default)
- User taps a compartment → existing inspection run flow → submits → returns to session view → compartment marked complete
- All submissions in the session share an `inspection_session_id` UUID — reports can group by session
- Progress persists if user leaves and returns (session tracked by session ID in URL or DB)
- "Start Weekly Inspection" button lives on the apparatus detail page

### Use Case Mapping
- **Daily check (career dept shift change):** Scan compartment → compartment page → Verify Present → done
- **Weekly full inspection:** Apparatus detail → Start Weekly Inspection → session view → work through each compartment
- **Ad hoc single compartment inspection:** Scan or navigate → compartment page → Start Inspection

### QR Label Generation & Printing
- `qrcode.react` npm package — generates QR as SVG client-side, no third party
- QR encodes the full scan URL (e.g. `https://www.fireops7.com/scan?type=compartment&code=ENGINE-32-D1`)
- "Print QR Label" button on apparatus detail + compartment page
- Print layout: QR image + code text + apparatus/compartment name — uses `window.print()` (same as inventory reports)

### Build Order (when starting this)
1. DB migration: `qr_code` fields on apparatus, apparatus_compartments, item_assets; `inspection_session_id` on item_asset_inspection_logs
2. Compartment page (`/equipment/[apparatus_id]/[compartment_id]`) with item list + Verify Present + Start Inspection
3. Weekly inspection session (`/inspections/apparatus/[id]`)
4. `/scan` route with type+code lookup and auth redirect logic
5. `QRScanner` component (extract from fire school page), add scan buttons to relevant pages
6. QR label print layout + "Print QR Label" buttons
7. Admin UI: qr_code field on apparatus/compartment/asset edit forms

## Training Module Detail

### Three Training Scenarios
1. **Certification Course Logging** — Admin creates course + chapters, enrolls members, member submits progress, officer verifies, admin logs test result → cert record
2. **Direct Certification Entry** — Admin logs cert directly, no course history required
3. **Regular Training Event** — Officer/admin creates event, logs attendance, no cert attached

### Data Model
```
certification_types
  ├── cert_name, issuing_body
  ├── does_expire (boolean)
  ├── expiration_interval_months (null if no expiration — e.g. FF1 Nebraska)
  └── is_structured_course (boolean)

certification_course_units
  └── unit_title, unit_description, required_hours, sort_order

course_enrollments (admin assigns — gate to submit)
  └── personnel_id, certification_type_id, status: active/withdrawn/completed

member_course_progress (member submits)
  ├── enrollment_id, unit_id, hours_submitted, completed_date, notes
  └── status: pending/verified/rejected + verified_by, verified_at, rejection_reason

member_certifications (actual cert records)
  ├── personnel_id, certification_type_id, cert_number, issued_by, issued_date
  ├── expiration_date (auto-calc from issue_date + interval, manual override allowed)
  └── source: course_completion | direct_entry

training_events + training_event_attendance
```

### Key Rules
- Expiration: FF1 Nebraska = no expiration. EMT-B/CPR = 24 months (configurable per type)
- Renewals create new cert record — old records kept for history
- Dashboard flags certs expiring within configurable window

## Incident Log Module Detail

### Background
- CAD email (CFS PDF) received after each call — currently transcribed manually into NERIS
- Goal: bring incident logging into FireOps7, eventually replace NERIS workflow
- EMS reporting NOT in scope
- Build order: 1) Manual entry ✅  2) CAD email parsing via Edge Function  3) CAD API/webhook

### Data Model
```
incidents
  ├── department_id, incident_number (internal), cad_number
  ├── incident_date, call_time, completed_time, address
  ├── incident_type (fire/rescue/standby/mutual_aid/special/other)
  ├── mutual_aid_direction (to/from) + mutual_aid_department
  ├── disposition, narrative, neris_reported (boolean)
  └── created_by

incident_times — paged, page_acknowledged, enroute, on_scene, leaving_scene, back_at_station
incident_apparatus — apparatus_id, role (primary/support/staging)
incident_personnel — personnel_id, apparatus_id, status (pending/verified/rejected)
incident_fire_details — property_lost, dollar_loss, cause_of_fire, vehicle_make, insurance_info
```

## Database Tables

### Fire Department (auth-protected, RLS)
- `departments`, `stations`, `apparatus`, `apparatus_types`
- `apparatus_compartments`, `compartment_names`
- `personnel`, `department_personnel`, `personnel_roles`
- `items`, `item_categories`, `item_assets`, `item_location_standards`
- `item_inspection_templates`, `item_inspection_template_steps`
- `item_asset_inspection_logs` (+ apparatus_id, compartment_id columns), `item_asset_inspection_log_steps`
- `compartment_presence_check_logs`
- `excuse_types`, `participation_requirements`
- `event_series`, `event_instances`, `event_attendance`
- `certification_types`, `certification_course_units`, `course_enrollments`
- `member_course_progress`, `member_certifications`
- `training_events`, `training_event_attendance`
- `incidents`, `incident_apparatus`, `incident_personnel`, `incident_fire_details`
- `scba_bottles`, `scba_fill_logs`, `scba_maintenance_logs`, `scba_cylinder_specs`
- `system_logs`

### DB Migrations Applied
- `item_assets`: added `has_linked_asset`, `linked_item_type_id`
- `item_inspection_template_steps`: added `step_type`, `linked_item_type_id`
- Attendance module: `excuse_types`, `participation_requirements`, `event_series`, `event_instances`, `event_attendance`
- Training module: `certification_types`, `certification_course_units`, `course_enrollments`, `member_course_progress`, `member_certifications`, `training_events`, `training_event_attendance`
- Incident module: `incidents`, `incident_apparatus`, `incident_personnel`, `incident_fire_details`
- Inspection logs: added `apparatus_id`, `compartment_id` to `item_asset_inspection_logs`; new `compartment_presence_check_logs` table

### Fire School (public, no auth)
- `fire_school_bottles`, `fire_school_fill_logs`

## Fire School — QR Scanning
- Uses BarcodeDetector Web API, rear camera via getUserMedia
- Scan → extracts bottle ID → calls handleCheck() directly
- Fire school IDs are generic (public, shared across depts) — separate from main app QR system

## ISO Audit Reporting — Design & Roadmap

### What's Reportable Today (covered by existing data)
- **Apparatus inspections** — by truck, date range, inspector, pass/fail, step responses
- **Training + certifications** — by member, cert type, expiration tracking, course completions
- **Attendance** — participation rates by member and event type
- **Incidents** — call volume, incident type breakdown, apparatus and personnel response

### ISO Sections Still Needing Data + Logs

**Hose inventory log**
- Simple table: hose type (attack/supply/forestry), diameter, length, location (apparatus/station), last test date, test result
- Admin entry form under Dept Admin
- Report: all hose by location, last test date, pass/fail

**Apparatus + pump specs**
- Add fields to `apparatus` table: pump_gpm, tank_capacity_gallons, pump_manufacturer, pump_year, vehicle_vin, vehicle_year, vehicle_make, vehicle_model
- Edit form already exists on apparatus detail — just add fields
- Report: apparatus spec sheet per truck

**Hydrant flow logs**
- New table: hydrant ID/address, test date, static PSI, residual PSI, flow GPM, tester name
- Admin entry form, map or list view
- Report: all hydrant tests by date range

### Mutual Aid — Three-Tier Design

**Tier 1 — Manual entry (build first)**
- Dept admin manually enters partner name, their apparatus list, pump GPM, tank capacity, hose inventory
- New table: `mutual_aid_partners` + `mutual_aid_apparatus`
- Simple admin form under Dept Admin

**Tier 2 — Partner self-entry page (build second)**
- Dept admin generates a share link for a mutual aid partner
- Partner opens a public/token-gated page and enters their own equipment data directly
- No FireOps7 account required — similar to fire school pattern
- Data lands in requesting dept's mutual aid table, attributed to that partner

**Tier 3 — Cross-department data pull (future, when multiple customers)**
- If partner is already on FireOps7, their apparatus/equipment data already exists in the system
- Partner dept enables a "share with mutual aid partners" toggle
- Requesting dept sends a link request → partner approves → data populates automatically and stays current
- Network effect: more FireOps7 customers = less manual data entry for everyone

### ISO Report Format
- ISO audits are a recognized format accepted by nearly all agencies
- Build what data exists now, add sections as logs are built
- Each section: filterable by date range, grouped appropriately, printable via `window.print()`
- Print layout consistent with inventory reports pattern already established

## Reference Documents
- Winslow Run Sheet (Excel) — uploaded April 16, 2026
- CAD CFS Report (PDF) — uploaded April 16, 2026 (Dodge County 9-1-1)
  - Current workflow: received via email after call → manually transcribed into NERIS
