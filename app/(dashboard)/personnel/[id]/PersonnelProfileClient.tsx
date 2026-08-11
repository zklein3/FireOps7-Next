'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateOwnProfile, updatePersonnelProfile, updateDeptPersonnel, changeOwnPassword, linkQrToken, deleteQrToken } from '@/app/actions/personnel'
import BiometricSettings from '@/components/BiometricSettings'
import QRScanner from '@/components/QRScanner'
import { parseSalamanderCard, parseFireOps7Card, isFireOps7Card } from '@/lib/salamander'
import type { SalamanderCard } from '@/lib/salamander'
import HelpText from '@/components/HelpText'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY'
]

interface Person {
  id: string
  first_name: string
  last_name: string
  display_name: string | null
  email: string
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  signup_status: string
  is_sys_admin: boolean
}

interface DeptRecord {
  id: string
  system_role: string
  role_id: string | null
  employee_number: string | null
  hire_date: string | null
  active: boolean
  signup_status: string
  notify_feedback: boolean
  burn_permit_reviewer: boolean
}

interface Role {
  id: string
  name: string
  is_officer: boolean
  sort_order: number
}

interface LinkedToken {
  id: string
  token_type: string
  label: string | null
  linked_at: string
}

interface BiometricCredential {
  id: string
  device_label: string | null
  created_at: string
  last_used_at: string | null
}

