@AGENTS.md

# FireOps7 — Project Guide & Session Summary

## Stack
- **Next.js 16.2.3** (App Router, TypeScript, Server Actions)
- **Supabase** (PostgreSQL 17, Auth, RLS) — project: FireOps7 (kolrhnxozeroaselapzn, us-east-1)
- **Tailwind CSS v4**
- **@supabase/ssr** + **@supabase/supabase-js**
- **Resend** — email notifications via Supabase Edge Function

## GitHub
- Repo: https://github.com/zklein3/FireOps7-Next
- Branch: main
- Local path: C:\Users\zklei\Documents\FireOps7-Next

## Production
- Vercel: https://fire-ops7-next.vercel.app
- Primary domain: https://www.fireops7.com (DNS live — Vercel valid config)
- Every push to main auto-deploys to Vercel

## Environment Variables (.env.local — never commit)
- NEXT_PUBLIC_SUPABASE_URL=https://kolrhnxozeroaselapzn.supabase.co
- NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci... (anon key)
- SUPABASE_SERVICE_ROLE_KEY=eyJhbGci... (service role key)
- Resend API key stored in Supabase Edge Function Secrets as RESEND_API_KEY

## Supabase Clients
- `lib/supabase/client.ts` — browser client (anon key)
- `lib/supabase/server.ts` — server client (anon key, cookie-based session)
- `lib/supabase/admin.ts` — admin client (service role key, bypasses RLS)

CRITICAL PATTERNS:
- Always use admin client for fetching department-wide data
- Never use nested Supabase joins — causes TypeScript build errors in production
- Always fetch related data flat and join in JavaScript with maps
- sys admin has no department_personnel record — pass department_id explicitly in forms
- Never name a destructured Supabase error variable `logError` — conflicts with imported logger fn. Use `dbErr`, `stepsErr`, etc.

## App Route Structure

### Route Groups
| Group | Routes | Auth | Purpose |
|---|---|---|---|
| `(auth)` | `/login`, `/change-password`, `/profile-setup`, `/pending`, `/denied` | Public | Auth flow |
| `(dashboard)` | All dashboard routes | Required | Main app |
| `(fire-school)` | `/fire-school`, `/fire-school/bottles`, `/fire-school/fill-log` | Public | Standalone tool |

### Fire School Routes
- `/fire-school` — PRIMARY workflow: manual entry + QR scan + bottle check + fill log
- `/fire-school/bottles` — admin/list page only, NOT part of scan workflow
- `/fire-school/fill-log` — history page: view past fill logs only

### Dashboard Routes
- `/dashboard` — dept dashboard or sys admin overview
- `/personnel`, `/personnel/[id]` — roster + profile
- `/apparatus`, `/apparatus/[id]` — apparatus list + detail
- `/stations`, `/stations/[id]` — stations list + detail
- `/equipment`, `/equipment/[id]` — equipment by apparatus (quantity items)
- `/inspections` — select apparatus + compartment to inspect
- `/inspections/run` — run inspection checklist
- `/scan` — QR scan landing/redirect route (to build)
- `/scba` — placeholder
- `/admin/departments`, `/admin/users`, `/admin/logs` — sys admin pages
- `/admin/dept/[id]` — sys admin dept drill-in (tabbed: personnel, stations, apparatus, compartments)
- `/dept-admin/personnel` — manage personnel
- `/dept-admin/compartments` — manage compartment names
- `/dept-admin/items` — manage item categories, item types, assets, inspection templates (3 tabs)

### Key Action Files
- `app/actions/auth.ts` — signIn, changePassword, signOut
- `app/actions/profile.ts` — saveProfile
- `app/actions/departments.ts` — createDepartment, toggleDepartment
- `app/actions/users.ts` — createDeptAdmin, createDeptMember
- `app/actions/personnel.ts` — updateOwnProfile, updatePersonnelProfile, updateDeptPersonnel, changeOwnPassword, submitUserReport
- `app/actions/apparatus.ts` — createApparatus, updateApparatus
- `app/actions/stations.ts` — createStation, updateStation
- `app/actions/compartments.ts` — createCompartmentName, updateCompartmentName, assignCompartmentToApparatus, removeCompartmentFromApparatus
- `app/actions/equipment.ts` — createItemCategory, updateItemCategory, createItem, updateItem, createAsset, updateAsset, assignItemToCompartment, removeItemFromCompartment
- `app/actions/inspections.ts` — createInspectionTemplate, updateInspectionTemplate, addTemplateStep, updateTemplateStep, deleteTemplateStep, submitInspection
- `app/actions/fire-school.ts` — checkBottle, logFill, addFireSchoolBottle

