'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { dispenseStock, administerStock, wasteStock, transferStock } from '@/app/actions/medical'
import { administeredDoseToVolume } from '@/lib/medical-dose'
import { MEDICAL_STATUS_COLORS, MEDICAL_STATUS_LABELS, getMedicalSupplyStatus } from '@/lib/medical-status'
import SignatureCapture, { SignatureCaptureHandle } from '../../medical/SignatureCapture'

interface CompStoreroom { id: string; name: string; compartment_id: string; compartment_code: string; compartment_name: string | null }
interface InventoryRow { id: string; storeroom_id: string; supply_type_id: string; par_level: number }
interface Lot {
  id: string; storeroom_inventory_id: string; lot_number: string | null; expiration_date: string | null
  quantity_received: number; quantity_remaining: number; received_date: string
  concentration_amount: number | null; concentration_unit: string | null
  volume_per_unit: number | null; volume_unit: string | null
}
interface SupplyType { id: string; name: string; category: string; unit_of_measure: string; is_controlled: boolean; tracks_expiration: boolean; required_signatures: number }
interface Storeroom { id: string; name: string }
interface SrcLot { id: string; storeroom_inventory_id: string; lot_number: string | null; quantity_remaining: number; expiration_date: string | null }
interface ControlUnit { id: string; lot_id: string; control_number: string; status: string }
interface Personnel { id: string; name: string }

const STATUS_COLORS = MEDICAL_STATUS_COLORS
const STATUS_LABELS = MEDICAL_STATUS_LABELS
const WASTE_REASONS = ['Expired', 'Damaged', 'Contaminated', 'Administered / Used on Scene', 'Other']

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getStatus(total: number, par: number, lots: Lot[]) {
  return getMedicalSupplyStatus(total, par, lots)
}

