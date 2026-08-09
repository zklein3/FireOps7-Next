import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import {
  getPdContactTypes, getPdActionTakenTypes, getPdCaseNumberSettings,
  getPdContactTypeUsageCounts, getPdActionTakenUsageCounts, getPdCaseNumberCounter,
} from '@/app/actions/pd-contacts'
import PdListClient from './PdListClient'
import PdCaseNumberClient from './PdCaseNumberClient'

export default async function PoliceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const activeTab = tab === 'actions' ? 'actions' : tab === 'numbering' ? 'numbering' : 'types'

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (!ctx.departmentId) redirect('/dashboard')
  if (!(await hasPermission(ctx, 'manage_police_settings'))) redirect('/dashboard')

  const departmentId = ctx.departmentId
  const year = new Date().getFullYear()

  const [
    { items: contactTypesRaw },
    { items: actionTypesRaw },
    caseNumberSettings,
    contactTypeUsage,
    actionTypeUsage,
    currentSeq,
  ] = await Promise.all([
    getPdContactTypes(departmentId),
    getPdActionTakenTypes(departmentId),
    getPdCaseNumberSettings(departmentId),
    getPdContactTypeUsageCounts(departmentId),
    getPdActionTakenUsageCounts(departmentId),
    getPdCaseNumberCounter(departmentId, year),
  ])

  const contactTypes = contactTypesRaw.map(t => ({ ...t, usageCount: contactTypeUsage[t.label] ?? 0 }))
  const actionTypes = actionTypesRaw.map(a => ({ ...a, usageCount: actionTypeUsage[a.id] ?? 0 }))

  return (
    <div className="pt-20 px-4 pb-4 sm:pt-0 sm:p-6 lg:p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Police Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">Configure contact types, action-taken options, and case numbering for the Contact Log.</p>
      </div>

      <div className="flex border-b border-zinc-200 mb-6">
        <a
          href="/dept-admin/police?tab=types"
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'types' ? 'border-blue-700 text-blue-800' : 'border-transparent text-zinc-500 hover:text-zinc-700'
          }`}
        >
          Contact Types
        </a>
        <a
          href="/dept-admin/police?tab=actions"
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'actions' ? 'border-blue-700 text-blue-800' : 'border-transparent text-zinc-500 hover:text-zinc-700'
          }`}
        >
          Action Taken
        </a>
        <a
          href="/dept-admin/police?tab=numbering"
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'numbering' ? 'border-blue-700 text-blue-800' : 'border-transparent text-zinc-500 hover:text-zinc-700'
          }`}
        >
          Case Numbering
        </a>
      </div>

      {activeTab === 'types' && (
        <PdListClient
          listKind="contact-type"
          departmentId={departmentId}
          initialItems={contactTypes}
          title="Contact Types"
          description="Shown as the Contact Type dropdown on the Contact form. Reorder, rename, or deactivate as needed."
          addPlaceholder="New contact type..."
        />
      )}

      {activeTab === 'actions' && (
        <PdListClient
          listKind="action-type"
          departmentId={departmentId}
          initialItems={actionTypes}
          title="Action Taken"
          description="Officers can select multiple per contact. Reorder, rename, or deactivate as needed."
          addPlaceholder="New action taken option..."
        />
      )}

      {activeTab === 'numbering' && (
        <PdCaseNumberClient
          departmentId={departmentId}
          initialMode={caseNumberSettings.mode}
          initialPrefix={caseNumberSettings.prefix}
          year={year}
          currentSeq={currentSeq}
        />
      )}
    </div>
  )
}
