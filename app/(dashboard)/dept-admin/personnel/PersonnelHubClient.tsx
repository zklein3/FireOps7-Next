'use client'

import { useState } from 'react'
import DeptPersonnelClient from './DeptPersonnelClient'
import AttendanceSettingsClient from '../attendance/AttendanceSettingsClient'

const TABS = [
  { id: 'members',    label: 'Members'    },
  { id: 'attendance', label: 'Attendance' },
]

interface Role { id: string; name: string; is_officer: boolean; sort_order: number }
interface Shift { id: string; name: string; sort_order: number; active: boolean }
interface PersonnelRecord {
  id: string; system_role: string; signup_status: string; active: boolean
  employee_number: string | null; hire_date: string | null; role_id: string | null; shift_id: string | null
  personnel: { id: string; first_name: string; last_name: string; email: string; signup_status: string } | null
  personnel_roles: { name: string; is_officer: boolean } | null
  shift_name: string | null
}
interface ExcuseType { id: string; excuse_name: string; active: boolean }
interface Requirement { id: string; event_type: string; minimum_percentage: number; period: string; active: boolean }

export default function PersonnelHubClient({
  personnel, roles, shifts, departmentName, departmentId,
  excuseTypes, requirements,
}: {
  personnel: PersonnelRecord[]
  roles: Role[]
  shifts: Shift[]
  departmentName: string
  departmentId: string
  excuseTypes: ExcuseType[]
  requirements: Record<string, Requirement>
}) {
  const [activeTab, setActiveTab] = useState('members')

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Personnel</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{departmentName}</p>
      </div>

      {/* Mobile tabs */}
      <div className="md:hidden flex gap-2 overflow-x-auto pb-2 mb-4">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-red-700 text-white'
                : 'bg-white border border-zinc-200 text-zinc-600 hover:border-red-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex gap-6 items-start">
        {/* Left tab rail — desktop */}
        <div className="hidden md:flex flex-col w-44 shrink-0 gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-red-700 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-w-0">
          {activeTab === 'members' && (
            <DeptPersonnelClient
              personnel={personnel}
              roles={roles}
              shifts={shifts}
              departmentName={departmentName}
              departmentId={departmentId}
            />
          )}
          {activeTab === 'attendance' && (
            <AttendanceSettingsClient
              excuseTypes={excuseTypes}
              requirements={requirements}
              departmentId={departmentId}
            />
          )}
        </div>
      </div>
    </div>
  )
}
