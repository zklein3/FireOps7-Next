import Link from 'next/link'

export default function FireSchoolLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-100">
      {/* Header */}
      <header className="bg-orange-600 text-white shadow">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold leading-tight">Fire School</h1>
            <p className="text-orange-100 text-xs">SCBA Fill Station</p>
          </div>
          <nav className="flex gap-1">
            <Link href="/fire-school" className="rounded-lg px-3 py-1.5 text-sm font-medium text-orange-100 hover:bg-orange-700 hover:text-white transition-colors">
              Fill
            </Link>
            <Link href="/fire-school/bottles" className="rounded-lg px-3 py-1.5 text-sm font-medium text-orange-100 hover:bg-orange-700 hover:text-white transition-colors">
              Bottles
            </Link>
            <Link href="/fire-school/fill-log" className="rounded-lg px-3 py-1.5 text-sm font-medium text-orange-100 hover:bg-orange-700 hover:text-white transition-colors">
              Log
            </Link>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
