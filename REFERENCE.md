# FireOps7 — Quick Reference (Routes, Actions, Permissions)

## App Route Structure

### Route Groups
| Group | Auth |
|---|---|
| `(auth)` — `/login`, `/change-password`, `/profile-setup`, `/pending`, `/denied` | Public |
| `(dashboard)` — all dashboard routes | Required |
| `(fire-school)` — `/fire-school`, `/fire-school/bottles`, `/fire-school/fill-log` | Public |
| `(public-site)` — `/dept/[slug]/*` | Public |

### Nav Structure (layout.tsx)

**Hub-and-spoke — sidebar 6 items only (all dept roles):**
| Sidebar Item | Hub Page | What's on it |
|---|---|---|
| Dashboard | `/dashboard` | Greeting, upcoming events, announcements, quick links |
| Operations | `/operations` | Incidents, Announcements, Fuel Log, Public Inbox cards + recent incidents list |
| Personnel | `/personnel` | Roster + profile card (already a hub) |
| Training | `/training` | Events / My Certs / Print cards + TrainingClient below |
| Equipment | `/equipment` | Inspections, Assets, Storage, Movement Log cards + apparatus grid |
| Reports | `/reports` | Tile grid — My Activity (all), Attendance/Training/Inspections/Inventory/Fuel (officer+) |

**Dept Admin section — admin only:** Single link → `/dept-admin` hub
Tiles: Personnel / Training & Certs / Accountability / Equipment Setup / Inspections / ISO (if enabled) / NERIS Settings (if enabled) / Public Site (if enabled)

**ISO sub-hub** (`/iso`): Hose Inventory / Hydrants / Mutual Aid / Pre-Fire Plans / ISO Report

**System Admin section:** Departments / Users / System Logs / NERIS

**PageNavBar** (`components/PageNavBar.tsx`) — auto-rendered on every dashboard page above content. Shows `← Back` (router.back()) + `[Hub Name] ↑` (parent hub link). Hidden on `/dashboard`. Pathname-driven — no per-page wiring needed.

Sidebar footer: name links to own `/personnel/[id]` profile.

### Dashboard Routes
- `/dashboard` — dept dashboard or sys admin overview
- `/personnel`, `/personnel/[id]` — roster + profile
- `/apparatus`, `/apparatus/[id]` — apparatus list + detail (still exists, not in nav)
- `/stations`, `/stations/[id]` — stations list + detail (still exists, not in nav)
- `/equipment/[id]` — manage items per apparatus (assign/remove/move), reached via apparatus detail
- `/equipment/[id]/[compartment_id]` — compartment detail; Back uses `?from` param; QR code auto-assigned on first open; Print QR always available
- `/equipment/[id]/fuel` — fuel log for a specific apparatus; receipt scan pre-fills fields
- `/equipment/storage` — dept-wide storage view: quantity items + unassigned tracked assets
- `/equipment/movement-log` — movement history with search + source filter
- `/equipment/assets` — dept-wide asset roster (Inspections nav group, officer+)
- `/inspections` — landing page: stations → apparatus cards → compartments (Scan QR / View / Inspect / Daily Check / Vehicle Check)
- `/inspections/run`, `/inspections/apparatus/[id]` — inspection run + session flow
- `/inspections/vehicle-check/[id]` — standalone vehicle check form (fluids, mechanical, lights, comms, emergency equipment, cleaning, air brakes if enabled); per-apparatus, all roles
- `/scan` — QR code lookup + redirect; compartment scans → `/inspections/run`; supports `?next=` post-login redirect
- `/fuel` — dept-wide fuel log + add entry (dashboard quick-action)
- `/events`, `/events/new`
- `/training` — nav label "Certifications"
- `/announcements` — unread badge
- `/incidents`, `/incidents/[id]`, `/incidents/new`
- `/reports/inspections`, `/reports/inventory`, `/reports/training`, `/reports/attendance`, `/reports/my-activity`, `/reports/fuel`
- `/iso/hoses`, `/iso/hydrants`, `/iso/report`
- `/inbox` — Signatures tab (all members, pending run signatures); Permits + Records tabs (officers/admins only)
- `/admin/departments`, `/admin/users`, `/admin/logs`
- `/admin/dept/[id]` — 5 tabs: Personnel/Stations/Apparatus/Compartments/Public Site
- `/dept-admin/setup`, `/dept-admin/items`, `/dept-admin/attendance`, `/dept-admin/training`
- `/dept-admin/inspections` — 2 tabs: Session Settings (inspection session duration) + Vehicle Check Items (add/edit/disable checklist items, instructions, reset to defaults)

