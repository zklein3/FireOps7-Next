'use client'

import { useState } from 'react'
import {
  createItemCategory, updateItemCategory,
  createItem, updateItem,
  createAsset, updateAsset,
} from '@/app/actions/equipment'
import {
  createInspectionTemplate, updateInspectionTemplate,
  addTemplateStep, updateTemplateStep, deleteTemplateStep,
} from '@/app/actions/inspections'

interface Category { id: string; category_name: string; active: boolean; sort_order: number | null }
interface Item { id: string; item_name: string; item_description: string | null; category_id: string; tracks_quantity: boolean; tracks_assets: boolean; requires_presence_check: boolean; requires_inspection: boolean; tracks_expiration: boolean; active: boolean }
interface Asset { id: string; item_id: string; asset_tag: string; serial_number: string | null; in_service_date: string | null; out_of_service_date: string | null; status: string; active: boolean; notes: string | null }
interface Template { id: string; item_id: string; template_name: string; template_description: string | null; active: boolean }
interface Step { id: string; template_id: string; step_text: string; step_description: string | null; step_type: string; required: boolean; fail_if_negative: boolean; sort_order: number; active: boolean }

type ActiveTab = 'categories' | 'items' | 'assets'
type ItemSection = 'assets' | 'inspections'

const inputCls = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
const checkCls = "rounded border-zinc-300 text-red-600 focus:ring-red-500"

const STATUS_OPTIONS = [
  { value: 'IN SERVICE', label: 'In Service' },
  { value: 'OUT OF SERVICE', label: 'Out of Service' },
  { value: 'RETIRED', label: 'Retired' },
]

const STEP_TYPES = [
  { value: 'BOOLEAN', label: 'Yes / No' },
  { value: 'NUMERIC', label: 'Number' },
  { value: 'TEXT', label: 'Short Text' },
  { value: 'LONG_TEXT', label: 'Long Text / Notes' },
]

function statusBadge(status: string) {
  const s = status?.toUpperCase()
  if (s === 'IN SERVICE') return 'bg-green-100 text-green-700'
  if (s === 'OUT OF SERVICE') return 'bg-yellow-100 text-yellow-700'
  return 'bg-zinc-100 text-zinc-500'
}
function statusLabel(status: string) {
  const s = status?.toUpperCase()
  if (s === 'IN SERVICE') return 'In Service'
  if (s === 'OUT OF SERVICE') return 'Out of Service'
  if (s === 'RETIRED') return 'Retired'
  return status ?? '—'
}

