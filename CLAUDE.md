@AGENTS.md

# FireOps7 — Project Guide

## Stack
- **Next.js 16** (App Router, TypeScript)
- **Supabase** (PostgreSQL, Auth, RLS)
- **Tailwind CSS v4**

## App Structure

### Route Groups
| Group | Path | Auth | Purpose |
|---|---|---|---|
| `(auth)` | `/login` | Public | Login/signup |
| `(dashboard)` | `/dashboard`, `/personnel`, `/apparatus`, `/stations`, `/equipment`, `/scba` | Required | Main fire dept app |
| `(fire-school)` | `/fire-school`, `/fire-school/bottles`, `/fire-school/fill-log` | Public | Standalone fire school fill station |

### Key Directories
- `app/` — Next.js App Router pages and layouts
- `lib/supabase/client.ts` — Browser Supabase client
- `lib/supabase/server.ts` — Server Supabase client
- `lib/types/database.ts` — TypeScript types for all DB tables
- `components/ui/` — Shared UI components
- `middleware.ts` — Auth session refresh + route protection

## Database Tables (Supabase)

### Fire Department (auth-protected)
- `departments`, `stations`, `apparatus`, `apparatus_types`, `apparatus_compartments`, `compartment_names`
- `personnel`, `department_personnel`, `personnel_roles`
- `items`, `item_categories`, `item_assets`, `item_location_standards`
- `item_inspection_templates`, `item_inspection_template_steps`, `item_asset_inspection_logs`, `item_asset_inspection_log_steps`
- `scba_bottles`, `scba_fill_logs`, `scba_maintenance_logs`, `scba_cylinder_specs`

### Fire School (public, no auth)
- `fire_school_bottles` — SCBA bottles used at fire school
- `fire_school_fill_logs` — Fill log entries (simple Yes/No result)

## Auth & Roles
- Auth handled via Supabase Auth (`auth.users`)
- `personnel.auth_user_id` links to `auth.users.id`
- `department_personnel.system_role` — `admin | officer | member`
- `personnel.is_sys_admin` — global system admin flag
- `signup_status` — `awaiting_approval | active | denied | temp_password`

## Environment Variables
Copy `.env.example` to `.env.local` and fill in values.
Never commit `.env.local` — it is gitignored.
