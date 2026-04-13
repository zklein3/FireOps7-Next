export default function FireSchoolLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-zinc-100">
      <div className="flex flex-col w-full">
        {/* Header */}
        <header className="bg-orange-600 text-white px-6 py-4 flex items-center justify-between shadow">
          <div>
            <h1 className="text-xl font-bold">Fire School — SCBA Fill Station</h1>
            <p className="text-orange-100 text-sm">Bottle tracking &amp; fill log</p>
          </div>
          <nav className="flex gap-4 text-sm font-medium">
            <a href="/fire-school" className="hover:underline">Fill Station</a>
            <a href="/fire-school/bottles" className="hover:underline">Bottles</a>
            <a href="/fire-school/fill-log" className="hover:underline">Fill Log</a>
          </nav>
        </header>
        {/* Content */}
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  )
}
