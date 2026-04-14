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
- Primary domain: https://www.fireops7.com (DNS propagating — may still show Wix)
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

CRITICAL PATTERN: Always use admin client for fetching department-wide data.
RLS blocks regular users from reading other users records.
Never use nested Supabase joins — they cause TypeScript errors in production builds.
Always fetch related data separately and join in JavaScript.

## App Route Structure

### Route Groups
| Group | Routes | Auth | Purpose |
|---|---|---|---|
| `(auth)` | `/login`, `/change-password`, `/profile-setup`, `/pending`, `/denied` | Public | Auth flow |
| `(dashboard)` | `/dashboard`, `/personnel`, `/personnel/[id]`, `/apparatus`, `/apparatus/[id]`, `/stations`, `/equipment`, `/scba`, `/admin/*`, `/dept-admin/*` | Required | Main app |
| `(fire-school)` | `/fire-school`, `/fire-school/bottles`, `/fire-school/fill-log` | **Public — no auth** | Standalone fire school tool |

### Key Files
- `app/actions/auth.ts` — signIn, changePassword, signOut
- `app/actions/profile.ts` — saveProfile
- `app/actions/departments.ts` — createDepartment, toggleDepartment
- `app/actions/users.ts` — createDeptAdmin, createDeptMember
- `app/actions/personnel.ts` — updateOwnProfile, updatePersonnelProfile, updateDeptPersonnel, changeOwnPassword, submitUserReport
- `app/actions/apparatus.ts` — createApparatus, updateApparatus
- `app/actions/fire-school.ts` — checkBottle, logFill, addFireSchoolBottle
- `app/(dashboard)/dashboard/SysAdminDashboard.tsx` — sys admin dashboard component
- `lib/logger.ts` — logEvent(), logError() utilities
- `components/FeedbackButton.tsx` — user feedback modal (React Portal)
- `components/MobileSidebar.tsx` — mobile hamburger drawer
- `middleware.ts` — auth session + route protection

## Auth & Signup Flow

### signup_status values
| Status | Meaning | Middleware Action |
|---|---|---|
| `temp_password` | Just created | Force → /change-password |
| `profile_setup` | Password changed, no profile | Force → /profile-setup |
| `active` | Fully set up | Allow → /dashboard |
| `awaiting_approval` | Pending | Force → /pending |
| `denied` | Denied | Force → /denied |

### First Login Chain
1. Admin enters email → auth user created with temp password `Hello1!`
2. Login → /change-password → status = profile_setup
3. Profile saved → status = active → /dashboard
4. All future logins → straight to /dashboard

### User Roles
| Field | Table | Purpose |
|---|---|---|
| `is_sys_admin` | `personnel` | Global — all departments, all data, no dept record |
| `system_role` | `department_personnel` | `admin / officer / member` within dept |
| `department_id` | `department_personnel` | Scopes all data to their department |

### Permission Matrix
| Action | Member | Officer | Admin | Sys Admin |
|---|---|---|---|---|
| View roster | ✅ | ✅ | ✅ | ✅ |
| Open own profile | ✅ | ✅ | ✅ | ✅ |
| Open anyone's profile | ❌ | ✅ | ✅ | ✅ |
| Edit own name/phone/address | ✅ | ✅ | ✅ | ✅ |
| Edit anyone's basic info | ❌ | ✅ | ✅ | ✅ |
| Edit role/rank/dept info | ❌ | ❌ | ✅ | ✅ |
| Edit apparatus basic info | ❌ | ✅ | ✅ | ✅ |
| Add/deactivate apparatus | ❌ | ❌ | ✅ | ✅ |
| Add/manage personnel | ❌ | ❌ | ✅ | ✅ |

## Sys Admin Account
- Email: zklein3@outlook.com
- Has NO department_personnel records (intentional)
- Gets completely different dashboard — all department cards overview
- Sidebar: Overview, System Admin (Departments, Users, System Logs)
- For department membership use a separate email account

