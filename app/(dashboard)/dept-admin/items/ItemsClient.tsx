'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createItemCategory, updateItemCategory,
  createItem, updateItem,
  createAsset, updateAsset,
} from '@/app/actions/equipment'

interface Category {
  id: string
  category_name: string
  active: boolean
  sort_order: number | null
}

interface Item {
  id: string
  item_name: string
  item_description: string | null
  category_id: string
  tracks_quantity: boolean
  tracks_assets: boolean
  requires_presence_check: boolean
  requires_inspection: boolean
  tracks_expiration: boolean
  active: boolean
}

interface Asset {
  id: string
  item_id: string
  asset_tag: string
  serial_number: string | null
  in_service_date: string | null
  out_of_service_date: string | null
  status: string
  active: boolean
  notes: string | null
}

type ActiveTab = 'categories' | 'items' | 'assets'

const inputCls = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
const checkCls = "rounded border-zinc-300 text-red-600 focus:ring-red-500"

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'out_of_service', label: 'Out of Service' },
  { value: 'retired', label: 'Retired' },
]

export default function ItemsClient({
  categories,
  items,
  assets,
  departmentName,
  departmentId,
  initialTab,
  focusItemId,
}: {
  categories: Category[]
  items: Item[]
  assets: Asset[]
  departmentName: string
  departmentId: string
  initialTab: ActiveTab
  focusItemId: string | null
}) {
  const router = useRouter()
  const [tab, setTab] = useState<ActiveTab>(initialTab)
  const [showForm, setShowForm] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null)
  const [expandedItemId, setExpandedItemId] = useState<string | null>(focusItemId)
  const [addingAssetToItemId, setAddingAssetToItemId] = useState<string | null>(focusItemId)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function reset() { setError(null); setSuccess(null) }

  async function handleAddCategory(formData: FormData) {
    reset(); setLoading(true)
    formData.set('department_id', departmentId)
    const result = await createItemCategory(formData)
    if (result?.error) setError(result.error)
    else { setSuccess('Category added.'); setShowForm(false) }
    setLoading(false)
  }

  async function handleUpdateCategory(formData: FormData) {
    reset(); setLoading(true)
    const result = await updateItemCategory(formData)
    if (result?.error) setError(result.error)
    else { setSuccess('Category updated.'); setEditingCategoryId(null) }
    setLoading(false)
  }

  async function handleAddItem(formData: FormData) {
    reset(); setLoading(true)
    formData.set('department_id', departmentId)
    const result = await createItem(formData)
    if (result?.error) { setError(result.error); setLoading(false); return }
    setShowForm(false)
    // If requires inspection → switch to items tab and open asset form
    if (result.requires_inspection && result.item_id) {
      setTab('items')
      setExpandedItemId(result.item_id)
      setAddingAssetToItemId(result.item_id)
      setSuccess('Item created. Now add assets below.')
    } else {
      setSuccess('Item added.')
    }
    setLoading(false)
  }

  async function handleUpdateItem(formData: FormData) {
    reset(); setLoading(true)
    const result = await updateItem(formData)
    if (result?.error) setError(result.error)
    else { setSuccess('Item updated.'); setEditingItemId(null) }
    setLoading(false)
  }

  async function handleAddAsset(formData: FormData, item_id: string) {
    reset(); setLoading(true)
    formData.set('item_id', item_id)
    formData.set('department_id', departmentId)
    const result = await createAsset(formData)
    if (result?.error) setError(result.error)
    else { setSuccess('Asset added.') }
    setLoading(false)
  }

  async function handleUpdateAsset(formData: FormData) {
    reset(); setLoading(true)
    const result = await updateAsset(formData)
    if (result?.error) setError(result.error)
    else { setSuccess('Asset updated.'); setEditingAssetId(null) }
    setLoading(false)
  }

  const activeCategories = categories.filter(c => c.active)
  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.category_name]))
  const assetsByItem = assets.reduce<Record<string, Asset[]>>((acc, a) => {
    if (!acc[a.item_id]) acc[a.item_id] = []
    acc[a.item_id].push(a)
    return acc
  }, {})

  const assetTrackedItems = items.filter(i => i.tracks_assets)

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Items</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{departmentName}</p>
        </div>
        {tab !== 'assets' && (
          <button
            onClick={() => { setShowForm(!showForm); reset(); setEditingCategoryId(null); setEditingItemId(null) }}
            className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
            {showForm ? 'Cancel' : `+ Add ${tab === 'categories' ? 'Category' : 'Item'}`}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white rounded-xl border border-zinc-200 p-1">
        {(['categories', 'items', 'assets'] as ActiveTab[]).map(t => (
          <button key={t} onClick={() => { setTab(t); setShowForm(false); setEditingCategoryId(null); setEditingItemId(null); setEditingAssetId(null); reset() }}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === t ? 'bg-red-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'
            }`}>
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
                <button type="submit" disabled={loading}
                  className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                  {loading ? 'Adding...' : 'Add Category'}
                </button>
              </form>
            </div>
          )}

          <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
            {categories.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-zinc-400">No categories yet.</div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {[...categories].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)).map(c => (
                  <div key={c.id}>
                    {editingCategoryId === c.id ? (
                      <div className="p-4">
                        <form action={handleUpdateCategory} className="flex flex-col gap-3">
                          <input type="hidden" name="id" value={c.id} />
                          <div className="flex gap-3">
                            <div className="flex-1">
                              <input name="category_name" type="text" required defaultValue={c.category_name} className={inputCls} />
                            </div>
                            <div className="w-24">
                              <input name="sort_order" type="number" defaultValue={c.sort_order ?? ''} className={inputCls} />
                            </div>
                            <div className="w-28">
                              <select name="active" defaultValue={c.active ? 'true' : 'false'} className={inputCls}>
                                <option value="true">Active</option>
                                <option value="false">Inactive</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button type="submit" disabled={loading}
                              className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                              {loading ? 'Saving...' : 'Save'}
                            </button>
                            <button type="button" onClick={() => setEditingCategoryId(null)}
                              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
                              Cancel
                            </button>
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
                          <button onClick={() => { setEditingCategoryId(c.id); reset() }}
                            className="text-xs font-semibold text-red-600 hover:text-red-800">Edit</button>
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
              {activeCategories.length === 0 ? (
                <p className="text-sm text-zinc-400">Create a category first.</p>
              ) : (
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
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Description</label>
                    <input name="item_description" type="text" placeholder="Optional" className={inputCls} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" name="requires_presence_check" value="true" defaultChecked className={checkCls} />
                      <span className="text-sm text-zinc-700">Requires presence check</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" name="requires_inspection" value="true" className={checkCls} />
                      <span className="text-sm text-zinc-700">Requires inspection <span className="text-zinc-400 text-xs">(enables individual asset tracking)</span></span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" name="tracks_expiration" value="true" className={checkCls} />
                      <span className="text-sm text-zinc-700">Tracks expiration date</span>
                    </label>
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                    {loading ? 'Adding...' : 'Add Item'}
                  </button>
                </form>
              )}
            </div>
          )}

          <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
            {items.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-zinc-400">No items yet.</div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {items.map(item => {
                  const itemAssets = assetsByItem[item.id] ?? []
                  const isExpanded = expandedItemId === item.id
                  return (
                    <div key={item.id}>
                      {editingItemId === item.id ? (
                        <div className="p-4">
                          <form action={handleUpdateItem} className="flex flex-col gap-3">
                            <input type="hidden" name="id" value={item.id} />
                            <div className="flex gap-3">
                              <div className="flex-1">
                                <input name="item_name" type="text" required defaultValue={item.item_name} className={inputCls} />
                              </div>
                              <div className="w-48">
                                <select name="category_id" defaultValue={item.category_id} className={inputCls}>
                                  {activeCategories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
                                </select>
                              </div>
                            </div>
                            <input name="item_description" type="text" defaultValue={item.item_description ?? ''} placeholder="Description" className={inputCls} />
                            <div className="flex flex-col gap-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" name="requires_presence_check" value="true" defaultChecked={item.requires_presence_check} className={checkCls} />
                                <span className="text-sm text-zinc-700">Requires presence check</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" name="requires_inspection" value="true" defaultChecked={item.requires_inspection} className={checkCls} />
                                <span className="text-sm text-zinc-700">Requires inspection</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" name="tracks_expiration" value="true" defaultChecked={item.tracks_expiration} className={checkCls} />
                                <span className="text-sm text-zinc-700">Tracks expiration</span>
                              </label>
                            </div>
                            <div className="w-28">
                              <select name="active" defaultValue={item.active ? 'true' : 'false'} className={inputCls}>
                                <option value="true">Active</option>
                                <option value="false">Inactive</option>
                              </select>
                            </div>
                            <div className="flex gap-2">
                              <button type="submit" disabled={loading}
                                className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                                {loading ? 'Saving...' : 'Save'}
                              </button>
                              <button type="button" onClick={() => setEditingItemId(null)}
                                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
                                Cancel
                              </button>
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
                            <div className="flex items-center gap-3 ml-3">
                              {item.requires_inspection && (
                                <span className="text-xs rounded-full bg-yellow-100 text-yellow-700 px-2 py-0.5">Inspection</span>
                              )}
                              {item.tracks_assets && (
                                <span className="text-xs rounded-full bg-blue-100 text-blue-700 px-2 py-0.5">{itemAssets.length} assets</span>
                              )}
                              {!item.active && (
                                <span className="text-xs rounded-full bg-zinc-100 text-zinc-400 px-2 py-0.5">Inactive</span>
                              )}
                              {item.tracks_assets && (
                                <button
                                  onClick={() => {
                                    setExpandedItemId(isExpanded ? null : item.id)
                                    setAddingAssetToItemId(null)
                                  }}
                                  className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                                  {isExpanded ? 'Hide' : 'Assets'}
                                </button>
                              )}
                              <button onClick={() => { setEditingItemId(item.id); reset() }}
                                className="text-xs font-semibold text-red-600 hover:text-red-800">Edit</button>
                            </div>
                          </div>

                          {/* Assets section — expanded */}
                          {isExpanded && item.tracks_assets && (
                            <div className="bg-zinc-50 border-t border-zinc-100 px-5 py-4">
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">Assets</p>
                                <button
                                  onClick={() => setAddingAssetToItemId(addingAssetToItemId === item.id ? null : item.id)}
                                  className="text-xs font-semibold text-red-600 hover:text-red-800">
                                  {addingAssetToItemId === item.id ? 'Cancel' : '+ Add Asset'}
                                </button>
                              </div>

                              {/* Add asset form */}
                              {addingAssetToItemId === item.id && (
                                <form action={(fd) => handleAddAsset(fd, item.id)} className="mb-4 flex flex-col gap-3 bg-white rounded-lg border border-zinc-200 p-4">
                                  <div className="flex gap-3">
                                    <div className="flex-1">
                                      <label className="mb-1 block text-xs font-medium text-zinc-700">Asset Name <span className="text-red-500">*</span></label>
                                      <input name="asset_name" type="text" required placeholder="Chainsaw 1" className={inputCls} />
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
                                  <button type="submit" disabled={loading}
                                    className="w-full rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                                    {loading ? 'Adding...' : 'Add Asset'}
                                  </button>
                                </form>
                              )}

                              {/* Asset list */}
                              {itemAssets.length === 0 ? (
                                <p className="text-xs text-zinc-400">No assets yet. Add one above.</p>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  {itemAssets.map(asset => (
                                    <div key={asset.id}>
                                      {editingAssetId === asset.id ? (
                                        <form action={handleUpdateAsset} className="bg-white rounded-lg border border-zinc-200 p-3 flex flex-col gap-3">
                                          <input type="hidden" name="id" value={asset.id} />
                                          <div className="flex gap-3">
                                            <div className="flex-1">
                                              <input name="asset_name" type="text" required defaultValue={asset.asset_tag} className={inputCls} placeholder="Asset name" />
                                            </div>
                                            <div className="flex-1">
                                              <input name="serial_number" type="text" defaultValue={asset.serial_number ?? ''} className={inputCls} placeholder="Serial #" />
                                            </div>
                                          </div>
                                          <div className="flex gap-3">
                                            <div className="flex-1">
                                              <input name="in_service_date" type="date" defaultValue={asset.in_service_date ?? ''} className={inputCls} />
                                            </div>
                                            <div className="flex-1">
                                              <input name="out_of_service_date" type="date" defaultValue={asset.out_of_service_date ?? ''} className={inputCls} />
                                            </div>
                                            <div className="w-36">
                                              <select name="status" defaultValue={asset.status} className={inputCls}>
                                                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                              </select>
                                            </div>
                                          </div>
                                          <input name="notes" type="text" defaultValue={asset.notes ?? ''} placeholder="Notes" className={inputCls} />
                                          <div className="flex gap-2">
                                            <button type="submit" disabled={loading}
                                              className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                                              {loading ? 'Saving...' : 'Save'}
                                            </button>
                                            <button type="button" onClick={() => setEditingAssetId(null)}
                                              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
                                              Cancel
                                            </button>
                                          </div>
                                        </form>
                                      ) : (
                                        <div className="flex items-center justify-between bg-white rounded-lg border border-zinc-200 px-4 py-3">
                                          <div>
                                            <p className="text-sm font-semibold text-zinc-900">{asset.asset_tag}</p>
                                            <div className="flex gap-3 text-xs text-zinc-400 mt-0.5">
                                              {asset.serial_number && <span>S/N: {asset.serial_number}</span>}
                                              {asset.in_service_date && <span>In service: {new Date(asset.in_service_date).toLocaleDateString()}</span>}
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-3">
                                            <span className={`text-xs rounded-full px-2 py-0.5 ${
                                              asset.status === 'active' ? 'bg-green-100 text-green-700' :
                                              asset.status === 'out_of_service' ? 'bg-yellow-100 text-yellow-700' :
                                              'bg-zinc-100 text-zinc-500'
                                            }`}>
                                              {asset.status === 'out_of_service' ? 'Out of Service' : asset.status.charAt(0).toUpperCase() + asset.status.slice(1)}
                                            </span>
                                            <button onClick={() => { setEditingAssetId(asset.id); reset() }}
                                              className="text-xs font-semibold text-red-600 hover:text-red-800">
                                              Edit
                                            </button>
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
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ASSETS ────────────────────────────────────────────────────── */}
      {tab === 'assets' && (
        <div>
          <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
            {assets.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-zinc-400">
                No assets yet. Create an item with inspection enabled to add assets.
              </div>
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
                        <span className={`text-xs rounded-full px-2 py-0.5 ${
                          asset.status === 'active' ? 'bg-green-100 text-green-700' :
                          asset.status === 'out_of_service' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-zinc-100 text-zinc-500'
                        }`}>
                          {asset.status === 'out_of_service' ? 'Out of Service' : asset.status.charAt(0).toUpperCase() + asset.status.slice(1)}
                        </span>
                        <button
                          onClick={() => { setTab('items'); setExpandedItemId(asset.item_id); setEditingAssetId(asset.id); reset() }}
                          className="text-xs font-semibold text-red-600 hover:text-red-800">
                          Edit
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
