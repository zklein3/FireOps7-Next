import { createAdminClient } from '@/lib/supabase/admin'
import { formatTimeRange } from '@/lib/event-times'
import { notFound } from 'next/navigation'
import Link from 'next/link'

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}


export default async function DeptEventsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const adminClient = createAdminClient()

  const { data: deptList } = await adminClient
    .from('departments')
    .select('id, name, public_site_enabled')
    .eq('public_slug', slug)
    .limit(1)

  const dept = deptList?.[0]
  if (!dept || !dept.public_site_enabled) notFound()

  const today = new Date().toISOString().split('T')[0]

  // Fetch public event series for this department
  const { data: seriesRaw } = await adminClient
    .from('event_series')
    .select('id, title, description, location, event_type, start_time, duration_minutes')
    .eq('department_id', dept.id)
    .eq('is_public', true)
    .eq('active', true)

  const seriesIds = (seriesRaw ?? []).map(s => s.id)
  const seriesMap = Object.fromEntries((seriesRaw ?? []).map(s => [s.id, s]))

  // Fetch upcoming instances for those series
  const { data: instancesRaw } = seriesIds.length > 0
    ? await adminClient
        .from('event_instances')
        .select('id, series_id, event_date, status, notes')
        .in('series_id', seriesIds)
        .gte('event_date', today)
        .neq('status', 'cancelled')
        .order('event_date', { ascending: true })
        .limit(50)
    : { data: [] as { id: string; series_id: string; event_date: string; status: string; notes: string | null }[] }

  const events = (instancesRaw ?? []).map(inst => {
    const series = seriesMap[inst.series_id]
    return {
      id: inst.id,
      title: series?.title ?? '—',
      description: series?.description ?? null,
      location: series?.location ?? null,
      event_type: series?.event_type ?? null,
      start_time: series?.start_time ?? null,
      duration_minutes: series?.duration_minutes ?? null,
      instance_date: inst.event_date,
      notes: inst.notes ?? null,
    }
  })

  return (
    <div>
      <div className="mb-6">
        <Link href={`/dept/${slug}`} className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors">
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900 mt-2">Upcoming Events</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{dept.name}</p>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-16 text-center">
          <div className="text-4xl mb-3">📅</div>
          <p className="text-sm font-medium text-zinc-600">No upcoming public events at this time.</p>
          <p className="text-xs text-zinc-400 mt-1">Check back soon.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {events.map(ev => (
            <div key={ev.id} className="rounded-xl bg-white border border-zinc-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="text-base font-semibold text-zinc-900">{ev.title}</h2>
                    {ev.event_type && (
                      <span className="rounded-full bg-red-50 border border-red-100 px-2 py-0.5 text-xs font-medium text-red-700 capitalize">
                        {ev.event_type.replace('_', ' ')}
                      </span>
                    )}
                  </div>

                  <p className="text-sm font-medium text-zinc-700">{formatDate(ev.instance_date)}</p>

                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-zinc-400">
                    {ev.start_time && (
                      <span>🕐 {formatTimeRange(ev.start_time, ev.duration_minutes)}</span>
                    )}
                    {ev.location && (
                      <span>📍 {ev.location}</span>
                    )}
                  </div>

                  {(ev.description || ev.notes) && (
                    <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
                      {ev.notes ?? ev.description}
                    </p>
                  )}
                </div>

                {/* Date block */}
                <div className="shrink-0 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-center min-w-[52px]">
                  <p className="text-xs font-semibold text-red-500 uppercase">
                    {new Date(ev.instance_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                  </p>
                  <p className="text-2xl font-bold text-red-800 leading-none">
                    {new Date(ev.instance_date + 'T00:00:00').getDate()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