## Auth & Signup Flow

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
| Verify training submissions | ❌ | ✅ | ✅ | ✅ |
| Create training events / log attendance | ❌ | ✅ | ✅ | ✅ |
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

## Sys Admin Notes
- Email: zklein3@outlook.com — no department_personnel record (intentional)
- Always pass `department_id` explicitly in forms for sys admin actions
- Sys admin dept drill-in: `/admin/dept/[id]` — tabbed management of any department

## Mobile Layout
- Desktop: fixed sidebar (w-64, red-800)
- Mobile: top bar + hamburger → slide-out drawer (MobileSidebar.tsx)
- Main content: `pt-20 px-4 pb-4 sm:pt-0 sm:p-6 lg:p-8` — pt-20 clears fixed mobile header
- All pages responsive: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
- Tables: overflow-x-auto + min-w
- Input text fix: globals.css forces `color: #18181b` and `-webkit-text-fill-color` on all inputs

## Error Logging & Notifications
- Table: `system_logs` (log_type: error | user_report | info)
- `lib/logger.ts` — logError() in all server actions
- Edge Function `notify-on-log` → email to zklein3@gmail.com via Resend
- FeedbackButton in sidebar → user_report to system_logs

## What's Built & Working ✅
- Full auth flow + middleware routing
- Role-aware sidebar + mobile hamburger drawer
- Sys admin dashboard — department cards with stats
- Sys admin — Departments, Users, System Logs (placeholder)
- Sys admin dept drill-in — `/admin/dept/[id]` tabbed
- Dept Admin — Manage Personnel, Compartments, Items pages (with inline edit)
- Personnel roster + profile (role-based editing, change password)
- Apparatus list + detail (edit, compartment assign/remove)
- Stations list + detail
- Compartment names management + assignment to apparatus
- Equipment pages — `/equipment` + `/equipment/[id]` (quantity item view, assign/remove)
- Item management — 3 tabs: Categories, Items (with asset expansion), Assets
- Asset tracking — create/edit assets, linked asset flag, has_linked_asset + linked_item_type_id
- Inspection template builder — create templates per item type, add/edit/delete steps, reassign to different item type
- Inspection run UI — `/inspections` select apparatus+compartment → `/inspections/run` checklist with asset picker, presence checks, all step types, submit logs to DB
- Dashboard with real data
- Error logging + email notifications
- FeedbackButton with React Portal
- Mobile header overlap fixed, input text color fixed
- Fire School — QR scanning fully working
- Vercel deployed + fireops7.com DNS configured

## What's Placeholder / Not Yet Built
- `/scba` — dept SCBA pages
- `/admin/logs` — full log viewer
- Supabase auth allowed URLs for custom domain
- Inspection schedule settings (daily/weekly/monthly per dept)
- Inspection history/log viewer
- QR code system (see section below)
- Training module (see section below)
- Attendance module (see section below)
- Incident log module (see section below)
- Equipment page — asset assignment to compartments (currently quantity-only)
- Resend from address → custom domain

## Equipment / Item System

### Item Categories (reporting/filter only)
- category_name, sort_order, active — NO inspection logic at category level

### Item Types — two behaviors:
**Quantity-only** (requires_inspection = false): Axe, Halligan, Pike Pole
**Asset-tracked** (requires_inspection = true): Chainsaw, TIC, Cardiac Monitor, Airpack

### Item Flags
- `tracks_quantity` — count based (auto false when requires_inspection = true)
- `tracks_assets` — individual tracking (auto true when requires_inspection = true)
- `requires_presence_check` — verified during apparatus check
- `requires_inspection` — has inspection template + schedule
- `tracks_expiration` — has expiry date

### Asset Statuses (DB values — must match exactly)
- `IN SERVICE` — active
- `OUT OF SERVICE` — temporarily unavailable
- `RETIRED` — permanently removed