## Mobile Layout
- Desktop: fixed sidebar (w-64, red)
- Mobile: top orange bar + hamburger → slide-out drawer
- All pages use responsive Tailwind classes (sm:, lg:)
- Tables use overflow-x-auto + min-w for horizontal scroll
- Cards use grid-cols-1 sm:grid-cols-2 lg:grid-cols-3

## Error Logging & Notifications
- Table: `system_logs` (log_type: error | user_report | info)
- `lib/logger.ts` — logError() called in all server actions on failure
- Edge Function: `notify-on-log` — fires on system_logs insert
- Sends email to zklein3@gmail.com via Resend on error or user_report
- From: onboarding@resend.dev (update to custom domain after deploy)
- FeedbackButton in sidebar footer — available to all users, uses React Portal

## What's Built & Working ✅
- Full auth flow (login → change password → profile setup → dashboard)
- Role-aware sidebar with mobile hamburger drawer
- Sys admin dashboard — all department cards with stats + system log
- Sys admin — Departments page, Users page, System Logs placeholder
- Dept Admin — Manage Personnel (add admin/officer/member)
- Personnel roster (role-based view/edit permissions)
- Personnel profile page (edit, change password)
- Apparatus list (station filter, cards, mobile-first)
- Apparatus detail (role-based editing, compartments placeholder)
- Dashboard with real department data
- Error logging in all server actions
- FeedbackButton → system_logs → email notification
- Fire School — Fill Station (check bottle, log fill, not found → add)
- Fire School — Bottles (list, add, status indicators)
- Fire School — Fill Log (full history table)
- Vercel deployment live
- fireops7.com DNS pointed to Vercel (propagating)

## What's Placeholder (not yet built)
- `/stations` — placeholder
- `/equipment` — placeholder
- `/scba` — placeholder (dept SCBA, separate from fire school)
- `/admin/logs` — placeholder (full log viewer)
- `/admin/dept/[id]` — sys admin drill-in to department
- Compartment management on apparatus detail page
- Supabase auth allowed URLs need updating for custom domain

## Database Tables

### Fire Department (auth-protected, RLS)
- `departments` — 3 rows
- `stations` — 2 rows
- `apparatus` — 3 rows
- `apparatus_types` — 20 rows (lookup, authenticated read policy)
- `apparatus_compartments`, `compartment_names`
- `personnel`, `department_personnel`, `personnel_roles` (19 rows, authenticated read)
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
- Never use nested Supabase joins — causes TypeScript build errors
- Fetch related data flat, join in JavaScript with maps

## Dynamic Route Params — CRITICAL
Next.js 16 made params a Promise. Always await:
```ts
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
}
```
Same for searchParams:
```ts
export default async function Page({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams
}
```

## Next Steps (priority order)
1. Test fire school pages on live site
2. Add custom domain to Supabase auth allowed URLs once DNS propagates
3. `/stations` pages — list and detail
4. `/admin/logs` — full log viewer
5. `/admin/dept/[id]` — sys admin dept drill-in
6. Compartment management on apparatus
7. `/scba` department SCBA pages
8. `/equipment` pages
9. Switch Resend from address to custom domain email

## Dev Workflow
- Start: `npm run dev` in C:\Users\zklei\Documents\FireOps7-Next
- Stop: type `stop server` in VS Code terminal (Ctrl+C doesn't work)
- Build check: `npm run build` (always run before pushing)
- Git: `git add . && git commit -m "message" && git push`
- Restart needed when: middleware.ts changes

## Test Accounts
- `zklein3@outlook.com` — sys admin, no department
- `test.winfire@fireops7.com` — Winslow Fire dept admin
- `member.winfire@fireops7.com` — Winslow Fire member
- `test.admin@fireops7.com` — Fremont Fire Test dept admin
- Temp password for new accounts: `Hello1!`

## Fire School
- URL: /fire-school (public, no login)
- Bottle check criteria: active=true, requal not expired, service life not exceeded
- Cylinder types: composite_15, composite_30, steel, aluminum
- Fill log: one record per fill, bottle_id + filled_at + fill_result + notes
- If bottle not found → redirect to /fire-school/bottles?add=BOTTLE_ID
