import { createAdminClient } from '@/lib/supabase/admin'
import { formatTimeRange } from '@/lib/event-times'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const adminClient = createAdminClient()

  const { data: deptList } = await adminClient
    .from('departments')
    .select('name, public_site_enabled, public_tagline, public_about')
    .eq('public_slug', slug)
    .limit(1)

  const dept = deptList?.[0]
  if (!dept || !dept.public_site_enabled) return {}

  const title = `${dept.name} | FireOps7`
  const description = (dept.public_tagline || dept.public_about || 'Department information, burn permits, records requests, and upcoming events.').slice(0, 160)

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://www.fireops7.com/dept/${slug}`,
      siteName: 'FireOps7',
      images: [{ url: '/og-image.png', width: 1200, height: 630 }],
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og-image.png'],
    },
  }
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function formatTime(t: string | null) {
  if (!t) return null
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

export default async function DeptLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const adminClient = createAdminClient()

  const { data: deptList } = await adminClient
    .from('departments')
    .select('id, name, public_site_enabled, public_phone, public_email, public_address, public_tagline, public_about, neris_entity_id')
    .eq('public_slug', slug)
    .limit(1)

  const dept = deptList?.[0]
  if (!dept || !dept.public_site_enabled) notFound()

  const base = `/dept/${slug}`
  const today = new Date().toISOString().split('T')[0]

  // Fetch upcoming public event series
  const { data: seriesRaw } = await adminClient
    .from('event_series')
    .select('id, title, event_type, start_time, duration_minutes, location')
    .eq('department_id', dept.id)
    .eq('is_public', true)
    .eq('active', true)

  const seriesIds = (seriesRaw ?? []).map(s => s.id)
  const seriesMap = Object.fromEntries((seriesRaw ?? []).map(s => [s.id, s]))

  const { data: instancesRaw } = seriesIds.length > 0
    ? await adminClient
        .from('event_instances')
        .select('id, series_id, event_date, status, notes')
        .in('series_id', seriesIds)
        .gte('event_date', today)
        .neq('status', 'cancelled')
        .order('event_date', { ascending: true })
        .limit(5)
    : { data: [] as { id: string; series_id: string; event_date: string; status: string; notes: string | null }[] }

  const upcomingEvents = (instancesRaw ?? []).map(inst => {
    const series = seriesMap[inst.series_id]
    return {
      id: inst.id,
      title: series?.title ?? '—',
      event_type: series?.event_type ?? null,
      start_time: series?.start_time ?? null,
      duration_minutes: series?.duration_minutes ?? null,
      location: series?.location ?? null,
      event_date: inst.event_date,
    }
  })

  const hasContact = dept.public_phone || dept.public_email || dept.public_address

  return (
    <div>
      {/* Hero */}
      <div className="rounded-2xl bg-red-800 text-white px-8 py-12 mb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">{dept.name}</h1>
        {dept.public_tagline && (
          <p className="text-red-200 text-lg mt-2">{dept.public_tagline}</p>
        )}
      </div>

      {/* Contact info */}
      {hasContact && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {dept.public_address && (
            <div className="rounded-xl bg-white border border-zinc-200 p-5">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">Address</p>
              <p className="text-sm text-zinc-700 whitespace-pre-line">{dept.public_address}</p>
            </div>
          )}
          {dept.public_phone && (
            <div className="rounded-xl bg-white border border-zinc-200 p-5">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">Phone</p>
              <a href={`tel:${dept.public_phone}`} className="text-sm text-red-700 hover:underline font-medium">
                {dept.public_phone}
              </a>
            </div>
          )}
          {dept.public_email && (
            <div className="rounded-xl bg-white border border-zinc-200 p-5">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">Email</p>
              <a href={`mailto:${dept.public_email}`} className="text-sm text-red-700 hover:underline font-medium break-all">
                {dept.public_email}
              </a>
            </div>
          )}
        </div>
      )}

      {/* About */}
      {dept.public_about && (
        <div className="rounded-xl bg-white border border-zinc-200 p-6 mb-8">
          <h2 className="text-base font-semibold text-zinc-900 mb-3">About Us</h2>
          <p className="text-sm text-zinc-600 leading-relaxed whitespace-pre-line">{dept.public_about}</p>
        </div>
      )}

      {/* Quick actions */}
      <h2 className="text-base font-semibold text-zinc-700 mb-3">How Can We Help?</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Link
          href={`${base}/burn-permit`}
          className="rounded-xl bg-white border border-zinc-200 p-6 hover:border-red-300 hover:shadow-md transition-all group"
        >
          <div className="text-2xl mb-2">🔥</div>
          <h3 className="font-semibold text-zinc-900 group-hover:text-red-700 transition-colors mb-1">Burn Permit</h3>
          <p className="text-xs text-zinc-400">Submit a request to conduct a controlled burn.</p>
        </Link>

        <Link
          href={`${base}/records`}
          className="rounded-xl bg-white border border-zinc-200 p-6 hover:border-red-300 hover:shadow-md transition-all group"
        >
          <div className="text-2xl mb-2">📄</div>
          <h3 className="font-semibold text-zinc-900 group-hover:text-red-700 transition-colors mb-1">Records Request</h3>
          <p className="text-xs text-zinc-400">Request incident reports or inspection records.</p>
        </Link>

        <Link
          href={`${base}/feedback`}
          className="rounded-xl bg-white border border-zinc-200 p-6 hover:border-red-300 hover:shadow-md transition-all group"
        >
          <div className="text-2xl mb-2">💬</div>
          <h3 className="font-semibold text-zinc-900 group-hover:text-red-700 transition-colors mb-1">Feedback &amp; Issues</h3>
          <p className="text-xs text-zinc-400">Share feedback or report a problem with this site.</p>
        </Link>
      </div>

      {/* Upcoming events */}
      {upcomingEvents.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-zinc-700">Upcoming Events</h2>
            <Link href={`${base}/events`} className="text-xs text-red-700 hover:underline font-medium">
              View all →
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {upcomingEvents.map(ev => (
              <div key={ev.id} className="rounded-xl bg-white border border-zinc-200 px-5 py-4 flex items-center gap-4">
                {/* Date block */}
                <div className="shrink-0 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-center min-w-[52px]">
                  <p className="text-xs font-semibold text-red-500 uppercase">
                    {new Date(ev.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                  </p>
                  <p className="text-2xl font-bold text-red-800 leading-none">
                    {new Date(ev.event_date + 'T00:00:00').getDate()}
                  </p>
                </div>
                {/* Details */}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 truncate">{ev.title}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-zinc-400">
                    <span>{formatDate(ev.event_date)}</span>
                    {ev.start_time && <span>{formatTimeRange(ev.start_time, ev.duration_minutes)}</span>}
                    {ev.location && <span>📍 {ev.location}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NERIS badge */}
      {dept.neris_entity_id && (
        <div className="mt-8 rounded-xl bg-zinc-950 border border-zinc-800 px-5 py-4 flex items-center gap-4">
          <Image
            src="/NERIS_Data_Exchange_Compatible__SealV1.png"
            alt="NERIS V1 Data Exchange Compatible"
            width={44}
            height={44}
            className="shrink-0 rounded-full"
          />
          <div>
            <p className="text-xs font-semibold text-white">NERIS V1 Data Exchange Compatible</p>
            <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
              This department submits incident data to the National Emergency Response Information System through FireOps7.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
