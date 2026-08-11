'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useHelp } from '@/lib/useHelp'
import type { DeptTheme } from '@/lib/department-theme'

// Two layouts sharing the same toggle logic:
// - "footer": full-width button with a label, for the desktop sidebar footer
//   and the mobile drawer footer, both already lists of full-width buttons.
// - "icon": compact circular button, for the mobile top bar where there's
//   no room for a label.
// Either way, a small "Help Center" link sits next to it — the secondary
// way to reach /help without relying on a fiddly long-press gesture.
export default function HelpToggle({ theme, variant = 'footer' }: { theme: DeptTheme; variant?: 'footer' | 'icon' }) {
  const { showHelp, toggleHelp } = useHelp()
  const [toast, setToast] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMounted(true)
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [])

  function handleToggle() {
    // Toggling by itself is invisible on any page that has no <HelpText>
    // content yet — this toast is the confirmation that the click actually
    // did something, regardless of what's on the current page.
    const turningOn = !showHelp
    toggleHelp()
    setToast(turningOn ? 'Help text is now on — look for blue tip boxes near page content' : 'Help text is now off')
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setToast(null), 2500)
  }

  const toastNode = toast && mounted ? createPortal(
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] max-w-[90vw] rounded-full bg-zinc-900 text-white text-sm font-medium px-4 py-2.5 shadow-xl text-center pointer-events-none">
      💡 {toast}
    </div>,
    document.body
  ) : null

  if (variant === 'icon') {
    return (
      <>
        <button
          onClick={handleToggle}
          aria-label={showHelp ? 'Hide help text' : 'Show help text'}
          aria-pressed={showHelp}
          className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
            showHelp ? 'bg-white text-zinc-900' : `${theme.navHoverBg} text-white border border-white/30`
          }`}
        >
          ?
        </button>
        {toastNode}
      </>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleToggle}
        aria-pressed={showHelp}
        className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border ${
          showHelp
            ? 'bg-white text-zinc-900 border-white'
            : `${theme.buttonBg} ${theme.buttonHoverBg} text-white ${theme.border}`
        }`}
      >
        <span className="font-bold">?</span>
        {showHelp ? 'Help On' : 'Show Help'}
      </button>
      <a
        href="/help"
        className={`shrink-0 rounded-lg border ${theme.border} px-2.5 py-1.5 text-xs font-medium text-white ${theme.navHoverBg} transition-colors`}
        title="Help Center"
      >
        Help Center →
      </a>
      {toastNode}
    </div>
  )
}
