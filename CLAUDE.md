@AGENTS.md

# FireOps7 — Project Guide & Session Summary

## Stack
- **Next.js 16.2.3** (App Router, TypeScript, Server Actions)
- **Supabase** (PostgreSQL 17, Auth, RLS) — project: FireOps7 (kolrhnxozeroaselapzn, us-east-1)
- **Tailwind CSS v4**
- **@supabase/ssr** + **@supabase/supabase-js**

## GitHub
- Repo: https://github.com/zklein3/FireOps7-Next
- Branch: main
- Local path: C:\Users\zklei\Documents\FireOps7-Next

## Environment Variables (.env.local — never commit)
- NEXT_PUBLIC_SUPABASE_URL=https://kolrhnxozeroaselapzn.supabase.co
- NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
- SUPABASE_SERVICE_ROLE_KEY=eyJhbGci... (required for admin operations)

## Supabase Clients
- `lib/supabase/client.ts` — browser client (anon key)
- `lib/supabase/server.ts` — server client (anon key, cookie-based session)
- `lib/supabase/admin.ts` — admin client (service role key, bypasses RLS)

CRITICAL PATTERN: Always use admin client for fetching department-wide data
in server components and actions. RLS blocks regular users from reading
other users' records. Only use regular client for auth (getUser).

## App Route Structure

### Route Groups
| Group | Routes | Auth | Purpose |
|---|---|---|---|
| `(auth)` | `/login`, `/change-password`, `/profile-setup`, `/pending`, `/denied` | Public | Auth flow pages |
| `(dashboard)` | `/dashboard`, `/personnel`, `/personnel/[id]`, `/apparatus`, `/stations`, `/equipment`, `/scba`, `/admin/*`, `/dept-admin/*` | Required | Main app |
| `(fire-school)` | `/fire-school`, `/fire-school/bottles`, `/fire-school/fill-log` | Public | Standalone fire school tool |

### Key Directories
- `app/actions/` — all server actions
- `app/(dashboard)/dashboard/SysAdminDashboard.tsx` — sys admin dashboard component
- `lib/supabase/` — Supabase client helpers
- `lib/types/database.ts` — TypeScript types for all DB tables
- `lib/logger.ts` — error logging utility
- `components/FeedbackButton.tsx` — user feedback modal (uses React Portal)
- `middleware.ts` — auth session + route protection

## Auth & Signup Flow

### signup_status values
| Status | Meaning | Middleware Action |
|---|---|---|
| `temp_password` | Just created | Force → /change-password |
| `profile_setup` | Password changed, no profile yet | Force → /profile-setup |
| `active` | Fully set up | Allow → /dashboard |
| `awaiting_approval` | Pending | Force → /pending |
| `denied` | Denied | Force → /denied |

### First Login Chain (all roles)
1. Admin enters email → auth user created with temp password `Hello1!`
2. Login → middleware detects `temp_password` → /change-password
3. Password changed → status = `profile_setup` → /profile-setup
4. Profile saved → status = `active` → /dashboard
5. All future logins → straight to /dashboard

### User Roles & Access
| Field | Table | Purpose |
|---|---|---|
| `is_sys_admin` | `personnel` | Global override — all departments, all data |
| `system_role` | `department_personnel` | `admin / officer / member` within dept |
| `department_id` | `department_personnel` | Scopes all data to their department |

### Permission Matrix (personnel pages)
| Action | Member | Officer | Admin | Sys Admin |
|---|---|---|---|---|
| View roster | ✅ | ✅ | ✅ | ✅ |
| Open own profile | ✅ | ✅ | ✅ | ✅ |
| Open anyone's profile | ❌ | ✅ | ✅ | ✅ |
| Edit own name/phone/address | ✅ | ✅ | ✅ | ✅ |
| Edit anyone's basic info | ❌ | ✅ | ✅ | ✅ |
| Edit role/rank/emp#/hire date | ❌ | ❌ | ✅ | ✅ |
| Change own password | ✅ | ✅ | ✅ | ✅ |

## Sys Admin Account
- Email: zklein3@outlook.com
- Has NO department_personnel records (intentional)
- Gets completely different dashboard — department cards overview
- Sidebar shows: Overview, System Admin (Departments, Users, System Logs)
- Department users should have separate login accounts

## Server Actions
- `app/actions/auth.ts` — signIn, changePassword, signOut
- `app/actions/profile.ts` — saveProfile (uses admin client)
- `app/actions/departments.ts` — createDepartment, toggleDepartment
- `app/actions/users.ts` — createDeptAdmin, createDeptMember (uses admin client)
- `app/actions/personnel.ts` — updateOwnProfile, updatePersonnelProfile, updateDeptPersonnel, changeOwnPassword, submitUserReport

