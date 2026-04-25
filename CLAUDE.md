@AGENTS.md

## Session Start Checklist
1. Verify Git is installed: `git --version`. If not found, download from https://git-scm.com/download/win and install before proceeding.
2. Run `git pull` to sync latest changes from remote before starting any work.
3. Run `git status` and `git log --oneline -5` to review what changed since the last session.
4. Run `npm run build` to confirm the current branch compiles clean before making changes.

## Local-Only Files — Never Commit
- `.env.local` — Supabase keys + Resend API key
- `.claude/settings.json` — Claude Code permissions, machine-specific paths. Each machine maintains its own. There is ONE settings file per machine (settings.local.json was merged into settings.json and removed). Do NOT commit.

# FireOps7 — Project Guide

## Stack
- **Next.js 16.2.3** (App Router, TypeScript, Server Actions)
- **Supabase** (PostgreSQL 17, Auth, RLS) — project: FireOps7 (kolrhnxozeroaselapzn, us-east-1)
- **Tailwind CSS v4**
- **@supabase/ssr** + **@supabase/supabase-js**
- **Resend** — email notifications via Supabase Edge Function

## GitHub & Machines
- Repo: https://github.com/zklein3/FireOps7-Next — branch: main
- Personal machine: `C:\Users\zklein3\Documents\FireOps7-Next`
- Shared machine: `C:\Users\zklei\Documents\FireOps7-Next`

## Production
- Vercel: https://fire-ops7-next.vercel.app
- Primary domain: https://www.fireops7.com (DNS live)
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

## CRITICAL PATTERNS
- Always use admin client for fetching department-wide data
- Never use nested Supabase joins — causes TypeScript build errors in production
- Always fetch related data flat and join in JavaScript with maps
- sys admin has no department_personnel record — pass department_id explicitly in forms
- Never name a destructured Supabase error variable `logError` — conflicts with imported logger fn. Use `dbErr`, `stepsErr`, etc.

## App Route Structure

### Route Groups
| Group | Routes | Auth |
|---|---|---|
| `(auth)` | `/login`, `/change-password`, `/profile-setup`, `/pending`, `/denied` | Public |
| `(dashboard)` | All dashboard routes | Required |
| `(fire-school)` | `/fire-school`, `/fire-school/bottles`, `/fire-school/fill-log` | Public |

### Dashboard Routes
- `/dashboard` — dept dashboard or sys admin overview
- `/personnel`, `/personnel/[id]` — roster + profile
- `/apparatus`, `/apparatus/[id]` — apparatus list + detail
- `/stations`, `/stations/[id]` — stations list + detail
- `/equipment`, `/equipment/[id]` — equipment by apparatus
- `/inspections` — select apparatus + compartment to inspect
- `/inspections/run` — run inspection checklist
- `/events`, `/events/new` — events + attendance
- `/training` — enrollments, certifications, training events
- `/reports/inspections` — inspection report: filters, flat table, asset drill-in, print (officer/admin only)
- `/reports/inventory` — inventory inspection reports (officer/admin only)
- `/reports/my-activity` — member self-view: attendance, inspections, incidents (all roles)
- `/admin/departments`, `/admin/users`, `/admin/logs` — sys admin pages
- `/admin/dept/[id]` — sys admin dept drill-in (tabbed)
- `/dept-admin/personnel`, `/dept-admin/compartments`, `/dept-admin/items` — dept admin
- `/dept-admin/attendance`, `/dept-admin/training` — dept admin settings
- `/scan` — QR scan landing/redirect (to build)

### Key Action Files
- `app/actions/auth.ts` — signIn, changePassword, signOut
- `app/actions/personnel.ts` — updateOwnProfile, updatePersonnelProfile, updateDeptPersonnel, changeOwnPassword
- `app/actions/apparatus.ts` — createApparatus, updateApparatus
- `app/actions/stations.ts` — createStation, updateStation
- `app/actions/compartments.ts` — createCompartmentName, assignCompartmentToApparatus, removeCompartmentFromApparatus
- `app/actions/equipment.ts` — createItemCategory, createItem, updateItem, createAsset, updateAsset, assignItemToCompartment, removeItemFromCompartment, moveItemToCompartment
- `app/actions/inspections.ts` — createInspectionTemplate, addTemplateStep, updateTemplateStep, deleteTemplateStep, submitInspection
- `app/actions/attendance.ts` — createEventSeries, updateEventInstance, logAttendance, verifyAttendance, createExcuseType, saveParticipationRequirement
- `app/actions/training.ts` — createCertificationType, createCourseUnit, enrollMember, verifyProgress, logDirectCert, createTrainingEvent, logTrainingAttendance
- `app/actions/fire-school.ts` — checkBottle, logFill, addFireSchoolBottle

## Auth
- Roles: `is_sys_admin` (personnel table) | `system_role: admin/officer/member` (department_personnel)
- Sys admin: zklein3@outlook.com — no department_personnel record (intentional), always pass department_id explicitly
- signup_status flow: temp_password → change-password | profile_setup → profile-setup | active → dashboard | awaiting_approval → pending | denied → denied

## Mobile Layout
- Desktop: fixed sidebar (w-64, red-800)
- Mobile: top bar + hamburger → slide-out drawer (MobileSidebar.tsx)
- Main content: `pt-20 px-4 pb-4 sm:pt-0 sm:p-6 lg:p-8`
- All pages responsive: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
- Input text fix: globals.css forces `color: #18181b` and `-webkit-text-fill-color` on all inputs

## Error Logging
- Table: `system_logs` (log_type: error | user_report | info)
- `lib/logger.ts` — logError() in all server actions
- Edge Function `notify-on-log` → email to zklein3@gmail.com via Resend

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

