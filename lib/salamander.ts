export interface SalamanderCard {
  firstName: string
  lastName: string
  department: string
  title: string | null
  certs: string[]
}

/**
 * Parses a Salamander personnel accountability card payload.
 *
 * Confirmed format (from live scan 2026-05-16):
 *   - Department: text immediately after ESC (\x1B), ends at next control char
 *   - Name: LASTNAME*\x07FIRSTNAME  (BEL char between * and first name)
 *   - Certs: CERTCODE followed by "2" + control chars (field separator pattern)
 *   - Last cert may be followed by ":" instead of "2"
 *   - Title: readable text on a new line after the last cert block
 *
 * Returns null if the payload doesn't match the expected Salamander structure.
 */
export function parseSalamanderCard(raw: string): SalamanderCard | null {
  // Must contain both * (name separator) and ESC (dept marker) to be Salamander
  if (!raw.includes('*') || !raw.includes('\x1B')) return null

  // --- Department ---
  // ESC followed by readable text; strip trailing digits/control chars
  const deptMatch = raw.match(/\x1B([A-Za-z0-9 &'.-]+)/)
  if (!deptMatch) return null
  const department = deptMatch[1].replace(/\d+$/, '').trim()

  // --- Name ---
  // Pattern: UPPERCASE_LASTNAME * BEL UPPERCASE_FIRSTNAME
  const nameMatch = raw.match(/([A-Z][A-Z'-]*)(?:\*)[\x01-\x08\x0B\x0E-\x1F]([A-Z][A-Z'-]*)/)
  if (!nameMatch) return null
  const lastName = nameMatch[1].trim()
  const firstName = nameMatch[2].trim()

  // --- Certs ---
  // Work with the section of the string after the name block
  const nameEnd = raw.indexOf(nameMatch[0]) + nameMatch[0].length
  const tail = raw.slice(nameEnd)

  // Cert codes are UPPERCASE strings (letters, digits, underscores, slashes)
  // followed by the field separator: "2" + at least one control char, or ":"
  const certPattern = /([A-Z][A-Z0-9_/]{1,15})(?:2[\x00-\x1F]|:[\x00-\x1F\n])/g
  const certs: string[] = []
  let m: RegExpExecArray | null
  while ((m = certPattern.exec(tail)) !== null) {
    certs.push(m[1])
  }

  // --- Title ---
  // Appears on its own line after the last cert, before binary garbage
  // Pattern: newline followed by readable words (title case or all caps)
  const titleMatch = tail.match(/\n([A-Za-z][A-Za-z ]{2,30})(?:\n|[\x00-\x1F\x7F-\xFF])/)
  const title = titleMatch ? titleMatch[1].trim() : null

  return { firstName, lastName, department, title, certs }
}

/**
 * Builds the canonical storage key for a Salamander card.
 * Used both when linking (server) and when looking up at an incident (Phase 2).
 * Format: SAL:{LASTNAME}:{FIRSTNAME}:{DEPT_ALPHANUMERIC}
 */
export function salamanderCanonicalKey(card: SalamanderCard): string {
  const deptKey = card.department.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return `SAL:${card.lastName.toUpperCase()}:${card.firstName.toUpperCase()}:${deptKey}`
}

/** Returns true if the raw string looks like a FireOps7 member token. */
export function isFireOps7Card(raw: string): boolean {
  return raw.startsWith('FO7:P:')
}

/** Extracts personnel_id from a FireOps7 card token. */
export function parseFireOps7Card(raw: string): string | null {
  if (!isFireOps7Card(raw)) return null
  const id = raw.slice(6).trim()
  return id.length > 0 ? id : null
}

/**
 * Reverses the `\xNN` hex-escaping applied before storing a raw scan in
 * qr_debug_scans (see saveDebugScan in app/actions/accountability.ts), so the
 * original control-character bytes can be re-fed into parseSalamanderCard to
 * check whether a captured failure now parses under the current regex.
 */
export function unescapeDebugRaw(sanitized: string): string {
  return sanitized.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

/**
 * Stable (non-cryptographic) fingerprint for a raw scan — used to recognize "the same
 * physical tag scanned again" for cards that don't carry a name (Salamander rapid/event
 * tags). Not a security boundary: 32-bit hash space, collisions are theoretically possible.
 * Shared between the accountability board (tag_ref matching) and the card-based board
 * access lookup (app/actions/accountability.ts resolveCardForBoardAccess) so both compute
 * the identical value for the identical physical card.
 */
export function hashRaw(raw: string): string {
  let h = 0
  for (let i = 0; i < raw.length; i++) h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0
  return `RT${(h >>> 0).toString(36)}`
}
