'use client'

import { useState } from 'react'
import { createItemCategory, updateItemCategory, createItem, updateItem } from '@/app/actions/equipment'

interface Category {
  id: string
  category_name: string
  requires_inspection: boolean
  active: boolean
  sort_order: number | null
}

interface Item {
  id: string
  item_name: string
  item_description: string | null
  category_id: string
  tracks_quantity: boolean
  requires_presence_check: boolean
  requires_inspection: boolean
  active: boolean
}

type ActiveTab = 'categories' | 'items'

export default function ItemsClient({
  categories,
  items,
  departmentName,
  departmentId,
}: {
  categories: Category[]
  items: Item[]
  departmentName: string
  departmentId: string
}) {
  const [tab, setTab] = useState<ActiveTab>('categories')
  const [showForm, setShowForm] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
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
    if (result?.error) setError(result.error)
    else { setSuccess('Item added.'); setShowForm(false) }
    setLoading(false)
  }

  async function handleUpdateItem(formData: FormData) {
    reset(); setLoading(true)
    const result = await updateItem(formData)
    if (result?.error) setError(result.error)
    else { setSuccess('Item updated.'); setEditingItemId(null) }
    setLoading(false)
  }

  const activeCategories = categories.filter(c => c.active)
  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.category_name]))

  const inputCls = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
  const checkCls = "rounded border-zinc-300 text-red-600 focus:ring-red-500"

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900">Items</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{departmentName}</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); reset(); setEditingCategoryId(null); setEditingItemId(null) }}
          className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
          {showForm ? 'Cancel' : `+ Add ${tab === 'categories' ? 'Category' : 'Item'}`}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white rounded-xl border border-zinc-200 p-1">
        {(['categories', 'items'] as ActiveTab[]).map(t => (
          <button key={t} onClick={() => { setTab(t); setShowForm(false); setEditingCategoryId(null); setEditingItemId(null); reset() }}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === t ? 'bg-red-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'
            }`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            <span className={`ml-1.5 text-xs ${tab === t ? 'text-red-200' : 'text-zinc-400'}`}>
              {t === 'categories' ? categories.length : items.length}
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
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="requires_inspection" value="true" className={checkCls} />
                  <span className="text-sm text-zinc-700">Items in this category require inspection</span>
                </label>
                <button type="submit" disabled={loading}
                  className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                  {loading ? 'Adding...' : 'Add Category'}
                </button>
              </form>
            </div>
          )}

          <div className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden">
            {categories.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-zinc-400">No categories yet. Add one above.</div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {[...categories]
                  .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
                  .map(c => (
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
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" name="requires_inspection" value="true"
                                defaultChecked={c.requires_inspection} className={checkCls} />
                              <span className="text-sm text-zinc-700">Requires inspection</span>
                            </label>
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
                            <div className="flex gap-2 mt-0.5">
                              {c.requires_inspection && <span className="text-xs text-yellow-600">Requires inspection</span>}
                              {!c.active && <span className="text-xs text-zinc-400">Inactive</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-xs text-zinc-400">{items.filter(i => i.category_id === c.id).length} items</span>
                            <button onClick={() => { setEditingCategoryId(c.id); reset() }}
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
        </div>
      )}

      {/* ── ITEMS ─────────────────────────────────────────────────────── */}
      {tab === 'items' && (
        <div>
          {showForm && (
            <div className="mb-6 rounded-xl bg-white p-5 shadow-sm border border-zinc-200">
              <h2 className="text-base font-semibold text-zinc-900 mb-4">Add Item</h2>
              {activeCategories.length === 0 ? (
                <p className="text-sm text-zinc-400">Create a category first before adding items.</p>
              ) : (
                <form action={handleAddItem} className="flex flex-col gap-4">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-sm font-medium text-zinc-700">Item Name <span className="text-red-500">*</span></label>
                      <input name="item_name" type="text" required placeholder="Axe" className={inputCls} />
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
                    <input name="item_description" type="text" placeholder="Optional description" className={inputCls} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" name="requires_presence_check" value="true" defaultChecked className={checkCls} />
                      <span className="text-sm text-zinc-700">Requires presence check during inspection</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" name="requires_inspection" value="true" className={checkCls} />
                      <span className="text-sm text-zinc-700">Requires its own inspection</span>
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
              <div className="px-6 py-12 text-center text-sm text-zinc-400">No items yet. Add one above.</div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {items.map(item => (
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
                              <input type="checkbox" name="requires_presence_check" value="true"
                                defaultChecked={item.requires_presence_check} className={checkCls} />
                              <span className="text-sm text-zinc-700">Requires presence check</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" name="requires_inspection" value="true"
                                defaultChecked={item.requires_inspection} className={checkCls} />
                              <span className="text-sm text-zinc-700">Requires inspection</span>
                            </label>
                          </div>
                          <div className="flex gap-3">
                            <div className="w-28">
                              <select name="active" defaultValue={item.active ? 'true' : 'false'} className={inputCls}>
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
                            <button type="button" onClick={() => setEditingItemId(null)}
                              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
                              Cancel
                            </button>
                          </div>
                        </form>
                      </div>
                    ) : (
                      <div className="flex items-center px-5 py-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-zinc-900">{item.item_name}</p>
                          <p className="text-xs text-zinc-400">{categoryMap[item.category_id] ?? '—'}</p>
                          {item.item_description && <p className="text-xs text-zinc-500 mt-0.5">{item.item_description}</p>}
                        </div>
                        <div className="flex items-center gap-3 ml-3">
                          {item.requires_inspection && (
                            <span className="text-xs rounded-full bg-yellow-100 text-yellow-700 px-2 py-0.5">Inspection</span>
                          )}
                          {!item.active && (
                            <span className="text-xs rounded-full bg-zinc-100 text-zinc-400 px-2 py-0.5">Inactive</span>
                          )}
                          <button onClick={() => { setEditingItemId(item.id); reset() }}
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
        </div>
      )}
    </div>
  )
}
