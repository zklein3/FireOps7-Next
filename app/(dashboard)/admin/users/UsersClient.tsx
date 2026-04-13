'use client'

import { useState } from 'react'
import { createDeptAdmin } from '@/app/actions/users'

interface Department {
  id: string
  name: string
  code: string | null
}

interface User {
  id: string
  first_name: string
  last_name: string
  email: string
  signup_status: string
  is_sys_admin: boolean
  created_at: string
  department_personnel: {
    system_role: string
    department_id: string
    departments: { name: string } | null
  }[]
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  temp_password: 'bg-yellow-100 text-yellow-700',
  awaiting_approval: 'bg-blue-100 text-blue-700',
  denied: 'bg-red-100 text-red-700',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  temp_password: 'Temp Password',
  awaiting_approval: 'Pending',
  denied: 'Denied',
}

export default function UsersClient({ departments, users }: { departments: Department[], users: User[] }) {
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleCreate(formData: FormData) {
    setError(null)
    setSuccess(null)
    setLoading(true)
    const result = await createDeptAdmin(formData)
    if (result?.error) {
      setError(result.error)
    } else {
      setSuccess(`Department admin created successfully. They can log in with the temporary password.`)
      setShowForm(false)
    }
    setLoading(false)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Users</h1>
          <p className="text-sm text-zinc-500 mt-1">{users.length} user{users.length !== 1 ? 's' : ''} total</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(null); setSuccess(null) }}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Dept Admin'}
        </button>
      </div>

      {/* Success */}
      {success && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-200">
          {success}
        </div>
      )}

      {/* New Dept Admin Form */}
      {showForm && (
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm border border-zinc-200">
          <h2 className="text-base font-semibold text-zinc-900 mb-1">Add Department Admin</h2>
          <p className="text-xs text-zinc-500 mb-4">
            The user will be created with a temporary password of <span className="font-mono font-semibold">Hello1!</span> and will be required to change it on first login.
          </p>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}
          <form action={handleCreate} className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="email">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="admin@department.com"
              />
            </div>
            <div className="w-64">
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="department_id">
                Department <span className="text-red-500">*</span>
              </label>
              <select
                id="department_id"
                name="department_id"
                required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              >
                <option value="">Select department...</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}{dept.code ? ` (${dept.code})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
        {users.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-400">No users yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-zinc-600">Name</th>
                <th className="px-6 py-3 text-left font-semibold text-zinc-600">Email</th>
                <th className="px-6 py-3 text-left font-semibold text-zinc-600">Department</th>
                <th className="px-6 py-3 text-left font-semibold text-zinc-600">Role</th>
                <th className="px-6 py-3 text-left font-semibold text-zinc-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {users.map((user) => {
                const deptInfo = user.department_personnel?.[0]
                const name = user.first_name || user.last_name
                  ? `${user.first_name} ${user.last_name}`.trim()
                  : '—'
                return (
                  <tr key={user.id} className="hover:bg-zinc-50">
                    <td className="px-6 py-4 font-medium text-zinc-900">
                      {name}
                      {user.is_sys_admin && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          Sys Admin
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-zinc-500">{user.email}</td>
                    <td className="px-6 py-4 text-zinc-500">
                      {deptInfo?.departments?.name ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-zinc-500 capitalize">
                      {deptInfo?.system_role ?? '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[user.signup_status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                        {STATUS_LABELS[user.signup_status] ?? user.signup_status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
