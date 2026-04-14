import { createAdminClient } from '@/lib/supabase/admin'

export default async function FireSchoolFillLogPage() {
  const adminClient = createAdminClient()

  const { data: logs } = await adminClient
    .from('fire_school_fill_logs')
    .select('*')
    .order('filled_at', { ascending: false })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Fill Log</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{logs?.length ?? 0} total fill{(logs?.length ?? 0) !== 1 ? 's' : ''} recorded</p>
      </div>

      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-x-auto">
        {!logs || logs.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-400">No fills logged yet.</div>
        ) : (
          <table className="w-full text-sm min-w-[480px]">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-zinc-600">Bottle ID</th>
                <th className="px-4 py-3 text-left font-semibold text-zinc-600">Date & Time</th>
                <th className="px-4 py-3 text-left font-semibold text-zinc-600">Result</th>
                <th className="px-4 py-3 text-left font-semibold text-zinc-600">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-mono font-bold text-zinc-900">{log.bottle_id}</td>
                  <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                    {new Date(log.filled_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-700">
                      {log.fill_result}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{log.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