### Public Site Routes (no auth)
- `/dept/[slug]` — landing | `/dept/[slug]/events` | `/dept/[slug]/burn-permit` | `/dept/[slug]/records`
- `/dept/[slug]/permit-status` — permit lookup + applicant signature
- `/dept/[slug]/permit-print` — printable permit by confirmation code

### Print Routes
- `/print/qr` | `/print/training-signin?event_id=xxx` | `/print/member-training?personnel_id=xxx&from=xxx&to=xxx`
- `/print/burn-permit?id=xxx` — auth required
- `/print/run-sheet?id=xxx` — auth required; Run Field Report matching dept paper form (one letter sheet)

---

## Back Navigation Pattern
- `components/BackButton.tsx` — `href` prop for explicit dest, else `router.back()`
- Back button lives BELOW the header as a styled action row button — never inline with title
- Single parent pages: hardcode dest (personnel → /personnel, stations → /stations, incidents → /incidents)
- Contextual pages: pass `?from=/origin` in link, read in page, pass as `href` to BackButton

## Key Action Files
- `app/actions/auth.ts` — signIn, changePassword, signOut
- `app/actions/personnel.ts` — updateOwnProfile, updatePersonnelProfile, updateDeptPersonnel, changeOwnPassword
- `app/actions/apparatus.ts` — createApparatus, updateApparatus
- `app/actions/stations.ts` — createStation, updateStation
- `app/actions/compartments.ts` — createCompartmentName, assignCompartmentToApparatus, removeCompartmentFromApparatus, setCompartmentQrCode
- `app/actions/equipment.ts` — createItemCategory, createItem, updateItem, createAsset, updateAsset, assignItemToCompartment, removeItemFromCompartment, moveItemToCompartment, assignAssetApparatus
- `app/actions/inspections.ts` — createInspectionTemplate, addTemplateStep, updateTemplateStep, deleteTemplateStep, submitInspection, inspection session actions; vehicle check: ensureVehicleCheckItems, getVehicleCheckItems, submitVehicleCheck, getVehicleCheckHistory, addVehicleCheckItem, updateVehicleCheckItem, toggleVehicleCheckItem, resetVehicleCheckItemsToDefaults
- `app/actions/attendance.ts` — createEventSeries, updateEventInstance, logAttendance, verifyAttendance, requestExcuse, closeEventInstance, cancelEventInstance, createExcuseType, saveParticipationRequirement
- `app/actions/incidents.ts` — createIncident, updateIncident, setIncidentStatus, apparatus/personnel/attendance actions
- `app/actions/training.ts` — createCertificationType, createCourseUnit, enrollMember, verifyProgress, logDirectCert, createTrainingEvent, logTrainingAttendance, saveTrainingSignature
- `app/actions/announcements.ts` — createAnnouncement, deleteAnnouncement, pinAnnouncement, markAnnouncementRead
- `app/actions/iso.ts` — upsertApparatusIsoSpecs, hose/hydrant/mutual aid actions
- `app/actions/users.ts` — createDeptMember
- `app/actions/fire-school.ts` — checkBottle, logFill, addFireSchoolBottle
- `app/actions/parse-fuel-receipt.ts` — Claude Haiku vision, extracts gallons/price/vendor/date from receipt photo
- `app/actions/fuel.ts` — saveFuelEntry, getFuelEntries
- `app/actions/public-site.ts` — savePublicSiteSettings, toggleEventSeriesPublic, submitBurnPermit, submitRecordRequest, updateBurnPermitStatus, updateRecordRequestStatus, savePermitOfficerSignature, savePermitApplicantSignature

