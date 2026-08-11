import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import BackButton from '@/components/BackButton'
import ContactClient from './ContactClient'
import { getPdContactTypes, getPdActionTakenTypes, getPdCaseNumberSettings } from '@/app/actions/pd-contacts'

export default async function ContactFormPage() {
  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.selectionPending) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/dashboard')

  const isOfficerOrAbove = await hasPermission(ctx, 'manage_pd_logs')
  const department_id = ctx.departmentId

  const [
    { data: addressesRaw },
    { data: personsRaw },
    { data: contactsRaw },
    { items: contactTypesRaw },
    { items: actionTypesRaw },
    caseNumberSettings,
  ] = await Promise.all([
    adminClient.from('pd_addresses').select('id, address, city, state, zip').eq('department_id', department_id).order('address'),
    adminClient.from('pd_persons').select('id, first_name, last_name, dob, phone, address, city, state, zip, is_dangerous, danger_reason').eq('department_id', department_id).order('last_name'),
    adminClient
      .from('pd_contacts')
      .select('id, address_id, address, city, state, zip, location_detail, contact_date, contact_time, contact_type_id, narrative, report_number, officer_name, created_at')
      .eq('department_id', department_id)
      .order('contact_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
    getPdContactTypes(department_id),
    getPdActionTakenTypes(department_id),
    getPdCaseNumberSettings(department_id),
  ])

  const contactTypes = contactTypesRaw.filter(t => t.active)
  const actionTypes = actionTypesRaw.filter(a => a.active)

  const contactIds = (contactsRaw ?? []).map(c => c.id)
  const [{ data: contactPersonsRaw }, { data: contactActionsRaw }] = contactIds.length > 0
    ? await Promise.all([
        adminClient.from('pd_contact_persons').select('contact_id, person_id').in('contact_id', contactIds),
        adminClient.from('pd_contact_actions').select('contact_id, action_type_id').in('contact_id', contactIds),
      ])
    : [{ data: [] }, { data: [] }]

  return (
    <div className="max-w-2xl">
      <div className="mb-2">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Contact Log</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Field interviews and daytime contacts</p>
      </div>
      <div className="mb-5">
        <BackButton />
      </div>
      <ContactClient
        addresses={addressesRaw ?? []}
        persons={personsRaw ?? []}
        contacts={contactsRaw ?? []}
        contactPersons={contactPersonsRaw ?? []}
        contactActions={contactActionsRaw ?? []}
        contactTypes={contactTypes}
        actionTypes={actionTypes}
        caseNumberMode={caseNumberSettings.mode}
        isOfficerOrAbove={isOfficerOrAbove}
      />
    </div>
  )
}
