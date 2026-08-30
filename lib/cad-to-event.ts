import type { ParsedRunSheet } from '@/app/actions/parse-run-sheet'

export type EventFieldsFromCad = {
  event_type: string
  event_date: string        // YYYY-MM-DD
  start_time: string        // HH:MM
  end_time: string          // HH:MM, '' when the sheet has no completed time
  location: string
  description: string
}

/**
 * A CAD sheet reaching the event form is a detail that never became an incident — a
 * standby, fire watch, or parade. "Special Event" is the right landing spot for all of
 * them, and the user can still change it.
 */
function toEventType(): string {
  return 'special'
}

/** '2026-08-29T19:04' / '2026-08-29 19:04:11' → ['2026-08-29', '19:04'] */
function splitStamp(stamp: string | undefined): [string, string] {
  if (!stamp) return ['', '']
  const m = stamp.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
  return m ? [m[1], m[2]] : ['', '']
}

/**
 * The sheet's Completed Time, but only when it lands within a day of the call —
 * a detail that reads as multi-day is a parse artifact, not a real end time.
 */
function endTimeIfSane(callTime: string | undefined, completed: string | undefined): string {
  if (!callTime || !completed) return ''
  const a = new Date(callTime).getTime()
  const b = new Date(completed).getTime()
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return ''
  const mins = Math.round((b - a) / 60000)
  if (mins <= 0 || mins > 24 * 60) return ''
  return splitStamp(completed)[1]
}

/**
 * Maps a parsed Central Square CFS onto event fields.
 *
 * Events are not incidents: no apparatus rows, no mutual aid, no NERIS, and no CFS
 * number — a run with a dispatch number is filed as an incident instead. What carries
 * over is purely the typing this saves: when it happened, where, how long, and what
 * dispatch said about it.
 */
export function cadToEventFields(d: ParsedRunSheet): EventFieldsFromCad {
  const [callDate, callTime] = splitStamp(d.call_time)
  const [pagedDate, pagedTime] = splitStamp(d.paged_at)

  return {
    event_type: toEventType(),
    event_date: d.incident_date || callDate || pagedDate || '',
    start_time: callTime || pagedTime || '',
    end_time: endTimeIfSane(d.call_time, d.in_service_at),
    location: [d.address, d.city].filter(Boolean).join(', '),
    description: d.narrative || '',
  }
}
