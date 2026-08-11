'use client'

import { useMemo, useState } from 'react'
import { HELP_CATEGORIES, HELP_TOPICS, type HelpTopic } from '@/lib/help-content'

const ROLE_RANK: Record<string, number> = { member: 0, officer: 1, admin: 2 }

export default function HelpCenterClient({ roleRank }: { roleRank: number }) {
  const [query, setQuery] = useState('')

  const visibleTopics = useMemo(
    () => HELP_TOPICS.filter(t => roleRank >= (ROLE_RANK[t.minRole] ?? 0)),
    [roleRank]
  )

  const filteredTopics = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return visibleTopics
    return visibleTopics.filter(t =>
      t.question.toLowerCase().includes(q) ||
      t.answer.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
    )
  }, [visibleTopics, query])

  const byCategory = useMemo(() => {
    const map = new Map<string, HelpTopic[]>()
    for (const cat of HELP_CATEGORIES) map.set(cat, [])
    for (const topic of filteredTopics) map.get(topic.category)?.push(topic)
    return map
  }, [filteredTopics])

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Help Center</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Search for what you're trying to do — each topic links straight to the right page.</p>
      </div>

      <div className="mb-6">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search help topics… e.g. &quot;attendance&quot; or &quot;vehicle check&quot;"
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        />
      </div>

      {filteredTopics.length === 0 ? (
        <div className="rounded-xl bg-white border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-400">
          No help topics match "{query}".
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {HELP_CATEGORIES.map(category => {
            const topics = byCategory.get(category) ?? []
            if (topics.length === 0) return null
            return (
              <div key={category}>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">{category}</h2>
                <div className="flex flex-col gap-3">
                  {topics.map(topic => (
                    <div key={topic.id} className="rounded-xl bg-white border border-zinc-200 shadow-sm p-5">
                      <p className="text-sm font-bold text-zinc-900 mb-1.5">{topic.question}</p>
                      <p className="text-sm text-zinc-600 leading-relaxed mb-3">{topic.answer}</p>
                      <a
                        href={topic.href}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-red-700 hover:text-red-800"
                      >
                        {topic.linkLabel} →
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
