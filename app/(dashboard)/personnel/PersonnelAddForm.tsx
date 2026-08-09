'use client'

import { useState } from 'react'
import { createDeptMember } from '@/app/actions/users'

interface Role { id: string; name: string; is_officer: boolean }
interface PermissionGroup { id: string; name: string }

export default function PersonnelAddForm({ roles, permissionGroups }: { roles: Role[]; permissionGroups: PermissionGroup[] }) {
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setError(null); setSuccess(null); setLoading(true)
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Personnel</h1>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(null); setSuccess(null) }}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Personnel'}
        </button>
      </div>

      {success && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-200">
          {success}
        </div>
      )}

      {showForm && (
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm border border-zinc-200">
          <p className="text-sm font-semibold text-zinc-900 mb-1">Add Personnel</p>
          <p className="text-xs text-zinc-500 mb-4">
            A temporary password is generated and must be changed on first login.
          </p>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>
          )}
          <form action={handleSubmit} className="flex flex-col gap-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">First Name</label>
                <input name="first_name" type="text" placeholder="Optional"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Last Name</label>
                <input name="last_name" type="text" placeholder="Optional"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input name="email" type="email" required placeholder="member@department.com"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
            </div>
            <div className="flex gap-4">
              <div className="w-44">
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  Access Level <span className="text-red-500">*</span>
                </label>
                <select name="system_role" required defaultValue="member"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                  <option value="officer">Officer</option>
                  <option value="member">Member</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Title / Rank</label>
                <select name="role_id"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                  <option value="">Select title...</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Permission Group</label>
              <select name="permission_group_id" defaultValue=""
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="">— Legacy (based on Access Level) —</option>
                {permissionGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="flex gap-4">
              <div className="w-44">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Employee #</label>
                <input name="employee_number" type="text" placeholder="Optional"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Hire Date</label>
                <input name="hire_date" type="date"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm text-zinc-700">
              <input type="checkbox" name="send_welcome_email" value="true" defaultChecked className="mt-0.5" />
              <span>
                Send welcome email with a random temporary password
                <span className="block text-xs text-zinc-500">Uncheck for test/demo accounts — uses the default password Hello1! and sends no email.</span>
              </span>
            </label>
            <button type="submit" disabled={loading}
              className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
              {loading ? 'Adding...' : 'Add Personnel'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
