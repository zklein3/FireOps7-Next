'use client'

import { useState } from 'react'
import Link from 'next/link'
import { signOut } from '@/app/actions/auth'
import FeedbackButton from './FeedbackButton'

export default function MobileSidebar({
  navItems,
  adminNavItems,
  adminLabel,
  userInfo,
  isSysAdmin,
}: {
  navItems: { href: string; label: string }[]
  adminNavItems: { href: string; label: string }[]
  adminLabel: string
  userInfo: { name: string; role: string; departmentName: string | null }
  isSysAdmin: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Mobile Top Bar — fixed at top, z-40 */}
      <div id="mobile-header" className="md:hidden fixed top-0 left-0 right-0 z-40 bg-red-800 text-white shadow">
        <div className="flex items-center px-4 py-3 relative">
          <button
            onClick={() => setOpen(true)}
            className="p-2 rounded-lg hover:bg-red-700 transition-colors shrink-0"
            aria-label="Open menu"
          >
            <div className="flex flex-col gap-1.5">
              <span className="block w-6 h-0.5 bg-white" />
              <span className="block w-6 h-0.5 bg-white" />
              <span className="block w-6 h-0.5 bg-white" />
            </div>
          </button>
          <div className="absolute left-1/2 -translate-x-1/2 text-center pointer-events-none">
            <h1 className="text-lg font-bold leading-tight">FireOps7</h1>
            {userInfo.departmentName && (
              <p className="text-xs text-red-300 leading-tight">{userInfo.departmentName}</p>
            )}
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
      <div className={`md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-red-800 text-white flex flex-col transform transition-transform duration-300 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="px-6 py-5 border-b border-red-700 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">FireOps7</h1>
            {userInfo.departmentName && (
              <p className="text-xs text-red-300 mt-0.5 truncate">{userInfo.departmentName}</p>
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded hover:bg-red-700 text-red-200 hover:text-white text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1 text-sm overflow-y-auto">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex items-center rounded-lg px-3 py-3 text-red-100 hover:bg-red-700 hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          ))}

          {adminNavItems.length > 0 && (
            <>
              <div className="mt-4 mb-1 px-3 text-xs font-semibold text-red-300 uppercase tracking-wider">
                {adminLabel}
              </div>
              {adminNavItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center rounded-lg px-3 py-3 text-red-100 hover:bg-red-700 hover:text-white transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </>
          )}
        </nav>

        <div className="px-4 py-4 border-t border-red-700 flex flex-col gap-2">
          <div className="mb-1">
            <p className="text-sm font-medium truncate">{userInfo.name}</p>
            <p className="text-xs text-red-300 capitalize">{userInfo.role}</p>
          </div>
          <FeedbackButton />
          <form action={signOut}>
            <button type="submit"
              className="w-full rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors text-left">
              Sign Out
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