## Supabase Edge Functions
- `notify-on-log` — emails zklein3@gmail.com on new system_logs entries
- `auto-close-events` — nightly 2 AM UTC, closes stale event instances
- `notify-expired-sessions` — hourly, emails officers on expired inspection sessions
- `send-permit-approval` — emails resident on permit approval (awaiting fireops7.com Resend domain)

---

## Permission Model

**Superseded 2026-08-10 by the granular permission-group system** (currently on local branch `feature/permission-groups-phase2`, not yet merged to `main` — see CLAUDE.md's "IMMEDIATE NEXT" section for full status). The old fixed 3-tier matrix below no longer reflects reality once that branch merges; kept temporarily for the legacy-fallback reference.

### Role Fields (legacy fallback only, once merged)
| Field | Table | Values |
|---|---|---|
| `is_sys_admin` | `personnel` | boolean — global, no dept record needed. Always bypasses every permission check. |
| `system_role` | `department_personnel` | `admin / officer / member` — used as the fallback for anyone with no `permission_group_id` assigned. See `legacyMinRole` per key below. |

### Granular Permission Catalog (`lib/permission-catalog.ts`)

A department admin creates named permission groups (e.g. "Chief", "Records Clerk") at `/dept-admin/permission-groups`, checks whichever of the 46 keys below apply, and assigns personnel to that group. `lib/permissions.ts` → `hasPermission(ctx, key)` / `getPermissionSnapshot(ctx)` is the resolver every gate below calls. `legacyMinRole` is only the fallback for someone with no group assigned — it is not a fixed role a group is limited to.

Every key here is wired to at least one real gate — the original 55-key catalog had 13 speculative Phase-1 entries with no matching code. 4 were wired to real (previously ungated) capabilities (`perform_apparatus_check`, `manage_equipment_standard`, `perform_standard_equipment_inspection`, `dispense_controlled_substances`); 9 were removed outright since no corresponding feature exists in the app (`view_dashboards`, `switch_station`, `unrestricted_transfer`, `manage_personnel_roles`, `delete_completed_check_reports`, `manage_service_task`, `manage_equipment_ppe`, `perform_ppe_inspection`, `transfer_equipment` — the PPE/standard-equipment split in particular never had a code-level distinction, so those pairs collapsed into one key each).

`/dept-admin` and `/officer` now filter each `HubCard` by its own matching key (not just whether you can see the hub at all) — a narrowly-scoped custom role only sees cards it can actually use.

#### Department Administration
| Key | `legacyMinRole` | Grants |
|---|---|---|
| `access_dept_admin_hub` | admin | View the `/dept-admin` hub page |
| `manage_users` | admin | `/dept-admin/personnel` page · reset a member's password · edit a member's department-level info (role/employee #/active status) |
| `manage_department_settings` | admin | `/dept-admin/settings` page · save timezone · save weekly digest setting |
| `post_update` | officer | Show the "Post Announcement" form on `/announcements` (page itself is open to all) |
| `moderate_announcements` | admin | Pin or delete any announcement |
| `manage_permission_groups` | admin | `/dept-admin/permission-groups` page · create/edit/delete permission groups · assign a group to a person |
| `manage_kiosk_devices` | admin | `/dept-admin/kiosk` page · create/list/revoke kiosk tablet devices |
| `manage_dept_setup` | admin | `/dept-admin/setup` wizard · `/stations`, `/stations/[id]` admin controls · create/edit stations · create compartment names |
| `manage_police_settings` | admin | `/dept-admin/police` page · edit contact types / action-taken types / case numbering |
| `access_officer_hub` | officer | View the `/officer` hub page |
| `manage_pd_logs` | officer | `/forms/business-check`, `/forms/contact` pages · create/edit/delete those log entries |

#### Personnel
| Key | `legacyMinRole` | Grants |
|---|---|---|
| `add_personnel` | officer | Show the Add Personnel form on `/personnel` and `/dept-admin/personnel` · actually create a new member |
| `view_personnel_details` | officer | View another member's profile (`/personnel/[id]`) · print another member's ID card · edit another member's basic profile · link/unlink another member's ID card or QR token |
| `manage_attendance_settings` | admin | `/dept-admin/attendance` page · manage shifts (add/rename/toggle/assign) · manage excuse types · set participation requirements |

#### Fleet
| Key | `legacyMinRole` | Grants |
|---|---|---|
| `manage_apparatus` | admin | Create an apparatus · edit active/ISO-exclusion/air-brakes/engine-hours flags · admin controls on the compartment detail page |
| `perform_apparatus_check` | member | Submit a vehicle check (`submitVehicleCheck`) |
| `change_apparatus_service_status` | officer | Edit an apparatus's basic info (name, type, station, make/model, etc.) |
| `manage_fuel_storage` | admin | `/dept-admin/fuel-tanks` page · toggle the fuel storage module · admin section of `/fuel/tanks/[id]` |
| `manage_inspection_settings` | admin | `/dept-admin/inspections` page · manage vehicle check items · inspection session duration setting |
| `manage_inspection_sessions` | officer | Close/delete a live inspection session · reconcile a session · `/reports/inspections` page |

#### Equipment
| Key | `legacyMinRole` | Grants |
|---|---|---|
| `manage_equipment_standard` | admin | Item categories, item types, and asset records (`equipment.ts`'s create/update/delete item category, item, asset, and asset-apparatus assignment) |
| `perform_standard_equipment_inspection` | member | Submit an equipment/compartment inspection (`submitInspection`) |
| `manage_inventory` | officer | `/equipment/movement-log`, `/reports/inventory`, `/reports/inventory-status` pages · assign/move/quantity-manage inventory items and compartment assignments · asset detail edit controls · storage transfer controls |

#### Training
| Key | `legacyMinRole` | Grants |
|---|---|---|
| `manage_training_programs` | admin | Create/edit/delete cert types, courses, direct cert entries · review outside-training submissions (all in `training.ts`) |
| `record_training_completion` | officer | `/dept-admin/training`, `/reports/training` pages · officer UI on `/training` · download a training document (`/api/training-doc`) · log/verify attendance, issue certs |

#### Events / Attendance
| Key | `legacyMinRole` | Grants |
|---|---|---|
| `manage_events` | officer | `/dept-admin/events`, `/events/new` pages · officer UI on `/events` · generate a self-check-in QR code · create/edit/close/cancel events |
| `delete_events` | admin | Delete an event |
| `approve_attendance` | officer | `/reports/attendance` page (and its Reports-hub card) |

#### Operations / Incidents
| Key | `legacyMinRole` | Grants |
|---|---|---|
| `manage_incidents` | officer | Officer UI on `/incidents`, `/incidents/[id]`, the NERIS report page · `/reports/run-report` page · officer-level incident/NERIS actions |
| `submit_neris` | admin | `/dept-admin/neris` page · save a department's NERIS entity ID · submit-only controls on the NERIS report page |

#### Accountability / ICS
| Key | `legacyMinRole` | Grants |
|---|---|---|
| `manage_accountability_boards` | officer | Officer UI on `/accountability` and a board's detail page · generate/revoke guest links · delete a lane · attach a card · set ICS fields/roles/lane leader/work assignment · rename a lane |
| `manage_accountability_lanes` | admin | `/dept-admin/accountability` page · add/update/toggle/reorder lane templates |
| `manage_ics_defaults` | admin | `/dept-admin/ics-defaults` page · radio channel and medical plan contact defaults |
| `close_ics_packets` | officer | Close an ICS operational period |
| `manage_ics_incidents` | officer | Officer UI on `/ics` and an incident's detail page · create an ICS incident · add/close a participant · transfer command · open an operational period |
| `delete_ics_incidents` | admin | Delete an ICS incident · admin UI on an incident's detail page |
| `delete_accountability_boards` | admin | Delete an accountability board · admin UI on `/accountability` and a board's detail page |

#### ISO
| Key | `legacyMinRole` | Grants |
|---|---|---|
| `manage_iso_data` | admin | "Save as Default" control on `/iso/report/print` · save ISO report settings |
| `perform_iso_testing` | officer | `/iso` hub · `/iso/hydrants`, `/iso/hoses`, `/iso/hoses/session`, `/iso/mutual-aid`, `/iso/preplans` pages · all hose/hydrant/mutual-aid/preplan data entry |

#### Medical
| Key | `legacyMinRole` | Grants |
|---|---|---|
| `manage_medical_inventory` | officer | Officer UI on `/equipment`, `/medical` · `/reports/medical` page · medical CS log print page · waste/transfer actions · Inbox Restock tab (reorder requests, expired lots) |
| `dispense_controlled_substances` | member | Dispense or administer a controlled substance (`dispenseStock`, `administerStock`) |
| `manage_medical_supply_setup` | admin | Medical tab on `/dept-admin/setup` (`?tab=medical` — `/dept-admin/medical` redirects there) · admin UI on `/medical` (setup links, stock adjustment) |

#### Public Site / Inbox
| Key | `legacyMinRole` | Grants |
|---|---|---|
| `manage_public_site` | admin | `/dept-admin/public-inbox` page · save inbox/public-site settings · toggle an event series' public visibility |
| `manage_public_inbox` | officer | Update/delete public feedback · reply to public feedback · update a records request's status · Inbox Records Requests + Feedback tabs |
| `review_burn_permits` | officer | Approve/deny/delete a burn permit · save officer signature · contact a permit holder · Inbox Burn Permits tab |

### Known Gaps (as of 2026-08-10)
None — every real `system_role`-based authorization gate in `app/` (including `layout.tsx` nav conditionals and Inbox tab visibility) is resolver-backed. `viewingSysAdminOverview` is untouched by design, since it governs the platform-level sys-admin bypass, not a department permission.

---

## Burn Permit Flow
- Public submits at `/dept/[slug]/burn-permit` → `burn_permits` table, auto confirmation code, `logEvent` notification to sys admin
- Officer reviews in `/inbox` → requires `burn_permit_county_info` + dept name configured
- Approval: officer fills expiry/notes → "Sign & Approve" → `PermitSignatureModal` → signature saved → `updateBurnPermitStatus` → `logEvent` notification
- Direct resident email: `send-permit-approval` Edge Function ready, swap in when fireops7.com verified
- Resident signs at `/dept/[slug]/permit-status?code=xxx`
- Signatures: `signatures/permits/officer/{id}.png` and `signatures/permits/applicant/{id}.png`

## Public Site System
- Path-based at `fireops7.com/dept/[slug]` — one codebase, all depts
- Toggle: `departments.public_site_enabled` + `public_slug` (sys admin in `/admin/dept/[id]` → Public Site tab)
- Middleware bypasses auth for `/dept/*`
- Events: `event_series.is_public = true` required (toggled from `/events` manage panel)

## Accountability Module — Future Build (not started)

Standalone personnel accountability system using Salamander QR cards + temp cards. See CLAUDE.md → "Salamander QR Card Integration" for QR format details.

**Concept:** Scene accountability officer runs this on a tablet. People scan in/out. PAR button snapshots the roster. Works independent of incident reporting.

**Check-in methods:** Salamander QR card | Temp card (pre-printed, handed to visitors/mutual aid) | Manual name entry

**Temp cards:** Print laminated QR badges (TEMP-001…TEMP-020). Hand out to people without cards. Scan → assign to a person. Scan out → card returns to available. Unreturned cards flagged at event close.

**Tables to build:**
- `accountability_events` — scene/event, optional `incident_id` link, status (active/closed)
- `accountability_roster` — person on scene: `personnel_id` (nullable), raw name/dept, assignment, status (on_scene/staged/rehab/released), check-in/out times
- `accountability_pars` — PAR timestamp + roster snapshot (jsonb)
- `accountability_temp_cards` — card inventory: code, status (available/checked_out/retired), current assignee

**Routes:** `/accountability` list → `/accountability/[id]` main board → `/accountability/[id]/scan` full-screen tablet scan mode → `/accountability/temp-cards` inventory + QR print

**Open questions before building:** assignment list (fixed ICS divisions or free text?), who can run it (officers only?), linking to incidents (optional or required?).

## Test Data (Winslow Fire)
- Engine 32 → D1 (Scott Air Pack ×2, Bottle ×2, Halligan ×1) + P1 (Chainsaw ×1)
- Assets: Chainsaw 1, Scott Air Pack 1, Scott Air Pack 2, B-0001, B-0002
- Templates: Weekly Chainsaw Inspection (3 steps), Weekly Airpack Inspection (4 steps)
