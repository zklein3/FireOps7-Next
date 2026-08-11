'use client'

import { useCallback, useEffect, useState } from 'react'

// Global, purely client-side help toggle — no DB column, no server round trip.
// State lives in localStorage; the custom event keeps every mounted
// useHelp() instance on the page in sync the moment one of them toggles it
// (localStorage's own "storage" event only fires in *other* tabs/windows,
// never the tab that made the change).
const STORAGE_KEY = 'fireops7_show_help'
const TOGGLE_EVENT = 'fireops7-help-toggle'

function readStoredValue(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(STORAGE_KEY) === 'true'
}

export function useHelp() {
  // Defaults false on first render (server and client agree) to avoid a
  // hydration mismatch; the real stored value is picked up in the effect
  // right after mount.
  const [showHelp, setShowHelpState] = useState(false)

  useEffect(() => {
    setShowHelpState(readStoredValue())
    function onChange() {
      setShowHelpState(readStoredValue())
    }
    window.addEventListener(TOGGLE_EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(TOGGLE_EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])

  const setShowHelp = useCallback((value: boolean) => {
    window.localStorage.setItem(STORAGE_KEY, String(value))
    window.dispatchEvent(new Event(TOGGLE_EVENT))
  }, [])

  const toggleHelp = useCallback(() => {
    setShowHelp(!readStoredValue())
  }, [setShowHelp])

  return { showHelp, setShowHelp, toggleHelp }
}
