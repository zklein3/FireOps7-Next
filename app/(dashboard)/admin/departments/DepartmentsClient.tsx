'use client'

import { useState } from 'react'
import { createDepartment, toggleDepartment } from '@/app/actions/departments'

interface Department {
  id: string
  name: string
  code: string | null
  active: boolean
  created_at: string
}

export default function DepartmentsClient({ departments }: { departments: Department[] }) {
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleCreate(formData: FormData) {
    setError(null)
    setLoading(true)
    const result = await createDepartment(formData)
    if (result?.error) {
      setError(result.error)
    } else {
      setShowForm(false)
    }
    setLoading(false)
  }

  async function handleToggle(id: string, active: boolean) {
    await toggleDepartment(id, !active)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Departments</h1>
          <p className="text-sm text-zinc-500 mt-1">{departments.length} department{departments.length !== 1 ? 's' : ''} total</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
        >
          {showForm ? 'Cancel' : '+ New Department'}
        </button>
      </div>

      {/* New Department Form */}
      {showForm && (
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm border border-zinc-200">
          <h2 className="text-base font-semibold text-zinc-900 mb-4">New Department</h2>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}
          <form action={handleCreate} className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="name">
                Department Name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="Winslow Fire Department"
              />
            </div>
            <div className="w-32">
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="code">
                Code
              </label>
              <input
                id="code"
                name="code"
                type="text"
                maxLength={10}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="WFD"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Saving...' : 'Create'}
            </button>
          </form>
        </div>
      )}

      {/* Departments Table */}
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
        {departments.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-400">
            No departments yet. Create one above.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-zinc-600">Name</th>
                <th className="px-6 py-3 text-left font-semibold text-zinc-600">Code</th>
                <th className="px-6 py-3 text-left font-semibold text-zinc-600">Status</th>
                <th className="px-6 py-3 text-left font-semibold text-zinc-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {departments.map((dept) => (
                <tr key={dept.id} className="hover:bg-zinc-50">
                  <td className="px-6 py-4 font-medium text-zinc-900">{dept.name}</td>
                  <td className="px-6 py-4 text-zinc-500">{dept.code ?? '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      dept.active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-zinc-100 text-zinc-500'
                    }`}>
                      {dept.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggle(dept.id, dept.active)}
                      className="text-xs text-red-600 hover:text-red-800 font-medium"
                    >
                      {dept.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
