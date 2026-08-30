/**
 * Events store a duration, but people know an end time — a standby runs "6 to 10",
 * not "240 minutes". These convert between the two so the form can ask for the end
 * time while the column keeps holding minutes, which every display already derives
 * an end time back out of.
 *
 * Duration stays the stored form deliberately: it survives an occurrence that runs
 * past midnight, where a bare end time is ambiguous.
 */

/** 'HH:MM' + 'HH:MM' → whole minutes. An end at or before the start is read as next-day. */
export function durationFromTimes(startTime: string, endTime: string): number | null {
  if (!startTime || !endTime) return null
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return null

  const start = sh * 60 + sm
  let end = eh * 60 + em
  // Ran past midnight (18:00 → 00:30). Equal times are ambiguous rather than a
  // full 24 hours, so they yield no duration at all.
  if (end < start) end += 24 * 60
  const mins = end - start
  return mins > 0 ? mins : null
}

/** Minutes → 'HH:MM' for populating an end-time input from an existing duration. */
export function endTimeFromDuration(startTime: string | null, durationMinutes: number | null): string {
  if (!startTime || !durationMinutes) return ''
  const [h, m] = startTime.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return ''
  const total = h * 60 + m + durationMinutes
  const endH = Math.floor(total / 60) % 24
  const endM = total % 60
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
}

/** 'HH:MM' → '6:00 PM' */
export function formatClockTime(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  if (Number.isNaN(hour)) return ''
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

/**
 * '6:00 PM – 10:00 PM', or just the start when there's no duration on file.
 * Reads better than a bare span like "4h" for anyone deciding whether they can make it.
 */
export function formatTimeRange(startTime: string | null, durationMinutes: number | null): string {
  const start = formatClockTime(startTime)
  if (!start) return ''
  const end = formatClockTime(endTimeFromDuration(startTime, durationMinutes))
  return end ? `${start} – ${end}` : start
}
