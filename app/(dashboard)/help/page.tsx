import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import HelpCenterClient from './HelpCenterClient'

const ROLE_RANK: Record<string, number> = { member: 0, officer: 1, admin: 2 }

export default async function HelpPage() {
  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')

  // Content-relevance filter, not a security gate — sys admin sees
  // everything, everyone else ranks off their department role.
  const roleRank = ctx.isSysAdmin ? 2 : (ROLE_RANK[ctx.systemRole ?? 'member'] ?? 0)

  return <HelpCenterClient roleRank={roleRank} />
}
