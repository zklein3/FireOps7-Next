'use client'

import { useState } from 'react'
import Link from 'next/link'
import BoardCleanupActions from './BoardCleanupActions'

type Board = {
  id: string
  title: string
  board_date: string
  linked_incident_id: string | null
}

// Archived boards are real audit history (214/PAR checks still have value) but shouldn't clutter
// the default list the way Closed does — collapsed by default, one click to pull them back up.
export default function ArchivedBoardsSection({
  boards,
  countMap,
  incidentMap,
  canDelete,
  formatDate,
}: {
  boards: Board[]
  countMap: Record<string, number>
  incidentMap: Record<string, string>
  canDelete: boolean
  formatDate: (d: string) => string
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2 hover:text-zinc-700"
      >
        {expanded ? '▾' : '▸'} Archived ({boards.length})
      </button>

      {expanded && (
        <div className="rounded-xl bg-white border border-zinc-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-zinc-100">
            {boards.map(board => {
              const count = countMap[board.id] ?? 0
              const incNum = board.linked_incident_id ? incidentMap[board.linked_incident_id] : null
              return (
                <div key={board.id} className="flex items-center px-5 py-4 gap-4 hover:bg-zinc-50 transition-colors">
                  <Link href={`/accountability/${board.id}`} className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 truncate">{board.title}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {formatDate(board.board_date)}
                      {incNum && <span className="ml-2 text-zinc-500">· Incident {incNum}</span>}
                    </p>
                  </Link>
                  <div className="flex items-center gap-3 shrink-0">
                    {count > 0 && <span className="text-xs text-zinc-400">{count} logged</span>}
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">Archived</span>
                    <BoardCleanupActions boardId={board.id} mode="archived" canDelete={canDelete} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
