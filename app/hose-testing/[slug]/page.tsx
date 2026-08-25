import type { Viewport } from 'next'
import { getPublicHoseTestingContext, listPublicHoses, getHoseTestingLiveState } from '@/app/actions/hose-testing'
import HoseTestingClient from './HoseTestingClient'
import PublicFeedbackButton from '@/components/PublicFeedbackButton'

export const dynamic = 'force-dynamic'

// Testers often add this page to their home screen (see PWA setup in
// app/layout.tsx's appleWebApp.statusBarStyle: "black-translucent"), which
// renders standalone content full-bleed under the iOS status bar/notch.
// viewport-fit=cover + the safe-area padding below keeps the header clear of
// the notch/rounded corner on notched iPhones instead of clipping under it.
export const viewport: Viewport = {
  viewportFit: 'cover',
}

export default async function HoseTestingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { enabled, departmentName, departmentId } = await getPublicHoseTestingContext(slug)

  if (!enabled || !departmentId) {
    return (
      <div className="min-h-screen bg-zinc-100 flex items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-bold text-zinc-900 mb-2">Hose Testing</h1>
          <p className="text-sm text-zinc-500">This tool isn't currently active for this department. Contact your department admin.</p>
        </div>
      </div>
    )
  }

  const [hoses, { locks, recentlyTestedHoseIds }] = await Promise.all([
    listPublicHoses(slug),
    getHoseTestingLiveState(slug),
  ])

  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="bg-red-800 text-white shadow">
        <div
          className="max-w-2xl mx-auto"
          style={{
            paddingTop: 'max(1rem, env(safe-area-inset-top))',
            paddingBottom: '1rem',
            paddingLeft: 'max(1rem, env(safe-area-inset-left))',
            paddingRight: 'max(1rem, env(safe-area-inset-right))',
          }}
        >
          <h1 className="text-lg font-bold leading-tight">Hose Testing</h1>
          <p className="text-red-200 text-xs">NFPA 1962 · {departmentName ?? 'Department'}</p>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">
        <HoseTestingClient
          slug={slug}
          departmentId={departmentId}
          initialHoses={hoses}
          initialLocks={locks}
          initialRecentlyTestedIds={recentlyTestedHoseIds}
        />
      </main>
      <PublicFeedbackButton slug={slug} />
    </div>
  )
}
