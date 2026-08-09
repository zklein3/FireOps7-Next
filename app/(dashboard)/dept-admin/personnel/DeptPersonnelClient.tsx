'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createDeptMember, deptAdminForcePasswordReset } from '@/app/actions/users'
import { assignPersonnelShift, addShift } from '@/app/actions/shifts'
import { updatePersonnelPermissionGroup } from '@/app/actions/permissions'

interface Role {
  id: string
  name: string
  is_officer: boolean
  sort_order: number
}

interface Shift { id: string; name: string; sort_order: number; active: boolean }
interface PermissionGroup { id: string; name: string }

interface PersonnelRecord {
  id: string
  system_role: string
  signup_status: string
  active: boolean
  employee_number: string | null
  hire_date: string | null
  role_id: string | null
  shift_id: string | null
  shift_name: string | null
  permission_group_id: string | null
  personnel: {
    id: string
    first_name: string
    last_name: string
    email: string
    signup_status: string
  } | null
  personnel_roles: {
    name: string
    is_officer: boolean
  } | null
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  temp_password: 'bg-yellow-100 text-yellow-700',
  profile_setup: 'bg-blue-100 text-blue-700',
  awaiting_approval: 'bg-orange-100 text-orange-700',
  denied: 'bg-red-100 text-red-700',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  temp_password: 'Temp Password',
  profile_setup: 'Profile Setup',
  awaiting_approval: 'Pending',
  denied: 'Denied',
}

