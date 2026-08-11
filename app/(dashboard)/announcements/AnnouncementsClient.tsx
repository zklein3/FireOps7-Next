'use client'

import { useState, useTransition } from 'react'
import { createAnnouncement, deleteAnnouncement, pinAnnouncement, markAnnouncementRead } from '@/app/actions/announcements'
import { formatLocalDateTime } from '@/lib/format-datetime'
import HelpText from '@/components/HelpText'

type Announcement = {
  id: string
  title: string
  body: string
  pinned: boolean
  created_at: string
  author_name: string
  read: boolean
}

export default function AnnouncementsClient({
  announcements,
  isOfficerOrAbove,
  isAdmin,
  departmentTimezone,
}: {
  announcements: Announcement[]
  isOfficerOrAbove: boolean
  isAdmin: boolean
  departmentTimezone: string
}) {
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const pinned = announcements.filter(a => a.pinned)
  const unpinned = announcements.filter(a => !a.pinned)
  const ordered = [...pinned, ...unpinned]

  function handleCreate(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createAnnouncement(formData)
      if (result?.error) { setError(result.error); return }
      setShowForm(false)
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteAnnouncement(id)
    })
  }

  function handlePin(id: string, pinned: boolean) {
    startTransition(async () => {
      await pinAnnouncement(id, pinned)
    })
  }

  function handleMarkRead(id: string) {
    startTransition(async () => {
      await markAnnouncementRead(id)
    })
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Announcements</h1>
          <p className="text-sm text-zinc-500 mt-1">Department-wide notices from leadership</p>
        </div>
        {isOfficerOrAbove && (
          <button
            onClick={() => setShowForm(v => !v)}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-colors"
          >
            {showForm ? 'Cancel' : '+ New Announcement'}
          </button>
        )}
      </div>

      <HelpText className="mb-4">
        Pinned announcements always stay at the top. Everyone in the department sees these — there's no way to
        target a specific group or role.
      </HelpText>

      {showForm && (
        <div className="mb-6 rounded-xl bg-white shadow-sm border border-zinc-200 p-5">
          <h2 className="text-sm font-semibold text-zinc-900 mb-4">New Announcement</h2>
          <form action={handleCreate} className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Title</label>
              <input
                name="title"
                required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="e.g. Station meeting rescheduled"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Message</label>
              <textarea
                name="body"
                required
                rows={4}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                placeholder="Write your announcement here..."
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {isPending ? 'Posting...' : 'Post Announcement'}
              </button>
            </div>
          </form>
        </div>
      )}

      {ordered.length === 0 && (
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 px-5 py-8 text-center">
          <p className="text-sm text-zinc-400">No announcements yet.</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {ordered.map(a => (
          <div
            key={a.id}
            className={`rounded-xl bg-white shadow-sm border px-5 py-4 ${
              a.pinned ? 'border-red-200 bg-red-50' : a.read ? 'border-zinc-200' : 'border-blue-200'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {a.pinned && (
                    <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">Pinned</span>
                  )}
                  {!a.read && (
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">New</span>
                  )}
                  <h3 className="text-sm font-semibold text-zinc-900">{a.title}</h3>
                </div>
                <p className="text-sm text-zinc-700 whitespace-pre-wrap">{a.body}</p>
                <p className="text-xs text-zinc-400 mt-2">
                  {a.author_name} &middot; {formatLocalDateTime(a.created_at, departmentTimezone)}
                </p>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                {!a.read && (
                  <button
                    onClick={() => handleMarkRead(a.id)}
                    disabled={isPending}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50"
                  >
                    Mark as Read
                  </button>
                )}
                {isAdmin && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePin(a.id, !a.pinned)}
                      disabled={isPending}
                      className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors disabled:opacity-50"
                    >
                      {a.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      onClick={() => handleDelete(a.id)}
                      disabled={isPending}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