export default function PersonnelProfileClient({
  person,
  deptRecord,
  roles,
  linkedTokens: initialLinkedTokens,
  biometricCredentials,
  isMe,
  isAdmin,
  isOfficerOrAbove,
  departmentTimezone,
}: {
  person: Person
  deptRecord: DeptRecord
  roles: Role[]
  linkedTokens: LinkedToken[]
  biometricCredentials: BiometricCredential[]
  isMe: boolean
  isAdmin: boolean
  isOfficerOrAbove: boolean
  departmentTimezone: string
}) {
  const router = useRouter()
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  const [deptError, setDeptError] = useState<string | null>(null)
  const [deptSuccess, setDeptSuccess] = useState<string | null>(null)
  const [deptLoading, setDeptLoading] = useState(false)

  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState<string | null>(null)
  const [pwLoading, setPwLoading] = useState(false)

  const [qrScannerOpen, setQrScannerOpen] = useState(false)
  const [qrResult, setQrResult] = useState<string | null>(null)
  const [qrParsed, setQrParsed] = useState<{ type: 'fireops7'; id: string } | { type: 'salamander'; card: SalamanderCard } | { type: 'unknown' } | null>(null)

  const [linkedTokens, setLinkedTokens] = useState<LinkedToken[]>(initialLinkedTokens)
  const [linkingToken, setLinkingToken] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [deletingTokenId, setDeletingTokenId] = useState<string | null>(null)

  async function handleScan(raw: string) {
    setQrResult(raw)
    setQrScannerOpen(false)
    setLinkError(null)

    if (isFireOps7Card(raw)) {
      const fo7Id = parseFireOps7Card(raw)
      setQrParsed(fo7Id ? { type: 'fireops7', id: fo7Id } : { type: 'unknown' })
      // Auto-link if this card belongs to the profile being viewed
      if (fo7Id && fo7Id === person.id) {
        const alreadyLinked = linkedTokens.some(t => t.token_type === 'fireops7')
        if (!alreadyLinked) {
          setLinkingToken(true)
          const res = await linkQrToken(person.id, 'fireops7', raw, 'FireOps7 Card')
          setLinkingToken(false)
          if (res?.error) setLinkError(res.error)
          else setLinkedTokens(prev => [...prev, { id: crypto.randomUUID(), token_type: 'fireops7', label: 'FireOps7 Card', linked_at: new Date().toISOString() }])
        }
      }
    } else {
      const card = parseSalamanderCard(raw)
      setQrParsed(card ? { type: 'salamander', card } : { type: 'unknown' })
    }
  }

  async function handleLinkToken() {
    if (!qrResult || !qrParsed || qrParsed.type === 'unknown') return
    setLinkingToken(true)
    setLinkError(null)
    const label = qrParsed.type === 'salamander'
      ? `${qrParsed.card.firstName} ${qrParsed.card.lastName} — Salamander`
      : 'FireOps7 Card'
    const res = await linkQrToken(person.id, qrParsed.type, qrResult, label)
    setLinkingToken(false)
    if (res?.error) { setLinkError(res.error); return }
    setLinkedTokens(prev => {
      const filtered = prev.filter(t => t.token_type !== qrParsed.type)
      return [...filtered, { id: crypto.randomUUID(), token_type: qrParsed.type, label, linked_at: new Date().toISOString() }]
    })
    setQrResult(null)
    setQrParsed(null)
  }

  async function handleDeleteToken(tokenId: string) {
    setDeletingTokenId(tokenId)
    const res = await deleteQrToken(tokenId)
    setDeletingTokenId(null)
    if (!res?.error) setLinkedTokens(prev => prev.filter(t => t.id !== tokenId))
  }

  const canEditProfile = isMe || isOfficerOrAbove

  async function handleProfileSubmit(formData: FormData) {
    setProfileError(null)
    setProfileSuccess(null)
    setProfileLoading(true)
    const result = isMe
      ? await updateOwnProfile(formData)
      : await updatePersonnelProfile(formData)
    if (result?.error) setProfileError(result.error)
    else setProfileSuccess('Profile updated successfully.')
    setProfileLoading(false)
  }

  async function handleDeptSubmit(formData: FormData) {
    setDeptError(null)
    setDeptSuccess(null)
    setDeptLoading(true)
    const result = await updateDeptPersonnel(formData)
    if (result?.error) setDeptError(result.error)
    else setDeptSuccess('Department info updated successfully.')
    setDeptLoading(false)
  }

  async function handlePasswordSubmit(formData: FormData) {
    setPwError(null)
    setPwSuccess(null)
    setPwLoading(true)
    const result = await changeOwnPassword(formData)
    if (result?.error) setPwError(result.error)
    else setPwSuccess('Password changed successfully.')
    setPwLoading(false)
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-zinc-900">
            {person.first_name || person.last_name
              ? `${person.first_name} ${person.last_name}`.trim()
              : 'Profile'}
          </h1>
          <p className="text-sm text-zinc-500">{person.email}</p>
        </div>
        {person.is_sys_admin && (
          <span className="shrink-0 inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
            Sys Admin
          </span>
        )}
      </div>
      {canEditProfile && (
        <HelpText className="mb-4">
          {isMe ? "This is your own profile — changes here save immediately, no approval needed." : "You're editing someone else's profile as an officer/admin — they'll see the updated info next time they log in."}
        </HelpText>
      )}
      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={() => router.push('/personnel')} className="rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-sm">← Back</button>
        {(isMe || isOfficerOrAbove) && (
          <button
            onClick={() => window.open(`/print/member-card?id=${person.id}`, '_blank')}
            className="rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-sm"
          >
            Print ID Card
          </button>
        )}
      </div>

      {/* ── Personal Info ─────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-zinc-900 mb-4">Personal Information</h2>
        {profileSuccess && <Alert type="success" message={profileSuccess} />}
        {profileError && <Alert type="error" message={profileError} />}

        {canEditProfile ? (
          <form action={handleProfileSubmit} className="flex flex-col gap-4">
            <input type="hidden" name="personnel_id" value={person.id} />
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">First Name <span className="text-red-500">*</span></label>
                <input name="first_name" type="text" required defaultValue={person.first_name}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Last Name <span className="text-red-500">*</span></label>
                <input name="last_name" type="text" required defaultValue={person.last_name}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Email</label>
              <input type="text" value={person.email} disabled
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-400 cursor-not-allowed" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Phone</label>
              <input name="phone" type="tel" defaultValue={person.phone ?? ''}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="(555) 555-5555" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Street Address</label>
              <input name="address" type="text" defaultValue={person.address ?? ''}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="123 Main St" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">City</label>
                <input name="city" type="text" defaultValue={person.city ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="w-24">
                <label className="mb-1 block text-sm font-medium text-zinc-700">State</label>
                <select name="state" defaultValue={person.state ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                  <option value="">—</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="w-28">
                <label className="mb-1 block text-sm font-medium text-zinc-700">ZIP</label>
                <input name="zip" type="text" maxLength={10} defaultValue={person.zip ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <button type="submit" disabled={profileLoading}
              className="mt-1 w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
              {profileLoading ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <ReadOnlyField label="Name" value={`${person.first_name} ${person.last_name}`.trim()} />
            <ReadOnlyField label="Email" value={person.email} />
            <ReadOnlyField label="Phone" value={person.phone} />
            <ReadOnlyField label="Address" value={[person.address, person.city, person.state, person.zip].filter(Boolean).join(', ')} />
          </div>
        )}
      </div>

      {/* ── Department Info ───────────────────────────────────────────────── */}
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-zinc-900 mb-4">Department Information</h2>
        {deptSuccess && <Alert type="success" message={deptSuccess} />}
        {deptError && <Alert type="error" message={deptError} />}

        {isAdmin ? (
          <form action={handleDeptSubmit} className="flex flex-col gap-4">
            <input type="hidden" name="dept_personnel_id" value={deptRecord.id} />
            <input type="hidden" name="personnel_id" value={person.id} />
            <div className="flex gap-4">
              <div className="w-44">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Access Level</label>
                <select name="system_role" defaultValue={deptRecord.system_role}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                  <option value="admin">Admin</option>
                  <option value="officer">Officer</option>
                  <option value="member">Member</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Title / Rank</label>
                <select name="role_id" defaultValue={deptRecord.role_id ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                  <option value="">Select title...</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-44">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Employee #</label>
                <input name="employee_number" type="text" defaultValue={deptRecord.employee_number ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-zinc-700">Hire Date</label>
                <input name="hire_date" type="date" defaultValue={deptRecord.hire_date ?? ''}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Status</label>
              <select name="active" defaultValue={deptRecord.active ? 'true' : 'false'}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" name="notify_feedback" value="true" defaultChecked={deptRecord.notify_feedback}
                className="mt-0.5 rounded" />
              <span className="text-sm text-zinc-700">
                Email this person when new public feedback or problem reports are submitted
                <span className="block text-xs text-zinc-400">Only applies to Officers and Admins.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" name="burn_permit_reviewer" value="true" defaultChecked={deptRecord.burn_permit_reviewer}
                className="mt-0.5 rounded" />
              <span className="text-sm text-zinc-700">
                Email this person when a new burn permit is submitted for review
                <span className="block text-xs text-zinc-400">Only applies to Officers and Admins.</span>
              </span>
            </label>
            <button type="submit" disabled={deptLoading}
              className="mt-1 w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
              {deptLoading ? 'Saving...' : 'Save Department Info'}
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <ReadOnlyField label="Access Level" value={deptRecord.system_role.charAt(0).toUpperCase() + deptRecord.system_role.slice(1)} />
            <ReadOnlyField label="Employee #" value={deptRecord.employee_number} />
            <ReadOnlyField label="Hire Date" value={deptRecord.hire_date} />
          </div>
        )}
      </div>

      {/* ── Card Scanner ─────────────────────────────────────────────────── */}
      {(isMe || isOfficerOrAbove) && (
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-6 mb-6">
          <h2 className="text-base font-semibold text-zinc-900 mb-1">ID Cards</h2>
          <p className="text-xs text-zinc-400 mb-4">Link a FireOps7 or Salamander card to this profile for accountability scanning.</p>

          {qrScannerOpen && (
            <div className="mb-4">
              <QRScanner
                onScan={handleScan}
                onClose={() => setQrScannerOpen(false)}
                hint="Point camera at QR code or PDF417 barcode"
              />
            </div>
          )}

          {/* Parsed result */}
          {qrParsed && !qrScannerOpen && (
            <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              {qrParsed.type === 'fireops7' && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">FireOps7 Card</span>
                  <span className="text-sm text-zinc-600">{qrParsed.id === person.id ? 'Matches this profile' : 'Different member'}</span>
                </div>
              )}
              {qrParsed.type === 'salamander' && (
                <div className="flex flex-col gap-1">
                  <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 mb-1 w-fit">Salamander Card</span>
                  <p className="text-sm font-semibold text-zinc-900">{qrParsed.card.firstName} {qrParsed.card.lastName}</p>
                  <p className="text-sm text-zinc-500">{qrParsed.card.department}{qrParsed.card.title ? ` · ${qrParsed.card.title}` : ''}</p>
                  {qrParsed.card.certs.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {qrParsed.card.certs.map(c => (
                        <span key={c} className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs font-mono text-zinc-700">{c}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {qrParsed.type === 'unknown' && (
                <p className="text-sm text-zinc-500">Card format not recognized.</p>
              )}
            </div>
          )}

          {/* Link / auto-link feedback */}
          {linkError && <p className="mb-3 text-sm text-red-600">{linkError}</p>}
          {qrParsed && !qrScannerOpen && qrParsed.type !== 'unknown' && (() => {
            const alreadyLinked = linkedTokens.some(t => t.token_type === qrParsed.type)
            const isOwnFo7 = qrParsed.type === 'fireops7' && qrParsed.id === person.id
            if (qrParsed.type === 'fireops7' && !isOwnFo7) return <p className="mb-3 text-sm text-zinc-500">This FireOps7 card belongs to a different member.</p>
            if (alreadyLinked) {
              const label = qrParsed.type === 'fireops7' ? 'FireOps7' : 'Salamander'
              return <p className="mb-3 text-sm text-green-600 font-medium">{label} card linked to this profile.</p>
            }
            if (linkingToken) return <p className="mb-3 text-sm text-zinc-500">Linking...</p>
            return (
              <button type="button" disabled={linkingToken} onClick={handleLinkToken}
                className="mb-3 w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
                Link to Profile
              </button>
            )
          })()}

          {/* Linked cards list */}
          {linkedTokens.length > 0 && (
            <div className="mt-4 border-t border-zinc-100 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-2">Linked Cards</p>
              <div className="flex flex-col gap-2">
                {linkedTokens.map(t => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.token_type === 'fireops7' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {t.token_type === 'fireops7' ? 'FireOps7' : t.token_type === 'salamander' ? 'Salamander' : 'Custom'}
                      </span>
                      {t.label && <span className="text-sm text-zinc-600">{t.label}</span>}
                    </div>
                    {(isMe || isOfficerOrAbove) && (
                      <button type="button" disabled={deletingTokenId === t.id}
                        onClick={() => handleDeleteToken(t.id)}
                        className="text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50 transition-colors">
                        {deletingTokenId === t.id ? 'Removing...' : 'Remove'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!qrScannerOpen && (
            <button
              type="button"
              onClick={() => { setQrScannerOpen(true); setQrParsed(null) }}
              className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
            >
              {qrResult ? 'Scan Again' : 'Scan Card'}
            </button>
          )}
        </div>
      )}

      {/* ── Biometric Unlock — own profile only ─────────────────────────── */}
      {isMe && <BiometricSettings initialCredentials={biometricCredentials} departmentTimezone={departmentTimezone} />}

      {/* ── Change Password — own profile only ───────────────────────────── */}
      {isMe && (
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-6">
          <h2 className="text-base font-semibold text-zinc-900 mb-4">Change Password</h2>
          {pwSuccess && <Alert type="success" message={pwSuccess} />}
          {pwError && <Alert type="error" message={pwError} />}
          <form action={handlePasswordSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Current Password</label>
              <input name="current_password" type="password" required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="••••••••" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">New Password</label>
              <input name="password" type="password" required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="••••••••" />
              <p className="mt-1 text-xs text-zinc-400">Minimum 8 characters</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Confirm New Password</label>
              <input name="confirm" type="password" required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="••••••••" />
            </div>
            <button type="submit" disabled={pwLoading}
              className="mt-1 w-full rounded-lg bg-zinc-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors">
              {pwLoading ? 'Updating...' : 'Change Password'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-4">
      <span className="w-32 text-zinc-500 shrink-0">{label}</span>
      <span className="text-zinc-900">{value || '—'}</span>
    </div>
  )
}

function Alert({ type, message }: { type: 'success' | 'error'; message: string }) {
  return (
    <div className={`mb-4 rounded-lg px-4 py-3 text-sm border ${
      type === 'success'
        ? 'bg-green-50 text-green-700 border-green-200'
        : 'bg-red-50 text-red-700 border-red-200'
    }`}>
      {message}
    </div>
  )
}
