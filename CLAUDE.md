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

## App Route Structure

### Route Groups
| Group | Routes | Auth | Purpose |
|---|---|---|---|
| `(auth)` | `/login`, `/change-password`, `/profile-setup`, `/pending`, `/denied` | Public | Auth flow |
| `(dashboard)` | All dashboard routes | Required | Main app |
| `(fire-school)` | `/fire-school`, `/fire-school/bottles`, `/fire-school/fill-log` | Public | Standalone tool |

### Dashboard Routes
- `/dashboard` — dept dashboard or sys admin overview
- `/personnel`, `/personnel/[id]` — roster + profile
- `/apparatus`, `/apparatus/[id]` — apparatus list + detail
- `/stations`, `/stations/[id]` — stations list + detail
- `/equipment`, `/equipment/[id]` — equipment by apparatus
- `/scba` — placeholder
- `/admin/departments`, `/admin/users`, `/admin/logs` — sys admin pages
- `/admin/dept/[id]` — sys admin dept drill-in (tabbed: personnel, stations, apparatus, compartments)
- `/dept-admin/personnel` — manage personnel
- `/dept-admin/compartments` — manage compartment names
- `/dept-admin/items` — manage item categories and item types

### Key Action Files
- `app/actions/auth.ts` — signIn, changePassword, signOut
- `app/actions/profile.ts` — saveProfile
- `app/actions/departments.ts` — createDepartment, toggleDepartment
- `app/actions/users.ts` — createDeptAdmin, createDeptMember
- `app/actions/personnel.ts` — updateOwnProfile, updatePersonnelProfile, updateDeptPersonnel, changeOwnPassword, submitUserReport
- `app/actions/apparatus.ts` — createApparatus, updateApparatus
- `app/actions/stations.ts` — createStation, updateStation
- `app/actions/compartments.ts` — createCompartmentName, updateCompartmentName, assignCompartmentToApparatus, removeCompartmentFromApparatus
- `app/actions/equipment.ts` — createItemCategory, createItem, assignItemToCompartment, removeItemFromCompartment
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
| Edit own profile | ✅ | ✅ | ✅ | ✅ |
| Edit anyone's basic info | ❌ | ✅ | ✅ | ✅ |
| Edit apparatus/station info | ❌ | ✅ | ✅ | ✅ |
| Assign items to compartments | ❌ | ✅ | ✅ | ✅ |
| Add/deactivate apparatus/stations | ❌ | ❌ | ✅ | ✅ |
| Manage compartments/items/categories | ❌ | ❌ | ✅ | ✅ |
| Add/manage personnel | ❌ | ❌ | ✅ | ✅ |

## Sys Admin Notes
- Email: zklein3@outlook.com — no department_personnel record (intentional)
- Always pass `department_id` explicitly in forms for sys admin actions
- `verifyAdmin()` in compartments.ts and equipment.ts accepts override department_id
- Sys admin dept drill-in: `/admin/dept/[id]` — tabbed management of any department

## Mobile Layout
- Desktop: fixed sidebar (w-64, red-800)
- Mobile: top bar + hamburger → slide-out drawer (MobileSidebar.tsx)
- All pages responsive: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
- Tables: overflow-x-auto + min-w

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
- Sys admin dept drill-in — `/admin/dept/[id]` tabbed (personnel, stations, apparatus, compartments)
- Dept Admin — Manage Personnel, Compartments, Items pages
- Personnel roster + profile (role-based editing, change password)
- Apparatus list (All/station/unassigned filters, cards) + detail (edit, compartment assign/remove)
- Stations list (cards) + detail (admin edit, assigned apparatus)
- Compartment names management + assignment to apparatus
- **Equipment pages** — `/equipment` (apparatus cards with item counts) + `/equipment/[id]` (compartment-by-compartment item view, assign/remove items)
- **Item management** — `/dept-admin/items` (categories tab + items tab, add forms)
- Dashboard with real data
- Error logging + email notifications
- FeedbackButton with React Portal
- Fire School — Fill Station, Bottles, Fill Log (all public)
- Vercel deployed + fireops7.com DNS configured