### Asset Linked Asset Pattern
- `has_linked_asset = true` — this asset expects a linked asset during inspection
- `linked_item_type_id` — what TYPE of asset to prompt for (e.g. Scott Air Pack Bottle)
- Link is DYNAMIC — not hardwired. During inspection user selects which specific asset is present

### Inspection Flow (BUILT)
1. Member/officer goes to Inspections → selects apparatus → selects compartment
2. For quantity items → presence check (Present/Missing + actual qty)
3. For asset-tracked items → dropdown to select which specific asset is present
4. If multiple templates → user picks which one (Daily/Weekly/Monthly)
5. ASSET_LINK steps → dropdown of available linked assets
6. Submit → logs to item_asset_inspection_logs + item_asset_inspection_log_steps
7. Overall result = PASS/FAIL based on fail_if_negative steps

### Compartment Assignment
- Quantity items → assigned to compartment with expected_quantity via item_location_standards
- Asset-tracked items → assigned to compartment by item TYPE (not specific asset)
- During inspection user picks which specific asset is present (no pre-assignment needed)

## Inspection Template Builder
- Lives under: Dept Admin → Items → Items tab → [item] → Manage → Inspections tab
- Admin creates templates per item type (multiple allowed: Daily, Weekly, Monthly)
- Template edit includes "Assigned to Item Type" dropdown — admin can reassign to different item
- Step types: BOOLEAN (Yes/No), NUMERIC, TEXT, LONG_TEXT, ASSET_LINK

## QR Code System — DESIGN (to build)

### Core Principles
- Scanning is ADDITIVE — never required. Every page works fully without it
- Manual navigation always available everywhere
- Two scan modes: phone camera outside app, in-app scanner
- QR codes use human-readable codes, not UUIDs — app looks up UUID internally

### Human-Readable Code Format
- Apparatus: unit number (e.g. `ENGINE-32`, `TANKER-1`)
- Compartment: apparatus + code (e.g. `ENGINE-32-D1`, `ENGINE-32-P1`)
- Asset: asset tag (e.g. `CHAINSAW-1`, `SAP-1`)
- SCBA bottle: bottle ID (e.g. `B-0001`) — already in use

### DB Changes Needed
- Add `qr_code` field to `apparatus`, `apparatus_compartments`, `item_assets`
- Admin can set custom code OR scan existing manufacturer QR to associate

### Two Scan Modes
**Mode 1 — Phone camera outside app:**
- QR encodes URL: `https://www.fireops7.com/scan?type=compartment&code=ENGINE-32-D1`
- Not logged in → redirected to login → after auth → back to `/scan` → resolves → destination
- Logged in → `/scan` looks up code → redirects to final destination

**Mode 2 — In-app scanner:**
- User already logged in, taps scan button on relevant pages
- App calls camera via BarcodeDetector/getUserMedia
- Reads QR, extracts code, navigates internally — no redirect needed
- Reusable `QRScanner` component shared across pages

### QR Label Generation & Printing
- No third-party service needed — use `qrcode` or `qrcode.react` npm package
- Generates QR as SVG/canvas entirely in browser, print via browser dialog
- Admin can also scan existing manufacturer QR to associate with asset record

### Implementation Steps (when building)
1. Add `qr_code` field to apparatus, apparatus_compartments, item_assets tables
2. Build `/scan` route with type+code lookup and auth redirect logic
3. Build reusable `QRScanner` component (extract from fire school page)
4. Install `qrcode.react` npm package
5. Add "Generate QR Label" button + print layout to apparatus, compartment, asset pages
6. Add scan buttons (optional shortcut) to inspections landing, equipment pages
7. Add scan-to-associate flow in asset edit form

## Training Module — DESIGN (to build)

### Three Training Scenarios

**1. Certification Course Logging (structured)**
- State-facilitated courses with defined units/chapters (FF1, EMT-B, etc.)
- Admin creates course in system first — defines chapters with titles + hours
- Admin enrolls specific members in the course (enrollment = gate to submit)
- Member submits completed chapter → status: pending
- Officer/admin verifies or rejects → verified submissions count toward completion
- When all required units verified → member flagged as eligible to test
- Admin logs test result → pass creates certification record automatically

**2. Direct Certification Entry (standalone)**
- Member already holds cert (e.g. new hire with existing FF1)
- Admin logs it directly — no course history required
- Fields: cert name, issuing body, cert number, issue date, expiration date

