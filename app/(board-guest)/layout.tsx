export const dynamic = 'force-dynamic'

export default function BoardGuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="sticky top-0 z-20 bg-zinc-800 text-white shadow">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <h1 className="text-base font-bold leading-tight">FireOps7</h1>
          <p className="text-zinc-300 text-xs">Guest Access — Accountability Board</p>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
