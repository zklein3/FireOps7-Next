import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentPath } from '@/lib/current-path'
import { redirect } from 'next/navigation'
import { getCurrentDepartmentContext } from '@/lib/current-department'
import { hasPermission } from '@/lib/permissions'
import PrintButton from '../training-signin/PrintButton'

const TX_LABELS: Record<string, string> = {
  received: 'Received',
  dispensed: 'Dispensed',
  administered: 'Administered',
  wasted: 'Wasted',
  transferred_out: 'Transfer Out',
  transferred_in: 'Transfer In',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default async function MedicalCSLogPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; storeroom_id?: string; supply_type_id?: string }>
}) {
  const { from, to, storeroom_id, supply_type_id } = await searchParams

  const adminClient = createAdminClient()

  const ctx = await getCurrentDepartmentContext()
  if (!ctx) redirect('/login')
  if (ctx.hasMultipleDepartments && !ctx.departmentId) redirect(`/select-department?next=${encodeURIComponent(await getCurrentPath())}`)
  if (!ctx.departmentId) redirect('/login')

  if (!(await hasPermission(ctx, 'manage_medical_inventory'))) redirect('/medical')

  const department_id = ctx.departmentId

  // Date range defaults — current month
  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()
  const fromDate = from ? new Date(from).toISOString() : defaultFrom
  const toDate = to ? new Date(to + 'T23:59:59').toISOString() : defaultTo

  // Dept info
  const { data: deptList } = await adminClient.from('departments').select('name').eq('id', department_id)
  const deptName = deptList?.[0]?.name ?? 'Department'

  // Storerooms for this dept
  const { data: storerooms } = await adminClient
    .from('medical_storerooms')
    .select('id, name')
    .eq('department_id', department_id)
    .eq('active', true)

  const storeroomIds = (storerooms ?? []).map(s => s.id)
  const storeroomMap = Object.fromEntries((storerooms ?? []).map(s => [s.id, s.name]))

  // Controlled supply type IDs for this dept
  const { data: csTypes } = await adminClient
    .from('medical_supply_types')
    .select('id, name')
    .eq('department_id', department_id)
    .eq('is_controlled', true)
    .eq('active', true)

  const csTypeIds = (csTypes ?? []).map(s => s.id)
  const supplyMap = Object.fromEntries((csTypes ?? []).map(s => [s.id, s.name]))

  if (csTypeIds.length === 0 || storeroomIds.length === 0) {
    return <p style={{ padding: '2rem', fontFamily: 'sans-serif' }}>No controlled substances configured.</p>
  }

  // Transactions — controlled supplies only, filtered by date + optional storeroom/supply
  let query = adminClient
    .from('medical_stock_transactions')
    .select('id, storeroom_id, supply_type_id, supply_type_name, lot_id, transaction_type, quantity, administered_amount, waste_amount, volume_unit, performed_by, signer_1_id, signer_1_signature_data, signer_2_id, signer_2_signature_data, notes, created_at')
    .in('storeroom_id', storeroomIds)
    .in('supply_type_id', csTypeIds)
    .gte('created_at', fromDate)
    .lte('created_at', toDate)
    .order('created_at', { ascending: true })

  if (storeroom_id) query = query.eq('storeroom_id', storeroom_id)
  if (supply_type_id) query = query.eq('supply_type_id', supply_type_id)

  const { data: transactions } = await query

  // Lot number lookup
  const lotIds = [...new Set((transactions ?? []).map(t => t.lot_id).filter(Boolean))] as string[]
  const { data: lots } = lotIds.length > 0
    ? await adminClient.from('medical_stock_lots').select('id, lot_number').in('id', lotIds)
    : { data: [] }
  const lotMap = Object.fromEntries((lots ?? []).map(l => [l.id, l.lot_number]))

  // Control number lookup — administered/wasted vials are tied to the transaction that
  // touched them; received vials aren't (a lot can receive many vials in one transaction),
  // so those fall back to every control number issued with that lot.
  const { data: units } = lotIds.length > 0
    ? await adminClient.from('medical_stock_units').select('lot_id, control_number, transaction_id').in('lot_id', lotIds)
    : { data: [] }
  const controlNumbersByTx: Record<string, string[]> = {}
  const controlNumbersByLot: Record<string, string[]> = {}
  for (const u of units ?? []) {
    if (u.transaction_id) { (controlNumbersByTx[u.transaction_id] ??= []).push(u.control_number) }
    (controlNumbersByLot[u.lot_id] ??= []).push(u.control_number)
  }

  // Personnel lookup
  const personnelIds = [...new Set([
    ...(transactions ?? []).map(t => t.performed_by),
    ...(transactions ?? []).map(t => t.signer_1_id),
    ...(transactions ?? []).map(t => t.signer_2_id),
  ].filter(Boolean))] as string[]
  const { data: personnelList } = personnelIds.length > 0
    ? await adminClient.from('personnel').select('id, first_name, last_name').in('id', personnelIds)
    : { data: [] }
  const personnelMap = Object.fromEntries(
    (personnelList ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`.trim()])
  )

  const fromLabel = new Date(fromDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const toLabel = new Date(toDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const filterStoreroomName = storeroom_id ? storeroomMap[storeroom_id] : null
  const filterSupplyName = supply_type_id ? supplyMap[supply_type_id] : null

  return (
    <>
      <style>{`
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
          @page { margin: 0.6in; size: letter portrait; }
        }
        body { font-family: 'Times New Roman', serif; font-size: 11pt; color: #000; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
        th { background: #f0f0f0; font-weight: bold; font-size: 10pt; }
        td { font-size: 10pt; }
      `}</style>

      <PrintButton jobName="Controlled Substance Log" />

      <div style={{ padding: '0.5in' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '0.25in' }}>
          <div style={{ fontSize: '16pt', fontWeight: 'bold' }}>{deptName}</div>
          <div style={{ fontSize: '13pt', fontWeight: 'bold', marginTop: '4px' }}>Controlled Substance Transaction Log</div>
          <div style={{ fontSize: '10pt', marginTop: '4px' }}>
            {fromLabel} — {toLabel}
            {filterStoreroomName && <span> · {filterStoreroomName}</span>}
            {filterSupplyName && <span> · {filterSupplyName}</span>}
          </div>
          <div style={{ fontSize: '9pt', color: '#555', marginTop: '2px' }}>
            Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </div>
        </div>

        {(transactions ?? []).length === 0 ? (
          <p style={{ textAlign: 'center', padding: '2rem', fontStyle: 'italic', color: '#555' }}>
            No controlled substance transactions found for this period.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: '12%' }}>Date / Time</th>
                <th style={{ width: '14%' }}>Supply</th>
                <th style={{ width: '7%' }}>Type</th>
                <th style={{ width: '6%' }}>Qty</th>
                <th style={{ width: '8%' }}>Lot #</th>
                <th style={{ width: '10%' }}>Control #</th>
                <th style={{ width: '11%' }}>Storeroom</th>
                <th style={{ width: '11%' }}>Performed By</th>
                <th style={{ width: '10%' }}>Signer 1</th>
                <th style={{ width: '11%' }}>Signer 2</th>
              </tr>
            </thead>
            <tbody>
              {(transactions ?? []).map(tx => (
                <tr key={tx.id}>
                  <td>{fmtDate(tx.created_at)}</td>
                  <td>{tx.supply_type_name ?? supplyMap[tx.supply_type_id] ?? '—'}</td>
                  <td>{TX_LABELS[tx.transaction_type] ?? tx.transaction_type}</td>
                  <td style={{ textAlign: 'center' }}>
                    {tx.transaction_type === 'administered'
                      ? `Given ${tx.administered_amount} / Waste ${tx.waste_amount} ${tx.volume_unit ?? ''}`
                      : tx.quantity}
                  </td>
                  <td>{tx.lot_id ? (lotMap[tx.lot_id] ?? 'No lot #') : '—'}</td>
                  <td>
                    {(controlNumbersByTx[tx.id] ?? (tx.lot_id ? controlNumbersByLot[tx.lot_id] : null))?.join(', ') || '—'}
                  </td>
                  <td>{storeroomMap[tx.storeroom_id] ?? '—'}</td>
                  <td>{tx.performed_by ? (personnelMap[tx.performed_by] ?? '—') : '—'}</td>
                  <td>
                    {tx.signer_1_id ? (personnelMap[tx.signer_1_id] ?? '—') : '—'}
                    {tx.signer_1_signature_data && (
                      <img src={tx.signer_1_signature_data} alt="Signature" style={{ display: 'block', maxHeight: '24px', maxWidth: '90px', marginTop: '2px' }} />
                    )}
                  </td>
                  <td>
                    {tx.signer_2_id ? (personnelMap[tx.signer_2_id] ?? '—') : '—'}
                    {tx.signer_2_signature_data && (
                      <img src={tx.signer_2_signature_data} alt="Signature" style={{ display: 'block', maxHeight: '24px', maxWidth: '90px', marginTop: '2px' }} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Signature lines */}
        <div style={{ marginTop: '0.4in', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4in' }}>
          <div>
            <div style={{ borderTop: '1px solid #000', paddingTop: '4px', fontSize: '9pt' }}>Officer Signature / Date</div>
          </div>
          <div>
            <div style={{ borderTop: '1px solid #000', paddingTop: '4px', fontSize: '9pt' }}>Witness Signature / Date</div>
          </div>
        </div>

        <div style={{ marginTop: '0.3in', fontSize: '8pt', color: '#555', textAlign: 'center' }}>
          Total transactions: {(transactions ?? []).length} · FireOps7
        </div>
      </div>
    </>
  )
}
