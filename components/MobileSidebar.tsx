'use client'

import { useState } from 'react'
import { signOut } from '@/app/actions/auth'
import FeedbackButton from './FeedbackButton'
import HelpToggle from './HelpToggle'
import NavGroups from './NavGroups'
import PWAInstallButton from './PWAInstallButton'
import type { NavGroup } from './NavGroups'
import { getDeptTheme, type DeptTheme } from '@/lib/department-theme'

export default function MobileSidebar({
  navGroups,
  adminNavItems,
  adminLabel,
  userInfo,
  theme,
  brandName,
}: {
  navGroups: NavGroup[]
  adminNavItems: { href: string; label: string }[]
  adminLabel: string
  userInfo: { name: string; role: string; departmentName: string | null; canSwitchDepartment?: boolean }
  theme?: DeptTheme
  brandName?: string
}) {
  const [open, setOpen] = useState(false)
  const t = theme ?? getDeptTheme('fire')
  const brand = brandName ?? 'FireOps7'

  return (
    <>
      {/* Mobile Top Bar */}
      <div id="mobile-header" className={`md:hidden print:hidden fixed top-0 left-0 right-0 z-40 ${t.sidebarBg} text-white shadow`}>
        <div className="flex items-center px-4 py-3 relative">
          <button
            onClick={() => setOpen(true)}
            className={`p-2 rounded-lg ${t.navHoverBg} transition-colors shrink-0`}
            aria-label="Open menu"
          >
            <div className="flex flex-col gap-1.5">
              <span className="block w-6 h-0.5 bg-white" />
              <span className="block w-6 h-0.5 bg-white" />
              <span className="block w-6 h-0.5 bg-white" />
            </div>
          </button>
          <div className="absolute left-1/2 -translate-x-1/2 text-center pointer-events-none">
            <h1 className="text-lg font-bold leading-tight">{brand}</h1>
            {userInfo.departmentName && (
              <p className={`text-xs ${t.textMuted} leading-tight`}>{userInfo.departmentName}</p>
            )}
          </div>
          <div className="ml-auto shrink-0">
            <HelpToggle theme={t} variant="icon" />
          </div>
        </div>
      </div>

      {/* Overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div className={`md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 ${t.sidebarBg} text-white flex flex-col transform transition-transform duration-300 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className={`px-6 py-5 border-b ${t.border} flex items-center justify-between`}>
          <div>
            <h1 className="text-xl font-bold">{brand}</h1>
            {userInfo.departmentName && (
              <p className={`text-xs ${t.textMuted} mt-0.5 truncate`}>{userInfo.departmentName}</p>
            )}
            {userInfo.canSwitchDepartment && (
              <a href="/select-department" className={`text-xs ${t.switchLink} underline mt-0.5 inline-block hover:text-white`}>
                Switch Department
              </a>
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            className={`p-1 rounded ${t.navHoverBg} ${t.switchLink} hover:text-white text-xl leading-none`}
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <NavGroups groups={navGroups} onNavigate={() => setOpen(false)} theme={t} />
          {adminNavItems.length > 0 && (
            <div className="mt-4">
              <div className={`mb-1 px-3 text-xs font-semibold ${t.textMuted} uppercase tracking-wider`}>{adminLabel}</div>
              <NavGroups groups={[{ items: adminNavItems }]} onNavigate={() => setOpen(false)} theme={t} />
            </div>
          )}
        </nav>

        <div className={`px-4 py-4 border-t ${t.border} flex flex-col gap-2`}>
          <div className="mb-1">
            <p className="text-sm font-medium truncate">{userInfo.name}</p>
            <p className={`text-xs ${t.textMuted} capitalize`}>{userInfo.role}</p>
          </div>
          <HelpToggle theme={t} />
          <PWAInstallButton />
          <FeedbackButton />
          <form action={signOut}>
            <button type="submit"
              className={`w-full rounded-lg ${t.buttonBg} px-3 py-2 text-sm font-medium text-white ${t.buttonHoverBg} transition-colors text-left`}>
              Sign Out
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
