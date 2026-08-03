'use server'

import Anthropic from '@anthropic-ai/sdk'
import { logError } from '@/lib/logger'

export type ParsedRunSheet = {
  cad_number?: string
  incident_number?: string
  incident_date?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  incident_type?: string
  call_time?: string
  paged_at?: string
  first_on_scene_at?: string
  last_leaving_scene_at?: string
  in_service_at?: string
  disposition?: string
  narrative?: string
  apparatus?: {
    unit_number: string
    role: string
    enroute_at?: string
    on_scene_at?: string
    leaving_scene_at?: string
    available_at?: string
  }[]
  mutual_aid?: {
    department_name: string
    apparatus_description?: string
    personnel_count?: number
    arrival_time?: string
    departure_time?: string
  }[]
}

// Collapses duplicate mutual_aid entries for the same agency into one — a safety net in case the
// model still splits an agency's placeholder header and its real unit header into two entries.
function mergeMutualAidByAgency(rows: NonNullable<ParsedRunSheet['mutual_aid']>): NonNullable<ParsedRunSheet['mutual_aid']> {
  const normalize = (name: string) => name.trim().toLowerCase().replace(/\s+department$/, '').replace(/\s+/g, ' ')
  const merged: Record<string, NonNullable<ParsedRunSheet['mutual_aid']>[number]> = {}

  for (const row of rows) {
    const key = normalize(row.department_name || '')
    if (!key) continue
    const existing = merged[key]
    if (!existing) {
      merged[key] = { ...row }
      continue
    }
    // Prefer the longer/more complete-looking department name
    if (row.department_name.length > existing.department_name.length) existing.department_name = row.department_name
    if (row.apparatus_description && !existing.apparatus_description?.includes(row.apparatus_description)) {
      existing.apparatus_description = existing.apparatus_description
        ? `${existing.apparatus_description}, ${row.apparatus_description}`
        : row.apparatus_description
    }
    if (row.personnel_count && (!existing.personnel_count || row.personnel_count > existing.personnel_count)) {
      existing.personnel_count = row.personnel_count
    }
    if (row.arrival_time && (!existing.arrival_time || row.arrival_time < existing.arrival_time)) {
      existing.arrival_time = row.arrival_time
    }
    if (row.departure_time && (!existing.departure_time || row.departure_time > existing.departure_time)) {
      existing.departure_time = row.departure_time
    }
  }

  return Object.values(merged)
}

// Belt-and-suspenders filter: the model has been observed slipping the requesting department's own
// placeholder header (e.g. "WINFIRE") into mutual_aid despite prompt instructions not to. Since CAD
// radio prefixes are conventionally the first few letters of the department's own name (WIN for
// Winslow, HPR for Hooper), treat a mutual_aid row as our own department if its name shares that
// prefix or matches outright, and drop it — it's not an outside agency.
function looksLikeOwnDepartment(candidateName: string, ownDepartmentName: string): boolean {
  const clean = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '')
  const candidate = clean(candidateName)
  const own = clean(ownDepartmentName)
  if (!candidate || !own) return false
  if (candidate === own) return true
  const prefixLen = 3
  return candidate.length >= prefixLen && own.length >= prefixLen && candidate.slice(0, prefixLen) === own.slice(0, prefixLen)
}

