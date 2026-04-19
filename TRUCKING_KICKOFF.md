# TruckOps — New Project Kickoff Brief

## What We're Building
A multi-tenant fleet management SaaS for trucking companies — same architecture as FireOps7 (this repo) but domain-specific to trucking. Multiple companies each get their own isolated environment. One sys admin account (Zachary Klein) sits above all companies.

## Reference Codebase
FireOps7-Next (this repo) is the proven template. Read CLAUDE.md for full architectural context. Key patterns to replicate verbatim:
- Multi-tenant structure: `departments` → `companies`, `department_id` → `company_id`
- Auth flow + middleware + signup_status routing
- Supabase client setup (`lib/supabase/client.ts`, `server.ts`, `admin.ts`)
- Role system: admin / officer / member → admin / manager / driver
- Sidebar + mobile layout (MobileSidebar, top bar, hamburger drawer)
- Error logging (`lib/logger.ts` + `system_logs` table)
- RLS pattern: always use admin client for company-wide queries, never nested joins

## Stack (identical to FireOps7)
- Next.js App Router, TypeScript, Server Actions
- Supabase (new project — separate from FireOps7)
- Tailwind CSS v4
- @supabase/ssr + @supabase/supabase-js
- Resend for email notifications (future)

## Role Mapping
| FireOps7 | TruckOps |
|---|---|
| department | company |
| admin | admin |
| officer | manager |
| member | driver |
| sys admin | sys admin (same pattern — no company record) |

## New Supabase Project Needed
- Create a brand new Supabase project for TruckOps (do NOT use FireOps7 project)
- Same DB schema pattern, new tables with trucking names
- New .env.local with new project URL + keys

## Core Tables to Create First (Auth Shell)
Mirror FireOps7 exactly, renamed:
- `companies` (mirrors `departments`)
- `personnel` (same — auth_user_id, is_sys_admin, signup_status, etc.)
- `company_personnel` (mirrors `department_personnel` — company_id, personnel_id, system_role: admin/manager/driver)
- `system_logs` (identical)

## signup_status values (identical to FireOps7)
temp_password → change-password
profile_setup → profile-setup
active → dashboard
awaiting_approval → pending
denied → denied

## Files to Port Directly from FireOps7
These can be copied with minimal renaming:
- `lib/supabase/client.ts`, `server.ts`, `admin.ts`
- `lib/logger.ts`
- `middleware.ts` (update department → company references)
- `app/(auth)/` — all auth pages and actions
- `app/actions/auth.ts`
- `components/Sidebar.tsx`, `MobileSidebar.tsx` (reskin colors/labels)
- `globals.css` (input color fix, base styles)

## Build Order
1. New repo + Next.js project setup
2. New Supabase project + core auth tables (companies, personnel, company_personnel, system_logs)
3. Port auth shell — middleware, auth pages, login flow
4. Port sidebar + mobile layout — reskin for trucking
5. Sys admin shell — company list dashboard (mirrors /admin/departments)
6. Company onboarding — create company, create admin user
7. Then design trucking domain modules (vehicles, drivers, loads, inspections, maintenance)

## Domain Modules (to design — not yet spec'd)
- Vehicles (replaces apparatus — trucks, trailers)
- Drivers/personnel roster
- Loads / dispatch (replaces incidents)
- DOT vehicle inspections (replaces equipment inspections)
- Maintenance logs
- Compliance / HOS tracking (future)

## Sys Admin Account
- Same email: zklein3@outlook.com
- No company_personnel record (intentional — same pattern as FireOps7)
- Sees all companies in overview dashboard

## Color Scheme
FireOps7 uses red-800 as primary. Pick a new color for TruckOps — suggest blue-800 or slate-800 to differentiate. Decide when starting the sidebar build.

## What NOT to Copy
- Any fire-dept specific tables (apparatus, compartments, items, inspections, SCBA, incidents, etc.)
- Fire School route group
- Any domain logic — only infrastructure

## Session Goal
Get the auth shell running locally:
- Login → middleware routing → dashboard stub
- Sys admin can create a company + admin user
- Admin user can log in, change password, complete profile setup, land on dashboard
