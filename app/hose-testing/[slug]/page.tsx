import { getPublicHoseTestingContext, listPublicHoses } from '@/app/actions/hose-testing'
import HoseTestingClient from './HoseTestingClient'

export const dynamic = 'force-dynamic'

export default async function HoseTestingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { enabled, departmentName } = await getPublicHoseTestingContext(slug)

  if (!enabled) {
    return (
      <div className="min-h-screen bg-zinc-100 flex items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-bold text-zinc-900 mb-2">Hose Testing</h1>
          <p className="text-sm text-zinc-500">This tool isn't currently active for this department. Contact your department admin.</p>
        </div>
      </div>
    )
  }

  const hoses = await listPublicHoses(slug)

  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="bg-red-800 text-white shadow">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h1 className="text-lg font-bold leading-tight">Hose Testing</h1>
          <p className="text-red-200 text-xs">NFPA 1962 · {departmentName ?? 'Department'}</p>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">
        <HoseTestingClient slug={slug} initialHoses={hoses} />
      </main>
    </div>
  )
}
