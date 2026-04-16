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
- `/dept-admin/items` — manage item categories, item types, and assets (3 tabs)

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
| Manage compartments/items/categories/assets | ❌ | ❌ | ✅ | ✅ |
| Add/manage personnel | ❌ | ❌ | ✅ | ✅ |

## Sys Admin Notes
- Email: zklein3@outlook.com — no department_personnel record (intentional)
- Always pass `department_id` explicitly in forms for sys admin actions
- `verifyAdmin()` in compartments.ts and equipment.ts accepts override department_id
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
- Sys admin dept drill-in — `/admin/dept/[id]` tabbed (personnel, stations, apparatus, compartments)
- Dept Admin — Manage Personnel, Compartments, Items pages (with inline edit)
- Personnel roster + profile (role-based editing, change password)
- Apparatus list (All/station/unassigned filters, cards) + detail (edit, compartment assign/remove)
- Stations list (cards) + detail (admin edit, assigned apparatus)
- Compartment names management + assignment to apparatus
- Equipment pages — `/equipment` + `/equipment/[id]` (compartment item view, assign/remove)
- **Item management** — 3 tabs: Categories, Items (with asset expansion), Assets
- **Asset tracking** — create/edit assets under inspectable item types
- Item creation flow — if requires_inspection checked → redirects to asset creation on save
- Dashboard with real data
- Error logging + email notifications
- FeedbackButton with React Portal
- Mobile header overlap fixed, input text color fixed (webkit-text-fill-color)
- Fire School — Fill Station, Bottles, Fill Log (all public)
- Vercel deployed + fireops7.com DNS configured

## What's Placeholder / Not Yet Built
- `/scba` — dept SCBA pages
- `/admin/logs` — full log viewer
- Supabase auth allowed URLs for custom domain
- Inspection template builder (admin builds checklist per item type)
- Inspection schedule settings (daily/weekly/monthly per dept)
- Inspection run UI (officer/member completes inspection)
- Equipment page — asset assignment to compartments (currently quantity-only items)
- Resend from address → custom domain

## Equipment / Item System — DESIGN

### Item Categories (reporting/filter only)
- category_name, sort_order, active
- NO inspection logic at category level
- Used for filtering: "show all Power Tools on Engine 32"

### Item Types — two behaviors based on flags:

**Quantity-only items** (requires_inspection = false):
- Axe, Halligan, Pike Pole, Gauze packs
- Assigned to compartments with expected_quantity
- item_location_standards holds the assignment

**Asset-tracked items** (requires_inspection = true):
- Chainsaw, Thermal Imager, Cardiac Monitor
- tracks_assets = true automatically
- Individual assets created under item type (Chainsaw 1, Chainsaw 2)
- Each asset: serial number, asset tag, in-service date, status
- Assets are what get assigned to compartments (not the item type)
- Inspections log against specific asset

### Item Flags
- `tracks_quantity` — count based (auto false when requires_inspection = true)
- `tracks_assets` — individual serial number tracking (auto true when requires_inspection = true)
- `requires_presence_check` — must be verified present during apparatus check
- `requires_inspection` — has inspection template + schedule
- `tracks_expiration` — has expiry date to track

### Asset Flow (BUILT)
1. Admin creates item type "Chainsaw" → checks requires_inspection
2. On save → stays on items tab, auto-opens asset form for that item
3. Admin creates "Chainsaw 1" (name, serial, in-service date)
4. Can add "Chainsaw 2" etc. on same screen
5. Assets tab shows all assets across all item types
6. Adding future assets → Items tab → Chainsaw → Assets → + Add Asset

### Asset Statuses
- `active` — in service
- `out_of_service` — temporarily unavailable
- `retired` — permanently removed

### Inspection System (TO BUILD)
- `item_inspection_templates` — per item type, per department
  - template_name, template_description, item_id, department_id
- `item_inspection_template_steps` — individual checklist questions
  - step_text, response_type (boolean/text/numeric), required, fail_if_negative, sort_order
- `item_asset_inspection_logs` — completed inspection record
  - asset_id, template_id, inspected_at, overall_result, inspected_by
- `item_asset_inspection_log_steps` — individual step responses
  - boolean_value, text_value, numeric_value, notes

### Inspection Schedule (TO BUILD — new table needed)
- Department sets baseline: Daily / Weekly / Monthly
- Monthly = system maximum (no apparatus can go longer than monthly)
- Schedule options:
  - Daily: select active days + which day gets full inspection
  - Weekly: select day of week
  - Monthly by day of week: 1st/2nd/3rd/4th + Mon-Sun (e.g. 2nd Tuesday)
  - Monthly by date: specific date 1-28 (e.g. 15th of month)
- Apparatus can override to more frequent than dept baseline
- Career depts: daily presence + weekly/monthly full inspection
- Volunteer depts: typically monthly full inspection

## Database Tables (full list)

### Fire Department (auth-protected, RLS)
- `departments`, `stations`, `apparatus`, `apparatus_types`
- `apparatus_compartments`, `compartment_names`
- `personnel`, `department_personnel`, `personnel_roles`
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
1. Test asset tracking flow — create item with inspection, add assets
2. Update equipment page to support asset assignment to compartments
3. Build inspection template builder (admin)
4. Build inspection schedule settings (admin)
5. Build inspection run UI (officer/member)
6. Add fireops7.com to Supabase auth allowed URLs
7. `/scba` pages
8. `/admin/logs` full log viewer

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

## Fire School
- URL: /fire-school (public, no login)
- Bottle check: active=true + requal not expired + service life not exceeded
- Cylinder types: composite_15, composite_30, steel, aluminum
- Fill log: one record per fill (bottle_id, filled_at, fill_result, notes)
- Not found → redirect to /fire-school/bottles?add=BOTTLE_ID