**3. Regular Training Event (non-certification)**
- Department runs a training drill/class not tied to a certification
- Officer/admin creates event: date, topic, hours, location, notes
- Logs attendance: who showed up
- No certification attached

### Data Model

```
certification_types (admin defines — state structured, built out over time)
  ├── cert_name, issuing_body
  ├── does_expire (boolean)
  ├── expiration_interval_months (editable per cert type — null if no expiration)
  └── is_structured_course (boolean)

certification_course_units (chapters/modules — only if is_structured_course)
  ├── unit_title, unit_description, required_hours, sort_order

course_enrollments (admin assigns member to course — gate to submit progress)
  ├── personnel_id, certification_type_id, enrolled_by, enrolled_at
  └── status: active / withdrawn / completed

member_course_progress (member submits unit completions)
  ├── enrollment_id, unit_id, personnel_id
  ├── hours_submitted, completed_date, notes
  ├── status: pending / verified / rejected
  └── verified_by, verified_at, rejection_reason

member_certifications (actual cert records)
  ├── personnel_id, certification_type_id
  ├── cert_number, issued_by, issued_date
  ├── expiration_date (auto-calculated from issued_date + interval, manual override allowed)
  └── source: course_completion | direct_entry

training_events (regular training — no cert)
  ├── department_id, event_date, topic, hours, location, notes
  └── created_by

training_event_attendance
  └── event_id, personnel_id, logged_by
```

### Key Rules
- Member cannot submit course progress unless enrolled by admin
- Expiration date auto-calculated from issue date + cert type interval (editable override)
- FF1 Nebraska = no expiration. EMT-B/CPR = 24 months (configurable per cert type)
- Renewals create new certification record — old records kept for history
- Dashboard flags certs expiring within configurable window (e.g. 60 days)
- Member self-service: view enrolled courses, submit chapter completions, view own certs

## Attendance Module — DESIGN (to build)

### Four Event Types
- **Training** — drills, classes, department-led instruction
- **Meeting** — regular department meetings, officer meetings, board meetings
- **Incident** — emergency responses (reactive, not pre-scheduled — see Incident section)
- **Special Event** — parades, community events, fundraisers, standby coverage

### Scheduled vs Reactive
- Training, meetings, special events — created in advance, members see them coming
- Incidents — created during or after the response, no advance scheduling

### Recurring Events — Series + Instances Pattern
- Series definition stores the recurrence rule
- Instances are individual occurrences generated from the rule
- Rolling one-year window — system always maintains instances 12 months out
- Supabase Edge Function cron job generates new instances as time passes
- Admin can edit: **This event only** OR **This and all future events**
- If editing an instance that already has attendance records → show inline warning banner (non-blocking)

**Recurrence options:**
- Every week on a specific day
- Every month by day of week (2nd Tuesday)
- Every month by specific date (15th of every month)

### Verification — Default to Verify
- `requires_verification` defaults to `true` on all events — admin must consciously uncheck
- Can be set at series level (all instances inherit) or overridden per instance
- When `requires_verification = false` → attendance auto-approves on submission
- When `requires_verification = true` → sits as pending until officer/admin approves

### Attendance Submission Rules
- **Self-report window** — 12 hours from event start time
- After window closes → member self-reporting locked
- Officer/admin can log retroactively at any time — no restriction
- Officer/admin can bulk log attendance for entire group

### Excused Absences
- Supported — member or officer submits an excuse for missing an event
- Admin defines the department's valid excuse types (family emergency, work conflict, medical, etc.)
- Excuses can count differently toward participation requirements per dept configuration

### Participation Requirements
- Department configurable — admin sets minimum thresholds per event type if desired
- Not enforced by system — informational and reportable
- Dashboard shows department-level aggregate stats
- Members see only their own attendance data — no peer visibility

### Data Model

