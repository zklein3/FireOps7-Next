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
- `/events` — events list, self-log attendance, officer manage panel, verification queue ✅
- `/events/new` — create one-time or recurring event ✅
- `/training` — my enrollments, certifications, training events (self-report + officer log) ✅
- `/scan` — QR scan landing/redirect route (to build)
- `/scba` — placeholder
- `/admin/departments`, `/admin/users`, `/admin/logs` — sys admin pages
- `/admin/dept/[id]` — sys admin dept drill-in (tabbed: personnel, stations, apparatus, compartments)
- `/dept-admin/personnel` — manage personnel
- `/dept-admin/compartments` — manage compartment names
- `/dept-admin/items` — manage item categories, item types, assets, inspection templates (3 tabs)
- `/dept-admin/attendance` — excuse types + participation requirements ✅
- `/dept-admin/training` — cert types, course units, enrollments, pending progress verification, direct cert entry, training events ✅

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
- `app/actions/attendance.ts` — createEventSeries, updateEventInstance, updateEventSeries, logAttendance, verifyAttendance, cancelEventInstance, createExcuseType, saveParticipationRequirement ✅
- `app/actions/training.ts` — createCertificationType, updateCertificationType, createCourseUnit, updateCourseUnit, enrollMember, verifyProgress, logDirectCert, createTrainingEvent, logTrainingAttendance, verifyTrainingAttendance ✅
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
- Dept Admin — Manage Personnel, Compartments, Items, Attendance Settings
- Personnel roster + profile (role-based editing, change password)
- Apparatus list + detail (edit, compartment assign/remove)
- Stations list + detail
- Compartment names management + assignment to apparatus
- Equipment pages — `/equipment` + `/equipment/[id]` (quantity item view, assign/remove)
- Item management — 3 tabs: Categories, Items (with asset expansion), Assets
- Asset tracking — create/edit assets, linked asset flag, has_linked_asset + linked_item_type_id
- Inspection template builder — create templates per item type, add/edit/delete steps, reassign to different item type
- Inspection run UI — `/inspections` select apparatus+compartment → `/inspections/run` checklist with asset picker, presence checks, all step types, submit logs to DB
- **Attendance module — fully built including verification queue (approve/reject with reason, approve all)**
- **Training module — DB migrated, cert types + course units, enrollments, member progress + verification, direct cert entry, training events with self-report + officer log + verification queue**
- **Incident log module — DB migrated, manual entry, apparatus + per-unit times, personnel with POV support, fire details, officer verification + finalize flow**
- Dashboard with real data + upcoming events/training this week with personal attendance status
- Error logging + email notifications
- FeedbackButton with React Portal
- Mobile header overlap fixed, input text color fixed
- Fire School — QR scanning fully working
- Vercel deployed + fireops7.com DNS configured

## IMMEDIATE NEXT — Resume Here Next Session
**Inspection history/log viewer**
- Query `item_asset_inspection_logs` + `item_asset_inspection_log_steps` for dept
- Filter by apparatus, date range, result (PASS/FAIL)
- Drill into a log to see each step response

## What's Placeholder / Not Yet Built
- Inspection history/log viewer
- `/scba` — dept SCBA pages
- `/admin/logs` — full log viewer
- QR code system (see section below)
- Equipment page — asset assignment to compartments (currently quantity-only)
- Inspection schedule settings (daily/weekly/monthly per dept)
- Supabase auth allowed URLs for custom domain
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

## Attendance Module (FULLY BUILT ✅)

### DB Tables
- `excuse_types` — department defined excuse reasons
- `participation_requirements` — minimum % thresholds per event type
- `event_series` — recurring event definitions
- `event_instances` — individual occurrences generated from series
- `event_attendance` — attendance records per member per instance

### Pages Built
- `/events` — upcoming/past events, self-log button, officer bulk logging + verification queue (approve/reject/approve all)
- `/events/new` — create one-time or recurring event, verification toggle (defaults true)
- `/dept-admin/attendance` — excuse types + participation requirements

### Key Rules
- `requires_verification` defaults to TRUE on all events — admin consciously opts out
- Self-report window: 12 hours from event start time (members only)
- Officer/admin can log retroactively at any time, no restriction
- Warning banner shown when editing past events with existing attendance records
- Members see only own attendance; dept-level aggregates on dashboard

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

## Training Module (FULLY BUILT ✅)

### Three Training Scenarios

**1. Certification Course Logging (structured)**
- Admin creates course, defines chapters with titles + hours
- Admin enrolls specific members (enrollment = gate to submit)
- Member submits completed chapter → pending
- Officer/admin verifies → all verified → eligible to test
- Admin logs test result → pass creates certification record

**2. Direct Certification Entry (standalone)**
- Admin logs cert directly — no course history required
- Fields: cert name, issuing body, cert number, issue date, expiration date

**3. Regular Training Event (non-certification)**
- Officer/admin creates event: date, topic, hours, location
- Logs attendance — no cert attached

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

### Pages Built
- `/training` — my enrollments (course progress, submit units), my certifications, training events (self-report)
- `/dept-admin/training` — cert types + course units, enrollments, pending progress verification, direct cert entry, training events + attendance log + verification queue

## Incident Log Module (BUILT ✅ — manual entry)

### Background
- CAD email (CFS PDF) received after each call — currently transcribed manually into NERIS
- Goal: bring incident logging into FireOps7, eventually replace NERIS workflow
- EMS reporting NOT in scope

### Source Documents Analyzed
- Winslow Run Sheet (Excel) — paper form covering Fire, Rescue, Standby, Mutual Aid, Meeting, Training
- CAD CFS Report (PDF) — Dodge County 9-1-1, contains CFS#, times, responders, unit activity log

### Build Order
1. Manual entry (build first)
2. CAD email parsing via Edge Function (future)
3. CAD API/webhook (future)

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

## Fire School — QR Scanning
- Uses BarcodeDetector Web API, rear camera via getUserMedia
- Scan → extracts bottle ID → calls handleCheck() directly
- Fire school IDs are generic (public, shared across depts) — separate from main app QR system

## Database Tables

### Fire Department (auth-protected, RLS)
- `departments`, `stations`, `apparatus`, `apparatus_types`
- `apparatus_compartments`, `compartment_names`
- `personnel`, `department_personnel`, `personnel_roles`
- `items`, `item_categories`, `item_assets`, `item_location_standards`
- `item_inspection_templates`, `item_inspection_template_steps`
- `item_asset_inspection_logs`, `item_asset_inspection_log_steps`
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
1. **Inspection history/log viewer** ← START HERE
2. Incident log — test + any follow-up tweaks
3. QR code system
4. `/scba` pages
5. `/admin/logs` full log viewer
6. Equipment — asset assignment to compartments
7. Supabase auth allowed URLs for custom domain

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
- CAD CFS Report (PDF) — uploaded April 16, 2026 (Dodge County 9-1-1)
  - Current workflow: received via email after call → manually transcribed into NERIS
