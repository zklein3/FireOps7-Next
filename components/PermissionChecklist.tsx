'use client'

import { PERMISSION_CATALOG, PERMISSION_CATEGORIES, type PermissionCatalogEntry } from '@/lib/permission-catalog'

// Grouped-category checklist, same idiom as VehicleCheckItemsClient.tsx's
// grouped[group_name] cards. Controlled component — the caller owns the
// permissions state and save/dirty logic; this just renders and reports
// individual toggles.
export default function PermissionChecklist({
  permissions,
  onChange,
}: {
  permissions: Record<string, boolean>
  onChange: (key: string, value: boolean) => void
}) {
  const grouped = PERMISSION_CATALOG.reduce<Record<string, PermissionCatalogEntry[]>>((acc, entry) => {
    ;(acc[entry.category] ??= []).push(entry)
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-4">
      {PERMISSION_CATEGORIES.map(category => {
        const entries = grouped[category] ?? []
        const checkedCount = entries.filter(e => permissions[e.key]).length
        const allChecked = entries.length > 0 && checkedCount === entries.length

        return (
          <div key={category} className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{category}</h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-400">{checkedCount}/{entries.length}</span>
                <button
                  type="button"
                  onClick={() => entries.forEach(e => onChange(e.key, !allChecked))}
                  className="text-xs text-blue-600 font-semibold hover:text-blue-800"
                >
                  {allChecked ? 'Clear' : 'Select All'}
                </button>
              </div>
            </div>
            <div className="divide-y divide-zinc-100">
              {entries.map(entry => (
                <label
                  key={entry.key}
                  className="px-4 py-2.5 flex items-center gap-2 text-sm text-zinc-700 cursor-pointer hover:bg-zinc-50"
                  title={entry.description}
                >
                  <input
                    type="checkbox"
                    checked={!!permissions[entry.key]}
                    onChange={e => onChange(entry.key, e.target.checked)}
                    className="rounded border-zinc-300 text-red-600 focus:ring-red-500"
                  />
                  {entry.label}
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