export async function parseRunSheet(formData: FormData): Promise<{ data?: ParsedRunSheet; error?: string }> {
  const file = formData.get('pdf') as File | null
  if (!file) return { error: 'No file provided.' }
  if (file.type !== 'application/pdf') return { error: 'File must be a PDF.' }
  if (file.size > 5 * 1024 * 1024) return { error: 'File too large (max 5MB).' }

  const apparatusJson = formData.get('apparatus_units') as string | null
  const apparatusUnits: string[] = apparatusJson ? JSON.parse(apparatusJson) : []
  const departmentName = (formData.get('department_name') as string | null)?.trim() || ''

  const apparatusContext = apparatusUnits.length > 0
    ? `\nThis department is${departmentName ? ` "${departmentName}" —` : ''} its own apparatus unit numbers are: ${apparatusUnits.join(', ')}. In the CFS, these units may appear with a department prefix (e.g. unit "11" may appear as "WIN11", unit "24" as "WIN24").

**Step 1 — identify which "Responders" line (page 1) is THIS department.**${departmentName ? ` Find the line whose printed agency name matches or clearly corresponds to "${departmentName}" (it may be abbreviated, e.g. "Winslow Fire Department" printed as "WINFIRE" / prefix "WIN").` : ' Each line pairs a unit/agency identifier with an agency abbreviation (rightmost column).'} Every OTHER agency/department name on that Responders list is a genuinely outside agency — a candidate for "mutual_aid".

**Step 2 — classify each header in "Unit Response Times".** Some headers are a whole-agency dispatch placeholder, not a specific vehicle — recognizable because the identifier is just an agency callsign with no unit number (e.g. "WINFIRE", "HPRFIRE" — literally "<prefix>FIRE" with nothing else), and its lines are typically just Assign/Off Duty with no real Enroute/Arrived. Other headers are an actual responding unit — they include a number and/or explicit apparatus type (e.g. "HPR12", "WIN24", "Squad 1", "Engine 4").
   - **This department's own headers — including its own placeholder header (e.g. "WINFIRE") — must NEVER appear in "mutual_aid" under any circumstances.** Only include a unit in "apparatus" if its identifier is a real numbered unit matching one of the unit numbers above AND it has its own genuine Enroute or Arrived line. If this department's only entry is its own placeholder header with no numbered unit, that means its personnel responded without a specific piece of apparatus (e.g. by POV) — omit it entirely from both "apparatus" and "mutual_aid".
   - For an agency confirmed as OUTSIDE this department in Step 1: if a real numbered/typed unit header exists for them (e.g. "HPR12"), use that one for the mutual_aid entry's apparatus_description and times, and ignore that agency's own placeholder header entirely (do not double-count it, do not use its times). If that outside agency has ONLY a placeholder header with no numbered unit, still add one mutual_aid entry for them (they assisted, e.g. by POV or command staff) but leave apparatus_description blank, and pull arrival_time/departure_time from that placeholder header since it's the only data available.
   - Return exactly ONE mutual_aid entry per outside agency — never split one agency across multiple entries even if it has multiple headers.

**Never fabricate — this is critical.** Every unit_number, apparatus_description, personnel_count, and timestamp you return must be text or digits literally printed in the document. Do NOT guess a truck's type or number from convention or habit — for example, if the document only shows the identifier "HPR12" with no separate human-readable apparatus name printed anywhere, apparatus_description must be exactly "HPR12", never an invented name like "Squad 10" or "Squad 12". Do NOT default personnel_count to a typical crew size (2, 3, 4) — only include it if an actual number is printed in the document for that unit; otherwise omit the field entirely. When in doubt, omit rather than guess.`
    : ''

  try {
    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
            },
          } as any,
          {
            type: 'text',
            text: `Extract incident data from this Central Square CAD CFS (Call for Service) report.${apparatusContext}

IMPORTANT: Return all timestamps exactly as the digits appear in the document — do not convert to UTC or adjust for any timezone. Use the date and time numbers as printed.

This report has three distinct time sources. Use each one correctly:

1. PAGE 1 header fields:
   - "Call Time" → call_time
   - "Completed Time" → in_service_at
   - "Primary Disposition" → disposition

2. "Response Times" block (department-level incident timeline):
   - Assigned → paged_at
   - Arrived → first_on_scene_at
   - Leaving → last_leaving_scene_at
   Do NOT use this block for individual apparatus times.

3. "Unit Response Times" section (per-vehicle times, near the end):
   Each unit has its own subsection headed by its identifier (e.g. "WIN11"). Under each header are lines in the format "MM/DD/YY HH:MM:SS | Event". Read each unit's lines individually:
   - A line containing "| Enroute" → enroute_at for that unit
   - A line containing "| Arrived" → on_scene_at for that unit
   - A line containing "| Leaving Scene" → leaving_scene_at for that unit
   - A line containing "| Available" or "| Off Duty" → available_at for that unit
   Some headers list multiple units (e.g. "WIN11, WIN24") — apply that timestamp to ALL units listed.

Return a JSON object (all fields optional, omit if not found):
{
  "cad_number": "CFS# value",
  "incident_number": "from IR / External Agency Numbers — entry WITHOUT a PO: prefix (e.g. WIN26-0016)",
  "incident_date": "YYYY-MM-DD",
  "address": "street address only (e.g. '123 Main St')",
  "city": "city name",
  "state": "2-letter state code (e.g. 'AZ')",
  "zip": "5-digit zip code",
  "incident_type": one of "fire"|"rescue"|"standby"|"mutual_aid"|"special"|"other" — crashes/injuries = "rescue",
  "call_time": "YYYY-MM-DDTHH:mm",
  "paged_at": "YYYY-MM-DDTHH:mm",
  "first_on_scene_at": "YYYY-MM-DDTHH:mm",
  "last_leaving_scene_at": "YYYY-MM-DDTHH:mm",
  "in_service_at": "YYYY-MM-DDTHH:mm",
  "disposition": "string",
  "narrative": "1-2 sentence summary from the dispatch log comments",
  "apparatus": [
    {
      "unit_number": "plain number exactly as listed in the department unit list",
      "role": "primary" for first/lead unit, "support" for others,
      "enroute_at": "YYYY-MM-DDTHH:mm — from this unit's Enroute line in Unit Response Times",
      "on_scene_at": "YYYY-MM-DDTHH:mm — from this unit's Arrived line in Unit Response Times",
      "leaving_scene_at": "YYYY-MM-DDTHH:mm — from this unit's Leaving Scene line (may be a grouped entry)",
      "available_at": "YYYY-MM-DDTHH:mm — from this unit's Available or Off Duty line"
    }
  ],
  "mutual_aid": [
    {
      "department_name": "outside agency/department name exactly as printed (e.g. 'Hooper Fire') — do not append words like 'Department' unless they're actually printed; if only a prefix is visible with no full name, use the prefix (e.g. 'FLG')",
      "apparatus_description": "their unit(s) as printed, e.g. 'Engine 4' or 'FLG-Engine4, FLG-Tanker12'",
      "personnel_count": number of personnel if listed, otherwise omit,
      "arrival_time": "YYYY-MM-DDTHH:mm — from that unit's Enroute/Arrived line in Unit Response Times, if present",
      "departure_time": "YYYY-MM-DDTHH:mm — from that unit's Leaving Scene/Available line in Unit Response Times, if present"
    }
  ]
}

Return only valid JSON, no markdown or explanation.`,
          },
        ],
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const data = JSON.parse(cleaned) as ParsedRunSheet
    if (data.mutual_aid?.length && departmentName) {
      data.mutual_aid = data.mutual_aid.filter(m => !looksLikeOwnDepartment(m.department_name, departmentName))
    }
    if (data.mutual_aid?.length) data.mutual_aid = mergeMutualAidByAgency(data.mutual_aid)
    return { data }
  } catch (err: any) {
    await logError(err, 'parse-run-sheet')
    return { error: 'Failed to parse run sheet. Please try again or enter manually.' }
  }
}
