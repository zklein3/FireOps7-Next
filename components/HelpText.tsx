'use client'

import { useHelp } from '@/lib/useHelp'

// Renders nothing when the global help toggle is off — purely additive,
// never affects layout or behavior when hidden.
export default function HelpText({ children, className }: { children: React.ReactNode; className?: string }) {
  const { showHelp } = useHelp()
  if (!showHelp) return null

  return (
    <p className={`flex items-start gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-700 ${className ?? ''}`}>
      <span className="shrink-0">💡</span>
      <span>{children}</span>
    </p>
  )
}
