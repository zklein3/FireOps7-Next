'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

export type NavItem = { href: string; label: string }
export type NavGroup = { label?: string; items: NavItem[] }

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/')
}

export default function NavGroups({
  groups,
  onNavigate,
}: {
  groups: NavGroup[]
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const open = new Set<string>()
    for (const group of groups) {
      if (group.label && group.items.some(item => isActive(pathname, item.href))) {
        open.add(group.label)
      }
    }
    return open
  })

  function toggle(label: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-0.5">
      {groups.map(group => {
        if (!group.label) {
          return group.items.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive(pathname, item.href)
                  ? 'bg-red-900 text-white font-medium'
                  : 'text-red-100 hover:bg-red-700 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          ))
        }

        const open = openGroups.has(group.label)
        const hasActive = group.items.some(item => isActive(pathname, item.href))

        return (
          <div key={group.label}>
            <button
              onClick={() => toggle(group.label!)}
              className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                hasActive
                  ? 'text-white font-medium hover:bg-red-700'
                  : 'text-red-200 hover:bg-red-700 hover:text-white'
              }`}
            >
              <span>{group.label}</span>
              <span className={`text-xs opacity-70 transition-transform duration-200 ${open ? 'rotate-180' : ''} inline-block`}>
                ▾
              </span>
            </button>

            {open && (
              <div className="ml-2 mt-0.5 pl-2 border-l border-red-700 flex flex-col gap-0.5 mb-1">
                {group.items.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive(pathname, item.href)
                        ? 'bg-red-900 text-white font-medium'
                        : 'text-red-100 hover:bg-red-700 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
