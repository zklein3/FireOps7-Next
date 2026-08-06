@AGENTS.md

## Session Start Checklist
1. Verify Git is installed: `git --version`
2. Run `git pull` to sync latest changes
3. Run `git status` and `git log --oneline -5`
4. Run `npm run build` to confirm clean before making changes

## Local-Only Files — Never Commit
- `.env.local` — Supabase keys + Resend API key
- `.claude/settings.json` — Claude Code permissions, machine-specific. Do NOT commit.

# FireOps7 — Project Guide

## Stack
- **Next.js 16.2.3** (App Router, TypeScript, Server Actions)
- **Supabase** (PostgreSQL 17, Auth, RLS) — project: FireOps7 (kolrhnxozeroaselapzn, us-east-1)
- **Tailwind CSS v4**, **@supabase/ssr**, **Resend** (email via Supabase Edge Functions)

## GitHub & Machines
- Repo: https://github.com/zklein3/municipal-hub — branch: main
- Primary (sole active machine): `C:\Users\zklein3\Documents\FireOps7-Next`
- Backup only (emergency failover — not actively used): `C:\Users\zklei\Documents\FireOps7-Next` — keep git pull available in case primary machine dies

## Production
- Vercel: https://fire-ops7-next.vercel.app | Domain: https://www.fireops7.com
- Every push to main auto-deploys to Vercel

## Environment Variables (.env.local — never commit)
- NEXT_PUBLIC_SUPABASE_URL=https://kolrhnxozeroaselapzn.supabase.co
- NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci... (anon key)
- SUPABASE_SERVICE_ROLE_KEY=eyJhbGci... (service role key)
- RESEND_API_KEY stored in Supabase Edge Function Secrets

## Supabase Clients
- `lib/supabase/client.ts` — browser client (anon key)
- `lib/supabase/server.ts` — server client (anon key, cookie-based session)
- `lib/supabase/admin.ts` — admin client (service role key, bypasses RLS)

## CRITICAL PATTERNS
- Always use admin client for fetching department-wide data
- Never use nested Supabase joins — causes TypeScript build errors in production
- Always fetch related data flat and join in JavaScript with maps
- sys admin has no department_personnel record — pass department_id explicitly in forms
- Never name a destructured Supabase error variable `logError` — conflicts with imported logger fn. Use `dbErr`, `stepsErr`, etc.

## Attendance Status Values (event_attendance.status)
DB constraint: `pending` | `present` | `absent` | `excused` | `excused_pending`
- `pending` — member self-logged | `excused_pending` — excuse request pending
- `present` — officer approved | `absent` — rejected or auto-closed | `excused` — excuse approved
- event_instances.status: `scheduled` | `cancelled` | `completed`

## Auth
- Roles: `is_sys_admin` (personnel table) | `system_role: admin/officer/member` (department_personnel)
- Sys admin: zklein3@outlook.com — no department_personnel record (intentional)
- signup_status: temp_password → change-password | profile_setup → profile-setup | active → dashboard | awaiting_approval → pending | denied → denied

## Mobile Layout
- Desktop: fixed sidebar (w-64, red-800) | Mobile: top bar + hamburger → MobileSidebar.tsx
- Main content: `pt-20 px-4 pb-4 sm:pt-0 sm:p-6 lg:p-8`
- globals.css forces `color: #18181b` and `-webkit-text-fill-color` on all inputs

## Dynamic Route Params — CRITICAL
```ts
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
}
export default async function Page({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams
}
```

## Dev Workflow
- Start: `npm run dev` | Build: `npm run build` (always before pushing)
- `git add . && git commit -m "message" && git push`

## Browser Testing (Playwright) — added 2026-07-12
Claude can drive the actual app in a real headless browser — log in, click through pages, screenshot, read console errors — instead of only reading source. Used for navigation/UX audits (see `audit_session6_navigation.md`) where the bug only shows up by actually clicking a link and seeing where it lands.

**Setup (one-time, already done):** `playwright` is a real `devDependency` (not ad hoc) + Chromium binary installed via `npx playwright install chromium`. Both persist across sessions on this machine — no reinstall needed unless `node_modules` gets wiped.

**Reusable driver:** `scripts/playwright-drive.mjs` — exports `launch()`, `login(page, email, password, profile?)`, `shot(page, name)`, `BASE`. Handles the temp-password → change-password → profile-setup chain automatically (sets a new password `AuditWalk2026!` if it hits `/change-password`, fills blank first/last name if it hits `/profile-setup`). Write throwaway walkthrough scripts that import this rather than re-deriving login/screenshot logic each time — keep the one-off scripts local (not committed), only the driver is a real project asset.

