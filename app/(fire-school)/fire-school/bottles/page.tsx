import { createAdminClient } from '@/lib/supabase/admin'
import FireSchoolBottlesClient from './FireSchoolBottlesClient'

export default async function FireSchoolBottlesPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>
}) {
  const { add } = await searchParams
  const adminClient = createAdminClient()

  const { data: bottles } = await adminClient
    .from('fire_school_bottles')
    .select('*')
    .order('bottle_id')

  const { data: fillCounts } = await adminClient
    .from('fire_school_fill_logs')
    .select('bottle_id')

  // Count fills per bottle
  const countMap: Record<string, number> = {}
  for (const log of fillCounts ?? []) {
    countMap[log.bottle_id] = (countMap[log.bottle_id] ?? 0) + 1
  }

  return (
    <FireSchoolBottlesClient
      bottles={bottles ?? []}
      fillCounts={countMap}
      prefillBottleId={add ?? null}
    />
  )
}
