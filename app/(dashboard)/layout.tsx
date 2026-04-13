export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-zinc-100">
      {/* Sidebar placeholder */}
      <aside className="w-64 bg-red-800 text-white flex flex-col p-4">
        <h2 className="text-xl font-bold mb-8">FireOps7</h2>
        <nav className="flex flex-col gap-2 text-sm">
          <a href="/dashboard" className="hover:bg-red-700 rounded px-3 py-2">Dashboard</a>
          <a href="/personnel" className="hover:bg-red-700 rounded px-3 py-2">Personnel</a>
          <a href="/apparatus" className="hover:bg-red-700 rounded px-3 py-2">Apparatus</a>
          <a href="/stations" className="hover:bg-red-700 rounded px-3 py-2">Stations</a>
          <a href="/equipment" className="hover:bg-red-700 rounded px-3 py-2">Equipment</a>
          <a href="/scba" className="hover:bg-red-700 rounded px-3 py-2">SCBA</a>
        </nav>
      </aside>
      {/* Main content */}
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
