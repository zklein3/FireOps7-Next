'use client'

export function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-zinc-900">{value || '—'}</p>
    </div>
  )
}
