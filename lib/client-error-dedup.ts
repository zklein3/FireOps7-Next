// Guards against the same error being reported more than once in quick succession —
// React Strict Mode double-invokes effects with no cleanup in dev, and a single
// render error can legitimately be seen by both the error.tsx boundary and the
// global window.onerror listener. Module-level, so it's shared across every
// caller in the same browser tab; resets on full page load.
const recentlySeen = new Map<string, number>()
const DEDUP_WINDOW_MS = 5000

// Known-benign browser/OS quirks that fire from outside our code (not from any promise
// we or our dependencies create — traced end to end, nothing in the app calls these).
// Real errors, zero actionable signal — just noise every time someone scans on Android.
const KNOWN_NOISE = [
  'setPhotoOptions failed', // Android Chrome's internal camera pipeline, during getUserMedia video capture
]

export function shouldLogClientError(key: string): boolean {
  if (KNOWN_NOISE.some(noise => key.includes(noise))) return false
  const now = Date.now()
  const last = recentlySeen.get(key)
  if (last && now - last < DEDUP_WINDOW_MS) return false
  recentlySeen.set(key, now)
  // Keep the map small — drop anything older than the window.
  if (recentlySeen.size > 50) {
    for (const [k, t] of recentlySeen) {
      if (now - t > DEDUP_WINDOW_MS) recentlySeen.delete(k)
    }
  }
  return true
}