## What's Placeholder / Not Yet Built
- `/scba` — dept SCBA pages
- `/admin/logs` — full log viewer
- Supabase auth allowed URLs for custom domain
- Resend from address update to custom domain
- Item inspection flow (coming up)

## Equipment / Item System

### Database Tables
- `item_categories` — dept-scoped (category_name, requires_inspection, sort_order)
- `items` — item type definitions (item_name, category_id, tracks_quantity, requires_presence_check, requires_inspection)
- `item_location_standards` — what goes where (apparatus_compartment_id, item_id, expected_quantity, minimum_quantity)
- `item_assets` — individual tracked assets with serial numbers (future)
- `item_inspection_templates`, `item_inspection_template_steps` — inspection templates (future)
- `item_asset_inspection_logs`, `item_asset_inspection_log_steps` — inspection logs (future)

### Equipment Flow
1. Admin creates item categories (Forcible Entry, Medical, Power Tools...)
2. Admin creates item types (Axe, Halligan, Pike Pole...)
3. Officer/Admin assigns items to compartments on specific apparatus
4. All users view equipment by apparatus → compartment breakdown

### Item Flags
- `tracks_quantity` — quantity-based (axe x1, gauze x10)
- `tracks_assets` — individual serial number tracking (future)
- `requires_presence_check` — must be verified during inspection
- `requires_inspection` — has its own inspection protocol

## Compartment System
- `compartment_names` — dept-level definitions (code + name + sort_order)
- `apparatus_compartments` — links compartment_names to specific apparatus
- Admin only — create/edit/delete compartment names
- Officer/Admin — assign compartments to apparatus

## Database Tables (full list)

### Fire Department (auth-protected, RLS)
- `departments` — 3 rows
- `stations` — 2+ rows
- `apparatus` — 4+ rows
- `apparatus_types` — 20 rows (lookup)
- `apparatus_compartments` — junction: apparatus ↔ compartment_names
- `compartment_names` — dept-level compartment definitions
- `personnel`, `department_personnel`, `personnel_roles` (19 rows)
- `items`, `item_categories`, `item_assets`, `item_location_standards`
- `item_inspection_templates`, `item_inspection_template_steps`
- `item_asset_inspection_logs`, `item_asset_inspection_log_steps`
- `scba_bottles`, `scba_fill_logs`, `scba_maintenance_logs`, `scba_cylinder_specs`
- `system_logs`

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
1. Run `npm run build` and fix any TypeScript errors
2. Test equipment pages — add categories, items, assign to compartments
3. Add fireops7.com to Supabase auth allowed URLs
4. `/scba` department SCBA pages
5. `/admin/logs` full log viewer
6. Item inspection flow
7. Resend from address → custom domain

## Dev Workflow
- Start: `npm run dev` in C:\Users\zklei\Documents\FireOps7-Next
- Stop: Ctrl+C in VS Code terminal
- Build: `npm run build` (always before pushing)
- Git: `git add . && git commit -m "message" && git push`

## Test Accounts
- `zklein3@outlook.com` — sys admin, no department
- `test.winfire@fireops7.com` — Winslow Fire dept admin
- `member.winfire@fireops7.com` — Winslow Fire member
- `test.admin@fireops7.com` — Fremont Fire Test dept admin
- Temp password for new accounts: `Hello1!`

## Fire School
- URL: /fire-school (public, no login)
- Bottle check: active=true + requal not expired + service life not exceeded
- Cylinder types: composite_15, composite_30, steel, aluminum
- Fill log: one record per fill (bottle_id, filled_at, fill_result, notes)
- Not found → redirect to /fire-school/bottles?add=BOTTLE_ID
