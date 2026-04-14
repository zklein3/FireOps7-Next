'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateOwnProfile, updatePersonnelProfile, updateDeptPersonnel, changeOwnPassword } from '@/app/actions/personnel'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY'
]

interface Person {
  id: string
  first_name: string
  last_name: string
  display_name: string | null
  email: string
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  signup_status: string
  is_sys_admin: boolean
}

interface DeptRecord {
  id: string
  system_role: string
  role_id: string | null
  employee_number: string | null
  hire_date: string | null
  active: boolean
  signup_status: string
}

interface Role {
  id: string
  name: string
  is_officer: boolean
  sort_order: number
}

export default function PersonnelProfileClient({
  person,
  deptRecord,
  roles,
  isMe,
  isAdmin,
  isOfficerOrAbove,
}: {
  person: Person
  deptRecord: DeptRecord
  roles: Role[]
  isMe: boolean
  isAdmin: boolean
  isOfficerOrAbove: boolean
}) {
  const router = useRouter()
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  const [deptError, setDeptError] = useState<string | null>(null)
  const [deptSuccess, setDeptSuccess] = useState<string | null>(null)
  const [deptLoading, setDeptLoading] = useState(false)

  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState<string | null>(null)
  const [pwLoading, setPwLoading] = useState(false)

  const canEditProfile = isMe || isOfficerOrAbove

  async function handleProfileSubmit(formData: FormData) {
    setProfileError(null)
    setProfileSuccess(null)
    setProfileLoading(true)
    const result = isMe
      ? await updateOwnProfile(formData)
      : await updatePersonnelProfile(formData)
    if (result?.error) setProfileError(result.error)
    else setProfileSuccess('Profile updated successfully.')
    setProfileLoading(false)
  }

  async function handleDeptSubmit(formData: FormData) {
    setDeptError(null)
    setDeptSuccess(null)
    setDeptLoading(true)
    const result = await updateDeptPersonnel(formData)
    if (result?.error) setDeptError(result.error)
    else setDeptSuccess('Department info updated successfully.')
    setDeptLoading(false)
  }

  async function handlePasswordSubmit(formData: FormData) {
    setPwError(null)
    setPwSuccess(null)
    setPwLoading(true)
    const result = await changeOwnPassword(formData)
    if (result?.error) setPwError(result.error)
    else setPwSuccess('Password changed successfully.')
    setPwLoading(false)
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => router.back()}
          className="text-sm text-zinc-500 hover:text-zinc-700"
        >
          ← Back
        </button>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">
            {person.first_name || person.last_name
              ? `${person.first_name} ${person.last_name}`.trim()
              : 'Profile'}
          </h1>
          <p className="text-sm text-zinc-500">{person.email}</p>
        </div>
        {person.is_sys_admin && (
          <span className="ml-auto inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
            Sys Admin
          </span>
        )}
      </div>

      {/* ── Personal Info ─────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-zinc-900 mb-4">Personal Information</h2>
        {profileSuccess && <Alert type="success" message={profileSuccess} />}
        {profileError && <Alert type="error" message={profileError} />}

        {canEditProfile ? (
          <form action={handleProfileSubmit} className="flex flex-col gap-4">
            <input type="hidden" name="personnel_id" value={person.id} />
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">First Name <span className="text-red-500">*</span></label>
                <input name="first_name" type="text" required defaultValue={person.first_name}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Last Name <span className="text-red-500">*</span></label>
                <input name="last_name" type="text" required defaultValue={person.last_name}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Email</label>
              <input type="text" value={person.email} disabled
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-400 cursor-not-allowed" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Phone</label>
              <input name="phone" type="tel" defaultValue={person.phone ?? ''}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="(555) 555-5555" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Street Address</label>
              <input name="address" type="text" defaultValue={person.address ?? ''}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="123 Main St" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">City</label>
                <input name="city" type="text" defaultValue={person.city ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="w-24">
                <label className="mb-1 block text-sm font-medium text-zinc-700">State</label>
                <select name="state" defaultValue={person.state ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                  <option value="">—</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="w-28">
                <label className="mb-1 block text-sm font-medium text-zinc-700">ZIP</label>
                <input name="zip" type="text" maxLength={10} defaultValue={person.zip ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <button type="submit" disabled={profileLoading}
              className="mt-1 w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
              {profileLoading ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <ReadOnlyField label="Name" value={`${person.first_name} ${person.last_name}`.trim()} />
            <ReadOnlyField label="Email" value={person.email} />
            <ReadOnlyField label="Phone" value={person.phone} />
            <ReadOnlyField label="Address" value={[person.address, person.city, person.state, person.zip].filter(Boolean).join(', ')} />
          </div>
        )}
      </div>

      {/* ── Department Info ───────────────────────────────────────────────── */}
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-zinc-900 mb-4">Department Information</h2>
        {deptSuccess && <Alert type="success" message={deptSuccess} />}
        {deptError && <Alert type="error" message={deptError} />}

        {isAdmin ? (
          <form action={handleDeptSubmit} className="flex flex-col gap-4">
            <input type="hidden" name="dept_personnel_id" value={deptRecord.id} />
            <input type="hidden" name="personnel_id" value={person.id} />
            <div className="flex gap-4">
              <div className="w-44">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Access Level</label>
                <select name="system_role" defaultValue={deptRecord.system_role}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                  <option value="admin">Admin</option>
                  <option value="officer">Officer</option>
                  <option value="member">Member</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Title / Rank</label>
                <select name="role_id" defaultValue={deptRecord.role_id ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                  <option value="">Select title...</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-44">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Employee #</label>
                <input name="employee_number" type="text" defaultValue={deptRecord.employee_number ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Hire Date</label>
                <input name="hire_date" type="date" defaultValue={deptRecord.hire_date ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Status</label>
              <select name="active" defaultValue={deptRecord.active ? 'true' : 'false'}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <button type="submit" disabled={deptLoading}
              className="mt-1 w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
              {deptLoading ? 'Saving...' : 'Save Department Info'}
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <ReadOnlyField label="Access Level" value={deptRecord.system_role.charAt(0).toUpperCase() + deptRecord.system_role.slice(1)} />
            <ReadOnlyField label="Employee #" value={deptRecord.employee_number} />
            <ReadOnlyField label="Hire Date" value={deptRecord.hire_date} />
            <ReadOnlyField label="Status" value={deptRecord.active ? 'Active' : 'Inactive'} />
          </div>
        )}
      </div>

      {/* ── Change Password — own profile only ───────────────────────────── */}
      {isMe && (
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-6">
          <h2 className="text-base font-semibold text-zinc-900 mb-4">Change Password</h2>
          {pwSuccess && <Alert type="success" message={pwSuccess} />}
          {pwError && <Alert type="error" message={pwError} />}
          <form action={handlePasswordSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Current Password</label>
              <input name="current_password" type="password" required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="••••••••" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">New Password</label>
              <input name="password" type="password" required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="••••••••" />
              <p className="mt-1 text-xs text-zinc-400">Minimum 8 characters</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Confirm New Password</label>
              <input name="confirm" type="password" required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="••••••••" />
            </div>
            <button type="submit" disabled={pwLoading}
              className="mt-1 w-full rounded-lg bg-zinc-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors">
              {pwLoading ? 'Updating...' : 'Change Password'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-4">
      <span className="w-32 text-zinc-500 shrink-0">{label}</span>
      <span className="text-zinc-900">{value || '—'}</span>
    </div>
  )
}

function Alert({ type, message }: { type: 'success' | 'error'; message: string }) {
  return (
    <div className={`mb-4 rounded-lg px-4 py-3 text-sm border ${
      type === 'success'
        ? 'bg-green-50 text-green-700 border-green-200'
        : 'bg-red-50 text-red-700 border-red-200'
    }`}>
      {message}
    </div>
  )
}