## Error Logging System
- Table: `system_logs` in Supabase
- Utility: `lib/logger.ts` — logEvent(), logError()
- All server actions call logError() on failure
- log_type values: `error`, `user_report`, `info`
- Sys admin dashboard shows recent logs
- Users can submit reports via FeedbackButton in sidebar

### system_logs table
```
id, created_at, log_type, page, message, metadata(jsonb),
personnel_id, department_id, resolved
```

## What's Built & Working ✅
- Full auth flow (login → change password → profile setup → dashboard)
- Middleware routing for all signup_status values
- Role-aware sidebar (different nav for sys admin vs dept users)
- Sys admin dashboard — department cards with personnel/stations/apparatus/scba counts
- Sys admin — Departments page (view, create, activate/deactivate)
- Sys admin — Users page (view all, create dept admin)
- Dept Admin — Manage Personnel page (add admin/officer/member, full role list)
- Personnel roster page (role-based view → link permissions)
- Personnel profile page (role-based editing, change password)
- Dashboard with real department data (active users, stations, apparatus, SCBA)
- Error logging wired into all server actions
- FeedbackButton — modal with React Portal, submits to system_logs

## What's Placeholder (not yet built)
- `/apparatus` — placeholder
- `/stations` — placeholder
- `/equipment` — placeholder
- `/scba` — placeholder
- `/admin/logs` — placeholder (sys logs viewer)
- `/admin/dept/[id]` — sys admin drill-in to department (referenced in dept cards)
- `/fire-school/*` — layout built, pages are placeholders
- Email notifications via Resend (planned)

## Database Tables

### Fire Department (auth-protected, RLS enabled)
- `departments` — 3 rows (Fremont Fire Dept, Fremont Fire Test Dept, Winslow Fire Dept)
- `stations` — 2 rows
- `apparatus` — 3 rows
- `apparatus_types` — 20 rows (lookup, has read policy for authenticated users)
- `apparatus_compartments` — 0 rows
- `compartment_names` — 0 rows
- `personnel` — linked to auth.users via auth_user_id
- `department_personnel` — junction, holds system_role + signup_status
- `personnel_roles` — 19 rows (rank/title lookup, has read policy for authenticated users)
- `items`, `item_categories`, `item_assets`, `item_location_standards`
- `item_inspection_templates`, `item_inspection_template_steps`
- `item_asset_inspection_logs`, `item_asset_inspection_log_steps`
- `scba_bottles`, `scba_fill_logs`, `scba_maintenance_logs`, `scba_cylinder_specs`
- `system_logs` — error and user report logging

### Fire School (public, no auth, open RLS)
- `fire_school_bottles` — 7 rows
- `fire_school_fill_logs` — 11 rows

## RLS Notes
- `personnel` — open read/write policies (use admin client anyway for safety)
- `department_personnel` — `dept_personnel_read_own` only allows reading own record
- All department-wide queries MUST use admin client to bypass RLS
- `personnel_roles` — has authenticated read policy
- `apparatus_types` — has authenticated read policy
- `system_logs` — service role all, authenticated insert only
- Recursive RLS policies cause infinite loops — never reference the same table in its own policy

## Dynamic Route Params — IMPORTANT
Next.js 16 made params a Promise. Always await params:
```ts
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  ...
}
```

## Known Issues / TODO
- `/admin/dept/[id]` referenced in dept cards but not built yet
- Email notifications (Resend) not yet implemented
- Fire school pages are placeholders
- Apparatus, Stations, Equipment, SCBA pages all placeholder

## Next Steps (priority order)
1. ✅ Test feedback button (fixed with React Portal)
2. Email notifications via Resend — Edge Function fires on system_logs insert
3. `/admin/logs` — full log viewer for sys admin
4. `/apparatus` pages — list and detail
5. `/stations` pages — list and detail
6. `/admin/dept/[id]` — sys admin dept drill-in
7. Fire school pages
8. Deploy to Vercel + domain

## Dev Workflow Notes
- Start: `cd C:\Users\zklei\Documents\FireOps7-Next` then `npm run dev`
- Stop: Type `stop server` in VS Code terminal (Ctrl+C doesn't work)
- Restart needed when: middleware.ts or next.config.ts changes
- Hot reload works for all other changes
- PowerShell fix if needed: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force`
- Git push: `git add . && git commit -m "message" && git push`

## Test Accounts
- `zklein3@outlook.com` — sys admin, no department
- `test.winfire@fireops7.com` — Winslow Fire dept admin
- `member.winfire@fireops7.com` — Winslow Fire member
- `test.admin@fireops7.com` — Fremont Fire Test dept admin
- Temp password for new accounts: `Hello1!`
