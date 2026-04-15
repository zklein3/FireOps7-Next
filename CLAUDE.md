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
- Never nest joins like: .select('id, department_personnel(departments(name))')
- Instead fetch departments separately and join with a map

## App Route Structure

### Route Groups
| Group | Routes | Auth | Purpose |
|---|---|---|---|
| `(auth)` | `/login`, `/change-password`, `/profile-setup`, `/pending`, `/denied` | Public | Auth flow |
| `(dashboard)` | `/dashboard`, `/personnel`, `/personnel/[id]`, `/apparatus`, `/apparatus/[id]`, `/stations`, `/stations/[id]`, `/equipment`, `/scba`, `/admin/*`, `/dept-admin/*` | Required | Main app |
| `(fire-school)` | `/fire-school`, `/fire-school/bottles`, `/fire-school/fill-log` | **Public — no auth** | Standalone fire school tool |

### Key Files
- `app/actions/auth.ts` — signIn, changePassword, signOut
- `app/actions/profile.ts` — saveProfile
- `app/actions/departments.ts` — createDepartment, toggleDepartment
- `app/actions/users.ts` — createDeptAdmin, createDeptMember
- `app/actions/personnel.ts` — updateOwnProfile, updatePersonnelProfile, updateDeptPersonnel, changeOwnPassword, submitUserReport
- `app/actions/apparatus.ts` — createApparatus, updateApparatus
- `app/actions/stations.ts` — createStation, updateStation
- `app/actions/compartments.ts` — createCompartmentName, updateCompartmentName, assignCompartmentToApparatus, removeCompartmentFromApparatus
- `app/actions/fire-school.ts` — checkBottle, logFill, addFireSchoolBottle
- `lib/logger.ts` — logEvent(), logError() utilities
- `components/FeedbackButton.tsx` — user feedback modal (React Portal)
- `components/MobileSidebar.tsx` — mobile hamburger drawer

## Auth & Signup Flow

### signup_status values
| Status | Redirect |
|---|---|
| `temp_password` | /change-password |
| `profile_setup` | /profile-setup |
| `active` | /dashboard |
| `awaiting_approval` | /pending |
| `denied` | /denied |

### First Login Chain
1. Admin enters email → auth created with temp password `Hello1!`
2. Login → /change-password → status = profile_setup
3. Profile saved → status = active → /dashboard

### User Roles
| Field | Table | Purpose |
|---|---|---|
| `is_sys_admin` | `personnel` | Global — all departments, no dept record needed |
| `system_role` | `department_personnel` | `admin / officer / member` within dept |
| `department_id` | `department_personnel` | Scopes all data to their department |

### Permission Matrix
| Action | Member | Officer | Admin | Sys Admin |
|---|---|---|---|---|
| View roster/stations/apparatus | ✅ | ✅ | ✅ | ✅ |
| Edit own profile | ✅ | ✅ | ✅ | ✅ |
| Edit anyone's basic info | ❌ | ✅ | ✅ | ✅ |
| Edit role/rank/dept info | ❌ | ❌ | ✅ | ✅ |
| Edit apparatus basic info | ❌ | ✅ | ✅ | ✅ |
| Add/deactivate apparatus/stations | ❌ | ❌ | ✅ | ✅ |
| Manage compartments | ❌ | ❌ | ✅ | ✅ |
| Add/manage personnel | ❌ | ❌ | ✅ | ✅ |

## Sys Admin Account
- Email: zklein3@outlook.com
- Has NO department_personnel records (intentional)
- Dashboard shows all department cards with stats
- Sidebar: Overview, System Admin (Departments, Users, System Logs)
- Can drill into any dept via /admin/dept/[id]

## Mobile Layout
- Desktop: fixed sidebar (w-64, red-800)
- Mobile: top bar + hamburger → slide-out drawer (MobileSidebar.tsx)
- All pages responsive: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
- Tables: overflow-x-auto + min-w for horizontal scroll on mobile

## Error Logging & Notifications
- Table: `system_logs` (log_type: error | user_report | info)
- `lib/logger.ts` — logError() called in all server actions on failure
- Edge Function `notify-on-log` fires on insert → email to zklein3@gmail.com
- FeedbackButton in sidebar → submits user_report to system_logs
- From: onboarding@resend.dev (update to custom domain later)

