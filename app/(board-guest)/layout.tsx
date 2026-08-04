import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function BoardGuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="sticky top-0 z-20 bg-zinc-800 text-white shadow">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold leading-tight">FireOps7</h1>
            <p className="text-zinc-300 text-xs">Guest Access — Accountability Board</p>
          </div>
          <Link
            href="/board-guest/scan"
            className="shrink-0 rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            ← Scan a card
          </Link>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