**Known gotchas, all handled by the driver's `settle()` helper — don't re-debug these:**
- **Turbopack dev shows a "Compiling…" badge** while lazily building a route on first hit — can take 30s+ for heavy pages (dashboard, etc). A short fixed sleep produces false "stuck on this page" failures; `settle()` polls for the badge to disappear (60s timeout) instead.
- **Dev server port varies** (3000/3001/3002) depending on what else is running — check `npm run dev`'s actual output, don't assume 3000. Set `PW_BASE_URL` env var if it's not 3000.
- **"An unexpected response was received from the server"** on a Server Action submit (login, etc.) — this is a stale action-ID from Turbopack HMR after editing a file mid-session, not an app bug. Fix: kill *all* stray `next dev` processes (Windows: `nohup npm run dev &` backgrounds the **npm** PID, not the actual Next.js child — `kill $npm_pid` doesn't touch it; use `taskkill //PID <actual-pid> //F`, the actual PID is printed in the "Another next dev server is already running" error) and start one clean instance. If it happens on an account that worked moments ago on a fresh browser context, it's this — not a login/credentials bug.
- **Test accounts' passwords get changed** by walking through the temp-password flow — `sysAdminForcePasswordReset` (`/admin/users`) resets an account back to `Hello1!` if needed for the next session.

## Test Accounts
- `zklein3@outlook.com` — sys admin | `test.winfire@fireops7.com` — Winslow admin
- `member.winfire@fireops7.com` — Winslow member | `test.admin@fireops7.com` — Fremont admin
- Temp password for new accounts: `Hello1!`

## Reference Files
- `REFERENCE.md` — routes, action files, edge functions, permissions, nav structure
- `MODULES.md` — equipment/inspection, attendance, training, incident, ISO module design + **Future Integrations** (ImageTrend EMS push)
- `HISTORY.md` — what's built, what's not, DB tables, session history
- `NATIVE.md` — Capacitor/Android/iOS app architecture and build workflow
- `ANDROID_HANDOFF.md` — handoff protocol between Claude Code and the Android Studio agent; point the Android Studio agent at this file
- `STRATEGY.md` — business strategy & platform expansion notes (MuniOps parent brand, dept type toggle, multi-dept login, ICS module spec, forms-as-product). Forward-looking, not yet built.

---

## Infrastructure & Business Roadmap

### Current State
- **Vercel** (free tier) + **Supabase** (free tier) — both production-grade platforms, not toys
- Architecture is standard PostgreSQL + Next.js — fully portable, no lock-in
- NERIS certified and approaching first live department

### Upgrade Trigger — First Paying Department or NERIS Live
- **Vercel Pro** — $20/month: removes cold starts, adds SLA, 60s function timeout
- **Supabase Pro** — $25/month: 8GB storage, no pausing, daily backups, point-in-time recovery
- **Total: ~$50/month** for production-grade setup

### Long-Term Infrastructure Path
1. **Now:** Vercel + Supabase (current)
2. **5–10 depts:** Evaluate Neon (managed Postgres, more control than Supabase)
3. **Enterprise:** AWS RDS PostgreSQL — SOC 2, encryption, multi-region. Migration = connection string change.

### Backup Strategy ✅ Working (2026-06-16)
- `.github/workflows/weekly-backup.yml` — runs every Sunday 2 AM UTC, `pg_dump` → gzip → Backblaze B2, keeps 12 weeks
- **All 4 secrets confirmed working in GitHub repo:** `SUPABASE_DB_PASSWORD`, `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`
- **Bucket name:** `fireops7-backups` on Backblaze B2 — scoped application key `fireops7-backup` (Read + Write, list all bucket names)
- **Connection confirmed working:** pooler shard `aws-1-us-east-1.pooler.supabase.com:5432`, username `postgres.kolrhnxozeroaselapzn`, `postgresql-client-17` required (PGDG repo added to workflow). pg_dump produces 412 KiB dump. Full end-to-end test passed 2026-06-16.

### PWA ✅ (2026-06-04)
- `public/manifest.json` + `public/sw.js` + root layout meta tags deployed
- Members can Add to Home Screen on Android/Chrome now; iOS works via Safari Share
- **To complete for iOS:** generate real 192×512 PNG icons → drop in `public/icons/`
- Push notifications: separate future phase

### Native App — Capacitor (after Winslow operational + funded)
- `capacitor.config.ts` scaffolded, `@capacitor/core` + `@capacitor/cli` installed
- When funded: `npx cap add ios && npx cap add android`, add PNG icons, submit to stores
- Apple Developer ($99/year) + Google Play ($25 one-time)

### Infrastructure Remaining
- **Upgrade Vercel + Supabase** — trigger: first paying dept or NERIS live (~$50/month)
- **Capacitor** — after Winslow funded

---

## IMMEDIATE NEXT — Resume Here Next Session

### Multi-Department / MuniOps Platform Expansion — IN PROGRESS ✳️ (2026-06-26)

**Shipped this session:**
- `department_type` column on `departments` (`fire | law_enforcement | public_works | municipal`, default `fire`) — migration applied
- Multi-department login flow — `signIn` redirects to `/select-department` when a user has >1 active `department_personnel` row; `selectDepartment` action validates membership and sets `selected_department_id` cookie; sign-out clears it
- Department switcher in sidebar (desktop + mobile) — "Switch Department" link, shown only when `hasMultipleDepartments`
- Navy theme (`lib/department-theme.ts`) for non-fire departments — sidebar, nav active/hover states. Fire stays red. Two-tone only for now (no per-type palette beyond fire/non-fire)
- Nav gating by `department_type` — non-fire depts see a stripped sidebar (Dashboard, Personnel, Training, Reports only); Operations/Inbox/Inventory hidden since they're fire-specific (incidents, apparatus, burn permits, medical)
- **Yutan Police Department** created (`department_type: law_enforcement`) as the pilot for Terry (fire dept member + Yutan police chief). Terry and `zklein3@gmail.com` both added as admin on Yutan PD in addition to their existing fire dept admin roles
- **Major bug fix — multi-department data scoping**: discovered the dashboard layout's cookie-aware department selection only governed the sidebar, not actual page data. ~90 files across the app independently queried `department_personnel` and grabbed the *first* row regardless of which department was selected, meaning a multi-dept user (like Terry/zklein3@gmail.com) would see one department's data while believing they were in another. Fixed via a new shared helper `lib/current-department.ts` (`getCurrentDepartmentContext()`), rolled out across every page and server action that previously duplicated the "first dept row" pattern. Also caught and fixed several **wrong-department write bugs** (`createApparatus`, `createStation`, `createDeptMember`, `saveDeptInspectionSettings` were inserting/updating against the wrong department for multi-dept admins) and a cross-department read leak in `/print/run-sheet` (any dept could print any other dept's run sheet by guessing the incident ID). Also fixed a pre-existing `logError(page, message, id)` argument-order bug (correct signature is `logError(message, page, context)`) found in `incidents.ts` and `iso.ts` while clearing type errors.
- Build verified green after every phase of this rollout — see git log for the phase-by-phase commit, or ask Claude for the file list if auditing.

**Not yet built:**
- Dept Admin hub still shows fire-specific admin cards for non-fire depts (Inspections, ISO, Medical, Events) — no gating there yet
- No police-specific modules/forms — Terry hasn't delivered his Yutan city forms yet (contact reports, internal memos, inspection checklists). Plan is to build those using the existing inspection-template-builder pattern (see STRATEGY.md "Forms as a Product")
- Reports/Training pages still query fire-shaped data under the hood — will render empty/awkward for Yutan rather than something police-relevant
- MuniOps parent brand site not started

See `STRATEGY.md` for the full roadmap this work is drawn from.

### Medical Supply Module — COMPLETE ✅ (2026-06-06)

**Key files:** `app/(dashboard)/medical/`, `app/(dashboard)/dept-admin/medical/`, `app/actions/medical.ts`, `app/(dashboard)/apparatus/[id]/MedicalBagsSection.tsx`, `app/(dashboard)/apparatus/[id]/MedicalCompartmentsSection.tsx`, `app/(dashboard)/inbox/RestockTab.tsx`, `app/(dashboard)/reports/medical/`, `app/print/medical-cs-log/`

- **Phase 1:** DB tables, admin supply/storeroom management, receive stock, alerts panel, inbox badge
- **Phase 2:** Dispense/Use (FIFO, dual-sig), Waste (reason + dual-sig), Transfer, Transaction History (90-day ledger, Print CS Log)
- **Phase 3:** CS log print, Medical Reports page, `module_medical` flag + sys admin toggle
- **Phase 4:** Stock adjustment (admin), daily alert edge function, reorder requests (inbox Restock tab)
- **Phase 5 (2026-06-06):** Lot editing (officer+: edit `lot_number` + `expiration_date` after receipt). Batch waste expired lots — waste all expired active lots in one operation (single reason + signatures). Bidirectional Restock/Transfer on bags + compartments (all surfaces: pull in from storeroom, push out to storeroom). Inbox Restock tab shows expired lots (red section) with "Go to →" link routing to `/equipment/[id]` for bags or `/medical` for storerooms. Medical reports: location type badge (Storeroom / Bag / Compartment) + apparatus context; expired rows red-tinted. Transfer button now shows when apparatus compartments exist (not just multiple storerooms). Bag inventory: Receive button removed (storeroom-only action). `medical_stock_transactions.transaction_type` constraint updated to match app values.
- **Bag system:** Template-based. Dept Admin → Medical → Bags tab. `MedicalBagsSection` + `MedicalCompartmentsSection` in apparatus View Inventory. Mode toggle (Standard ↕ / Independent ↕) per bag.

**Role model:** Members = view + use + restock non-controlled. Officers+ = receive + waste + transfer + edit lots + batch waste expired. Admins = configure + adjust.
**Controlled substances = separate future module.** `is_controlled` flag + dual-sig fields stay as schema placeholders only — no CS compliance workflows built yet.
**DB tables:** `medical_supply_types`, `medical_storerooms` (+`apparatus_id`, `compartment_id`, `template_id`, `inventory_mode`), `medical_storeroom_inventory`, `medical_stock_lots`, `medical_stock_transactions`, `medical_reorder_requests`, `medical_bag_templates`, `medical_bag_template_items`
**Transaction types:** `received` | `dispensed` | `wasted` | `transferred_out` | `transferred_in` | `adjusted`
**Storerooms** = station storage (`apparatus_id=null`). **Bags** = apparatus-linked (`apparatus_id` set, `compartment_id` null). **Compartment storerooms** = both set.

---

### 0f. Events Restructure + Training Toggle — SHIPPED ✅ (2026-06-01)
- `/events` → clean member page (cards, Log Attendance, Sign, Can't Attend). Officers see "Manage Events →" top right.
- `/dept-admin/events` → full management page (edit, bulk log, pending queue, excuse approvals, close, cancel, delete). Card added to Dept Admin hub.
- **Training toggle** on event create + inline edit: sets hours + optional cert type → auto-creates `training_events` rows per instance → linked events show on `/training` page with purple "via [Event Title]" badge
- Officer verifies attendance on training-linked event → cert auto-issued if cert type set
- Standalone training events: Cancel button added; cancelled events hidden from member view
- DB: `event_series` + `is_training`, `training_hours`, `training_cert_type_id`; `training_events` + `event_instance_id`, `cancelled`
- Apparatus ISO specs: `turning_radius_ft` + `gvwr_lbs` added to `apparatus_iso_specs`, ISO report + apparatus detail updated

### 0e. Inventory & Equipment Setup Restructure — SHIPPED ✅ (2026-06-01)
- Nav label: Equipment → **Inventory**
- `/equipment` rewritten as member-focused page: Station Storage card + apparatus list (Vehicle Check, View Inventory, Fuel Log per card)
- Equipment Setup → Items sub-tabs: **Items → Asset Categories → Assets** (templates nested inside Asset Categories per inspectable item; apparatus assignment inline on Assets tab)
- Compartments setup: Active/All toggle (defaults Active)
- Compartment display: `[unit_number] - [code]` everywhere in apparatus context; universal in setup
- Asset Roster moved to Reports hub (read-only). Apparatus assignment moved to Setup → Items → Assets.
- Scattered "Storage →" shortcut buttons removed; Storage now accessed from Inventory page card

### 0f. Batch QR Print — Asset Classes, Compartments, Apparatus all SHIPPED ✅ (2026-07-10)

`/print/qr-batch` now handles all three via a `type` param (`asset` default / `compartment` / `apparatus`), same format selector (Sheet 3-up / Avery 5160 / 5163 / 5164), same page — no separate component extraction needed since it was never duplicated across routes.
- **Assets** (2026-07-01): `?item_id=...` — unchanged, backed by `/api/assets-for-item`. "Print All QRs" button in Dept Admin → Setup → Items → Assets tab.
- **Compartments**: `?type=compartment&apparatus_id=...` — backed by new `/api/compartments-for-apparatus` (flat-fetch + JS join, per the no-nested-joins rule). "Print All QR Codes" button on the apparatus detail page (`ApparatusDetailClient.tsx`), next to "Start Inspection Session". Only compartments with a `qr_code` already set are included.
- **Apparatus**: `?type=apparatus&apparatus_id=...` — backed by new `/api/apparatus-qr`. "Print QR (Label Sheet)" link in the apparatus detail header, next to the existing single-page `QrPrintLabel` button — this one puts it on an Avery label instead of a full page. Only shown when `apparatus.qr_code` is set (same gating as the existing single-QR button).

### 0. Nav Hub-and-Spoke — SHIPPED ✅ (2026-05-20)
Sidebar trimmed to 6 items. Hub pages live at `/operations`, `/equipment` (enhanced), `/reports`, `/dept-admin`, `/iso`. `PageNavBar` on every page. No further nav work needed unless user requests tweaks after testing.

### 0d. Vehicle Check — SHIPPED ✅ (2026-05-31)
Standalone truck check at `/inspections/vehicle-check/[id]` — separate from compartment inventory inspection.
- 24 default items across 7 groups: Fluids, Mechanical, Lights, Communications, Emergency Equipment, Cleaning, Air Brakes
- Every item has instructions (procedure, what to look for, pass/fail) — shown expanded by default, tap to collapse
- Per-apparatus toggles on apparatus detail page: `has_air_brakes` (adds Air Brakes group), `has_engine_hours` (adds engine hours field)
- Admin manages checklist via Dept Admin → Inspections (new hub card) → Vehicle Check Items tab
- Results stored in `vehicle_inspections` + `vehicle_inspection_results`; history panel shows last 10 checks
- "Do inventory on this vehicle?" link connects to compartment inspection session
- Equipment Setup → Apparatus consolidated to single Edit button (was 3 redundant buttons)
- Apparatus detail page: ISO Specs + Pump Tests section now before Compartments

**Note for existing depts:** Go to Dept Admin → Inspections → Vehicle Check Items → Reset to defaults once to load instruction text into the DB.

### 0a. Incident Run Signatures — SHIPPED ✅ (2026-05-23)
- `incident_signatures` table — unique `(incident_id, personnel_id)`, `signed_at` null = pending
- Triggered on NERIS submit — rows upserted for all non-absent personnel
- Members sign via `/inbox` Signatures tab (`IncidentSignaturePadModal`)
- Officer/admin sees signed/pending roster on incident detail page
- Inbox opened to all members; layout badge includes pending signature count
- `standby` role added to `incident_personnel_role_check` constraint

### 0b. Run Sheet Print — SHIPPED ✅ (2026-05-23, enhanced 2026-05-24)
`/print/run-sheet?id=xxx` — matches dept paper Run Field Report, fits one letter sheet.
- Units Dispatched: each apparatus with member names; **POV** group (no apparatus, role ≠ standby); **Station** group (no apparatus, role = standby)
- Single "Incident Role" column header at top of Units Dispatched section
- Role labels (IC, Driver, Officer, FF) right of name; members sorted IC → Driver → Officer → FF → Standby
- Cert labels below name — driven by `certification_types.show_on_run_report` flag (dept controls which certs appear)
- Incident info labels tab-aligned (CSS grid, 1.35in label column); address includes zip
- Incident Time rows span full column width (label left, time line right)
- Type of Incident: labels left, checkboxes right; additional fields span full width
- Mutual aid reads `incident_mutual_aid`: `gave_aid` → To, `received_aid` → From
- Key file: `app/print/run-sheet/page.tsx`

### 0c. Run Report — SHIPPED ✅ (2026-05-24)
`/reports/run-report` — filterable incident list with print links.
- Filters: date range (default last 90 days) + incident type dropdown (only types present in dept)
- Each row: date, incident #, type badge (color-coded), address, unit count, responder count
- Print ↗ button opens `/print/run-sheet?id=...` in new tab
- Card added to `/reports` hub (officers + admins)

### 1. Training — ✅ Core complete (2026-06-02)
Built 2026-05-17. Enhanced 2026-05-24. Outside training submission flow added 2026-06-02.

**What's working:**
- Unified member training page (My Training list + My Certifications)
- Simple cert: assign → training date → member logs attendance → officer verifies → cert issued → member signs
- Training event with cert type: bulk log attendance → cert auto-issued to all
- Direct cert entry (admin): picks cert type or enters custom name, dates, cert number
- Dept-wide enrollment: "Assign to All Active Members" toggle
- Cert signatures on all records (CertSignaturePadModal)
- **Member Certs tab** in Training Admin: officers read-only, admins can edit
- `show_on_run_report` flag on cert types — controls run sheet cert display
- **Outside training submission** — member logs external classes (conference, seminar) via "Log Outside Training" button on `/training`. Optional photo upload → Claude Haiku parses image and pre-fills fields. Optional purpose + NREMT category dropdowns. Sits as `pending` until officer/admin approves via Submissions tab in Training Admin. Approval can link to a cert type (auto-issues cert for recert/initial_cert). All submissions (pending/approved/rejected) visible on member training page with status badge and reviewer notes.

**NREMT categories (built in):** AIRWAY | CARDIOLOGY | TRAUMA | MEDICAL | OPERATIONS

**Known gaps still open:**
- Training event cert issuance deduplication (same-day check only — may double-issue if event re-verified)
- No expiry notification for certs approaching expiration
- Outside training print record (deferred — needs Vercel push to test)

### 2. NERIS — Payload validation in progress ✳️ (2026-05-22)
V1 Compatible badge earned. Production Client ID + Secret set in Vercel + .env.local.
`NERIS_USE_TEST=true` in `.env.local` — test credentials were retired when badge was issued; no test OAuth available. Use payload preview for local dev; live submissions go through Vercel once a real dept is enrolled.

**Auth situation:** Production credentials only work against `api.neris.fsri.org`. Test API (`api-test.neris.fsri.org`) had separate credentials that were retired. To go live: flip `NERIS_USE_TEST=false` in Vercel, set real dept FDID as `neris_entity_id`, dept must be enrolled and linked to vendor account `VN03615504`.

**Admin panel resolve/dismiss — SHIPPED ✅ (2026-07-10):** `/admin/neris` was previously 100% read-only on both its Issues and Error Logs tabs — no way to close anything out from the panel itself.
- **Error Logs tab:** now has per-row Resolve + bulk "Resolve All" (reuses `resolveLog`/existing `system_logs.resolved` flow already built for `/admin/logs`, just wasn't wired in here). Also: `submitToNeris()` (`app/actions/neris.ts`) now tags its `logError` calls with `metadata: { incident_id }`, and on a successful submission auto-resolves any earlier unresolved NERIS log rows tied to that same incident — closes the loop going forward instead of requiring a manual click every time a fix lands.
- **Issues tab:** this was the actual bug behind "I fixed it but it still shows open" — the tab is a live filter on `incident_neris.neris_status`/`completed_at` with **no dismiss mechanism at all**, so a row can get permanently stuck (e.g. old test-era incidents marked ready under `NERIS_USE_TEST=true` before test credentials were retired — they can never be submitted through the normal flow again, so they sat in Issues forever). Added `incident_neris.neris_issue_dismissed` (boolean, migration `add_neris_issue_dismissed`) + `setNerisIssueDismissed()` (`app/actions/departments.ts`, sys-admin gated) + a Dismiss/Restore button per issue. Dismissed issues stay visible (grayed out, same convention as resolved logs) but drop out of the issue count and the sidebar badge.
- Sys-admin nav badge on `/admin/neris` (added same session, see §12 below) now excludes dismissed issues from its count.

**Sys-admin NERIS Entity ID field — SHIPPED ✅ (2026-07-12):** `saveNerisEntityId()` (sys-admin gated) existed with no UI anywhere calling it — `/admin/dept/[id]` had `neris_entity_id` typed into its `Dept` interface but never rendered as an input. Dept admins already had self-service via `saveDeptAdminNerisEntityId` at `/dept-admin/neris`, but sys admin had zero path to set it for a department. Added an entity ID input + Save button inside the NERIS bundle card on `ModulesTab.tsx` (Dept Admin → sys-admin dept detail → Modules tab) — found during the session 6 navigation/dead-code audit (see `audit_session6_navigation.md`).

**Dept enrollment UI built** (`/dept-admin/neris`) — 4-step guide, Client ID copy button, Test Connection.
**Admin troubleshooting panel built** (`/admin/neris`) — Departments / Issues / Error Logs tabs.

**New DB column:** `incident_neris.neris_last_error` — stores API error on failed submissions.

**Confirmed live submissions (test API, `NERIS_USE_TEST=true`):**
- `FD35049607|WIN26-0017|1779004260` — rescue (2026-05-17)
- `FD35049607|FRE26-T001|1779199200` — structure fire
- `FD35049607|FRE26-T002|1779204600` — medical (chest pain)
- `FD35049607|FRE26-T003|1779209100` — hazmat (gas leak)
- `FD35049607|WIN26-0008|1771255200` — structure fire with investigation
- `FD35049607|WIN26-0002|1767597600` — mutual aid
- `FD35049607|26-0100|1761846420` — vehicle / transportation fire

**Confirmed payload structures (2026-05-19 + 2026-05-22):**
- Actions taken: flat string array — groups ordered suppression-first in `NERIS_ACTIONS_TAKEN`
- Ventilation actions have timing variants (PRIOR_TO_SUPPRESSION / DURING_SUPPRESSION / POST_SUPPRESSION) — added 2026-05-22
- Fire module — `location_detail.type` discriminator:
  - `STRUCTURE`: condition on arrival, building damage, cause, floor of origin (required), room of origin (required), water supply, investigation
  - `OUTSIDE`: cause, acres burned, water supply — NO condition on arrival, NO building damage, NO floor/room
  - Transportation fires (`FIRE||TRANSPORTATION_FIRE||*`): also use `OUTSIDE` type — only cause sent
- Alarm/suppression modules: structure fires only, NOT sent for outside or transportation fires
- `investigation_needed` + `investigation_types`: always sent for fire incidents
- Mutual aid: `involves_mutual_aid` boolean on `incident_neris`
- **Rescue module** (`casualty_rescues[]`) — confirmed correct 2026-05-22:
  - Per person: `type` (FF|NONFF) + `rescue` + optional `casualty`
  - `rescue.ffrescue_or_nonffrescue` discriminated by type: FF rescue types → `FfRescuePayload` (requires `removal_or_nonremoval`); non-FF → `NonFfRescuePayload`
  - FF rescue `removal_or_nonremoval.type`: EXTRICATION | DISENTANGLEMENT | RECOVERY | REMOVAL_FROM_STRUCTURE | OTHER
  - `rescue.presence_known`: NONFF persons only (regardless of who did the rescuing)
  - `casualty.injury_or_noninjury.type`: UNINJURED | INJURED_NONFATAL | INJURED_FATAL
- **Medical module** (`medical_details[]`) — field names confirmed 2026-05-22:
  - `patient_care_evaluation` (required), `patient_status`, `transport_disposition`
  - `transport_disposition` values: TRANSPORT_BY_EMS_UNIT | OTHER_AGENCY_TRANSPORT | NONPATIENT_TRANSPORT | PATIENT_REFUSED_TRANSPORT | NO_TRANSPORT
- **Hazmat module**: top-level key is `hazsit_detail` (not `hazardous_situation`) — sub-fields still TODO(api-review)

**Confirmed clean payloads (preview verified 2026-05-22):**
- Motor vehicle extrication (`RESCUE||TRANSPORTATION||MOTOR_VEHICLE_EXTRICATION_ENTRAPPED`) — FFD26-1819
- Wildland fire (`FIRE||OUTSIDE_FIRE||WILDFIRE_WILDLAND`) — UEH26-0017

**Still to verify:**
- Mutual aid module payload structure
- Hazmat module sub-field names (`hazsit_detail` inner fields)

**Key files:**
- Payload builder: `app/actions/neris.ts` → `buildNerisPayload`
- Value sets (all confirmed enums): `lib/neris-value-sets.ts`
- Requirements checker: `lib/neris-requirements.ts`
- See `NERIS.md` for full field reference

### 3. ISO Hose — SHIPPED ✅ (was already built in a prior session; CLAUDE.md just never got updated — HISTORY.md had it right)

**Two parallel systems — no overlap:**

**A) `hoses` table — inventory + testing only**
- Tracks physical hose sections (H-0001, H-0002, etc.) by diameter and length
- No location field — we don't track which truck a specific hose is on
- Annual pressure tests logged per section via `hose_tests` table
- No DB changes needed to `hoses` table

**B) `apparatus_iso_specs.hose_loads` — per-truck load spec (already built 2026-05-15)**
- Engine 32: 500ft of 3", 300ft of 1.75" (not linked to specific hose IDs)
- This is the source for on-truck totals in the ISO report
- No changes needed — keep as-is

**ISO Report hose section** — built in `/iso/report`: Diameter / Total Owned / On Trucks / In Storage table (amber warning if In Storage goes negative — a real gap), plus a separate Hose Test Compliance (NFPA 1962) section showing Tested/Failed/Overdue per hose off the last 12 months of `hose_tests`.

**Hose testing session** — `/iso/hoses/session` (`HoseTestSessionClient.tsx`), matches the spec: header set once (date, pressure, duration default 5min, tester read from login), per-hose Pass/Fail with failure reason on Fail, warns if entered pressure is below the hose's required PSI, submits via `submitHoseTestSession()` → one `hose_tests` row per hose. Also reachable via a per-hose "Log Test" inline form on `/iso/hoses` for one-off (non-session) logging.

**Fixed 2026-07-10:** `requiredPsi()` was keyed primarily off the user-assigned `hose_type` field (attack/supply/forestry/etc.) with a diameter override only for `>=4"`, so a mistagged hose (e.g. a 2" hose typed `supply`) would get shown the wrong required PSI. Changed to purely diameter-driven (`>=4" → 200 PSI, else 300 PSI`) matching the NFPA 1962 rule as documented above — `hose_type` still displays for context, just no longer drives the PSI requirement.

**Key files:** `app/(dashboard)/iso/hoses/HosesClient.tsx`, `app/(dashboard)/iso/hoses/session/HoseTestSessionClient.tsx`, `app/actions/iso.ts`, `app/(dashboard)/iso/report/page.tsx`

### 4. ISO Module — Gating Architecture Decision ✳️ FUTURE REFACTOR
Current state: hose inventory, hose testing, hydrant tests all gated behind `module_iso`.

**Agreed architecture (build now as ISO, refactor gating later):**
- **Base platform (no gate):** Data collection — apparatus specs, pump tests (NFPA 1911), hose inventory/testing (NFPA 1962), hydrant flow tests. Departments need this regardless of ISO — it's NFPA compliance.
- **ISO module only:** `/iso/report` — the compiled audit-ready report. This is the reporting layer that justifies the module gate.

**What changes when we refactor:**
- Move hose/hydrant pages out of ISO nav into a general Compliance section (main nav)
- Only `/iso/report` stays behind `module_iso`
- ISO Specs button on apparatus (feeds the report) stays gated
- Data collected before module upgrade automatically populates the report

**Why deferred:** Continue building ISO features as-is under the current gate. Change the gating in one pass once ISO section is feature-complete.

### 5. ISO Mutual Aid — Data Entry Roadmap (future phases)
Current: manual entry by user (Phase 1, built 2026-05-16).

**Phase 2 — Partner link:** Generate a shareable URL the dept admin emails to the M/A department. Partner fills out their apparatus specs (pump, tank, hose loads) via a public form (no login). Submits → populates the agreement record. Same pattern as burn permit public form.

**Phase 3 — System-to-system:** If the M/A department also uses FireOps7, their apparatus ISO specs (`apparatus_iso_specs.hose_loads`, pump rating, tank) can be pulled directly from their dept record. Admin links agreements by selecting the partner dept from a FireOps7 dept lookup instead of entering manually. Data stays live — if partner updates their specs, it reflects automatically.

**Key files when building:** `app/(dashboard)/iso/mutual-aid/`, `app/actions/iso.ts` → mutual aid actions, `iso_mutual_aid_agreements` table.

### 6. ISO — Configurable Single-Page Report Builder — SHIPPED ✅ (was already built in a prior session at `/iso/report/print`; CLAUDE.md just never got updated, same pattern as §3)

`/iso/report/print` (`PrintReportClient.tsx`) already had all 10 sections (the 8 listed above plus Certifications and Response Times, which the original spec didn't call out), section show/hide toggles, a 6/12/24/36-month date range selector (`?months=` searchParam, re-fetches server-side), audit date/auditor name header fields, and a Print/Save PDF button — but every one of those controls was **ephemeral, reset on reload, never persisted**. That's the actual gap this session closed:

- New `departments` columns (migration `add_iso_report_settings`): `iso_audit_date`, `iso_auditor_name`, `iso_report_default_months` (default 12), `iso_report_sections` (jsonb, default all-true).
- `saveIsoReportSettings(departmentId, settings)` (`app/actions/departments.ts`) — admin-only (mirrors `saveDeptTimezone`'s gate), writes those columns.
- "Save as Default" button on the report builder panel (admin-only, next to Print/Save PDF) — persists whatever audit date/auditor/months/section-toggles are currently set as the department's defaults, so the next person to open the report starts from those instead of blank/all-sections-on. Per-visit overrides still work exactly as before; this only changes the *starting* values.
- `/iso/report/print/page.tsx` now reads the saved defaults and uses `iso_report_default_months` as the fallback when no `?months=` param is given (was hardcoded to 12 regardless of dept preference).
- **Print-chrome fix (affects every in-dashboard print page, not just ISO):** the sidebar (`<aside>` in `app/(dashboard)/layout.tsx`), mobile top bar (`MobileSidebar.tsx`), and the "← Back" bar (`PageNavBar.tsx`) had no `print:hidden` anywhere — they'd bleed into the printed/PDF output on every dashboard-embedded print page (ISO report, `/reports/inspections`, etc.). Added `print:hidden` to all three. This was a real, previously-unnoticed gap in the "clean multi-page PDF" requirement, not ISO-specific.

### 7. ISO — Aerial Testing (deferred — build when dept has aerial apparatus)
Same model as pump tests (NFPA 1911). Date, vendor, pass/fail, document upload per apparatus.
Only relevant for depts with aerial apparatus — skip until needed.
Key files when building: `apparatus_pump_tests` pattern, `app/actions/iso.ts`, apparatus detail page.

### 9. Email / Resend — DONE except welcome email ✅ (2026-07-10)

`fireops7.com` transfer + Resend verification complete (verified 2026-06-07). Permit approval email (`send-permit-approval` Edge Function) and landing page contact form (`app/actions/contact.ts`) both live.

`municipal-hub.com` (MuniOps parent brand, DNS via Vercel Domains) is **not** verified in Resend — plan only includes 1 domain, upgrade costs money not budgeted right now. Decision: leave it. Contact form (`RequestAccessModal` on `/` and `/fire`) sends from `noreply@fireops7.com` for both sources, but subject/body brand text (MuniOps vs FireOps7) is now correct per source page via a `source` hidden field — no Resend plan change needed for that fix. Revisit verifying `municipal-hub.com` only if/when upgrading Resend.

**New Member Welcome Email — SHIPPED ✅ (2026-07-10)**
- `createDeptMember` / `createDeptAdmin` (`app/actions/users.ts`) each take a `send_welcome_email` checkbox (default checked) plus optional `first_name`/`last_name` on the Add Personnel / Add Dept Admin forms.
- Checked → generates a random 10-char temp password (`generateTempPassword()`) and emails it inline via Resend (`sendWelcomeEmail()`, same `noreply@fireops7.com` sender as other transactional email — brand text and login link vary by `department_type` via `getDeptBrandName()` / `getLoginPath()`: fire→`/fire/login`, law_enforcement→`/police/login`, public_works→`/public-works/login`, else→`/login`).
- Unchecked → uses the fixed `Hello1!` password, no email sent — intended for test/demo account creation.
- Removed the old dead `adminClient.functions.invoke('send-welcome-email', ...)` call — implementation is now inline in `users.ts`, not a separate Edge Function. **Correction (audit session 5, 2026-07-10):** the `send-welcome-email` Edge Function itself was NOT "never built" as this note originally said — it's deployed on Supabase (v3, `ACTIVE`), real code exists there, it was just never actually wired up correctly by the old `.invoke()` call. It's dead/unused now regardless (nothing in the codebase calls it) — **pending manual deletion** via Supabase dashboard or `supabase functions delete send-welcome-email` (no MCP tool available to delete it directly).
- If the email send fails (or is skipped), the action returns `tempPassword` so the UI shows it on-screen for the admin to relay manually instead of it disappearing.
- **Known unresolved:** brand naming still disagrees between `lib/department-theme.ts` (`PoliceOps`/`MuniOps`, red/navy binary) and the marketing/login pages (`LawOps`/`CivicOps`, red/blue/green) — the welcome email currently follows `department-theme.ts` naming. Not yet decided which is canonical; revisit when picking one.

### 9a. Public Records Requests — Reconsider Removing from Public Site ⬅ PINNED FOR LATER
Most small departments aren't actually set up to handle public records requests this way (no formal process). Don't remove yet — wait and see whether any department gets real submissions through `/dept/[slug]/records` (`public_record_requests` table) before deciding whether to pull the "Request Records" card from the public site.

**Note:** Facebook page now links to the public site (set up 2026-06-09) — public site is getting real outside traffic now, so any future removal should be a deliberate UI change, not a silent drop (residents may have bookmarked/shared links).

### 10. QR Self Check-In — Event / Training / Incident — SHIPPED ✅ (2026-07-10)
`lib/checkin-token.ts` — HMAC-SHA256 signed token (`base64url(payload).signature`, no new dependency, signed with `SUPABASE_SERVICE_ROLE_KEY`), payload `{ type: 'event_instance' | 'training_event' | 'incident', id, exp }`. No DB table — tokens are minted on demand, not stored, so there's nothing to clean up and officers just regenerate a fresh QR if one expires.
- `app/actions/checkin.ts` → `generateCheckinToken(type, id)` — officer/admin only, verifies the record's `department_id` matches the caller's current department before minting (blocks a multi-dept officer from generating a token for the wrong department). TTL: 24h for events/training, 7 days for incidents (matches the existing self-log windows those actions already enforce independently).
- `/checkin/[token]` (`app/(dashboard)/checkin/[token]/`) — verifies the token, requires login (`redirect('/login?next=/checkin/...')` if not, reusing the existing `next` param support already built into `signIn`/`/select-department`), re-verifies department ownership server-side (defense in depth beyond the token check), shows the event/incident name + "Checking in as [name]", one tap to confirm. Already-checked-in visits show the confirmation immediately instead of a duplicate button.
- **Reuses the existing attendance actions as-is** rather than inventing new logging paths: `logAttendance()` for event instances, `selfReportTrainingAttendance()` for standalone training events, `logIncidentAttendance()` (with a role picker, default Crew) for incidents — so a check-in produces exactly the same `pending`/`present`/`verified` record a manual "Log Attendance" click would, no new status vocabulary.
- "Check-In QR" button added at the three officer-facing surfaces: `EventsAdminClient.tsx` (per event card — covers plain events AND training-linked events, since both write to `event_attendance`), `TrainingClient.tsx` (per standalone training event only — training linked to an `/events` entry is out of scope here since attendance for those goes through the event instance, not `training_event_attendance`), `IncidentDetailClient.tsx` (Personnel on Scene header). Each opens `/print/qr?type=checkin&code={token}&title={name}` in a new tab — extended `app/print/qr/page.tsx`'s existing `qrValue` branching rather than building a parallel print page; the raw token isn't shown as text under the QR (unlike apparatus/asset codes) since it's long and meaningless to a human.
- Distinct from Salamander card scanning (§10a) — this is member self-check-in, not officer-scans-others-cards. §10a (incident accountability/PAR) can now be picked up per the original sequencing note.

### 10a. Salamander QR — Incident Accountability (PAR) — SHIPPED ✅ (this whole section was stale — actually built 2026-05-24 through 2026-06-26, several sessions ago)
Salamander cards are for officer-scans-others-cards at a scene, not self check-in (distinct from §10 QR Self Check-In). Full board system live at `/accountability` (list) → `/accountability/[boardId]` (`AccountabilityBoard.tsx`, 567 lines) → `/accountability/new`.
- **Parser:** `lib/salamander.ts` → `parseSalamanderCard(raw)` (not `parseSalamanderQR` — correcting a stale function name in this doc), returns `{ firstName, lastName, department, title, certs[] } | null`. Single regex pipeline, all-or-nothing on name+department match — **known brittle, every new physical card variant so far has needed a hand-added regex branch** (see git log: 183f02b, 48c480a, 28c075d). Don't attempt to "fix" this blind — there's no synthetic test data that reflects real card encoding quirks.
- **Matching:** `personnel_qr_tokens` table links a card's canonical key (`salamanderCanonicalKey()` → `SAL:LAST:FIRST:DEPT`) to a `personnel_id`. Unmatched cards (valid parse, no linked token) or fully-failed parses fall back to `raw_name`/`raw_dept` on the entry — treated as mutual aid/visitor, not an error state.
- **Tables (actual names — differ from an earlier draft of this note):** `accountability_boards` (title, board_date, status, `linked_incident_id`/`linked_training_event_id`/`linked_event_instance_id`), `accountability_lane_templates` (dept-level defaults: Staging, Command, Interior Attack, Exterior/Suppression, Ventilation, RIT/RIC, Rehab, EMS), `accountability_lanes` (per-board, copied from templates on "Start Accountability"), `accountability_entries` (`board_id`, `lane_id` nullable→Unassigned, `personnel_id` nullable, `raw_name`, `raw_dept`, `status`, `checked_in_at`), `accountability_par_checks` (jsonb snapshot of lane→names at time of check).
- **Manual entry is first-class**, not a fallback bolted on — same `checkInPerson()` action as scanning, dropdown of known dept members or free-text name/agency for visitors, and any raw-name entry (scanned or manual) can be corrected in place via "Edit Name" without re-scanning.
- **Realtime sync** via Postgres changes subscription (board updates live across multiple officers' phones) — required an explicit `supabase.realtime.setAuth()` call before subscribing, was silently broken twice (f95843f, 5eee1ec) before landing.
- **Debug scan capture + viewer — SHIPPED ✅ (2026-07-10):** `qr_debug_scans` (id, raw_value, scanned_at, source) captures every scan that fails to parse (auto) plus anything pasted into the board's "paste raw scan data" panel (manual, officer-triggered, always available regardless of parse success). Previously write-only — had to query Supabase directly to see what a failing card contained. Now viewable at `/admin/qr-debug-scans` (sys admin only, added to the sys-admin nav) — `lib/salamander.ts` → `unescapeDebugRaw()` reverses the hex-escaping applied before storage, then **re-runs the current parser against every captured scan live** so each row shows "✓ Parses now" or "✗ Still fails" plus the extracted fields when successful — no more guessing whether an old capture was already fixed by a later regex change. Delete/Clear All included since the table has no other cleanup path.
  - `source` column (migration `add_qr_debug_scans_source`, default `'accountability'`) added forward-looking for whenever Salamander scanning expands beyond incident accountability (meeting/class attendance, etc. — not built yet). `saveDebugScan(rawValue, source?)` (`app/actions/accountability.ts`) takes an optional source tag; any new scan point just needs to pass its own source string when calling it and entries will show up distinguishable in the same shared viewer. The source filter dropdown/per-source Clear only appears in the UI once more than one source actually exists — invisible today since everything is still `'accountability'`.
- **Sys-admin nav badges — SHIPPED ✅ (2026-07-10):** the sys-admin-only nav items (`/admin/neris`, `/admin/qr-debug-scans`) now show an unread-style count badge — NERIS badge = same "Issues" definition used on `/admin/neris` itself (status=error, or draft with `completed_at` set), QR badge = count of debug scans that **still fail** under the current parser (not raw row count — already-resolved captures don't nag). Computed in `app/(dashboard)/layout.tsx`, only when `viewingSysAdminOverview` (i.e. never shown to dept admins). `/admin/neris` had no badge before this either — same "you have to remember to check" gap existed there too, now fixed for both at once.

### 11. Officer Sub-Menu — SHIPPED ✅ (2026-07-10)
`/officer` hub page (`app/(dashboard)/officer/page.tsx`), nav item shown between Inbox and Personnel for officer/admin, fire depts only (`ctx.departmentType === 'fire'`, redirects to `/dashboard` otherwise — non-fire depts don't have the underlying Operations/Inventory/Inbox pages this links to). Three sections: Operations (Manage Events, Accountability, Hose Testing Session if `module_iso`), Reports (deep links to all 8 officer-gated `/reports/*` cards + Movement Log, which was previously only reachable two clicks deep via `/equipment/storage`), Inbox (Burn Permits/Records if `public_site_enabled`, Restock if `module_medical`, Feedback always — via `/inbox?tab=...`).

**Known tradeoff, decided deliberately:** most of these links were already one click away from `/reports`, `/iso/hoses`, `/operations`, or the `/events` page — this hub mostly duplicates existing entry points rather than filling gaps (the only genuinely new discoverability fix is Movement Log). Built anyway per explicit request, valued as a single "everything officer" bookmark over marginal duplication.

### 11. Zip Code Auto-Fill on Incident Forms — SHIPPED ✅ (2026-07-10)
`lib/zip-lookup.ts` → `lookupZip(zip)` hits `https://api.zippopotam.us/us/{zip}` (free, no key), returns `{ city, state }` or null. Wired to the zip field's `onBlur` on both New Incident (`NewIncidentClient.tsx`, already-controlled fields) and Edit Incident (`IncidentDetailClient.tsx` — address/city/state/zip pulled into a new `AddressFields` child component so they could become controlled without breaking the "Cancel discards edits" behavior, which relied on the fields being uncontrolled/remounting). Only fills city/state when both are currently empty — no overwrite-confirm dialog, kept simple.

### 12. Timezone Setting per Department — SHIPPED ✅ (2026-07-08)
`departments.timezone` column + Dept Admin → Settings picker (IANA tz names). Shared `format-datetime` helper renders timestamps in the dept's local zone instead of hardcoded `America/Chicago`/UTC — rolled out across logs, announcements, events admin, and other timestamp displays.

### 12. Module / Feature Flag System — mostly already done, was stale ✅ (2026-07-10)
Turns out the sys-admin toggle UI already existed and was fully built out: `/admin/dept/[id]` → Modules tab (`ModulesTab.tsx` + `updateDepartmentModules()`) already covers Bundle A (`module_operations`), NERIS, Bundle B/ISO (`module_iso`), Bundle D/Medical (`module_medical`), and Bundle C/Public Engagement (`public_site_enabled`) — this note was just out of date. The one real gap — `module_fuel_storage` had no sys-admin visibility, only a dept-admin self-service toggle (`app/(dashboard)/dept-admin/FuelStorageToggle.tsx`) — is now closed: added as a bundle in `ModulesTab.tsx`, both toggle paths write the same column so they stay in sync.

### 13. Full-Site Playwright Audit — Screens + Functional Walkthrough — SHIPPED ✅ (2026-08-06)
Two-part audit run in one session against a dedicated throwaway "QA Test Department" (created via sys admin, not reused from Winslow/Fremont). Full write-up in memory: `audit_session7_functional_ux.md`.

**Part B (functional, from-scratch)** — every module walked end-to-end with each write verified against the DB directly (not just screenshots): station → apparatus → compartment → item → inspection checklist → asset → inventory assignment → ran an actual inspection session → medical storeroom → receive/dispense/waste → events → self-log + officer-approve attendance → incident → NERIS readiness page → ICS module → accountability board → kiosk device. All of it works correctly at the data layer.

**Part A (visual sweep)** — admin/officer at desktop+mobile, member at mobile, sys admin at desktop. Found real mobile-specific cutoffs (accountability board title truncates to "Q..", incidents table clips the Address column).

**Headline findings (full detail in the memory file):**
- **Systemic bug:** 8 separate "quick add" forms across unrelated pages (Users, Setup→Stations, Medical storerooms/receive/waste, Events approval, ICS, Accountability) succeed server-side but don't refresh the UI — looks like a silent failure until manual reload. Worth a dedicated pass across all "quick add" client forms rather than one-off fixes.
- **Gating gap:** `/iso` hub page never checks `module_iso` (all 5 sub-pages do) — dead-end but reachable by URL for depts without the module.
- **Silent failure:** new departments get zero accountability lane templates; `initBoardLanes` returns a real error but the client never shows it, so "Start Accountability" appears to do nothing on a brand-new department's very first use.
- **Duplicate nav bar** on `/ics` and `/ics/[id]` (desktop + mobile).
- Also discovered the **ICS module is fully built and functional** (incident command packets 201–214, cross-department jurisdiction) with **zero mention anywhere in this file's shipped-feature history** — folding it into the record now. REFERENCE.md's route list was also confirmed significantly stale (~30 undocumented routes).

**Fixes applied 2026-08-06 (same session, user asked to fix immediately after reviewing the report):**
- Added `router.refresh()` to every "quick add" client form that was genuinely missing it: `UsersClient.tsx` (Add Dept Admin + all modal actions), and the whole `dept-admin/setup` wizard (`StationsStep`, `ApparatusStep`, `CompartmentsStep`, `ItemsStep` — categories/items/assets/templates/steps/custom fields all now refresh). Verified live: a newly-added station now appears without a manual reload (self-corrects in ~2.4s — that page fans out a lot of Supabase queries on refresh, so it's not instant, but it's a real fix over "never updates without a hard reload").
- **Investigated further and found the pattern splits in two:** Medical (dept-admin + member pages), Events approval, and ICS already called `router.refresh()` correctly in code — their residual lag is `router.refresh()`'s inherent async round-trip, not a missing call. No further code change made there; flagged as a possible future optimistic-UI improvement if the lag ever bothers a real user, but not a bug as such.
- **Accountability — real root cause fixed, not just papered over:** `AccountabilityBoard.tsx`'s empty-lanes early-return (`lanes.length === 0`) had zero error display, so `initBoardLanes`'s error message was being set in state but was structurally unreachable. Fixed by adding the error banner to that branch. Then fixed the actual root cause: `initBoardLanes` (`app/actions/accountability.ts`) now auto-seeds the same 8 default lanes the Dept Admin settings page seeds, instead of erroring — a brand-new department's first "Start Accountability" click just works now, verified live against a genuinely template-less department. Extracted the previously-duplicated `DEFAULT_LANES` array into `lib/ics-roles.ts` as `DEFAULT_ACCOUNTABILITY_LANES`, shared by both call sites; also fixed the settings page's comment that claimed defaults were "never force-seeded" when the code directly below it always did.
- `/iso` hub page (`app/(dashboard)/iso/page.tsx`) now checks `module_iso` before rendering, matching all 5 of its sub-pages. Verified live — a department without the module now redirects to `/dashboard`.
- Removed the duplicate `<PageNavBar />` on `/ics` and `/ics/[id]` (both explicitly rendered their own on top of the one `(dashboard)/layout.tsx` already renders globally for every page).
- Mobile: accountability board list rows now stack (`flex-col sm:flex-row`) instead of forcing the title into a shrinking flex-1 column fighting a `shrink-0` badge cluster — "QA Test Board" no longer truncates to "Q..".
- **Investigated and closed, not a bug:** the `/incidents` mobile table already had correct `overflow-x-auto` + `min-w-[640px]` — scrolling right reveals Address/Status/NERIS exactly as designed. The original screenshot just caught the unscrolled default view. No change made.

Build verified clean (`npm run build`) after all changes. Dev server was restarted once mid-fix after hitting the documented "stale Server Action ID from HMR" gotcha (see Browser Testing section) from editing files while it stayed running — resolved per the documented fix.

---

## Run Sheet Import — Central Square CFS Format
Action: `app/actions/parse-run-sheet.ts` | Model: Claude Haiku | Key: `ANTHROPIC_API_KEY`

**Three time sources in every CFS:**
1. Page 1 header — `Call Time` → `call_time` | `Completed Time` → `in_service_at`
2. `Response Times` block — dept-level: `Assigned` → `paged_at`, `Arrived` → `first_on_scene_at`, `Leaving` → `last_leaving_scene_at`
3. `Unit Response Times` section — per-vehicle: `Enroute`, `Arrived`, `Leaving Scene`, `Available`/`Off Duty`

**Unit number matching:** CAD uses 3-letter agency prefix (e.g. `WIN11`); DB stores plain number (`11`). Parser given dept's unit list; Claude returns plain numbers. Client-side fallback strips alpha prefix before matching.

**Timestamp storage:** All times stored as local values with no timezone conversion — Supabase timezone = UTC. `formatDT` uses `timeZone: 'UTC'` to prevent CDT→UTC shift on display. Never instruct Claude to convert times to UTC.

**Re-import on existing incidents:** "Import Run Sheet" button on incident detail page (`app/(dashboard)/incidents/[id]/IncidentDetailClient.tsx`) — overwrites incident fields and upserts apparatus rows in place.

**Address fields:** `incidents` table has separate `address`, `city`, `state`, `zip` columns. Parser extracts each separately. NERIS uses `incident.state` directly.

---

## NERIS Compliance Reference → see `NERIS.md`

---

## Salamander QR Card Integration — Architecture Notes

Salamander personnel accountability cards encode binary data with readable text fields embedded. Format confirmed via live scan (2026-05-16).

**Confirmed parseable fields:**
- Name: `LASTNAME*FIRSTNAME` pattern (separated by `*`, with a control char between `*` and first name)
- Department: text following ESC character (`\x1B`)
- Title/Role: text near end of payload after cert block
- Certifications: uppercase codes (ACLS, FFII, EMT_P, etc.) separated by control characters

**Debug table:** `qr_debug_scans` — see §10a above for the current viewer/schema (this note was stale — table has a `source` column now, and RLS is actually enabled with no policies; only the service-role admin client touches it).

**Use Case A (Incident Accountability)** — see §10a above, shipped.

### Use Case B — Kiosk Login / Movement Tracking — SHIPPED ✅ (2026-07-10)
Went with the documented preference: **Option A** (device credential, no full Supabase auth on the tablet).

- **`kiosk_devices`** (`id, department_id, device_name, secret_hash, created_by, created_at, revoked_at`) — a device "credential" is `{id, secret}`, generated once via Dept Admin → Kiosk Devices (`app/(dashboard)/dept-admin/kiosk/`, admin-only), secret shown exactly once and stored in the tablet's browser `localStorage` (not a cookie — deliberately per-browser/per-device, survives across sessions with no expiry, revocable by an admin at any time by setting `revoked_at`). Secret is SHA-256 hashed at rest, compared with `crypto.timingSafeEqual`.
- **`station_presence`** (`id, department_id, personnel_id` nullable, `raw_name, raw_dept` for mutual-aid/unmatched cards, `checked_in_at, checked_out_at` nullable, `kiosk_device_id`) — a null `checked_out_at` means currently present. No status enum needed; presence is just "has an open row or not."
- **`/kiosk`** (`app/kiosk/page.tsx`) — standalone route outside `(dashboard)` and outside normal auth entirely (added to `middleware.ts`'s public-bypass list alongside `/fire`, `/police`, etc., since the tablet never logs in). Full-screen, dark, kiosk-friendly UI: department name, live roster of who's currently checked in (polls every 30s), a big Scan Card button (reuses `QRScanner`), and a Manual Check-In fallback (searchable name picker) for when a card won't scan or someone doesn't have one.
- **`app/actions/kiosk.ts`** — `createKioskDevice`/`listKioskDevices`/`revokeKioskDevice` (admin-gated, normal session auth) vs. `getKioskContext`/`kioskScan`/`kioskManualEntry`/`getKioskRosterPickerList` (device-credential-gated, callable with zero Supabase session — every one of these re-verifies the device id+secret against `kiosk_devices` on every call, so a revoked device is locked out immediately, not just at next login). Scanning toggles presence (scan once to check in, scan again to check out) and reuses the exact same card-resolution logic as Accountability (`parseSalamanderCard`/`isFireOps7Card`/`personnel_qr_tokens`) — unparseable cards fall through to `saveDebugScan(raw, 'kiosk')`, which is the first real use of the `source` column built earlier this session.
- Deliberately **not using Realtime** for the roster (poll instead) — Accountability's board already hit "Realtime silently not receiving updates" twice in its history (`f95843f`, `5eee1ec`), both traced to `setAuth()` needing a logged-in user's JWT. A kiosk device has no such session, so Realtime's auth story doesn't cleanly apply here; polling avoids that whole class of bug for a feature where 30-second staleness doesn't matter.