## What's Built & Working ✅
- Full auth flow + middleware routing
- Role-aware sidebar with mobile hamburger drawer
- Sys admin dashboard — department cards with stats
- Sys admin — Departments, Users, System Logs (placeholder) pages
- **Sys admin dept drill-in** — `/admin/dept/[id]` — tabbed view of personnel, stations, apparatus, compartments for any department
- Dept Admin — Manage Personnel, Compartments pages
- Personnel roster + profile (role-based editing, change password)
- Apparatus list (All/station/unassigned filters, cards, mobile-first)
- Apparatus detail (role-based editing, compartment assign/remove)
- Stations list (cards) + detail (admin edit, assigned apparatus)
- Compartment names management (dept-level, admin only)
- Compartment assignment on apparatus detail page
- Dashboard with real department data
- Error logging in all server actions → email notifications
- FeedbackButton with React Portal
- Fire School — Fill Station, Bottles, Fill Log (all public)
- Vercel deployed + fireops7.com DNS configured

## What's Placeholder (not yet built)
- `/equipment` — placeholder
- `/scba` — placeholder (dept SCBA)
- `/admin/logs` — placeholder (full log viewer)
- Supabase auth allowed URLs need adding for custom domain
- Resend from address needs updating to custom domain

## Database Tables

### Fire Department (auth-protected, RLS)
- `departments` — 3 rows (Fremont Fire, Fremont Fire Test, Winslow Fire)
- `stations` — 2 rows
- `apparatus` — 4+ rows
- `apparatus_types` — 20 rows (lookup)
- `apparatus_compartments` — junction: apparatus ↔ compartment_names
- `compartment_names` — department-level compartment definitions
- `personnel` — linked to auth.users via auth_user_id
- `department_personnel` — junction: personnel ↔ departments (holds system_role, signup_status)
- `personnel_roles` — 19 rows (rank/title lookup)
- `items`, `item_categories`, `item_assets`, `item_location_standards`
- `item_inspection_templates`, `item_inspection_template_steps`
- `item_asset_inspection_logs`, `item_asset_inspection_log_steps`
- `scba_bottles`, `scba_fill_logs`, `scba_maintenance_logs`, `scba_cylinder_specs`
- `system_logs` — error and user report logging

### Fire School (public, no auth, open RLS)
- `fire_school_bottles` — 7 rows
- `fire_school_fill_logs` — 11+ rows

## RLS Notes
- All department-wide queries MUST use admin client
- `department_personnel` — read_own policy only, always use admin client
- Never use nested Supabase joins — TypeScript build errors
- Recursive RLS causes infinite loops — never reference same table in its own policy

## Dynamic Route Params — CRITICAL
Next.js 16 params and searchParams are Promises — always await:
```ts
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
}
export default async function Page({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams
}
```

## Compartment System
- `compartment_names` — department-level definitions (code + name + sort_order)
- `apparatus_compartments` — links compartment_names to specific apparatus
- Compartments are universal — D1 can be assigned to multiple apparatus
- Admin only — create/edit/assign/remove compartments
- Managed via: Dept Admin → Compartments, or Sys Admin → dept drill-in → Compartments tab
- Assigned via: Apparatus detail page → Compartments section

## Next Steps (priority order)
1. Add fireops7.com to Supabase auth allowed redirect URLs
2. `/admin/logs` — full system log viewer
3. `/equipment` pages
4. `/scba` department SCBA pages
5. Switch Resend from address to custom domain email

## Dev Workflow
- Start: `npm run dev` in C:\Users\zklei\Documents\FireOps7-Next
- Stop: Ctrl+C in VS Code terminal
- Build check: `npm run build` (always before pushing)
- Git: `git add . && git commit -m "message" && git push`

## Test Accounts
- `zklein3@outlook.com` — sys admin, no department
- `test.winfire@fireops7.com` — Winslow Fire dept admin
- `member.winfire@fireops7.com` — Winslow Fire member
- `test.admin@fireops7.com` — Fremont Fire Test dept admin
- Temp password for new accounts: `Hello1!`

## Fire School
- URL: /fire-school (public, no login required)
- Bottle check: active=true + requal not expired + service life not exceeded
- Cylinder types: composite_15, composite_30, steel, aluminum
- Fill log: one record per fill (bottle_id, filled_at, fill_result, notes)
- Not found → redirect to /fire-school/bottles?add=BOTTLE_ID
