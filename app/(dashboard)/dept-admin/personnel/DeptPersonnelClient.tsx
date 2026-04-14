'use client'

import { useState } from 'react'
import { createDeptMember } from '@/app/actions/users'

interface Role {
  id: string
  name: string
  is_officer: boolean
  sort_order: number
}

interface PersonnelRecord {
  id: string
  system_role: string
  signup_status: string
  active: boolean
  employee_number: string | null
  hire_date: string | null
  role_id: string | null
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
  departmentName,
  departmentId,
}: {
  personnel: PersonnelRecord[]
  roles: Role[]
  departmentName: string
  departmentId: string
}) {
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleCreate(formData: FormData) {
    setError(null)
    setSuccess(null)
    setLoading(true)
    const result = await createDeptMember(formData)
    if (result?.error) {
      setError(result.error)
    } else {
      setSuccess('Personnel added successfully. They can log in with the temporary password Hello1!')
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
            User will be created with temporary password{' '}
            <span className="font-mono font-semibold">Hello1!</span> and must change it on first login.
          </p>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}
          <form action={handleCreate} className="flex flex-col gap-4">

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

      {/* Personnel Table */}
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
        {sorted.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-400">
            No personnel yet. Add someone above.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-zinc-600">Name</th>
                <th className="px-6 py-3 text-left font-semibold text-zinc-600">Email</th>
                <th className="px-6 py-3 text-left font-semibold text-zinc-600">Title</th>
                <th className="px-6 py-3 text-left font-semibold text-zinc-600">Access Level</th>
                <th className="px-6 py-3 text-left font-semibold text-zinc-600">Emp #</th>
                <th className="px-6 py-3 text-left font-semibold text-zinc-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {sorted.map((record) => {
                const p = record.personnel
                const name = p?.first_name || p?.last_name
                  ? `${p.first_name} ${p.last_name}`.trim()
                  : '—'
                const status = p?.signup_status ?? record.signup_status
                return (
                  <tr key={record.id} className="hover:bg-zinc-50">
                    <td className="px-6 py-4 font-medium text-zinc-900">{name}</td>
                    <td className="px-6 py-4 text-zinc-500">{p?.email ?? '—'}</td>
                    <td className="px-6 py-4 text-zinc-500">
                      {record.personnel_roles?.name ?? '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        record.system_role === 'admin' ? 'bg-red-100 text-red-700' :
                        record.system_role === 'officer' ? 'bg-blue-100 text-blue-700' :
                        'bg-zinc-100 text-zinc-600'
                      }`}>
                        {record.system_role.charAt(0).toUpperCase() + record.system_role.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-zinc-500">
                      {record.employee_number ?? '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                        {STATUS_LABELS[status] ?? status}
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