export default function MedicalCompartmentsSection({
  compartmentStorerooms, compInventory, compLots, compSupplyTypes,
  deptStorerooms, srcInventory, srcLots, units, personnel,
  apparatusId, isAdmin, isOfficerOrAbove, myPersonnelId,
}: {
  compartmentStorerooms: CompStoreroom[]
  compInventory: InventoryRow[]
  compLots: Lot[]
  compSupplyTypes: SupplyType[]
  deptStorerooms: Storeroom[]
  srcInventory: { id: string; storeroom_id: string; supply_type_id: string }[]
  srcLots: SrcLot[]
  units: ControlUnit[]
  personnel: Personnel[]
  apparatusId: string
  isAdmin: boolean
  isOfficerOrAbove: boolean
  myPersonnelId: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Shared across the use/waste modals — only one is ever open at a time
  const signer1PadRef = useRef<SignatureCaptureHandle>(null)
  const signer2PadRef = useRef<SignatureCaptureHandle>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [expandedStoreroomId, setExpandedStoreroomId] = useState<string | null>(compartmentStorerooms[0]?.id ?? null)
  const [expandedInvId, setExpandedInvId] = useState<string | null>(null)

  type UseForm = {
    invId: string; lotId: string; supplyName: string; unitOfMeasure: string
    isControlled: boolean; requiredSigs: number; quantity: string; notes: string
    signer1Id: string; signer2Id: string
  }
  type WasteForm = {
    invId: string; lotId: string; supplyName: string; unitOfMeasure: string
    isControlled: boolean; requiredSigs: number; lotNumber: string | null
    maxQty: number; quantity: string; wasteReason: string; notes: string
    signer1Id: string; signer2Id: string
    availableUnits: ControlUnit[]; selectedUnitIds: string[]
  }
  type AdministerForm = {
    invId: string; unitId: string; availableUnits: ControlUnit[]
    volumePerUnit: number; volumeUnit: string
    concentrationAmount: number | null; doseUnit: string | null
    requiredSigs: number; lotQuantityRemaining: number
    administeredAmount: string; supplyName: string; notes: string
    signer1Id: string; signer2Id: string
  }
  type RestockForm = {
    destInvId: string; supplyTypeId: string; supplyName: string; unitOfMeasure: string
    isControlled: boolean; destStoreroomId: string; srcInvId: string; srcLotId: string
    quantity: string; notes: string
  }
  type TransferOutForm = {
    srcInvId: string; supplyTypeId: string; supplyName: string; unitOfMeasure: string
    isControlled: boolean; srcLotId: string; destStoreroomId: string
    maxQty: number; quantity: string; notes: string
  }

  const [useForm, setUseForm] = useState<UseForm | null>(null)
  const [wasteForm, setWasteForm] = useState<WasteForm | null>(null)
  const [restockForm, setRestockForm] = useState<RestockForm | null>(null)
  const [transferOutForm, setTransferOutForm] = useState<TransferOutForm | null>(null)
  const [administerForm, setAdministerForm] = useState<AdministerForm | null>(null)

  const supplyMap = Object.fromEntries(compSupplyTypes.map(s => [s.id, s]))
  const lotsFor = (invId: string) => compLots.filter(l => l.storeroom_inventory_id === invId)
  const totalQty = (invId: string) => lotsFor(invId).reduce((s, l) => s + l.quantity_remaining, 0)

  function openUse(inv: InventoryRow) {
    const supply = supplyMap[inv.supply_type_id]; if (!supply) return
    const activeLots = lotsFor(inv.id)
    if (activeLots.length === 0) { setError('No stock available.'); return }
    const oldest = [...activeLots].sort((a, b) => a.received_date.localeCompare(b.received_date))[0]
    setError(null)
    setUseForm({
      invId: inv.id, lotId: oldest.id, supplyName: supply.name, unitOfMeasure: supply.unit_of_measure,
      isControlled: supply.is_controlled, requiredSigs: supply.required_signatures,
      quantity: '1', notes: '',
      signer1Id: supply.required_signatures >= 1 ? myPersonnelId : '',
      signer2Id: '',
    })
  }

  function openWaste(inv: InventoryRow, lot: Lot) {
    const supply = supplyMap[inv.supply_type_id]; if (!supply) return
    setError(null)
    const availableUnits = units.filter(u => u.lot_id === lot.id && u.status === 'available')
    setWasteForm({
      invId: inv.id, lotId: lot.id, supplyName: supply.name, unitOfMeasure: supply.unit_of_measure,
      isControlled: supply.is_controlled, requiredSigs: supply.required_signatures,
      lotNumber: lot.lot_number, maxQty: lot.quantity_remaining,
      quantity: supply.is_controlled ? '0' : String(lot.quantity_remaining),
      wasteReason: WASTE_REASONS[0], notes: '',
      signer1Id: supply.required_signatures >= 1 ? myPersonnelId : '',
      signer2Id: '', availableUnits, selectedUnitIds: [],
    })
  }

  function toggleWasteUnit(unitId: string) {
    setWasteForm(f => {
      if (!f) return f
      const selected = f.selectedUnitIds.includes(unitId)
        ? f.selectedUnitIds.filter(id => id !== unitId)
        : [...f.selectedUnitIds, unitId]
      return { ...f, selectedUnitIds: selected, quantity: String(selected.length) }
    })
  }

  function openAdminister(inv: InventoryRow) {
    const supply = supplyMap[inv.supply_type_id]; if (!supply) return
    const activeLotIds = new Set(lotsFor(inv.id).filter(l => l.quantity_remaining > 0 && l.volume_per_unit).map(l => l.id))
    const availableUnits = units.filter(u => activeLotIds.has(u.lot_id) && u.status === 'available')
    if (availableUnits.length === 0) { setError('No vials available to administer. Receive/transfer stock (with volume per vial set) first.'); return }
    setError(null)
    setAdministerForm({
      invId: inv.id, unitId: '', availableUnits,
      volumePerUnit: 0, volumeUnit: '', concentrationAmount: null, doseUnit: null,
      requiredSigs: supply.required_signatures, lotQuantityRemaining: 0,
      administeredAmount: '', supplyName: supply.name, notes: '',
      signer1Id: supply.required_signatures >= 1 ? myPersonnelId : '', signer2Id: '',
    })
  }

  function selectAdministerUnit(unitId: string) {
    setAdministerForm(f => {
      if (!f) return f
      const unit = f.availableUnits.find(u => u.id === unitId)
      const lot = unit ? compLots.find(l => l.id === unit.lot_id) : null
      if (!unit || !lot || !lot.volume_per_unit) return { ...f, unitId: '' }
      const doseUnit = lot.concentration_amount && lot.concentration_unit
        ? lot.concentration_unit.split('/')[0].trim() || null
        : null
      return {
        ...f, unitId, volumePerUnit: lot.volume_per_unit, volumeUnit: lot.volume_unit ?? '',
        concentrationAmount: lot.concentration_amount, doseUnit,
        lotQuantityRemaining: lot.quantity_remaining, administeredAmount: '',
      }
    })
  }

  async function handleAdministerSubmit() {
    if (!administerForm) return
    if (!administerForm.unitId) { setError('Select which vial is being administered.'); return }
    const entered = parseFloat(administerForm.administeredAmount)
    if (!entered || entered <= 0) { setError('Enter the amount administered.'); return }
    const administered = Math.round(administeredDoseToVolume(administerForm, entered) * 1000) / 1000
    if (administered > administerForm.volumePerUnit) {
      const maxDose = administerForm.doseUnit && administerForm.concentrationAmount
        ? `${Math.round(administerForm.volumePerUnit * administerForm.concentrationAmount * 1000) / 1000} ${administerForm.doseUnit}`
        : `${administerForm.volumePerUnit} ${administerForm.volumeUnit}`
      setError(`Cannot exceed ${maxDose} per vial.`)
      return
    }
    if (administerForm.requiredSigs >= 1 && !administerForm.signer1Id) { setError('Signer 1 is required.'); return }
    const signer1Signature = signer1PadRef.current?.getDataUrl() ?? null
    if (administerForm.requiredSigs >= 1 && !signer1Signature) { setError('Signer 1 must sign.'); return }
    if (administerForm.requiredSigs >= 2 && !administerForm.signer2Id) { setError('A witness is required for controlled substance administration.'); return }
    const signer2Signature = signer2PadRef.current?.getDataUrl() ?? null
    if (administerForm.requiredSigs >= 2 && !signer2Signature) { setError('The witness must sign.'); return }
    setError(null); setLoading(true)
    const r = await administerStock({
      storeroom_inventory_id: administerForm.invId, unit_id: administerForm.unitId,
      administered_amount: administered, notes: administerForm.notes || null,
      signer_1_id: administerForm.signer1Id || null, signer_2_id: administerForm.signer2Id || null,
      signer_1_signature: signer1Signature, signer_2_signature: signer2Signature,
    })
    if (r?.error) setError(r.error)
    else {
      const givenLabel = administerForm.doseUnit ? `${entered} ${administerForm.doseUnit}` : `${administered} ${administerForm.volumeUnit}`
      setSuccess(`Administered ${givenLabel} of ${administerForm.supplyName}.`)
      setAdministerForm(null)
      router.refresh()
    }
    setLoading(false)
  }

  function openRestock(inv: InventoryRow) {
    const supply = supplyMap[inv.supply_type_id]; if (!supply) return
    const srcInvRows = srcInventory.filter(i => i.supply_type_id === inv.supply_type_id)
    const availableLots = srcLots.filter(l => srcInvRows.some(i => i.id === l.storeroom_inventory_id) && l.quantity_remaining > 0)
    if (availableLots.length === 0) { setError('No stock available in any storeroom for this supply.'); return }
    const firstLot = availableLots[0]
    const firstSrcInv = srcInvRows.find(i => i.id === firstLot.storeroom_inventory_id)
    setError(null)
    setRestockForm({
      destInvId: inv.id, supplyTypeId: inv.supply_type_id, supplyName: supply.name,
      unitOfMeasure: supply.unit_of_measure, isControlled: supply.is_controlled,
      destStoreroomId: inv.storeroom_id,
      srcInvId: firstSrcInv?.id ?? '',
      srcLotId: firstLot.id,
      quantity: '1', notes: '',
    })
  }

  function openTransferOut(inv: InventoryRow) {
    const supply = supplyMap[inv.supply_type_id]; if (!supply) return
    const activeLots = lotsFor(inv.id).filter(l => l.quantity_remaining > 0)
    if (activeLots.length === 0) { setError('No stock available to transfer.'); return }
    const oldest = [...activeLots].sort((a, b) => a.received_date.localeCompare(b.received_date))[0]
    const validDests = deptStorerooms.filter(s => srcInventory.some(i => i.storeroom_id === s.id && i.supply_type_id === inv.supply_type_id))
    if (validDests.length === 0) { setError('No storeroom has this supply type assigned — transfer cannot be completed.'); return }
    setError(null)
    setTransferOutForm({
      srcInvId: inv.id, supplyTypeId: inv.supply_type_id, supplyName: supply.name,
      unitOfMeasure: supply.unit_of_measure, isControlled: supply.is_controlled,
      srcLotId: oldest.id, destStoreroomId: validDests[0].id,
      maxQty: oldest.quantity_remaining, quantity: '1', notes: '',
    })
  }

  async function handleUseSubmit() {
    if (!useForm) return
    const qty = parseInt(useForm.quantity)
    if (!qty || qty < 1) { setError('Quantity must be at least 1.'); return }
    if (useForm.requiredSigs >= 1 && !useForm.signer1Id) { setError('Signer 1 is required.'); return }
    const signer1Signature = signer1PadRef.current?.getDataUrl() ?? null
    if (useForm.requiredSigs >= 1 && !signer1Signature) { setError('Signer 1 must sign.'); return }
    if (useForm.requiredSigs >= 2 && !useForm.signer2Id) { setError('A second signer is required for controlled substances.'); return }
    const signer2Signature = signer2PadRef.current?.getDataUrl() ?? null
    if (useForm.requiredSigs >= 2 && !signer2Signature) { setError('The second signer must sign.'); return }
    setError(null); setLoading(true)
    const r = await dispenseStock({
      storeroom_inventory_id: useForm.invId, lot_id: useForm.lotId, quantity: qty,
      notes: useForm.notes || null, signer_1_id: useForm.signer1Id || null, signer_2_id: useForm.signer2Id || null,
      signer_1_signature: signer1Signature, signer_2_signature: signer2Signature,
    })
    if (r?.error) setError(r.error)
    else { setSuccess(`Used ${qty} ${useForm.unitOfMeasure} of ${useForm.supplyName}.`); setUseForm(null); router.refresh() }
    setLoading(false)
  }

  async function handleWasteSubmit() {
    if (!wasteForm) return
    const qty = parseInt(wasteForm.quantity)
    if (!qty || qty < 1) { setError(wasteForm.isControlled ? 'Select which vials are being wasted.' : 'Quantity must be at least 1.'); return }
    if (qty > wasteForm.maxQty) { setError(`Only ${wasteForm.maxQty} available in this lot.`); return }
    if (!wasteForm.wasteReason) { setError('Waste reason is required.'); return }
    if (wasteForm.requiredSigs >= 1 && !wasteForm.signer1Id) { setError('Signer 1 is required.'); return }
    const signer1Signature = signer1PadRef.current?.getDataUrl() ?? null
    if (wasteForm.requiredSigs >= 1 && !signer1Signature) { setError('Signer 1 must sign.'); return }
    if (wasteForm.requiredSigs >= 2 && !wasteForm.signer2Id) { setError('A witness is required for controlled substance waste.'); return }
    const signer2Signature = signer2PadRef.current?.getDataUrl() ?? null
    if (wasteForm.requiredSigs >= 2 && !signer2Signature) { setError('The witness must sign.'); return }
    setError(null); setLoading(true)
    const r = await wasteStock({
      storeroom_inventory_id: wasteForm.invId, lot_id: wasteForm.lotId, quantity: qty,
      unit_ids: wasteForm.isControlled ? wasteForm.selectedUnitIds : null,
      waste_reason: wasteForm.wasteReason, notes: wasteForm.notes || null,
      signer_1_id: wasteForm.signer1Id || null, signer_2_id: wasteForm.signer2Id || null,
      signer_1_signature: signer1Signature, signer_2_signature: signer2Signature,
    })
    if (r?.error) setError(r.error)
    else { setSuccess(`Wasted ${qty} ${wasteForm.unitOfMeasure} of ${wasteForm.supplyName}.`); setWasteForm(null); router.refresh() }
    setLoading(false)
  }

  async function handleRestockSubmit() {
    if (!restockForm) return
    const qty = parseInt(restockForm.quantity)
    if (!qty || qty < 1) { setError('Quantity must be at least 1.'); return }
    setError(null); setLoading(true)
    const r = await transferStock({
      source_inventory_id: restockForm.srcInvId,
      lot_id: restockForm.srcLotId,
      destination_storeroom_id: restockForm.destStoreroomId,
      quantity: qty,
      notes: restockForm.notes || null,
    })
    if (r?.error) setError(r.error)
    else { setSuccess(`Restocked ${qty} ${restockForm.unitOfMeasure} of ${restockForm.supplyName} from storeroom.`); setRestockForm(null); router.refresh() }
    setLoading(false)
  }

  async function handleTransferOutSubmit() {
    if (!transferOutForm) return
    const qty = parseInt(transferOutForm.quantity)
    if (!qty || qty < 1) { setError('Quantity must be at least 1.'); return }
    if (qty > transferOutForm.maxQty) { setError(`Only ${transferOutForm.maxQty} available in this lot.`); return }
    if (!transferOutForm.destStoreroomId) { setError('Select a destination storeroom.'); return }
    setError(null); setLoading(true)
    const r = await transferStock({
      source_inventory_id: transferOutForm.srcInvId,
      lot_id: transferOutForm.srcLotId,
      destination_storeroom_id: transferOutForm.destStoreroomId,
      quantity: qty,
      notes: transferOutForm.notes || null,
    })
    if (r?.error) setError(r.error)
    else { setSuccess(`Transferred ${qty} ${transferOutForm.unitOfMeasure} of ${transferOutForm.supplyName} to storeroom.`); setTransferOutForm(null); router.refresh() }
    setLoading(false)
  }

  function handleRestockSrcChange(srcInvId: string) {
    if (!restockForm) return
    const lot = srcLots.find(l => l.storeroom_inventory_id === srcInvId && l.quantity_remaining > 0)
    setRestockForm(f => f ? { ...f, srcInvId, srcLotId: lot?.id ?? '' } : f)
  }

  function handleTransferOutLotChange(lotId: string) {
    if (!transferOutForm) return
    const lot = compLots.find(l => l.id === lotId)
    setTransferOutForm(f => f ? { ...f, srcLotId: lotId, maxQty: lot?.quantity_remaining ?? 0 } : f)
  }

  const inputCls = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
  const signerSelect = (val: string, onChange: (v: string) => void, label: string, padRef: React.RefObject<SignatureCaptureHandle | null>, padLabel: string) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-700">{label}</label>
      <select value={val} onChange={e => onChange(e.target.value)} className={inputCls}>
        <option value="">Select person…</option>
        {personnel.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <div className="mt-2"><SignatureCapture ref={padRef} label={padLabel} /></div>
    </div>
  )

  return (
    <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-5 mb-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-zinc-900">Compartment Medical Supplies</h2>
        {isAdmin && (
          <a href="/dept-admin/medical" className="text-xs font-semibold text-zinc-400 hover:text-zinc-700">Manage →</a>
        )}
      </div>

      {success && <div className="mb-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-200">{success}</div>}
      {error && <div className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}

      {/* Compartment tabs */}
      {compartmentStorerooms.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {compartmentStorerooms.map(cs => (
            <button key={cs.id} onClick={() => setExpandedStoreroomId(cs.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors ${expandedStoreroomId === cs.id ? 'bg-red-700 text-white border-red-700' : 'bg-white text-zinc-600 border-zinc-200 hover:border-red-300'}`}>
              {cs.compartment_code}{cs.compartment_name ? ` — ${cs.compartment_name}` : ''}
            </button>
          ))}
        </div>
      )}

      {compartmentStorerooms.map(cs => {
        if (compartmentStorerooms.length > 1 && expandedStoreroomId !== cs.id) return null
        const inv = compInventory.filter(i => i.storeroom_id === cs.id)
        return (
          <div key={cs.id}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-zinc-700">
                {cs.compartment_code}{cs.compartment_name ? ` — ${cs.compartment_name}` : ''}
              </span>
              <span className="text-xs text-zinc-400">{cs.name}</span>
            </div>

            {inv.length === 0 ? (
              <p className="text-sm text-zinc-400 py-4 text-center">
                No supplies assigned to this compartment.
                {isAdmin && <span> <a href="/dept-admin/medical" className="text-red-600 hover:underline">Configure →</a></span>}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {inv.map(item => {
                  const supply = supplyMap[item.supply_type_id]
                  if (!supply) return null
                  const lots = lotsFor(item.id)
                  const total = totalQty(item.id)
                  const status = getStatus(total, item.par_level, lots)
                  const isExpanded = expandedInvId === item.id
                  const canAct = isOfficerOrAbove || !supply.is_controlled
                  const srcAvailable = srcLots.some(l =>
                    srcInventory.find(i => i.id === l.storeroom_inventory_id && i.supply_type_id === item.supply_type_id) && l.quantity_remaining > 0
                  )
                  const destAvailable = deptStorerooms.some(s => srcInventory.some(i => i.storeroom_id === s.id && i.supply_type_id === item.supply_type_id))

                  return (
                    <div key={item.id} className="rounded-xl border border-zinc-200 overflow-hidden">
                      <div className="flex items-center px-4 py-3 gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <p className="text-sm font-semibold text-zinc-900">{supply.name}</p>
                            {supply.is_controlled && <span className="text-xs rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 font-medium">Controlled</span>}
                            <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[status]}`}>{STATUS_LABELS[status]}</span>
                          </div>
                          <p className="text-xs text-zinc-400">{total} {supply.unit_of_measure} · PAR {item.par_level}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {lots.length > 0 && (
                            <button onClick={() => setExpandedInvId(isExpanded ? null : item.id)} className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                              {isExpanded ? 'Hide' : 'Lots'}
                            </button>
                          )}
                          {canAct && srcAvailable && (
                            <button onClick={() => openRestock(item)}
                              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${(status === 'low' || status === 'empty') ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50'}`}>
                              Restock
                            </button>
                          )}
                          {canAct && total > 0 && destAvailable && (
                            <button onClick={() => openTransferOut(item)}
                              className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
                              Transfer
                            </button>
                          )}
                          <button onClick={() => supply.is_controlled ? openAdminister(item) : openUse(item)} disabled={total === 0}
                            className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed">
                            {supply.is_controlled ? 'Administer' : 'Use'}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3">
                          <div className="flex flex-col gap-1.5">
                            {lots.map(lot => {
                              const now = new Date()
                              const expDate = lot.expiration_date ? new Date(lot.expiration_date + 'T00:00:00') : null
                              const expired = expDate && expDate < now
                              const expiring = expDate && !expired && expDate <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
                              return (
                                <div key={lot.id} className="flex items-center justify-between bg-white rounded-lg border border-zinc-200 px-4 py-2.5 gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-zinc-900">{lot.lot_number ? `Lot ${lot.lot_number}` : 'No lot #'}</p>
                                    <p className="text-xs text-zinc-400">Received {fmtDate(lot.received_date)}</p>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0 text-right">
                                    {supply.tracks_expiration && (
                                      <p className={`text-xs font-semibold ${expired ? 'text-red-600' : expiring ? 'text-amber-600' : 'text-zinc-500'}`}>
                                        {expired ? '⚠ Exp' : expiring ? '⚠ Exp soon' : 'Exp'} {fmtDate(lot.expiration_date)}
                                      </p>
                                    )}
                                    <div className="text-right">
                                      <p className="text-lg font-bold text-zinc-900">{lot.quantity_remaining}</p>
                                      <p className="text-xs text-zinc-400">{supply.unit_of_measure}</p>
                                    </div>
                                    {isOfficerOrAbove && (
                                      <button onClick={() => openWaste(item, lot)}
                                        className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">
                                        Waste
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Use Modal */}
      {useForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8">
          <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-xl p-6">
            <h2 className="text-base font-bold text-zinc-900 mb-1">Use Supply</h2>
            <p className="text-sm text-zinc-500 mb-5">{useForm.supplyName}</p>
            {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Quantity <span className="text-red-500">*</span></label>
                <input type="number" min="1" value={useForm.quantity}
                  onChange={e => setUseForm(f => f ? { ...f, quantity: e.target.value } : f)}
                  className={inputCls} />
              </div>
              {useForm.requiredSigs >= 1 && signerSelect(useForm.signer1Id, v => setUseForm(f => f ? { ...f, signer1Id: v } : f), 'Signer 1 *', signer1PadRef, 'Signer 1 Signature')}
              {useForm.requiredSigs >= 2 && signerSelect(useForm.signer2Id, v => setUseForm(f => f ? { ...f, signer2Id: v } : f), 'Signer 2 *', signer2PadRef, 'Signer 2 Signature')}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Notes</label>
                <input type="text" value={useForm.notes} placeholder="Optional"
                  onChange={e => setUseForm(f => f ? { ...f, notes: e.target.value } : f)} className={inputCls} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleUseSubmit} disabled={loading}
                className="flex-1 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                {loading ? 'Saving…' : 'Confirm Use'}
              </button>
              <button onClick={() => { setUseForm(null); setError(null) }}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Administer Modal (controlled substances) */}
      {administerForm && (() => {
        const entryUnit = administerForm.doseUnit ?? administerForm.volumeUnit
        const maxEntry = administerForm.doseUnit && administerForm.concentrationAmount
          ? Math.round(administerForm.volumePerUnit * administerForm.concentrationAmount * 1000) / 1000
          : administerForm.volumePerUnit
        const entered = administerForm.administeredAmount.trim()
        const enteredNum = parseFloat(entered)
        const hasEntry = entered !== '' && !isNaN(enteredNum)
        const volumeGiven = hasEntry ? administeredDoseToVolume(administerForm, enteredNum) : null
        const validAmount = !!administerForm.unitId && volumeGiven !== null && enteredNum > 0 && volumeGiven <= administerForm.volumePerUnit + 0.0001
        const amountHint = hasEntry && !validAmount
          ? (enteredNum <= 0 ? 'Enter an amount greater than 0.' : `Cannot exceed ${maxEntry} ${entryUnit} per vial.`)
          : null
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8">
            <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-xl p-6">
              <h2 className="text-base font-bold text-zinc-900 mb-1">Administer</h2>
              <p className="text-sm text-zinc-500 mb-5">
                {administerForm.supplyName}
                <span className="ml-2 text-xs rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 font-medium">Controlled</span>
              </p>
              {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">Vial (Control #) <span className="text-red-500">*</span></label>
                  <select value={administerForm.unitId} onChange={e => selectAdministerUnit(e.target.value)} className={inputCls}>
                    <option value="">Select the vial in hand...</option>
                    {administerForm.availableUnits.map(u => {
                      const unitLot = compLots.find(l => l.id === u.lot_id)
                      return (
                        <option key={u.id} value={u.id}>
                          {u.control_number}{unitLot?.lot_number ? ` — Lot ${unitLot.lot_number}` : ''}{unitLot?.expiration_date ? ` (Exp ${fmtDate(unitLot.expiration_date)})` : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>
                {administerForm.unitId && (
                  <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700">
                    This vial: {administerForm.doseUnit ? `${maxEntry} ${administerForm.doseUnit} (${administerForm.volumePerUnit} ${administerForm.volumeUnit})` : `${administerForm.volumePerUnit} ${administerForm.volumeUnit}`} · {administerForm.lotQuantityRemaining} vial{administerForm.lotQuantityRemaining === 1 ? '' : 's'} remaining in lot
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">Amount Administered <span className="text-red-500">*</span></label>
                  <div className="flex items-center gap-2">
                    <input type="number" step="any" min="0" max={maxEntry} value={administerForm.administeredAmount}
                      disabled={!administerForm.unitId}
                      onChange={e => setAdministerForm(f => f ? { ...f, administeredAmount: e.target.value } : f)}
                      className={`${inputCls} text-center disabled:bg-zinc-50 disabled:text-zinc-400`} />
                    <span className="text-sm text-zinc-500 shrink-0">{entryUnit}</span>
                  </div>
                  {amountHint && <p className="mt-1 text-xs text-red-600">{amountHint}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">Notes</label>
                  <input type="text" value={administerForm.notes} placeholder="Optional — e.g. patient/run reference"
                    onChange={e => setAdministerForm(f => f ? { ...f, notes: e.target.value } : f)} className={inputCls} />
                </div>
                {administerForm.requiredSigs >= 1 && signerSelect(administerForm.signer1Id, v => setAdministerForm(f => f ? { ...f, signer1Id: v } : f), 'Administered By *', signer1PadRef, 'Signer 1 Signature')}
                {administerForm.requiredSigs >= 2 && signerSelect(administerForm.signer2Id, v => setAdministerForm(f => f ? { ...f, signer2Id: v } : f), 'Witness *', signer2PadRef, 'Witness Signature')}
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={handleAdministerSubmit} disabled={loading || !validAmount}
                  className="flex-1 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                  {loading ? 'Saving…' : 'Confirm Administration'}
                </button>
                <button onClick={() => { setAdministerForm(null); setError(null) }}
                  className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Waste Modal */}
      {wasteForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8">
          <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-xl p-6">
            <h2 className="text-base font-bold text-zinc-900 mb-1">Waste / Dispose</h2>
            <p className="text-sm text-zinc-500 mb-5">
              {wasteForm.supplyName}
              {wasteForm.lotNumber && <span className="ml-1 text-zinc-400">· Lot {wasteForm.lotNumber}</span>}
            </p>
            {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Reason <span className="text-red-500">*</span></label>
                <select value={wasteForm.wasteReason} onChange={e => setWasteForm(f => f ? { ...f, wasteReason: e.target.value } : f)} className={inputCls}>
                  {WASTE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {wasteForm.isControlled ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">
                    Vials to Waste <span className="text-red-500">*</span>
                    <span className="ml-1 text-zinc-400 font-normal">({wasteForm.selectedUnitIds.length} selected)</span>
                  </label>
                  <div className="flex flex-col gap-1 max-h-40 overflow-y-auto rounded-lg border border-zinc-200 p-2">
                    {wasteForm.availableUnits.length === 0 && (
                      <p className="text-xs text-zinc-400 px-1 py-1">No vials on file for this lot.</p>
                    )}
                    {wasteForm.availableUnits.map(u => (
                      <label key={u.id} className="flex items-center gap-2 px-1 py-1 text-sm text-zinc-700 hover:bg-zinc-50 rounded cursor-pointer">
                        <input type="checkbox" checked={wasteForm.selectedUnitIds.includes(u.id)}
                          onChange={() => toggleWasteUnit(u.id)} />
                        {u.control_number}
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">
                    Quantity <span className="text-red-500">*</span>
                    <span className="ml-1 text-zinc-400 font-normal">({wasteForm.maxQty} available)</span>
                  </label>
                  <input type="number" min="1" max={wasteForm.maxQty} value={wasteForm.quantity}
                    onChange={e => setWasteForm(f => f ? { ...f, quantity: e.target.value } : f)} className={inputCls} />
                </div>
              )}
              {wasteForm.requiredSigs >= 1 && signerSelect(wasteForm.signer1Id, v => setWasteForm(f => f ? { ...f, signer1Id: v } : f), 'Witness 1 *', signer1PadRef, 'Witness 1 Signature')}
              {wasteForm.requiredSigs >= 2 && signerSelect(wasteForm.signer2Id, v => setWasteForm(f => f ? { ...f, signer2Id: v } : f), 'Witness 2 *', signer2PadRef, 'Witness 2 Signature')}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Notes</label>
                <input type="text" value={wasteForm.notes} placeholder="Optional"
                  onChange={e => setWasteForm(f => f ? { ...f, notes: e.target.value } : f)} className={inputCls} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleWasteSubmit} disabled={loading}
                className="flex-1 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                {loading ? 'Saving…' : 'Confirm Waste'}
              </button>
              <button onClick={() => { setWasteForm(null); setError(null) }}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restock Modal */}
      {restockForm && (() => {
        const srcInvForType = srcInventory.filter(i => i.supply_type_id === restockForm.supplyTypeId)
        const srcInvWithLots = srcInvForType.filter(i => srcLots.some(l => l.storeroom_inventory_id === i.id && l.quantity_remaining > 0))
        const lotsForSrcInv = srcLots.filter(l => l.storeroom_inventory_id === restockForm.srcInvId && l.quantity_remaining > 0)
        const selectedLot = srcLots.find(l => l.id === restockForm.srcLotId)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8">
            <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-xl p-6">
              <h2 className="text-base font-bold text-zinc-900 mb-1">Restock from Storeroom</h2>
              <p className="text-sm text-zinc-500 mb-5">{restockForm.supplyName}</p>
              {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">Source Storeroom <span className="text-red-500">*</span></label>
                  <select value={restockForm.srcInvId} onChange={e => handleRestockSrcChange(e.target.value)} className={inputCls}>
                    {srcInvWithLots.map(i => {
                      const room = deptStorerooms.find(s => s.id === i.storeroom_id)
                      return <option key={i.id} value={i.id}>{room?.name ?? 'Storeroom'}</option>
                    })}
                  </select>
                </div>
                {lotsForSrcInv.length > 1 && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700">Lot</label>
                    <select value={restockForm.srcLotId} onChange={e => setRestockForm(f => f ? { ...f, srcLotId: e.target.value } : f)} className={inputCls}>
                      {lotsForSrcInv.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.lot_number ? `Lot ${l.lot_number}` : 'No lot #'} · {l.quantity_remaining} available
                          {l.expiration_date ? ` · Exp ${fmtDate(l.expiration_date)}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">
                    Quantity <span className="text-red-500">*</span>
                    {selectedLot && <span className="ml-1 text-zinc-400 font-normal">({selectedLot.quantity_remaining} available)</span>}
                  </label>
                  <input type="number" min="1" max={selectedLot?.quantity_remaining ?? undefined} value={restockForm.quantity}
                    onChange={e => setRestockForm(f => f ? { ...f, quantity: e.target.value } : f)} className={inputCls} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">Notes</label>
                  <input type="text" value={restockForm.notes} placeholder="Optional"
                    onChange={e => setRestockForm(f => f ? { ...f, notes: e.target.value } : f)} className={inputCls} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={handleRestockSubmit} disabled={loading || !restockForm.srcLotId}
                  className="flex-1 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                  {loading ? 'Saving…' : 'Confirm Restock'}
                </button>
                <button onClick={() => { setRestockForm(null); setError(null) }}
                  className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Transfer Out Modal */}
      {transferOutForm && (() => {
        const activeLots = compLots.filter(l => l.storeroom_inventory_id === transferOutForm.srcInvId && l.quantity_remaining > 0)
          .sort((a, b) => a.received_date.localeCompare(b.received_date))
        const selectedLot = compLots.find(l => l.id === transferOutForm.srcLotId)
        const validDests = deptStorerooms.filter(s => srcInventory.some(i => i.storeroom_id === s.id && i.supply_type_id === transferOutForm.supplyTypeId))
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8">
            <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-xl p-6">
              <h2 className="text-base font-bold text-zinc-900 mb-1">Transfer to Storeroom</h2>
              <p className="text-sm text-zinc-500 mb-5">
                {transferOutForm.supplyName}
                {transferOutForm.isControlled && <span className="ml-2 text-xs rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">Controlled</span>}
              </p>
              {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}
              <div className="flex flex-col gap-3">
                {activeLots.length > 1 && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700">Source Lot</label>
                    <select value={transferOutForm.srcLotId} onChange={e => handleTransferOutLotChange(e.target.value)} className={inputCls}>
                      {activeLots.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.lot_number ? `Lot ${l.lot_number}` : 'No lot #'} · {l.quantity_remaining} available
                          {l.expiration_date ? ` · Exp ${fmtDate(l.expiration_date)}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">Destination Storeroom <span className="text-red-500">*</span></label>
                  <select value={transferOutForm.destStoreroomId} onChange={e => setTransferOutForm(f => f ? { ...f, destStoreroomId: e.target.value } : f)} className={inputCls}>
                    <option value="">Select storeroom…</option>
                    {validDests.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">
                    Quantity <span className="text-red-500">*</span>
                    {selectedLot && <span className="ml-1 text-zinc-400 font-normal">({selectedLot.quantity_remaining} available)</span>}
                  </label>
                  <input type="number" min="1" max={transferOutForm.maxQty} value={transferOutForm.quantity}
                    onChange={e => setTransferOutForm(f => f ? { ...f, quantity: e.target.value } : f)} className={inputCls} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">Notes</label>
                  <input type="text" value={transferOutForm.notes} placeholder="Optional"
                    onChange={e => setTransferOutForm(f => f ? { ...f, notes: e.target.value } : f)} className={inputCls} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={handleTransferOutSubmit} disabled={loading || !transferOutForm.destStoreroomId}
                  className="flex-1 rounded-lg bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-900 disabled:opacity-50">
                  {loading ? 'Saving…' : 'Confirm Transfer'}
                </button>
                <button onClick={() => { setTransferOutForm(null); setError(null) }}
                  className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
