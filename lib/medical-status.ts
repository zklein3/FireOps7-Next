export type MedicalSupplyStatus = 'expired' | 'expiring' | 'low' | 'good' | 'empty'

export const MEDICAL_STATUS_COLORS: Record<MedicalSupplyStatus, string> = {
  expired: 'bg-red-100 text-red-700',
  expiring: 'bg-amber-100 text-amber-700',
  low: 'bg-orange-100 text-orange-700',
  good: 'bg-green-100 text-green-700',
  empty: 'bg-zinc-100 text-zinc-500',
}

export const MEDICAL_STATUS_LABELS: Record<MedicalSupplyStatus, string> = {
  expired: 'Expired',
  expiring: 'Exp Soon',
  low: 'Below PAR',
  good: 'Good',
  empty: 'No Stock',
}

export function getMedicalSupplyStatus(
  total: number,
  par: number,
  lots: { expiration_date: string | null }[]
): MedicalSupplyStatus {
  if (total === 0) return 'empty'
  const now = new Date()
  const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  if (lots.some(l => l.expiration_date && new Date(l.expiration_date + 'T00:00:00') < now)) return 'expired'
  if (par > 0 && total < par) return 'low'
  if (lots.some(l => l.expiration_date && new Date(l.expiration_date + 'T00:00:00') <= soon)) return 'expiring'
  return 'good'
}