```
event_series
  ├── department_id, event_type (training/meeting/incident/special)
  ├── title, description, location
  ├── recurrence_type (weekly/monthly_by_dow/monthly_by_date/one_time)
  ├── recurrence_day_of_week, recurrence_week_of_month, recurrence_date
  ├── start_time, duration_minutes
  ├── requires_verification (default true)
  ├── active
  └── generate_through_date (tracks rolling window progress)

event_instances
  ├── series_id, event_date, start_time
  ├── location (can override series default)
  ├── status (scheduled/cancelled/completed)
  ├── notes
  └── requires_verification (inherits from series, overridable per instance)

event_attendance
  ├── instance_id, personnel_id
  ├── status (pending/verified/rejected/excused)
  ├── submitted_at, submitted_by
  └── verified_at, verified_by, rejection_reason, excuse_type_id

excuse_types (department defined)
  └── department_id, excuse_name, active

participation_requirements (department configured)
  └── department_id, event_type, minimum_percentage, period (monthly/quarterly/annual)
```

### Notifications & Reminders (design TBD)
- Members should receive reminders for upcoming scheduled events
- Notification when attendance window opens after an event
- Notification for pending verification (officers)
- Tied to broader notification system — design separately

## Incident Log Module — DESIGN (to build)

### Background
- Department receives a CAD email (CFS Report PDF) after each call
- Currently logs vehicles and members manually into NERIS (replaced NFIRS)
- Goal: bring incident logging into FireOps7, eventually replace external NERIS workflow
- EMS reporting NOT in scope at this time

### What the CAD Report Contains (CFS PDF)
- CFS # (CAD incident number) — e.g. CFS2610160
- Call taker name
- Location / address
- Primary incident code + description (e.g. SPEC ASSN: Special Assignment)
- Priority
- Primary disposition
- Call time, Completed time
- Responders — unit identifier (WIN11) and department (WIN)
- Response times — Assigned, Enroute, Staged, Arrived, Backup Requested, Backup Arrived, Leaving, Arrived At, Completed
- IR/External Agency Numbers (WIN26-0013 — internal incident number)
- Unit-specific timestamped activity log

### What the Run Sheet Contains (Paper Form)
- Date, incident address, owner name
- Incident type: Fire, Rescue, Standby, Meeting, Training, Mutual Aid (with To/From dept)
- Time fields: Paged, Page Acknowledged, Enroute, On Scene, Finished at Scene/Transport, Arrived Transport, Finished at Hospital, Back at Station
- Units dispatched — each apparatus with personnel assigned to it
  - 11 (Ambulance), 22 (Brush), 24 (Brush), 32 (Engine), 42 (Tender), 43 (Tender), 81 (Air Trailer), Station
- Fire-specific fields: property lost, estimated dollar losses, cause of fire, vehicle make, insurance info
- NEFIRES/NERIS Report Done checkbox
- Full roster signature sheet — all member names with checkboxes (attendance)
- Point list signatures

### Three Future Integration Options
1. **Manual entry** — officer creates incident in FireOps7 after the call (build first)
2. **CAD email parsing** — Supabase Edge Function parses the CFS email to auto-create incident record (medium complexity)
3. **CAD API/webhook** — real-time integration with dispatch CAD system (future)

### Incident Data Model (preliminary)

```
incidents
  ├── department_id
  ├── incident_number (internal — e.g. WIN26-0013)
  ├── cad_number (CAD system number — e.g. CFS2610160)
  ├── incident_date, call_time, completed_time
  ├── address, location_details
  ├── incident_type (fire/rescue/ems/standby/mutual_aid/special/other)
  ├── mutual_aid_direction (to/from) + mutual_aid_department
  ├── disposition
  ├── narrative / notes
  ├── neris_reported (boolean)
  └── created_by, created_at

incident_times
  ├── incident_id
  └── paged, page_acknowledged, enroute, on_scene, leaving_scene, back_at_station
      transport_depart, transport_arrived, finished_at_hospital (EMS — future)

incident_apparatus
  ├── incident_id, apparatus_id
  └── role (primary/support/staging)

incident_personnel (attendance — who responded)
  ├── incident_id, personnel_id
  ├── apparatus_id (which unit they rode)
  ├── status (pending/verified/rejected)
  └── verified_by, verified_at

incident_fire_details (only for fire incidents)
  ├── incident_id
  ├── property_lost, estimated_dollar_loss
  ├── cause_of_fire, vehicle_make, insurance_info
  └── (NERIS-specific fields to be added as NERIS spec is built out)
```

