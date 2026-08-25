// Shared date/time formatting helpers.
//
// This app stores two different kinds of timestamps:
//
// - "Wall-clock echo" fields (incident/apparatus response times like
//   paged_at, on_scene_at, call_time) are written straight from
//   <input type="datetime-local"> or the run-sheet AI parser with no
//   timezone conversion — the literal typed digits land in the DB
//   mislabeled as UTC. These must always be echoed back via
//   formatWallClockDateTime, never converted.
//
// - "True instant" fields (created_at, signed_at, submitted_at,
//   filled_at, inspected_at, etc.) are set via new Date().toISOString()
//   and are real UTC instants — these need genuine conversion to the
//   department's local timezone via formatLocalDateTime/formatLocalDate.

export const TIMEZONES = [
  { value: 'America/New_York',    label: 'Eastern (ET)' },
  { value: 'America/Chicago',     label: 'Central (CT)' },
  { value: 'America/Denver',      label: 'Mountain (MT)' },
  { value: 'America/Phoenix',     label: 'Mountain – No DST (AZ)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage',   label: 'Alaska (AKT)' },
  { value: 'America/Honolulu',    label: 'Hawaii (HT)' },
]

export const DEFAULT_TIMEZONE = 'America/Chicago'

export function formatWallClockDateTime(dt: string | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('en-US', {
    timeZone: 'UTC',
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    ...opts,
  })
}

export function formatLocalDateTime(dt: string | null, timezone: string, opts?: Intl.DateTimeFormatOptions): string {
  if (!dt) return '—'
  // dateStyle/timeStyle can't be mixed with component options (month, day, hour, minute, etc.) —
  // Intl.DateTimeFormat throws if both are present, so skip the component defaults when a caller opts in to style-based formatting.
  const usesStyle = opts && ('dateStyle' in opts || 'timeStyle' in opts)
  return new Date(dt).toLocaleString('en-US', {
    timeZone: timezone || DEFAULT_TIMEZONE,
    ...(usesStyle ? {} : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    ...opts,
  })
}

export function formatLocalDate(dt: string | null, timezone: string, opts?: Intl.DateTimeFormatOptions): string {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('en-US', {
    timeZone: timezone || DEFAULT_TIMEZONE,
    month: 'short', day: 'numeric', year: 'numeric',
    ...opts,
  })
}

export function toDatetimeLocalInput(dt: string | null): string {
  if (!dt) return ''
  return new Date(dt).toISOString().slice(0, 16)
}
