import { useState, useEffect, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import { router, usePage } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Button } from '@/components/admin/ui/button'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import type { SharedProps } from '@/types'

type ShopItem = {
  id: number
  name: string
  description: string
  price: number
  image_url: string
  status: 'available' | 'unavailable'
  featured: boolean
  currency: 'koi' | 'gold' | 'hours'
  grants_streak_freeze: boolean
  requires_shipping: boolean
}

type RowState = Omit<ShopItem, 'id'>

const BLANK_ROW: RowState = {
  name: '',
  description: '',
  price: 0,
  image_url: '',
  status: 'available',
  featured: false,
  currency: 'koi',
  grants_streak_freeze: false,
  requires_shipping: true,
}

function itemToRow(item: ShopItem): RowState {
  return {
    name: item.name,
    description: item.description,
    price: item.price,
    image_url: item.image_url,
    status: item.status,
    featured: item.featured,
    currency: item.currency,
    grants_streak_freeze: item.grants_streak_freeze,
    requires_shipping: item.requires_shipping,
  }
}

function isDirty(original: ShopItem, current: RowState) {
  return (Object.keys(current) as (keyof RowState)[]).some((k) => current[k] !== original[k])
}

const KOI_PER_USD = 7 / 5

const inputClass = 'w-full border border-input rounded-md px-2 py-1 text-sm'

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
  const [usdInput, setUsdInput] = useState(() =>
    row.currency === 'koi' || row.currency === 'gold' ? String(+(row.price / KOI_PER_USD).toFixed(2)) : '',
  )
  const skipSyncRef = useRef(false)

  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false
      return
    }
    setUsdInput(row.currency === 'koi' || row.currency === 'gold' ? String(+(row.price / KOI_PER_USD).toFixed(2)) : '')
  }, [row.price, row.currency])

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
    <TableRow className="align-top">
      <TableCell>
        <select value={row.status} onChange={(e) => onChange('status', e.target.value)} className={inputClass}>
          <option value="available">Available</option>
          <option value="unavailable">Unavailable</option>
        </select>
      </TableCell>
      <TableCell className="text-center">
        <input
          type="checkbox"
          checked={!!row.featured}
          onChange={(e) => onChange('featured', e.target.checked)}
          className="w-4 h-4 cursor-pointer"
        />
      </TableCell>
      <TableCell className="text-center">
        <input
          type="checkbox"
          checked={!!row.grants_streak_freeze}
          onChange={(e) => onChange('grants_streak_freeze', e.target.checked)}
          className="w-4 h-4 cursor-pointer"
        />
      </TableCell>
      <TableCell className="text-center">
        <input
          type="checkbox"
          checked={!!row.requires_shipping}
          onChange={(e) => onChange('requires_shipping', e.target.checked)}
          className="w-4 h-4 cursor-pointer"
        />
      </TableCell>
      <TableCell>
        <select value={row.currency} onChange={(e) => onChange('currency', e.target.value)} className={inputClass}>
          <option value="koi">Koi</option>
          <option value="gold">Gold</option>
          <option value="hours">Hours</option>
        </select>
      </TableCell>
      <TableCell>
        <input
          type="text"
          value={row.name}
          onChange={(e) => onChange('name', e.target.value)}
          className={inputClass}
          placeholder={label}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={row.price}
            min={1}
            onChange={(e) => onChange('price', e.target.value)}
            className={inputClass}
          />
          <span className="text-xs text-muted-foreground shrink-0">
            {row.currency === 'hours' ? 'h' : row.currency}
          </span>
        </div>
      </TableCell>
      <TableCell>
        {(row.currency === 'koi' || row.currency === 'gold') && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground shrink-0">$</span>
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
      </TableCell>
      <TableCell>
        <textarea
          value={row.description}
          rows={2}
          onChange={(e) => onChange('description', e.target.value)}
          className={inputClass}
        />
      </TableCell>
      <TableCell>
        <div className="flex gap-2 items-start">
          {row.image_url && (
            <img src={row.image_url} alt="" className="w-10 h-10 object-cover rounded shrink-0 border border-border" />
          )}
          <input
            type="text"
            value={row.image_url}
            onChange={(e) => onChange('image_url', e.target.value)}
            className={inputClass}
            placeholder="https://..."
          />
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {error && <p className="text-xs text-destructive mb-1">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onSave} disabled={saving}>
            {saving ? 'Saving...' : saveLabel}
          </Button>
          {onDelete && (
            <Button size="sm" variant="destructive" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

export default function AdminShopItemsIndex({ shop_items }: { shop_items: ShopItem[] }) {
  const { errors } = usePage<SharedProps>().props
  const [rows, setRows] = useState<Record<number, RowState>>(
    Object.fromEntries(shop_items.map((item) => [item.id, itemToRow(item)])),
  )
  useEffect(() => {
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
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Shop Items</h1>
        <div className="flex gap-2">
          {shop_items.some((item) => isDirty(item, rows[item.id])) && (
            <Button variant="outline" size="sm" onClick={saveAll}>
              Save All
            </Button>
          )}
          {!newRow && (
            <Button variant="outline" size="sm" onClick={() => setNewRow({ ...BLANK_ROW })}>
              + New Item
            </Button>
          )}
        </div>
      </div>

      {Object.keys(errors).length > 0 && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            {Object.values(errors)
              .flat()
              .map((msg, i) => (
                <p key={i}>{msg}</p>
              ))}
          </AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Status</TableHead>
              <TableHead className="whitespace-nowrap">Featured</TableHead>
              <TableHead className="whitespace-nowrap">Streak Freeze</TableHead>
              <TableHead className="whitespace-nowrap">Needs Shipping</TableHead>
              <TableHead className="whitespace-nowrap">Currency</TableHead>
              <TableHead className="min-w-36">Name</TableHead>
              <TableHead className="min-w-16">Price</TableHead>
              <TableHead className="min-w-16">USD</TableHead>
              <TableHead className="min-w-52">Description</TableHead>
              <TableHead className="min-w-48">Image URL</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
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
            {shop_items.length === 0 && !newRow && (
              <TableRow>
                <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
                  No shop items yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

AdminShopItemsIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
