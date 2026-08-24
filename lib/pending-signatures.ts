'use client'

import { saveIncidentSignature, saveEventAttendanceSignature } from '@/app/actions/signatures'

// A poor connection can drop the network request for a signature save mid-flight
// (surfaces to the browser as a generic "Load failed"/"Failed to fetch" error).
// Rather than losing the drawn signature when that happens, we hold it here and
// keep retrying until it actually lands.
export type PendingSignature = {
  id: string // sig_id
  kind: 'incident' | 'event'
  dataUrl: string
  savedAt: string
}

const KEY = 'fireops7_pending_signatures'

function readAll(): PendingSignature[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeAll(entries: PendingSignature[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY, JSON.stringify(entries))
}

export function getPendingSignatures(): PendingSignature[] {
  return readAll()
}

export function queuePendingSignature(entry: PendingSignature) {
  const all = readAll().filter(e => e.id !== entry.id)
  all.push(entry)
  writeAll(all)
}

export function removePendingSignature(id: string) {
  writeAll(readAll().filter(e => e.id !== id))
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

// Attempts to send every queued signature. Successes (including "already
// signed", which means an earlier attempt actually made it through despite
// reporting a failure) are removed from the queue. Anything that still can't
// reach the server is left in place for the next sync attempt.
export async function syncPendingSignatures(): Promise<string[]> {
  const pending = readAll()
  const synced: string[] = []

  for (const entry of pending) {
    try {
      const blob = await dataUrlToBlob(entry.dataUrl)
      const formData = new FormData()
      formData.append('sig_id', entry.id)
      formData.append('signature', blob, 'signature.png')

      const action = entry.kind === 'incident' ? saveIncidentSignature : saveEventAttendanceSignature
      const result = await action(formData)

      if (!result?.error || result.error === 'Already signed') {
        removePendingSignature(entry.id)
        synced.push(entry.id)
      }
      // A definitive non-network error (e.g. "Signature record not found")
      // isn't going to fix itself on retry either — drop it so it doesn't
      // sit in the queue forever.
      else if (result.error !== 'Not authenticated') {
        removePendingSignature(entry.id)
      }
    } catch {
      // Still offline / request failed — leave it queued for next time.
    }
  }

  return synced
}
