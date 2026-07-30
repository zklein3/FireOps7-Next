'use client'

import { useState } from 'react'
import PageNavBar from '@/components/PageNavBar'
import { addRadioChannel, toggleRadioChannel, addMedicalPlanContact, toggleMedicalPlanContact } from '@/app/actions/ics-defaults'

interface Channel { id: string; channel_name: string; assignment: string | null; active: boolean }
interface Contact { id: string; contact_type: string; name: string; phone: string | null; address: string | null; active: boolean }

const CONTACT_TYPES = ['hospital', 'ambulance', 'aid_station', 'other'] as const

export default function IcsDefaultsClient({ departmentId, channels: initialChannels, contacts: initialContacts }: {
  departmentId: string
  channels: Channel[]
  contacts: Contact[]
}) {
  const [channels, setChannels] = useState(initialChannels)
  const [contacts, setContacts] = useState(initialContacts)
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelAssignment, setNewChannelAssignment] = useState('')
  const [newContactType, setNewContactType] = useState<typeof CONTACT_TYPES[number]>('hospital')
  const [newContactName, setNewContactName] = useState('')
  const [newContactPhone, setNewContactPhone] = useState('')
  const [newContactAddress, setNewContactAddress] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleAddChannel() {
    if (!newChannelName.trim()) return
    const res = await addRadioChannel(departmentId, newChannelName, newChannelAssignment)
    if (res?.error) { setError(res.error); return }
    setChannels(prev => [...prev, { id: crypto.randomUUID(), channel_name: newChannelName.trim(), assignment: newChannelAssignment.trim() || null, active: true }])
    setNewChannelName(''); setNewChannelAssignment('')
  }

  async function handleToggleChannel(id: string, active: boolean) {
    const res = await toggleRadioChannel(id, active)
    if (res?.error) { setError(res.error); return }
    setChannels(prev => prev.map(c => c.id === id ? { ...c, active } : c))
  }

  async function handleAddContact() {
    if (!newContactName.trim()) return
    const res = await addMedicalPlanContact(departmentId, newContactType, newContactName, newContactPhone, newContactAddress)
    if (res?.error) { setError(res.error); return }
    setContacts(prev => [...prev, { id: crypto.randomUUID(), contact_type: newContactType, name: newContactName.trim(), phone: newContactPhone.trim() || null, address: newContactAddress.trim() || null, active: true }])
    setNewContactName(''); setNewContactPhone(''); setNewContactAddress('')
  }

  async function handleToggleContact(id: string, active: boolean) {
    const res = await toggleMedicalPlanContact(id, active)
    if (res?.error) { setError(res.error); return }
    setContacts(prev => prev.map(c => c.id === id ? { ...c, active } : c))
  }

  return (
    <div className="max-w-2xl">
      <PageNavBar />
      <h1 className="text-xl font-bold text-zinc-900 mb-1">ICS Defaults</h1>
      <p className="text-sm text-zinc-500 mb-6">Copied into every new operational period when it's opened — edit per-incident from there without changing these defaults.</p>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-900 mb-3">ICS 205 — Radio Channels</h2>
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 divide-y divide-zinc-100 mb-3">
          {channels.length === 0 && <p className="px-4 py-4 text-sm text-zinc-400 text-center">No channels yet.</p>}
          {channels.map(c => (
            <div key={c.id} className={`flex items-center justify-between px-4 py-2.5 ${!c.active ? 'opacity-50' : ''}`}>
              <div>
                <span className="text-sm font-medium text-zinc-900">{c.channel_name}</span>
                {c.assignment && <span className="text-xs text-zinc-500 ml-2">{c.assignment}</span>}
              </div>
              <button type="button" onClick={() => handleToggleChannel(c.id, !c.active)}
                className={`text-xs ${c.active ? 'text-zinc-400 hover:text-red-600' : 'text-zinc-400 hover:text-green-600'}`}>
                {c.active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newChannelName} onChange={e => setNewChannelName(e.target.value)} placeholder="Channel (e.g. Tac 2)"
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
          <input value={newChannelAssignment} onChange={e => setNewChannelAssignment(e.target.value)} placeholder="Assignment (e.g. Command)"
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
          <button type="button" disabled={!newChannelName.trim()} onClick={handleAddChannel}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">Add</button>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-zinc-900 mb-3">ICS 206 — Medical Plan Contacts</h2>
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 divide-y divide-zinc-100 mb-3">
          {contacts.length === 0 && <p className="px-4 py-4 text-sm text-zinc-400 text-center">No contacts yet.</p>}
          {contacts.map(c => (
            <div key={c.id} className={`flex items-center justify-between px-4 py-2.5 ${!c.active ? 'opacity-50' : ''}`}>
              <div>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 mr-2">{c.contact_type.replace('_', ' ')}</span>
                <span className="text-sm font-medium text-zinc-900">{c.name}</span>
                {c.phone && <span className="text-xs text-zinc-500 ml-2">{c.phone}</span>}
              </div>
              <button type="button" onClick={() => handleToggleContact(c.id, !c.active)}
                className={`text-xs ${c.active ? 'text-zinc-400 hover:text-red-600' : 'text-zinc-400 hover:text-green-600'}`}>
                {c.active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select value={newContactType} onChange={e => setNewContactType(e.target.value as typeof CONTACT_TYPES[number])}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
            {CONTACT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
          <input value={newContactName} onChange={e => setNewContactName(e.target.value)} placeholder="Name"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="Phone"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
          <input value={newContactAddress} onChange={e => setNewContactAddress(e.target.value)} placeholder="Address"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
        </div>
        <button type="button" disabled={!newContactName.trim()} onClick={handleAddContact}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">Add Contact</button>
      </section>
    </div>
  )
}
