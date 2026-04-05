import { useState, useEffect, useRef, useCallback } from 'react'
import { router, usePage } from '@inertiajs/react'
import type { SharedProps } from '@/types'

type ShopItem = {
  id: number
  name: string
  description: string
  price: number
  image_url: string
  status: 'available' | 'unavailable'
  featured: boolean
  ticket: boolean
}

type RowState = Omit<ShopItem, 'id'>

const BLANK_ROW: RowState = {
  name: '',
  description: '',
  price: 0,
  image_url: '',
  status: 'available',
  featured: false,
  ticket: false,
}

function itemToRow(item: ShopItem): RowState {
  return {
    name: item.name,
    description: item.description,
    price: item.price,
    image_url: item.image_url,
    status: item.status,
    featured: item.featured,
    ticket: item.ticket,
  }
}

function isDirty(original: ShopItem, current: RowState) {
  return (Object.keys(current) as (keyof RowState)[]).some((k) => current[k] !== original[k])
}

const KOI_PER_USD = 7 / 5

const inputClass = 'w-full border border-dark-brown bg-light-brown text-dark-brown px-2 py-1 rounded-xs text-sm'

function EditableRow({
  label,
  row,
  onChange,
  onSave,
  onDelete,
  saveLabel,
  saving,
  error,
}: {
  label?: string
  row: RowState
  onChange: (field: keyof RowState, value: string | number | boolean) => void
  onSave: () => void
  onDelete?: () => void
  saveLabel: string
  saving: boolean
  error?: string
}) {
  const [usdInput, setUsdInput] = useState(() => (row.ticket ? '' : String(+(row.price / KOI_PER_USD).toFixed(2))))
  // Track when USD field triggered the price change so we don't overwrite it
  const skipSyncRef = useRef(false)

  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false
      return
    }
    setUsdInput(row.ticket ? '' : String(+(row.price / KOI_PER_USD).toFixed(2)))
  }, [row.price, row.ticket])

  const handleUsdChange = useCallback(
    (val: string) => {
      setUsdInput(val)
      const usd = parseFloat(val)
      if (!isNaN(usd) && usd > 0) {
        skipSyncRef.current = true
        onChange('price', Math.round(usd * KOI_PER_USD))
      }
    },
    [onChange],
  )

  return (
    <tr className="border-b border-brown align-top">
      <td className="py-2 pr-3">
        <select value={row.status} onChange={(e) => onChange('status', e.target.value)} className={inputClass}>
          <option value="available">Available</option>
          <option value="unavailable">Unavailable</option>
        </select>
      </td>
      <td className="py-2 pr-3 text-center">
        <input
          type="checkbox"
          checked={!!row.featured}
          onChange={(e) => onChange('featured', e.target.checked)}
          className="w-4 h-4 accent-brown cursor-pointer"
        />
      </td>
      <td className="py-2 pr-3 text-center">
        <input
          type="checkbox"
          checked={!!row.ticket}
          onChange={(e) => onChange('ticket', e.target.checked)}
          className="w-4 h-4 accent-brown cursor-pointer"
        />
      </td>
      <td className="py-2 pr-3">
        <input
          type="text"
          value={row.name}
          onChange={(e) => onChange('name', e.target.value)}
          className={inputClass}
          placeholder={label}
        />
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={row.price}
            min={1}
            onChange={(e) => onChange('price', e.target.value)}
            className={inputClass}
          />
          <span className="text-xs text-dark-brown shrink-0">{row.ticket ? 'h' : 'koi'}</span>
        </div>
      </td>
      <td className="py-2 pr-3">
        {!row.ticket && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-dark-brown shrink-0">$</span>
            <input
              type="number"
              value={usdInput}
              min={0}
              step={0.01}
              onChange={(e) => handleUsdChange(e.target.value)}
              className={inputClass}
            />
          </div>
        )}
      </td>
      <td className="py-2 pr-3">
        <textarea
          value={row.description}
          rows={2}
          onChange={(e) => onChange('description', e.target.value)}
          className={inputClass}
        />
      </td>
      <td className="py-2 pr-3">
        <div className="flex gap-2 items-start">
          {row.image_url && (
            <img
              src={row.image_url}
              alt=""
              className="w-10 h-10 object-cover rounded-xs shrink-0 border border-dark-brown"
            />
          )}
          <input
            type="text"
            value={row.image_url}
            onChange={(e) => onChange('image_url', e.target.value)}
            className={inputClass}
            placeholder="https://..."
          />
        </div>
      </td>
      <td className="py-2 whitespace-nowrap">
        {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={onSave}
            disabled={saving}
            className="bg-brown border-2 border-dark-brown text-light-brown font-bold px-4 py-1 rounded-xs hover:opacity-80 disabled:opacity-40 text-sm"
          >
            {saving ? 'Saving...' : saveLabel}
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="border-2 border-dark-brown text-dark-brown font-bold px-4 py-1 rounded-xs hover:opacity-80 text-sm"
            >
              Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

export default function AdminShopItemsIndex({ shop_items }: { shop_items: ShopItem[] }) {
  const { errors } = usePage<SharedProps>().props
  const shopItemsRef = useRef(shop_items)
  const [rows, setRows] = useState<Record<number, RowState>>(
    Object.fromEntries(shop_items.map((item) => [item.id, itemToRow(item)])),
  )
  useEffect(() => {
    shopItemsRef.current = shop_items
    setRows((prev) => {
      const next = { ...prev }
      shop_items.forEach((item) => {
        if (!next[item.id]) next[item.id] = itemToRow(item)
      })
      return next
    })
  }, [shop_items])

  const [saving, setSaving] = useState<Record<number, boolean>>({})
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [newRow, setNewRow] = useState<RowState | null>(null)
  const [creating, setCreating] = useState(false)

  function update(id: number, field: keyof RowState, value: string | number | boolean) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  function save(item: ShopItem) {
    const row = rows[item.id]
    setSaving((prev) => ({ ...prev, [item.id]: true }))
    setRowErrors((prev) => ({ ...prev, [item.id]: '' }))
    router.patch(
      `/admin/shop_items/${item.id}`,
      { shop_item: row },
      {
        preserveScroll: true,
        preserveState: true,
        onSuccess: () => {
          setSaving((prev) => ({ ...prev, [item.id]: false }))
          const fresh = shopItemsRef.current.find((i) => i.id === item.id)
          if (fresh) setRows((prev) => ({ ...prev, [fresh.id]: itemToRow(fresh) }))
        },
        onError: () => {
          setSaving((prev) => ({ ...prev, [item.id]: false }))
          setRowErrors((prev) => ({ ...prev, [item.id]: 'Failed to save' }))
        },
      },
    )
  }

  function saveAll() {
    shop_items.filter((item) => isDirty(item, rows[item.id])).forEach((item) => save(item))
  }

  function destroy(item: ShopItem) {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return
    router.delete(`/admin/shop_items/${item.id}`, { preserveScroll: true })
  }

  function create() {
    if (!newRow) return
    setCreating(true)
    router.post(
      '/admin/shop_items',
      { shop_item: newRow },
      {
        preserveScroll: true,
        onSuccess: () => {
          setCreating(false)
          setNewRow(null)
        },
        onError: () => setCreating(false),
      },
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-bold text-4xl text-dark-brown">Shop Items</h1>
        <div className="flex gap-2">
          {shop_items.some((item) => isDirty(item, rows[item.id])) && (
            <button
              onClick={saveAll}
              className="bg-brown border-2 border-dark-brown text-light-brown font-bold px-4 py-2 rounded-xs hover:opacity-80 text-sm"
            >
              Save All
            </button>
          )}
          {!newRow && (
            <button
              onClick={() => setNewRow({ ...BLANK_ROW })}
              className="bg-brown border-2 border-dark-brown text-light-brown font-bold px-4 py-2 rounded-xs hover:opacity-80 text-sm"
            >
              + New Item
            </button>
          )}
        </div>
      </div>

      {Object.keys(errors).length > 0 && (
        <div className="border-2 border-dark-brown text-dark-brown p-3 mb-4 rounded-xs text-sm">
          {Object.values(errors)
            .flat()
            .map((msg, i) => (
              <p key={i}>{msg}</p>
            ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-dark-brown text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-dark-brown text-left">
              <th className="pb-2 pr-3 whitespace-nowrap">Status</th>
              <th className="pb-2 pr-3 whitespace-nowrap">Featured</th>
              <th className="pb-2 pr-3 whitespace-nowrap">Ticket</th>
              <th className="pb-2 pr-3 min-w-36">Name</th>
              <th className="pb-2 pr-3 min-w-16">Price</th>
              <th className="pb-2 pr-3 min-w-16">USD</th>
              <th className="pb-2 pr-3 min-w-52">Description</th>
              <th className="pb-2 pr-3 min-w-48">Image URL</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {shop_items.map((item) => {
              const row = rows[item.id]
              if (!row) return null
              const dirty = isDirty(item, row)
              return (
                <EditableRow
                  key={item.id}
                  row={row}
                  onChange={(field, value) => update(item.id, field, value)}
                  onSave={() => save(item)}
                  onDelete={() => destroy(item)}
                  saveLabel={dirty ? 'Save' : 'Saved'}
                  saving={!!saving[item.id]}
                  error={rowErrors[item.id]}
                />
              )
            })}
            {newRow && (
              <EditableRow
                label="New item name"
                row={newRow}
                onChange={(field, value) => setNewRow((prev) => (prev ? { ...prev, [field]: value } : prev))}
                onSave={create}
                saveLabel="Create"
                saving={creating}
              />
            )}
          </tbody>
        </table>

        {shop_items.length === 0 && !newRow && <p className="text-dark-brown mt-8 text-center">No shop items yet.</p>}
      </div>
    </div>
  )
}
