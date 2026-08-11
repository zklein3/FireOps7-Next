'use client'

import { useState } from 'react'
import { saveDeptAdminNerisEntityId, testNerisConnection } from '@/app/actions/departments'
import HelpText from '@/components/HelpText'

const STEPS = [
  {
    num: 1,
    title: 'Create a NERIS Account',
    body: 'If your department does not yet have a NERIS account, register at neris.fsri.org. You will need your department name, FDID (Fire Department ID), address, and contact information.',
    link: { label: 'Go to neris.fsri.org →', href: 'https://neris.fsri.org' },
  },
  {
    num: 2,
    title: 'Complete Your Department Profile',
    body: 'After registering, finish setting up your department profile in the NERIS portal. NERIS will assign your department a unique Entity ID (e.g. FD12345678). You can find this on your department profile page.',
    link: null,
  },
  {
    num: 3,
    title: 'Enroll in the FireOps7 Integration',
    body: 'In the NERIS portal, go to Integrations in the left sidebar. Click "Request Enrollment" and search for FireOps7, or use the Client ID below to find the integration directly.',
    link: null,
    clientId: true,
  },
  {
    num: 4,
    title: 'Enter Your Entity ID Below',
    body: 'Once enrolled, return here and enter your NERIS Entity ID to connect your department. Use the Test Connection button to confirm everything is working.',
    link: null,
  },
]

export default function NerisSettingsClient({
  departmentId,
  nerisEntityId: initial,
  clientId,
}: {
  departmentId: string
  nerisEntityId: string | null
  clientId: string | null
}) {
  const [entityId, setEntityId] = useState(initial ?? '')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const isConnected = !!initial

  async function handleSave() {
    setSaving(true); setSaveError(null); setSaveSuccess(null); setTestResult(null)
    const result = await saveDeptAdminNerisEntityId(departmentId, entityId.trim())
    if (result?.error) setSaveError(result.error)
    else setSaveSuccess('Entity ID saved.')
    setSaving(false)
  }

  async function handleTest() {
    setTesting(true); setTestResult(null)
    const result = await testNerisConnection(entityId.trim())
    setTestResult({
      ok: result.ok,
      message: result.ok ? 'Connection verified — entity ID is recognized by NERIS.' : (result.error ?? 'Connection failed.'),
    })
    setTesting(false)
  }

  function handleCopy() {
    if (!clientId) return
    navigator.clipboard.writeText(clientId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">NERIS Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Connect your department to the National Emergency Response Information System for incident reporting.
        </p>
      </div>

      <HelpText className="mb-4">
        This connects your department's account, but doesn't submit anything by itself — individual incidents still
        need their own required fields completed and get submitted from the incident's own detail page.
      </HelpText>

      {/* Status banner */}
      {isConnected ? (
        <div className="mb-6 rounded-xl bg-green-50 border border-green-200 px-5 py-4 flex items-center gap-3">
          <span className="text-green-600 text-lg">✓</span>
          <div>
            <p className="text-sm font-semibold text-green-800">Connected to NERIS</p>
            <p className="text-xs text-green-600 mt-0.5 font-mono">{initial}</p>
          </div>
        </div>
      ) : (
        <div className="mb-6 rounded-xl bg-yellow-50 border border-yellow-200 px-5 py-4 flex items-center gap-3">
          <span className="text-yellow-500 text-lg">⚠</span>
          <div>
            <p className="text-sm font-semibold text-yellow-800">NERIS not connected</p>
            <p className="text-xs text-yellow-600 mt-0.5">Follow the steps below to set up your integration.</p>
          </div>
        </div>
      )}

      {/* Enrollment guide */}
      <div className="rounded-xl bg-white border border-zinc-200 shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-zinc-100">
          <h2 className="text-sm font-semibold text-zinc-900">
            {isConnected ? 'NERIS Setup Reference' : 'How to Get Started with NERIS'}
          </h2>
          {!isConnected && (
            <p className="text-xs text-zinc-500 mt-0.5">Complete these steps to connect your department.</p>
          )}
        </div>
        <div className="divide-y divide-zinc-100">
          {STEPS.map(step => (
            <div key={step.num} className="px-5 py-4 flex gap-4">
              <div className="shrink-0 w-7 h-7 rounded-full bg-red-700 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                {step.num}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900">{step.title}</p>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{step.body}</p>
                {step.link && (
                  <a
                    href={step.link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 text-xs font-semibold text-red-600 hover:text-red-800 transition-colors"
                  >
                    {step.link.label}
                  </a>
                )}
                {step.clientId && clientId && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="rounded-lg bg-zinc-100 border border-zinc-200 px-3 py-1.5 flex items-center gap-2">
                      <span className="text-xs text-zinc-500">Client ID:</span>
                      <span className="text-xs font-mono font-semibold text-zinc-900">{clientId}</span>
                    </div>
                    <button
                      onClick={handleCopy}
                      className="text-xs font-medium text-red-600 hover:text-red-800 transition-colors"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Entity ID + connection test */}
      <div className="rounded-xl bg-white border border-zinc-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-zinc-900 mb-1">Your NERIS Entity ID</h2>
        <p className="text-xs text-zinc-500 mb-4">
          Assigned by NERIS during department setup (e.g. FD12345678). Find it on your department profile at neris.fsri.org.
        </p>

        {saveError && (
          <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">{saveError}</div>
        )}
        {saveSuccess && (
          <div className="mb-3 rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-sm text-green-700">{saveSuccess}</div>
        )}
        {testResult && (
          <div className={`mb-3 rounded-lg border px-4 py-2.5 text-sm ${
            testResult.ok
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {testResult.message}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={entityId}
            onChange={e => setEntityId(e.target.value)}
            placeholder="e.g. FD12345678"
            className="w-48 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={handleTest}
            disabled={testing || !entityId.trim()}
            className="rounded-lg bg-white border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400 disabled:opacity-50 transition-colors"
          >
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
        </div>
      </div>
    </div>
  )
}
