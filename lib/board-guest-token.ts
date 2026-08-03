import crypto from 'crypto'

// Guest access to an accountability board — no FireOps7 account, the signed link itself is the
// credential. Two tiers:
//  - 'self'  — scoped to one accountability_entries row (e.g. a mutual-aid engine boss who scanned
//              in): can view and move only that entry (and its attached resource/crew, if any).
//  - 'admin' — scoped to the whole board (a Planning Section guest): full read + lane/move control,
//              same as a logged-in officer, but never anything outside that one board.
// Validity is checked live against the board's status/guest_links_revoked_at on every request (see
// resolveActor in app/actions/accountability.ts) rather than relying solely on the token's own exp —
// access is meant to track "is this board still open," not a fixed clock.

export type BoardGuestPayload =
  | { kind: 'self'; boardId: string; entryId: string; label: string; issuedAt: number; exp: number }
  | { kind: 'admin'; boardId: string; label: string; issuedAt: number; exp: number }

function secret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.')
  return key
}

function sign(body: string): string {
  return crypto.createHmac('sha256', secret()).update(body).digest('base64url')
}

// Hard ceiling only — real expiry in practice is the board closing or an explicit revoke, both
// checked live server-side. This just bounds how long a link could work if a board were somehow
// left open indefinitely.
const HARD_CEILING_MS = 30 * 24 * 60 * 60 * 1000

export function createBoardGuestToken(
  payload: { kind: 'self'; boardId: string; entryId: string; label: string } | { kind: 'admin'; boardId: string; label: string }
): string {
  const now = Date.now()
  const full: BoardGuestPayload = { ...payload, issuedAt: now, exp: now + HARD_CEILING_MS } as BoardGuestPayload
  const body = Buffer.from(JSON.stringify(full)).toString('base64url')
  return `${body}.${sign(body)}`
}

export function verifyBoardGuestTokenSignature(token: string): BoardGuestPayload | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null

  const expected = sign(body)
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString()) as BoardGuestPayload
    if (Date.now() > parsed.exp) return null
    return parsed
  } catch {
    return null
  }
}
