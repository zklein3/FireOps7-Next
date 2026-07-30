'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'

function getParentHub(pathname: string): { label: string; href: string } | null {
  if (pathname === '/dashboard') return null

  // Hub pages → parent is Dashboard
  const topHubs = ['/operations', '/personnel', '/training', '/equipment', '/reports', '/dept-admin', '/ics']
  if (topHubs.includes(pathname)) return { label: 'Dashboard', href: '/dashboard' }

  // ISO hub → parent is Dept Admin
  if (pathname === '/iso') return { label: 'Dept Admin', href: '/dept-admin' }

  // Operations sub-pages
  if (
    pathname.startsWith('/incidents') ||
    pathname.startsWith('/announcements') ||
    pathname.startsWith('/accountability') ||
    pathname === '/inbox'
  ) return { label: 'Operations', href: '/operations' }

  // ICS sub-pages
  if (pathname.startsWith('/ics/'))
    return { label: 'ICS', href: '/ics' }

  // Training sub-pages
  if (pathname.startsWith('/events') || pathname.startsWith('/training'))
    return { label: 'Training', href: '/training' }

  // Inventory sub-pages
  if (pathname.startsWith('/equipment') || pathname.startsWith('/inspections') || pathname.startsWith('/fuel'))
    return { label: 'Inventory', href: '/equipment' }

  // Personnel sub-pages
  if (pathname.startsWith('/personnel'))
    return { label: 'Personnel', href: '/personnel' }

  // Reports sub-pages
  if (pathname.startsWith('/reports'))
    return { label: 'Reports', href: '/reports' }

  // Medical sub-pages
  if (pathname.startsWith('/medical'))
    return { label: 'Inventory', href: '/equipment' }

  // Dept Admin sub-pages
  if (pathname.startsWith('/dept-admin'))
    return { label: 'Dept Admin', href: '/dept-admin' }

  // ISO sub-pages
  if (pathname.startsWith('/iso'))
    return { label: 'ISO', href: '/iso' }

  return null
}

export default function PageNavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const hub = getParentHub(pathname)

  if (!hub) return null

  return (
    <div className="flex items-center gap-2 mb-5 print:hidden">
      <button
        onClick={() => router.back()}
        className="text-xs font-medium text-zinc-500 hover:text-zinc-800 transition-colors px-3 py-1.5 rounded-lg bg-white border border-zinc-200 hover:border-zinc-300 active:bg-zinc-50"
      >
        ← Back
      </button>
      <Link
        href={hub.href}
        className="text-xs font-medium text-zinc-500 hover:text-zinc-800 transition-colors px-3 py-1.5 rounded-lg bg-white border border-zinc-200 hover:border-zinc-300 active:bg-zinc-50"
      >
        {hub.label} ↑
      </Link>
    </div>
  )
}
