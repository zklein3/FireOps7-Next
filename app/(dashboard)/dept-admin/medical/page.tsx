import { redirect } from 'next/navigation'

export default function MedicalAdminPage() {
  redirect('/dept-admin/setup?tab=medical')
}