### Incident Attendance Rules
- Same 12-hour self-report window as other attendance events
- Officer/admin can log retroactively at any time
- `requires_verification` defaults to true — same sneaky default as other events
- Members see their own response history; dept aggregate stats on dashboard

### NERIS Future Scope
- Capture NERIS-required fields in the incident record as the spec is built out
- Eventually allow incident export/submission to NERIS from within FireOps7
- EMS reporting excluded for now

## Fire School — QR Scanning
- Uses BarcodeDetector Web API, rear camera via getUserMedia
- Scan → extracts bottle ID → calls handleCheck() directly (no page navigation)
- QR standard: `https://fireops7.com/fire-school?scan=B-0001`
- Plain text QR (B-0001) also supported
- Note: Fire school IDs are intentionally generic (public, shared across depts)
- Main app QR system is separate and uses human-readable dept-specific codes

## Database Tables

### Fire Department (auth-protected, RLS)
- `departments`, `stations`, `apparatus`, `apparatus_types`
- `apparatus_compartments`, `compartment_names`
- `personnel`, `department_personnel`, `personnel_roles`
- `items`, `item_categories`, `item_assets`, `item_location_standards`
- `item_inspection_templates`, `item_inspection_template_steps`
- `item_asset_inspection_logs`, `item_asset_inspection_log_steps`
- `scba_bottles`, `scba_fill_logs`, `scba_maintenance_logs`, `scba_cylinder_specs`
- `system_logs`

### DB Migrations Applied
- `item_assets`: added `has_linked_asset boolean DEFAULT false`, `linked_item_type_id uuid REFERENCES items(id)`
- `item_inspection_template_steps`: added `step_type text DEFAULT 'BOOLEAN'`, `linked_item_type_id uuid REFERENCES items(id)`
- Template item_id moved: Weekly Airpack Inspection → Scott Air Pack

### Fire School (public, no auth)
- `fire_school_bottles`, `fire_school_fill_logs`

## RLS Notes
- All dept-wide queries MUST use admin client
- Never use nested Supabase joins
- Recursive RLS causes infinite loops

## Dynamic Route Params — CRITICAL
```ts
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
}
export default async function Page({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams
}
```

## Next Steps (priority order)
1. Test full inspection flow end-to-end (Winslow Fire — Engine 32)
2. Add fireops7.com to Supabase auth allowed URLs
3. Inspection schedule settings (daily/weekly/monthly per dept)
4. Inspection history/log viewer
5. QR code system — /scan route + QRScanner component + label generation
6. Training module
7. Attendance module
8. Incident log module (start with manual entry, build toward CAD integration)
9. `/scba` pages
10. `/admin/logs` full log viewer

## Dev Workflow
- Start: `npm run dev` in C:\Users\zklei\Documents\FireOps7-Next
- Stop: Ctrl+C in VS Code terminal
- Build: `npm run build` (always before pushing)
- Git push:
  git add .
  git commit -m "message"
  git push

## Test Accounts
- `zklein3@outlook.com` — sys admin, no department
- `test.winfire@fireops7.com` — Winslow Fire dept admin
- `member.winfire@fireops7.com` — Winslow Fire member
- `test.admin@fireops7.com` — Fremont Fire Test dept admin
- Temp password for new accounts: `Hello1!`

## Test Data (Winslow Fire)
- Engine 32 → D1 (Halligan ×1) + P1 (Chainsaw)
- Assets: Chainsaw 1, Scott Air Pack 1 (linked → Scott Air Pack Bottle), B-0001, B-0002
- Templates: Weekly Chainsaw Inspection (3 steps), Weekly Airpack Inspection (4 steps, on Scott Air Pack)

## Reference Documents
- Winslow Run Sheet (Excel) — uploaded April 16, 2026
  - Paper form used for all incident types: Fire, Rescue, Standby, Meeting, Training, Mutual Aid
  - Contains: date, address, owner, incident type, time fields, units dispatched with personnel, fire-specific fields, NERIS checkbox, full member roster for attendance signatures
- CAD CFS Report (PDF) — uploaded April 16, 2026
  - Auto-generated by Dodge County 9-1-1 dispatch after each call
  - Contains: CFS#, call taker, location, incident code, priority, disposition, timestamps, responders, unit activity log, IR/external agency numbers
  - Current workflow: received via email after call → manually transcribed into NERIS
