'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createDeptAdmin,
  sysAdminUpdateEmail,
  sysAdminForcePasswordReset,
  sysAdminSetRole,
  sysAdminMoveDepartment,
  sysAdminDeactivateUser,
  sysAdminReactivateUser,
} from '@/app/actions/users'

interface Department {
  id: string
  name: string
  code: string | null
}

interface DeptRecord {
  system_role: string
  department_id: string
  department_name: string | null
  active: boolean
}

interface User {
  id: string
  first_name: string
  last_name: string
  email: string
  signup_status: string
  is_sys_admin: boolean
  created_at: string
  department_personnel: DeptRecord[]
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  temp_password: 'bg-yellow-100 text-yellow-700',
  awaiting_approval: 'bg-blue-100 text-blue-700',
  denied: 'bg-red-100 text-red-700',
  profile_setup: 'bg-purple-100 text-purple-700',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  temp_password: 'Temp Password',
  awaiting_approval: 'Pending',
  denied: 'Denied',
  profile_setup: 'Profile Setup',
}

export default function UsersClient({ departments, users }: { departments: Department[], users: User[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [deptFilter, setDeptFilter] = useState('')

  const filteredUsers = deptFilter
    ? users.filter(u => u.department_personnel?.some(dp => dp.department_id === deptFilter))
    : users

  const [managingUser, setManagingUser] = useState<User | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [modalSuccess, setModalSuccess] = useState<string | null>(null)
  const [modalLoading, setModalLoading] = useState(false)

  // Modal field state
  const [emailInput, setEmailInput] = useState('')
  const [roleInput, setRoleInput] = useState('')
  const [deptInput, setDeptInput] = useState('')

  function openManage(user: User) {
    setManagingUser(user)
    setModalError(null)
    setModalSuccess(null)
    setEmailInput(user.email)
    const dp = user.department_personnel?.[0]
    setRoleInput(dp?.system_role ?? '')
    setDeptInput(dp?.department_id ?? '')
  }

  function closeManage() {
    setManagingUser(null)
    setModalError(null)
    setModalSuccess(null)
  }

  async function withModal(fn: () => Promise<{ error?: string; success?: boolean } | undefined>) {
    setModalError(null)
    setModalSuccess(null)
    setModalLoading(true)
    try {
      const result = await fn()
      if (result?.error) {
        setModalError(result.error)
      } else {
        setModalSuccess('Saved successfully.')
        router.refresh()
      }
    } finally {
      setModalLoading(false)
    }
  }

  async function handleCreate(formData: FormData) {
    setError(null)
    setSuccess(null)
    setLoading(true)
    const result = await createDeptAdmin(formData)
    if (result?.error) {
      setError(result.error)
    } else {
      setSuccess(
        result?.emailSent
          ? 'Department admin created. A welcome email with login instructions was sent.'
          : `Department admin created. Temporary password: ${result?.tempPassword ?? 'Hello1!'} — share this with them directly.`
      )
      setShowForm(false)
      router.refresh()
    }
    setLoading(false)
  }

  const dp = managingUser?.department_personnel?.[0]
  const isActive = dp?.active !== false && managingUser?.signup_status !== 'denied'

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Users</h1>
          <p className="text-sm text-zinc-500 mt-1">{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}{deptFilter ? '' : ' total'}</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(null); setSuccess(null) }}
          className="w-full sm:w-auto rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Dept Admin'}
        </button>
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="dept_filter">
          Filter by Department
        </label>
        <select
          id="dept_filter"
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          className="w-full sm:w-72 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        >
          <option value="">All Departments</option>
          {departments.map(dept => (
            <option key={dept.id} value={dept.id}>
              {dept.name}{dept.code ? ` (${dept.code})` : ''}
            </option>
          ))}
        </select>
      </div>

      {success && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-200">{success}</div>
      )}

      {showForm && (
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm border border-zinc-200">
          <h2 className="text-base font-semibold text-zinc-900 mb-1">Add Department Admin</h2>
          <p className="text-xs text-zinc-500 mb-4">
            A temporary password is generated and must be changed on first login.
          </p>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>
          )}
          <form action={handleCreate} className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4 sm:items-end sm:flex-wrap">
              <div className="flex-1 sm:min-w-40">
                <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="first_name">First Name</label>
                <input id="first_name" name="first_name" type="text" placeholder="Optional"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="flex-1 sm:min-w-40">
                <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="last_name">Last Name</label>
                <input id="last_name" name="last_name" type="text" placeholder="Optional"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 sm:items-end sm:flex-wrap">
              <div className="flex-1 sm:min-w-48">
                <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="email">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input id="email" name="email" type="email" required
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  placeholder="admin@department.com" />
              </div>
              <div className="w-full sm:w-64">
                <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="department_id">
                  Department <span className="text-red-500">*</span>
                </label>
                <select id="department_id" name="department_id" required
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                  <option value="">Select department...</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}{dept.code ? ` (${dept.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={loading}
                className="w-full sm:w-auto rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
                {loading ? 'Creating...' : 'Create'}
              </button>
            </div>
            <label className="flex items-start gap-2 text-sm text-zinc-700">
              <input type="checkbox" name="send_welcome_email" value="true" defaultChecked className="mt-0.5" />
              <span>
                Send welcome email with a random temporary password
                <span className="block text-xs text-zinc-500">Uncheck for test/demo accounts — uses the default password Hello1! and sends no email.</span>
              </span>
            </label>
          </form>
        </div>
      )}

      {filteredUsers.length === 0 ? (
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          {users.length === 0 ? 'No users yet.' : 'No users in this department.'}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-zinc-600">Name</th>
                  <th className="px-6 py-3 text-left font-semibold text-zinc-600">Email</th>
                  <th className="px-6 py-3 text-left font-semibold text-zinc-600">Department</th>
                  <th className="px-6 py-3 text-left font-semibold text-zinc-600">Role</th>
                  <th className="px-6 py-3 text-left font-semibold text-zinc-600">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredUsers.map((user) => {
                  const deptInfo = user.department_personnel?.[0]
                  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || '—'
                  const inactive = deptInfo?.active === false || user.signup_status === 'denied'
                  return (
                    <tr key={user.id} className={`hover:bg-zinc-50 ${inactive ? 'opacity-60' : ''}`}>
                      <td className="px-6 py-4 font-medium text-zinc-900 whitespace-nowrap">
                        {name}
                        {user.is_sys_admin && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            Sys Admin
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-zinc-500 whitespace-nowrap">{user.email}</td>
                      <td className="px-6 py-4 text-zinc-500 whitespace-nowrap">
                        {deptInfo?.department_name ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-zinc-500 capitalize whitespace-nowrap">
                        {deptInfo?.system_role ?? '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[user.signup_status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                          {STATUS_LABELS[user.signup_status] ?? user.signup_status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        {!user.is_sys_admin && (
                          <button
                            onClick={() => openManage(user)}
                            className="text-xs font-medium text-red-700 hover:text-red-900 hover:underline"
                          >
                            Manage
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {filteredUsers.map((user) => {
              const deptInfo = user.department_personnel?.[0]
              const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || '—'
              const inactive = deptInfo?.active === false || user.signup_status === 'denied'
              return (
                <div key={user.id} className={`rounded-xl bg-white shadow-sm border border-zinc-200 p-4 ${inactive ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-zinc-900 break-words">
                      {name}
                      {user.is_sys_admin && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 align-middle">
                          Sys Admin
                        </span>
                      )}
                    </p>
                    <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[user.signup_status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                      {STATUS_LABELS[user.signup_status] ?? user.signup_status}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 break-words mb-2">{user.email}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 mb-3">
                    <span>{deptInfo?.department_name ?? '—'}</span>
                    {deptInfo?.system_role && (
                      <span className="capitalize">· {deptInfo.system_role}</span>
                    )}
                  </div>
                  {!user.is_sys_admin && (
                    <div className="pt-3 border-t border-zinc-100">
                      <button
                        onClick={() => openManage(user)}
                        className="text-sm font-medium text-red-700 hover:text-red-900"
                      >
                        Manage
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Manage User Modal */}
      {managingUser && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-8 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6 my-auto">
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-zinc-900">
                  {[managingUser.first_name, managingUser.last_name].filter(Boolean).join(' ') || 'Unnamed User'}
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">{managingUser.email}</p>
                {dp?.department_name && (
                  <p className="text-xs text-zinc-400 mt-0.5">{dp.department_name} · {dp.system_role}</p>
                )}
              </div>
              <button onClick={closeManage} className="ml-4 text-zinc-400 hover:text-zinc-600 text-lg leading-none">✕</button>
            </div>

            {modalError && (
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{modalError}</div>
            )}
            {modalSuccess && (
              <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-200">{modalSuccess}</div>
            )}

            <div className="flex flex-col gap-5">

              {/* Change Email */}
              <section>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Email Address</h3>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                  <button
                    disabled={modalLoading || emailInput === managingUser.email}
                    onClick={() => withModal(() => sysAdminUpdateEmail(managingUser.id, emailInput))}
                    className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-900 disabled:opacity-40 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </section>

              {/* Change Role */}
              {dp && (
                <section>
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Department Role</h3>
                  <div className="flex gap-2">
                    <select
                      value={roleInput}
                      onChange={e => setRoleInput(e.target.value)}
                      className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                    >
                      <option value="admin">Admin</option>
                      <option value="officer">Officer</option>
                      <option value="member">Member</option>
                    </select>
                    <button
                      disabled={modalLoading || roleInput === dp.system_role}
                      onClick={() => withModal(() => sysAdminSetRole(managingUser.id, roleInput))}
                      className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-900 disabled:opacity-40 transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </section>
              )}

              {/* Move Department */}
              {dp && (
                <section>
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Department</h3>
                  <div className="flex gap-2">
                    <select
                      value={deptInput}
                      onChange={e => setDeptInput(e.target.value)}
                      className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                    >
                      <option value="">Select department...</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}{d.code ? ` (${d.code})` : ''}</option>
                      ))}
                    </select>
                    <button
                      disabled={modalLoading || deptInput === dp.department_id || !deptInput}
                      onClick={() => withModal(() => sysAdminMoveDepartment(managingUser.id, deptInput))}
                      className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-900 disabled:opacity-40 transition-colors"
                    >
                      Move
                    </button>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">Moves all dept_personnel records to the new department.</p>
                </section>
              )}

              {/* Force Password Reset */}
              <section>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Password</h3>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-500">Reset to <span className="font-mono font-semibold">Hello1!</span> — user must change on next login.</p>
                  <button
                    disabled={modalLoading}
                    onClick={() => withModal(() => sysAdminForcePasswordReset(managingUser.id))}
                    className="ml-3 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    Force Reset
                  </button>
                </div>
              </section>

              {/* Deactivate / Reactivate */}
              {dp && (
                <section className="border-t border-zinc-100 pt-5">
                  <h3 className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">Danger Zone</h3>
                  {isActive ? (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-zinc-500">Sets account to denied and removes dept access.</p>
                      <button
                        disabled={modalLoading}
                        onClick={() => withModal(() => sysAdminDeactivateUser(managingUser.id))}
                        className="ml-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40 transition-colors whitespace-nowrap"
                      >
                        Deactivate
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-zinc-500">Restores dept access and sets status to active.</p>
                      <button
                        disabled={modalLoading}
                        onClick={() => withModal(() => sysAdminReactivateUser(managingUser.id))}
                        className="ml-3 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40 transition-colors whitespace-nowrap"
                      >
                        Reactivate
                      </button>
                    </div>
                  )}
                </section>
              )}
            </div>

            <button
              onClick={closeManage}
              className="mt-6 w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