## Equipment / Item System

### Item Type Flags
- `tracks_quantity` — count based (auto false when requires_inspection = true)
- `tracks_assets` — individual tracking (auto true when requires_inspection = true)
- `requires_presence_check` — verified during apparatus check
- `requires_inspection` — has inspection template + schedule
- `tracks_expiration` — has expiry date

### Asset Statuses (DB values — must match exactly)
- `IN SERVICE` | `OUT OF SERVICE` | `RETIRED`

### Inspection Design — Two Check Modes
- **Daily Check** — presence-only (`?mode=presence`), available from `/inspections` → "Daily Check" button. Shows present/missing + qty for every item, no asset picking or checklist. Logs to `compartment_presence_check_logs`. When QR system is built, scanning a compartment lands here.
- **Full Inspection** — full checklist per individual asset. Each item type (airpack, bottle, chainsaw) is inspected independently in its own slot.

### Independent Asset Model
- Each asset type is inspected on its own — airpacks and bottles are separate items in the same compartment, each with their own checklist and slots. No linking between assets.
- ASSET_LINK step type has been fully removed from the codebase and DB. Do not re-introduce it.

### Inspection Flow
1. Select apparatus → select compartment
2. In Daily Check mode OR any item with no template → presence check (Present/Missing + actual qty)
3. Full Inspection: asset-tracked items WITH a template → N slots driven by `expected_quantity`; each slot: pick asset → run checklist
4. Submit → `item_asset_inspection_logs` + `item_asset_inspection_log_steps` + `compartment_presence_check_logs`

**Key rule:** `presenceOnly || !(requires_inspection && templates.length > 0)` → presence check. Otherwise → full asset inspection.

### Inspection Template Builder
- Dept Admin → Items → Items tab → [item] → Manage → Inspections tab
- Step types: BOOLEAN, NUMERIC, TEXT, LONG_TEXT
- Multiple templates per item type allowed (Daily/Weekly/Monthly)
- ASSET_LINK step type removed — bottles are now standalone location standard items

## IMMEDIATE NEXT — Resume Here Next Session

### 1. Incident Attendance — Member Self-Log + Officer Verification ← START HERE
Currently `incident_personnel` is officer-managed only. Need to add member self-log flow matching the event attendance pattern:
- Incident created (by anyone) → visible to all dept members as "active"
- Members can log themselves onto an active incident → `incident_personnel` record with `status: pending`
- Officer/admin reviews → verifies or rejects (same verification queue pattern as event attendance)
- Member can see their own incident participation in My Activity report (already shows incidents)

**Touches:**
- `app/(dashboard)/incidents/[id]` — add self-log button for members + verification queue for officers
- `app/actions/incidents.ts` — add `logIncidentAttendance`, `verifyIncidentAttendance` actions
- Incident list page — surface "active" incidents members can log onto

### 2. Fix My Activity — Attendance Stat Counts Not Updating
Events appear in the list on `/reports/my-activity` but the summary stat counts (Present, Excused, Absent, Pending) at the top do not reflect them. Investigate whether the counts are computed from the wrong field, filtered incorrectly, or not re-fetching after verification.

### Priority Order After That
3. Asset roster view — dept-wide, filterable by item type/status
3. QR + Compartment page + Inspection Session — see REFERENCE.md for full design
4. ISO Audit sections (future) — hose logs, apparatus specs, hydrant flows, mutual aid
5. Flow & Presentation Polish

### Completed This Session
- Training/Cert Report (`/reports/training`) — officer/admin, filters by member/cert type/date range, expiry flagging, printable
- Attendance Report (`/reports/attendance`) — officer/admin, participation rates, threshold flagging, printable
- Collapsible grouped sidebar nav (Personnel / Apparatus / Reports)
- Mobile header — hamburger left, title centered
- Inspection step notes required on fail (BOOLEAN No → textarea; required if fail_if_negative)
- Soft-delete inspection template steps (no more FK constraint error)
- Step reorder (▲▼) in template builder — 3-step swap avoids unique constraint
- Apparatus detail — equipment manifest inline in compartments (item name + qty only, read-only all roles)
- Fixed attendance verification not updating My Activity page — added revalidatePath for `/reports/my-activity` and `/dashboard`
- Events page defaults to 'all' filter (was 'upcoming' — hid past events from members)
- `.claude/settings.json` consolidated to single file, folder-level Edit/Write wildcard permissions
- Member self-log window: 12 hours from event start_time (null start_time defaults to midnight — set explicit start_time on test events)

## Dev Workflow
- Start: `npm run dev` in project directory
- Build: `npm run build` (always before pushing)
- Push policy: always git push after a successful build — troubleshoot on live Vercel site
- Git: `git add . && git commit -m "message" && git push`

## Test Accounts
- `zklein3@outlook.com` — sys admin, no department
- `test.winfire@fireops7.com` — Winslow Fire dept admin
- `member.winfire@fireops7.com` — Winslow Fire member
- `test.admin@fireops7.com` — Fremont Fire Test dept admin
- Temp password for new accounts: `Hello1!`

## Test Data (Winslow Fire)
- Engine 32 → D1 (Scott Air Pack ×2, Scott Air Pack Bottle ×2, Halligan ×1) + P1 (Chainsaw ×1)
- Assets: Chainsaw 1, Scott Air Pack 1, Scott Air Pack 2, B-0001, B-0002 (bottles are standalone location standards, not linked to airpacks)
- Templates: Weekly Chainsaw Inspection (3 steps), Weekly Airpack Inspection (4 steps, on Scott Air Pack)

## Historical Reference
Full module detail (attendance, training, incident, QR system design, DB table list, permission matrix, what's built) → read `REFERENCE.md`