export default function DeptPersonnelClient({
  personnel,
  roles,
  shifts,
  departmentName,
  departmentId,
  permissionGroups,
}: {
  personnel: PersonnelRecord[]
  roles: Role[]
  shifts: Shift[]
  departmentName: string
  departmentId: string
  permissionGroups: PermissionGroup[]
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [shiftOverrides, setShiftOverrides] = useState<Record<string, string | null>>({})
  const [newShiftName, setNewShiftName] = useState('')
  const [addingShift, setAddingShift] = useState(false)
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null)
  const [resetSuccessId, setResetSuccessId] = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState(false)
  const [groupOverrides, setGroupOverrides] = useState<Record<string, string | null>>({})

  async function handleAssignPermissionGroup(recordId: string, groupId: string) {
    setGroupOverrides(prev => ({ ...prev, [recordId]: groupId || null }))
    const res = await updatePersonnelPermissionGroup(recordId, groupId || null)
    if (res?.error) setError(res.error)
  }

  async function handleResetPassword(recordId: string, personnelId: string) {
    setResetLoading(true); setError(null)
    const res = await deptAdminForcePasswordReset(personnelId)
    setResetLoading(false)
    if (res?.error) { setError(res.error); return }
    setConfirmResetId(null)
    setResetSuccessId(recordId)
  }

  async function handleAssignShift(recordId: string, shiftId: string) {
    setShiftOverrides(prev => ({ ...prev, [recordId]: shiftId || null }))
    const res = await assignPersonnelShift(recordId, shiftId || null)
    if (res?.error) setError(res.error)
  }

  async function handleAddShift() {
    if (!newShiftName.trim()) return
    setAddingShift(true)
    const res = await addShift(departmentId, newShiftName.trim())
    setAddingShift(false)
    if (res?.error) { setError(res.error); return }
    setNewShiftName('')
    router.refresh()
  }

  async function handleCreate(formData: FormData) {
    setError(null)
    setSuccess(null)
    setLoading(true)
    const result = await createDeptMember(formData)
    if (result?.error) {
      setError(result.error)
    } else {
      setSuccess(
        result?.emailSent
          ? 'Personnel added. A welcome email with login instructions was sent.'
          : `Personnel added. Temporary password: ${result?.tempPassword ?? 'Hello1!'} — share this with them directly.`
      )
      setShowForm(false)
    }
    setLoading(false)
  }

  // Sort personnel: admins first, then officers, then members
  const roleOrder: Record<string, number> = { admin: 0, officer: 1, member: 2 }
  const sorted = [...personnel].sort((a, b) =>
    (roleOrder[a.system_role] ?? 9) - (roleOrder[b.system_role] ?? 9)
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Manage Personnel</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {departmentName} — {personnel.length} member{personnel.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(null); setSuccess(null) }}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Personnel'}
        </button>
      </div>

      {/* Success */}
      {success && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-200">
          {success}
        </div>
      )}

      {/* Add Personnel Form */}
      {showForm && (
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm border border-zinc-200">
          <h2 className="text-base font-semibold text-zinc-900 mb-1">Add Personnel</h2>
          <p className="text-xs text-zinc-500 mb-4">
            A temporary password is generated and must be changed on first login.
          </p>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}
          <form action={handleCreate} className="flex flex-col gap-4">

            {/* Name Row */}
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="first_name">
                  First Name
                </label>
                <input
                  id="first_name"
                  name="first_name"
                  type="text"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  placeholder="Optional"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="last_name">
                  Last Name
                </label>
                <input
                  id="last_name"
                  name="last_name"
                  type="text"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  placeholder="Optional"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="email">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="member@department.com"
              />
            </div>

            {/* Access Level + Title Row */}
            <div className="flex gap-4">
              <div className="w-44">
                <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="system_role">
                  Access Level <span className="text-red-500">*</span>
                </label>
                <select
                  id="system_role"
                  name="system_role"
                  required
                  defaultValue="member"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  <option value="admin">Admin</option>
                  <option value="officer">Officer</option>
                  <option value="member">Member</option>
                </select>
              </div>

              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="role_id">
                  Title / Rank
                </label>
                <select
                  id="role_id"
                  name="role_id"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  <option value="">Select title...</option>
                  {roles.map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Permission Group */}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="permission_group_id">
                Permission Group
              </label>
              <select
                id="permission_group_id"
                name="permission_group_id"
                defaultValue=""
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              >
                <option value="">— Legacy (based on Access Level) —</option>
                {permissionGroups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            {/* Employee Number + Hire Date Row */}
            <div className="flex gap-4">
              <div className="w-44">
                <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="employee_number">
                  Employee #
                </label>
                <input
                  id="employee_number"
                  name="employee_number"
                  type="text"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  placeholder="Optional"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="hire_date">
                  Hire Date
                </label>
                <input
                  id="hire_date"
                  name="hire_date"
                  type="date"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm text-zinc-700">
              <input type="checkbox" name="send_welcome_email" value="true" defaultChecked className="mt-0.5" />
              <span>
                Send welcome email with a random temporary password
                <span className="block text-xs text-zinc-500">Uncheck for test/demo accounts — uses the default password Hello1! and sends no email.</span>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Adding...' : 'Add Personnel'}
            </button>
          </form>
        </div>
      )}

      {/* Shifts — standing assignment, not a rotation calendar. Feeds ICS forward-planning. */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs font-medium text-zinc-500">Shifts:</span>
        {shifts.map(s => <span key={s.id} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{s.name}</span>)}
        <input value={newShiftName} onChange={e => setNewShiftName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAddShift() }}
          placeholder="+ Add shift (A Shift, Day Crew…)"
          className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-500 w-48" />
        <button type="button" disabled={addingShift || !newShiftName.trim()} onClick={handleAddShift}
          className="text-xs font-semibold text-red-700 hover:underline disabled:opacity-50">Add</button>
      </div>

      {/* Personnel Cards */}
      {sorted.length === 0 ? (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          No personnel yet. Add someone above.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map((record) => {
            const p = record.personnel
            const name = p?.first_name || p?.last_name
              ? `${p.first_name} ${p.last_name}`.trim()
              : '—'
            const status = p?.signup_status ?? record.signup_status
            return (
              <div key={record.id} className="rounded-xl bg-white border border-zinc-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900 truncate">{name}</p>
                    <p className="text-xs text-zinc-500 truncate">{p?.email ?? '—'}</p>
                  </div>
                  <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    record.system_role === 'admin'   ? 'bg-red-100 text-red-700' :
                    record.system_role === 'officer' ? 'bg-blue-100 text-blue-700' :
                                                       'bg-zinc-100 text-zinc-600'
                  }`}>
                    {record.system_role.charAt(0).toUpperCase() + record.system_role.slice(1)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                  {record.personnel_roles?.name && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                      {record.personnel_roles.name}
                    </span>
                  )}
                  {shifts.length > 0 && (
                    <select
                      value={shiftOverrides[record.id] ?? record.shift_id ?? ''}
                      onChange={e => handleAssignShift(record.id, e.target.value)}
                      className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-500">
                      <option value="">No shift</option>
                      {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                  {permissionGroups.length > 0 && (
                    <select
                      value={groupOverrides[record.id] ?? record.permission_group_id ?? ''}
                      onChange={e => handleAssignPermissionGroup(record.id, e.target.value)}
                      className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-500">
                      <option value="">Legacy access level</option>
                      {permissionGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                    {STATUS_LABELS[status] ?? status}
                  </span>
                  {record.employee_number && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                      #{record.employee_number}
                    </span>
                  )}
                </div>
                {resetSuccessId === record.id && (
                  <div className="mt-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
                    Password reset to <span className="font-mono font-semibold">Hello1!</span> — share this with {name} directly. They'll be required to change it on next login.
                  </div>
                )}
                {confirmResetId === record.id && (
                  <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
                    <p className="text-xs font-medium text-amber-900">Reset {name}'s password to Hello1!?</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => setConfirmResetId(null)}
                        className="flex-1 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-700"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => p?.id && handleResetPassword(record.id, p.id)}
                        disabled={resetLoading}
                        className="flex-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        {resetLoading ? 'Resetting…' : 'Confirm Reset'}
                      </button>
                    </div>
                  </div>
                )}
                {p?.id && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => router.push(`/personnel/${p.id}`)}
                      className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
                    >
                      Edit Profile
                    </button>
                    <button
                      onClick={() => { setConfirmResetId(record.id); setResetSuccessId(null) }}
                      className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
                    >
                      Reset Password
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