export default function ItemsClient({
  categories, items, assets, templates, steps,
  departmentName, departmentId, initialTab, focusItemId,
}: {
  categories: Category[]; items: Item[]; assets: Asset[]
  templates: Template[]; steps: Step[]
  departmentName: string; departmentId: string
  initialTab: ActiveTab; focusItemId: string | null
}) {
  const [tab, setTab] = useState<ActiveTab>(initialTab)
  const [showForm, setShowForm] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null)
  const [expandedItemId, setExpandedItemId] = useState<string | null>(focusItemId)
  const [itemSection, setItemSection] = useState<Record<string, ItemSection>>({})
  const [addingAssetToItemId, setAddingAssetToItemId] = useState<string | null>(focusItemId)
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null)
  const [addingTemplateToItemId, setAddingTemplateToItemId] = useState<string | null>(null)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [addingStepToTemplateId, setAddingStepToTemplateId] = useState<string | null>(null)
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const [newStepType, setNewStepType] = useState('BOOLEAN')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function reset() { setError(null); setSuccess(null) }

  const activeCategories = categories.filter(c => c.active)
  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.category_name]))
  const assetsByItem = assets.reduce<Record<string, Asset[]>>((acc, a) => {
    if (!acc[a.item_id]) acc[a.item_id] = []
    acc[a.item_id].push(a)
    return acc
  }, {})
  const templatesByItem = templates.reduce<Record<string, Template[]>>((acc, t) => {
    if (!acc[t.item_id]) acc[t.item_id] = []
    acc[t.item_id].push(t)
    return acc
  }, {})
  // All templates regardless of item — for the "all templates" view
  const allTemplatesByItem = templates.reduce<Record<string, Template[]>>((acc, t) => {
    if (!acc[t.item_id]) acc[t.item_id] = []
    acc[t.item_id].push(t)
    return acc
  }, {})
  const stepsByTemplate = steps.reduce<Record<string, Step[]>>((acc, s) => {
    if (!acc[s.template_id]) acc[s.template_id] = []
    acc[s.template_id].push(s)
    return acc
  }, {})

  async function wrap(fn: () => Promise<{ error?: string; success?: boolean; [k: string]: any } | undefined>) {
    reset(); setLoading(true)
    const result = await fn()
    if (result?.error) setError(result.error)
    setLoading(false)
    return result
  }

  async function handleAddCategory(formData: FormData) {
    formData.set('department_id', departmentId)
    const r = await wrap(() => createItemCategory(formData))
    if (!r?.error) setShowForm(false)
  }
  async function handleUpdateCategory(formData: FormData) {
    const r = await wrap(() => updateItemCategory(formData))
    if (!r?.error) setEditingCategoryId(null)
  }
  async function handleAddItem(formData: FormData) {
    formData.set('department_id', departmentId)
    const r = await wrap(() => createItem(formData))
    if (!r?.error) {
      setShowForm(false)
      if (r?.requires_inspection && r?.item_id) {
        setExpandedItemId(r.item_id)
        setItemSection(prev => ({ ...prev, [r.item_id]: 'assets' }))
        setAddingAssetToItemId(r.item_id)
        setSuccess('Item created — add assets below.')
      }
    }
  }
  async function handleUpdateItem(formData: FormData) {
    const r = await wrap(() => updateItem(formData))
    if (!r?.error) setEditingItemId(null)
  }
  async function handleAddAsset(formData: FormData, item_id: string) {
    formData.set('item_id', item_id)
    formData.set('department_id', departmentId)
    const r = await wrap(() => createAsset(formData))
    if (!r?.error) setSuccess('Asset added.')
  }
  async function handleUpdateAsset(formData: FormData) {
    const r = await wrap(() => updateAsset(formData))
    if (!r?.error) setEditingAssetId(null)
  }
  async function handleAddTemplate(formData: FormData, item_id: string) {
    formData.set('item_id', item_id)
    formData.set('department_id', departmentId)
    const r = await wrap(() => createInspectionTemplate(formData))
    if (!r?.error) {
      setAddingTemplateToItemId(null)
      setSuccess('Template created.')
      if (r?.template_id) setExpandedTemplateId(r.template_id)
    }
  }
  async function handleUpdateTemplate(formData: FormData) {
    const r = await wrap(() => updateInspectionTemplate(formData))
    if (!r?.error) setEditingTemplateId(null)
  }
  async function handleAddStep(formData: FormData) {
    const r = await wrap(() => addTemplateStep(formData))
    if (!r?.error) { setAddingStepToTemplateId(null); setNewStepType('BOOLEAN') }
  }
  async function handleUpdateStep(formData: FormData) {
    const r = await wrap(() => updateTemplateStep(formData))
    if (!r?.error) setEditingStepId(null)
  }
  async function handleDeleteStep(step_id: string) {
    await wrap(() => deleteTemplateStep(step_id))
  }

  function getSectionForItem(item_id: string): ItemSection {
    return itemSection[item_id] ?? 'assets'
  }

  const inspectableItems = items.filter(i => i.requires_inspection)

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Items</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{departmentName}</p>
        </div>
        {tab !== 'assets' && (
          <button onClick={() => { setShowForm(!showForm); reset() }}
            className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
            {showForm ? 'Cancel' : `+ Add ${tab === 'categories' ? 'Category' : 'Item'}`}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white rounded-xl border border-zinc-200 p-1">
        {(['categories', 'items', 'assets'] as ActiveTab[]).map(t => (
          <button key={t} onClick={() => { setTab(t); setShowForm(false); reset() }}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === t ? 'bg-red-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            <span className={`ml-1.5 text-xs ${tab === t ? 'text-red-200' : 'text-zinc-400'}`}>
              {t === 'categories' ? categories.length : t === 'items' ? items.length : assets.length}
            </span>
          </button>
        ))}
      </div>

      {success && <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-200">{success}</div>}
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">{error}</div>}

      {/* ── CATEGORIES ───────────────────────────────────────────────── */}
      {tab === 'categories' && (
        <div>
          {showForm && (
            <div className="mb-6 rounded-xl bg-white p-5 shadow-sm border border-zinc-200">
              <h2 className="text-base font-semibold text-zinc-900 mb-4">Add Category</h2>
              <form action={handleAddCategory} className="flex flex-col gap-4">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Category Name <span className="text-red-500">*</span></label>
                    <input name="category_name" type="text" required placeholder="Forcible Entry" className={inputCls} />
                  </div>
                  <div className="w-24">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Sort</label>
                    <input name="sort_order" type="number" min="1" className={inputCls} />
                  </div>
                </div>
                <button type="submit" disabled={loading} className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                  {loading ? 'Adding...' : 'Add Category'}
                </button>
              </form>
            </div>
          )}
          <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
            {categories.length === 0 ? <div className="px-6 py-12 text-center text-sm text-zinc-400">No categories yet.</div> : (
              <div className="divide-y divide-zinc-100">
                {[...categories].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)).map(c => (
                  <div key={c.id}>
                    {editingCategoryId === c.id ? (
                      <div className="p-4">
                        <form action={handleUpdateCategory} className="flex flex-col gap-3">
                          <input type="hidden" name="id" value={c.id} />
                          <div className="flex gap-3">
                            <div className="flex-1"><input name="category_name" type="text" required defaultValue={c.category_name} className={inputCls} /></div>
                            <div className="w-24"><input name="sort_order" type="number" defaultValue={c.sort_order ?? ''} className={inputCls} /></div>
                            <div className="w-28"><select name="active" defaultValue={c.active ? 'true' : 'false'} className={inputCls}><option value="true">Active</option><option value="false">Inactive</option></select></div>
                          </div>
                          <div className="flex gap-2">
                            <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{loading ? 'Saving...' : 'Save'}</button>
                            <button type="button" onClick={() => setEditingCategoryId(null)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">Cancel</button>
                          </div>
                        </form>
                      </div>
                    ) : (
                      <div className="flex items-center px-5 py-4">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-zinc-900">{c.category_name}</p>
                          {!c.active && <span className="text-xs text-zinc-400">Inactive</span>}
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-zinc-400">{items.filter(i => i.category_id === c.id).length} items</span>
                          <button onClick={() => { setEditingCategoryId(c.id); reset() }} className="text-xs font-semibold text-red-600 hover:text-red-800">Edit</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ITEMS ─────────────────────────────────────────────────────── */}
      {tab === 'items' && (
        <div>
          {showForm && (
            <div className="mb-6 rounded-xl bg-white p-5 shadow-sm border border-zinc-200">
              <h2 className="text-base font-semibold text-zinc-900 mb-4">Add Item</h2>
              {activeCategories.length === 0 ? <p className="text-sm text-zinc-400">Create a category first.</p> : (
                <form action={handleAddItem} className="flex flex-col gap-4">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-sm font-medium text-zinc-700">Item Name <span className="text-red-500">*</span></label>
                      <input name="item_name" type="text" required placeholder="Chainsaw" className={inputCls} />
                    </div>
                    <div className="w-48">
                      <label className="mb-1 block text-sm font-medium text-zinc-700">Category <span className="text-red-500">*</span></label>
                      <select name="category_id" required className={inputCls}>
                        <option value="">Select...</option>
                        {activeCategories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
                      </select>
                    </div>
                  </div>
                  <input name="item_description" type="text" placeholder="Description (optional)" className={inputCls} />
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="requires_presence_check" value="true" defaultChecked className={checkCls} /><span className="text-sm text-zinc-700">Requires presence check</span></label>
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="requires_inspection" value="true" className={checkCls} /><span className="text-sm text-zinc-700">Requires inspection <span className="text-zinc-400 text-xs">(enables asset tracking + inspection templates)</span></span></label>
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="tracks_expiration" value="true" className={checkCls} /><span className="text-sm text-zinc-700">Tracks expiration date</span></label>
                  </div>
                  <button type="submit" disabled={loading} className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{loading ? 'Adding...' : 'Add Item'}</button>
                </form>
              )}
            </div>
          )}

          <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
            {items.length === 0 ? <div className="px-6 py-12 text-center text-sm text-zinc-400">No items yet.</div> : (
              <div className="divide-y divide-zinc-100">
                {items.map(item => {
                  const itemAssets = assetsByItem[item.id] ?? []
                  const itemTemplates = templatesByItem[item.id] ?? []
                  const isExpanded = expandedItemId === item.id
                  const section = getSectionForItem(item.id)

                  return (
                    <div key={item.id}>
                      {editingItemId === item.id ? (
                        <div className="p-4">
                          <form action={handleUpdateItem} className="flex flex-col gap-3">
                            <input type="hidden" name="id" value={item.id} />
                            <div className="flex gap-3">
                              <div className="flex-1"><input name="item_name" type="text" required defaultValue={item.item_name} className={inputCls} /></div>
                              <div className="w-48"><select name="category_id" defaultValue={item.category_id} className={inputCls}>{activeCategories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}</select></div>
                            </div>
                            <input name="item_description" type="text" defaultValue={item.item_description ?? ''} placeholder="Description" className={inputCls} />
                            <div className="flex flex-col gap-2">
                              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="requires_presence_check" value="true" defaultChecked={item.requires_presence_check} className={checkCls} /><span className="text-sm text-zinc-700">Requires presence check</span></label>
                              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="requires_inspection" value="true" defaultChecked={item.requires_inspection} className={checkCls} /><span className="text-sm text-zinc-700">Requires inspection</span></label>
                              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="tracks_expiration" value="true" defaultChecked={item.tracks_expiration} className={checkCls} /><span className="text-sm text-zinc-700">Tracks expiration</span></label>
                            </div>
                            <div className="w-28"><select name="active" defaultValue={item.active ? 'true' : 'false'} className={inputCls}><option value="true">Active</option><option value="false">Inactive</option></select></div>
                            <div className="flex gap-2">
                              <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{loading ? 'Saving...' : 'Save'}</button>
                              <button type="button" onClick={() => setEditingItemId(null)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">Cancel</button>
                            </div>
                          </form>
                        </div>
                      ) : (
                        <div>
                          {/* Item row */}
                          <div className="flex items-center px-5 py-4">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-zinc-900">{item.item_name}</p>
                              <p className="text-xs text-zinc-400">{categoryMap[item.category_id] ?? '—'}</p>
                            </div>
                            <div className="flex items-center gap-2 ml-3 flex-wrap justify-end">
                              {item.requires_inspection && <span className="text-xs rounded-full bg-yellow-100 text-yellow-700 px-2 py-0.5">Inspection</span>}
                              {item.tracks_assets && <span className="text-xs rounded-full bg-blue-100 text-blue-700 px-2 py-0.5">{itemAssets.length} assets</span>}
                              {!item.active && <span className="text-xs rounded-full bg-zinc-100 text-zinc-400 px-2 py-0.5">Inactive</span>}
                              {item.tracks_assets && (
                                <button onClick={() => { setExpandedItemId(isExpanded ? null : item.id); reset() }}
                                  className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                                  {isExpanded ? 'Hide' : 'Manage'}
                                </button>
                              )}
                              <button onClick={() => { setEditingItemId(item.id); reset() }} className="text-xs font-semibold text-red-600 hover:text-red-800">Edit</button>
                            </div>
                          </div>

                          {/* Expanded section */}
                          {isExpanded && item.tracks_assets && (
                            <div className="border-t border-zinc-100 bg-zinc-50">
                              {/* Section toggle */}
                              <div className="flex border-b border-zinc-200">
                                <button
                                  onClick={() => setItemSection(prev => ({ ...prev, [item.id]: 'assets' }))}
                                  className={`flex-1 py-2 text-xs font-semibold transition-colors ${section === 'assets' ? 'bg-white text-red-700 border-b-2 border-red-700' : 'text-zinc-500 hover:text-zinc-700'}`}>
                                  Assets ({itemAssets.length})
                                </button>
                                {item.requires_inspection && (
                                  <button
                                    onClick={() => setItemSection(prev => ({ ...prev, [item.id]: 'inspections' }))}
                                    className={`flex-1 py-2 text-xs font-semibold transition-colors ${section === 'inspections' ? 'bg-white text-red-700 border-b-2 border-red-700' : 'text-zinc-500 hover:text-zinc-700'}`}>
                                    Inspections ({itemTemplates.length})
                                  </button>
                                )}
                              </div>

                              {/* ── ASSETS SECTION ──────────────────────────── */}
                              {section === 'assets' && (
                                <div className="px-5 py-4">
                                  <div className="flex items-center justify-between mb-3">
                                    <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">Assets</p>
                                    <button onClick={() => setAddingAssetToItemId(addingAssetToItemId === item.id ? null : item.id)}
                                      className="text-xs font-semibold text-red-600 hover:text-red-800">
                                      {addingAssetToItemId === item.id ? 'Cancel' : '+ Add Asset'}
                                    </button>
                                  </div>

                                  {addingAssetToItemId === item.id && (
                                    <form action={(fd) => handleAddAsset(fd, item.id)} className="mb-4 flex flex-col gap-3 bg-white rounded-lg border border-zinc-200 p-4">
                                      <div className="flex gap-3">
                                        <div className="flex-1">
                                          <label className="mb-1 block text-xs font-medium text-zinc-700">Asset Name <span className="text-red-500">*</span></label>
                                          <input name="asset_name" type="text" required placeholder={`${item.item_name} 1`} className={inputCls} />
                                        </div>
                                        <div className="flex-1">
                                          <label className="mb-1 block text-xs font-medium text-zinc-700">Serial Number</label>
                                          <input name="serial_number" type="text" className={inputCls} />
                                        </div>
                                      </div>
                                      <div className="flex gap-3">
                                        <div className="flex-1">
                                          <label className="mb-1 block text-xs font-medium text-zinc-700">In Service Date</label>
                                          <input name="in_service_date" type="date" className={inputCls} />
                                        </div>
                                        <div className="flex-1">
                                          <label className="mb-1 block text-xs font-medium text-zinc-700">Notes</label>
                                          <input name="notes" type="text" className={inputCls} />
                                        </div>
                                      </div>
                                      <button type="submit" disabled={loading} className="w-full rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                                        {loading ? 'Adding...' : 'Add Asset'}
                                      </button>
                                    </form>
                                  )}

                                  {itemAssets.length === 0 ? (
                                    <p className="text-xs text-zinc-400">No assets yet.</p>
                                  ) : (
                                    <div className="flex flex-col gap-2">
                                      {itemAssets.map(asset => (
                                        <div key={asset.id}>
                                          {editingAssetId === asset.id ? (
                                            <form action={handleUpdateAsset} className="bg-white rounded-lg border border-zinc-200 p-3 flex flex-col gap-3">
                                              <input type="hidden" name="id" value={asset.id} />
                                              <div className="flex gap-3">
                                                <div className="flex-1"><input name="asset_name" type="text" required defaultValue={asset.asset_tag} className={inputCls} /></div>
                                                <div className="flex-1"><input name="serial_number" type="text" defaultValue={asset.serial_number ?? ''} className={inputCls} placeholder="Serial #" /></div>
                                              </div>
                                              <div className="flex gap-3">
                                                <div className="flex-1"><input name="in_service_date" type="date" defaultValue={asset.in_service_date ?? ''} className={inputCls} /></div>
                                                <div className="flex-1"><input name="out_of_service_date" type="date" defaultValue={asset.out_of_service_date ?? ''} className={inputCls} /></div>
                                                <div className="w-36"><select name="status" defaultValue={asset.status} className={inputCls}>{STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
                                              </div>
                                              <input name="notes" type="text" defaultValue={asset.notes ?? ''} placeholder="Notes" className={inputCls} />
                                              <div className="flex gap-2">
                                                <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{loading ? 'Saving...' : 'Save'}</button>
                                                <button type="button" onClick={() => setEditingAssetId(null)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">Cancel</button>
                                              </div>
                                            </form>
                                          ) : (
                                            <div className="flex items-center justify-between bg-white rounded-lg border border-zinc-200 px-4 py-3">
                                              <div>
                                                <p className="text-sm font-semibold text-zinc-900">{asset.asset_tag}</p>
                                                <div className="flex gap-3 text-xs text-zinc-400 mt-0.5">
                                                  {asset.serial_number && <span>S/N: {asset.serial_number}</span>}
                                                </div>
                                              </div>
                                              <div className="flex items-center gap-3">
                                                <span className={`text-xs rounded-full px-2 py-0.5 ${statusBadge(asset.status)}`}>{statusLabel(asset.status)}</span>
                                                <button onClick={() => { setEditingAssetId(asset.id); reset() }} className="text-xs font-semibold text-red-600 hover:text-red-800">Edit</button>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* ── INSPECTIONS SECTION ─────────────────────── */}
                              {section === 'inspections' && item.requires_inspection && (
                                <div className="px-5 py-4">
                                  <div className="flex items-center justify-between mb-3">
                                    <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">Inspection Templates</p>
                                    <button onClick={() => setAddingTemplateToItemId(addingTemplateToItemId === item.id ? null : item.id)}
                                      className="text-xs font-semibold text-red-600 hover:text-red-800">
                                      {addingTemplateToItemId === item.id ? 'Cancel' : '+ Add Template'}
                                    </button>
                                  </div>

                                  {addingTemplateToItemId === item.id && (
                                    <form action={(fd) => handleAddTemplate(fd, item.id)} className="mb-4 flex flex-col gap-3 bg-white rounded-lg border border-zinc-200 p-4">
                                      <div>
                                        <label className="mb-1 block text-xs font-medium text-zinc-700">Template Name <span className="text-red-500">*</span></label>
                                        <input name="template_name" type="text" required placeholder="Monthly Inspection" className={inputCls} />
                                      </div>
                                      <div>
                                        <label className="mb-1 block text-xs font-medium text-zinc-700">Description</label>
                                        <input name="template_description" type="text" placeholder="Optional" className={inputCls} />
                                      </div>
                                      <button type="submit" disabled={loading} className="w-full rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                                        {loading ? 'Creating...' : 'Create Template'}
                                      </button>
                                    </form>
                                  )}

                                  {itemTemplates.length === 0 ? (
                                    <p className="text-xs text-zinc-400">No inspection templates yet. Add one above.</p>
                                  ) : (
                                    <div className="flex flex-col gap-3">
                                      {itemTemplates.map(template => {
                                        const templateSteps = stepsByTemplate[template.id] ?? []
                                        const isTemplateExpanded = expandedTemplateId === template.id
                                        return (
                                          <div key={template.id} className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
                                            {editingTemplateId === template.id ? (
                                              <div className="p-3">
                                                <form action={handleUpdateTemplate} className="flex flex-col gap-2">
                                                  <input type="hidden" name="id" value={template.id} />
                                                  <div>
                                                    <label className="mb-1 block text-xs font-medium text-zinc-500">Template Name</label>
                                                    <input name="template_name" type="text" required defaultValue={template.template_name} className={inputCls} />
                                                  </div>
                                                  <div>
                                                    <label className="mb-1 block text-xs font-medium text-zinc-500">Description</label>
                                                    <input name="template_description" type="text" defaultValue={template.template_description ?? ''} placeholder="Description" className={inputCls} />
                                                  </div>
                                                  {/* Item type reassignment */}
                                                  <div>
                                                    <label className="mb-1 block text-xs font-medium text-zinc-500">Assigned to Item Type</label>
                                                    <select name="item_id" defaultValue={template.item_id} className={inputCls}>
                                                      {inspectableItems.map(i => (
                                                        <option key={i.id} value={i.id}>{i.item_name}</option>
                                                      ))}
                                                    </select>
                                                  </div>
                                                  <select name="active" defaultValue={template.active ? 'true' : 'false'} className={inputCls}>
                                                    <option value="true">Active</option>
                                                    <option value="false">Inactive</option>
                                                  </select>
                                                  <div className="flex gap-2">
                                                    <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">{loading ? '...' : 'Save'}</button>
                                                    <button type="button" onClick={() => setEditingTemplateId(null)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50">Cancel</button>
                                                  </div>
                                                </form>
                                              </div>
                                            ) : (
                                              <div className="flex items-center px-4 py-3 bg-zinc-50">
                                                <div className="flex-1">
                                                  <p className="text-sm font-semibold text-zinc-900">{template.template_name}</p>
                                                  {template.template_description && <p className="text-xs text-zinc-400">{template.template_description}</p>}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                  <span className="text-xs text-zinc-400">{templateSteps.length} steps</span>
                                                  {!template.active && <span className="text-xs rounded-full bg-zinc-100 text-zinc-400 px-2 py-0.5">Inactive</span>}
                                                  <button onClick={() => setExpandedTemplateId(isTemplateExpanded ? null : template.id)}
                                                    className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                                                    {isTemplateExpanded ? 'Hide' : 'Steps'}
                                                  </button>
                                                  <button onClick={() => { setEditingTemplateId(template.id); reset() }} className="text-xs font-semibold text-red-600 hover:text-red-800">Edit</button>
                                                </div>
                                              </div>
                                            )}

                                            {isTemplateExpanded && (
                                              <div className="p-3 border-t border-zinc-100">
                                                <div className="flex items-center justify-between mb-2">
                                                  <p className="text-xs font-semibold text-zinc-500">Checklist Steps</p>
                                                  <button onClick={() => setAddingStepToTemplateId(addingStepToTemplateId === template.id ? null : template.id)}
                                                    className="text-xs font-semibold text-red-600 hover:text-red-800">
                                                    {addingStepToTemplateId === template.id ? 'Cancel' : '+ Add Step'}
                                                  </button>
                                                </div>

                                                {addingStepToTemplateId === template.id && (
                                                  <form action={handleAddStep} className="mb-3 flex flex-col gap-2 bg-zinc-50 rounded-lg border border-zinc-200 p-3">
                                                    <input type="hidden" name="template_id" value={template.id} />
                                                    <input name="step_text" type="text" required placeholder="Step question..." className={inputCls} />
                                                    <input name="step_description" type="text" placeholder="Description (optional)" className={inputCls} />
                                                    <div className="flex gap-2">
                                                      <div className="flex-1">
                                                        <select name="step_type" value={newStepType} onChange={e => setNewStepType(e.target.value)} className={inputCls}>
                                                          {STEP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                                        </select>
                                                      </div>
                                                    </div>
                                                    <div className="flex gap-4">
                                                      <label className="flex items-center gap-2 cursor-pointer">
                                                        <input type="checkbox" name="required" value="true" defaultChecked className={checkCls} />
                                                        <span className="text-xs text-zinc-700">Required</span>
                                                      </label>
                                                      {newStepType === 'BOOLEAN' && (
                                                        <label className="flex items-center gap-2 cursor-pointer">
                                                          <input type="checkbox" name="fail_if_negative" value="true" className={checkCls} />
                                                          <span className="text-xs text-zinc-700">Fail if No</span>
                                                        </label>
                                                      )}
                                                    </div>
                                                    <button type="submit" disabled={loading} className="w-full rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                                                      {loading ? 'Adding...' : 'Add Step'}
                                                    </button>
                                                  </form>
                                                )}

                                                {templateSteps.length === 0 ? (
                                                  <p className="text-xs text-zinc-400">No steps yet. Add one above.</p>
                                                ) : (
                                                  <div className="flex flex-col gap-2">
                                                    {[...templateSteps].sort((a, b) => a.sort_order - b.sort_order).map((step, idx) => (
                                                      <div key={step.id}>
                                                        {editingStepId === step.id ? (
                                                          <form action={handleUpdateStep} className="bg-white rounded-lg border border-zinc-200 p-3 flex flex-col gap-2">
                                                            <input type="hidden" name="id" value={step.id} />
                                                            <input name="step_text" type="text" required defaultValue={step.step_text} className={inputCls} />
                                                            <input name="step_description" type="text" defaultValue={step.step_description ?? ''} placeholder="Description" className={inputCls} />
                                                            <div className="flex gap-2">
                                                              <select name="step_type" defaultValue={step.step_type} className={inputCls}>
                                                                {STEP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                                              </select>
                                                              <select name="active" defaultValue={step.active ? 'true' : 'false'} className={inputCls}>
                                                                <option value="true">Active</option>
                                                                <option value="false">Inactive</option>
                                                              </select>
                                                            </div>
                                                            <div className="flex gap-4">
                                                              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="required" value="true" defaultChecked={step.required} className={checkCls} /><span className="text-xs text-zinc-700">Required</span></label>
                                                              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="fail_if_negative" value="true" defaultChecked={step.fail_if_negative} className={checkCls} /><span className="text-xs text-zinc-700">Fail if No</span></label>
                                                            </div>
                                                            <div className="flex gap-2">
                                                              <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50">{loading ? '...' : 'Save'}</button>
                                                              <button type="button" onClick={() => setEditingStepId(null)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50">Cancel</button>
                                                            </div>
                                                          </form>
                                                        ) : (
                                                          <div className="flex items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                                                            <span className="text-xs font-mono text-zinc-400 mt-0.5 w-5 shrink-0">{idx + 1}.</span>
                                                            <div className="flex-1 min-w-0">
                                                              <p className="text-sm text-zinc-900">{step.step_text}</p>
                                                              <div className="flex gap-2 mt-0.5 flex-wrap">
                                                                <span className="text-xs text-zinc-400">{STEP_TYPES.find(t => t.value === step.step_type)?.label ?? step.step_type}</span>
                                                                {step.fail_if_negative && <span className="text-xs text-red-500">Fail if No</span>}
                                                                {step.required && <span className="text-xs text-zinc-400">Required</span>}
                                                              </div>
                                                            </div>
                                                            <div className="flex gap-2 shrink-0">
                                                              <button onClick={() => { setEditingStepId(step.id); reset() }} className="text-xs font-semibold text-red-600 hover:text-red-800">Edit</button>
                                                              <button onClick={() => handleDeleteStep(step.id)} className="text-xs text-zinc-400 hover:text-red-600">✕</button>
                                                            </div>
                                                          </div>
                                                        )}
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ASSETS TAB ────────────────────────────────────────────────── */}
      {tab === 'assets' && (
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
          {assets.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-zinc-400">No assets yet. Create an item with inspection enabled to add assets.</div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {assets.map(asset => {
                const item = items.find(i => i.id === asset.item_id)
                return (
                  <div key={asset.id} className="flex items-center px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-900">{asset.asset_tag}</p>
                      <p className="text-xs text-zinc-400">{item?.item_name ?? '—'} · {categoryMap[item?.category_id ?? ''] ?? '—'}</p>
                      {asset.serial_number && <p className="text-xs text-zinc-400">S/N: {asset.serial_number}</p>}
                    </div>
                    <div className="flex items-center gap-3 ml-3">
                      <span className={`text-xs rounded-full px-2 py-0.5 ${statusBadge(asset.status)}`}>{statusLabel(asset.status)}</span>
                      <button onClick={() => { setTab('items'); setExpandedItemId(asset.item_id); setItemSection(prev => ({ ...prev, [asset.item_id]: 'assets' })); setEditingAssetId(asset.id); reset() }}
                        className="text-xs font-semibold text-red-600 hover:text-red-800">Edit</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
