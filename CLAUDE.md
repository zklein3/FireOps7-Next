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
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY (required for admin auth operations)

## Supabase Clients
- `lib/supabase/client.ts` — browser client (anon key)
- `lib/supabase/server.ts` — server client (anon key, cookie-based session)
- `lib/supabase/admin.ts` — admin client (service role key, bypasses RLS)

IMPORTANT: Always use the admin client for any operation that writes to
`personnel` or `department_personnel` from a server action, as RLS blocks
updates from regular users on those tables.

## App Route Structure

### Route Groups
| Group | Routes | Auth | Purpose |
|---|---|---|---|
| `(auth)` | `/login`, `/change-password`, `/profile-setup`, `/pending`, `/denied` | Public | Auth flow pages |
| `(dashboard)` | `/dashboard`, `/personnel`, `/apparatus`, `/stations`, `/equipment`, `/scba`, `/admin/*` | Required | Main app |
| `(fire-school)` | `/fire-school`, `/fire-school/bottles`, `/fire-school/fill-log` | Public | Standalone fire school tool |

### Key Directories
- `app/actions/` — all server actions
- `lib/supabase/` — Supabase client helpers
- `lib/types/database.ts` — TypeScript types for all DB tables
- `components/ui/` — shared UI components (empty, ready to build)
- `middleware.ts` — auth session + route protection

## Auth & Signup Flow

### signup_status values (personnel + department_personnel tables)
| Status | Meaning | Middleware Action |
|---|---|---|
| `temp_password` | Just created, hasn't changed password | Force → /change-password |
| `profile_setup` | Password changed, hasn't set profile | Force → /profile-setup |
| `active` | Fully set up | Allow → /dashboard |
| `awaiting_approval` | Pending (not currently used in main flow) | Force → /pending |
| `denied` | Denied access | Force → /denied |

### First Login Chain (all roles)
1. Admin enters email in system → auth user created with temp password `Hello1!`
2. User logs in → middleware detects `temp_password` → /change-password
3. Password changed → status set to `profile_setup` → /profile-setup
4. Profile saved (first_name, last_name, phone, address) → status set to `active` → /dashboard
5. All future logins → straight to /dashboard

### User Roles & Access
| Field | Table | Purpose |
|---|---|---|
| `is_sys_admin` | `personnel` | Global override — all departments, all data |
| `system_role` | `department_personnel` | `admin / officer / member` within their dept |
| `department_id` | `department_personnel` | Scopes all data to their department only |

- Sys admin sees **System Admin** sidebar section (hidden from all others)
- Dept admin sees **Dept Admin** sidebar section (hidden from officer/member)
- `/admin/*` routes blocked by middleware for non-sys-admins
- Page-level permissions for officer vs member defined as pages are built

## Server Actions
- `app/actions/auth.ts` — signIn, changePassword, signOut
- `app/actions/profile.ts` — saveProfile (uses admin client)
- `app/actions/departments.ts` — createDepartment, toggleDepartment
- `app/actions/users.ts` — createDeptAdmin (uses admin client, creates auth user + personnel + dept_personnel with Hello1! temp password)

## What's Built & Working ✅
- Login page with error handling
- Change password page (forced on first login)
- Profile setup page (forced after password change)
- Pending / Denied pages
- Middleware routing for all signup_status values
- Dashboard layout with role-aware sidebar
- System Admin → Departments page (view, create, activate/deactivate)
- System Admin → Users page (view all users, create dept admin)
- Supabase admin client for RLS bypass on status updates

## What's Placeholder (not yet built)
- `/dashboard` — shows static text, needs real data/summary cards
- `/personnel` — placeholder
- `/apparatus` — placeholder
- `/stations` — placeholder
- `/equipment` — placeholder
- `/scba` — placeholder
- `/dept-admin/personnel` — not created yet (dept admin manage personnel)
- `/fire-school/*` — layout built, pages are placeholders

## Database Tables

### Fire Department (auth-protected, RLS enabled)
- `departments` — 3 rows (Fremont Fire Dept, Fremont Fire Test Dept, Winslow Fire Dept)
- `stations` — 2 rows
- `apparatus` — 3 rows
- `apparatus_types` — 20 rows (lookup)
- `apparatus_compartments` — 0 rows
- `compartment_names` — 0 rows
- `personnel` — linked to auth.users via auth_user_id
- `department_personnel` — junction table, holds system_role + signup_status
- `personnel_roles` — 19 rows (rank/title lookup)
- `items`, `item_categories`, `item_assets`, `item_location_standards`
- `item_inspection_templates`, `item_inspection_template_steps`
- `item_asset_inspection_logs`, `item_asset_inspection_log_steps`
- `scba_bottles`, `scba_fill_logs`, `scba_maintenance_logs`, `scba_cylinder_specs`

### Fire School (public, no auth, open RLS)
- `fire_school_bottles` — 7 rows (renamed from fs_scba_bottles)
- `fire_school_fill_logs` — 11 rows (renamed from fs_scba_fill_logs)

## Known Issues / Cleanup Needed
- Stray file `Claude Summary` exists at `app/(auth)/login/Claude Summary` — delete this file
- `department_personnel` RLS only allows SELECT on own record, no UPDATE — all writes to this table must use the admin client
- `dept-admin/personnel` route referenced in sidebar but directory/page not created yet

## Next Steps (priority order)
1. Build `/dept-admin/personnel` — dept admin adds officers/members (same Hello1! flow as sys admin adding dept admins)
2. Build real `/dashboard` page with summary cards (personnel count, apparatus count, etc.) scoped to department
3. Build `/personnel` list page scoped to department
4. Build `/apparatus`, `/stations` pages
5. Build `/scba` pages (department SCBA bottles + fill/maintenance logs)
6. Build fire school pages (`/fire-school` fill station, `/fire-school/bottles`, `/fire-school/fill-log`)
7. Deploy to Vercel + point domain

## Dev Workflow Notes
- Start dev server: `cd C:\Users\zklei\Documents\FireOps7-Next` then `npm run dev`
- Stop server: use VS Code stop button in terminal panel (Ctrl+C does not work)
- Restart needed when: middleware.ts or next.config.ts changes
- Hot reload works for all other file changes
- PowerShell execution policy fix if needed: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force`
- Git push: `git add . && git commit -m "message" && git push`
