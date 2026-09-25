import { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Package, Rows3, Search, Check, ImageOff } from 'lucide-react'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { Skeleton } from '@/components/admin/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/admin/ui/sheet'
import type { ItemOption } from '@/components/admin/shop/ItemFilterCombobox'
import { ORDER_STATES, STATE_META, type OrderState } from '@/components/admin/shop/shopOrder'
import { cn } from '@/lib/utils'

type Group = 'orders' | 'packages'
type Preview = { orders: number; rows: number }

const GROUPS: { value: Group; label: string; description: string; icon: typeof Rows3 }[] = [
  {
    value: 'orders',
    label: 'One row per order',
    description: 'Every order on its own line, exactly as placed.',
    icon: Rows3,
  },
  {
    value: 'packages',
    label: 'One package per buyer',
    description: 'Combines a buyer’s orders to the same address and sums quantities per item.',
    icon: Package,
  },
]

function SectionLabel({ children, hint }: { children: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

export default function ExportOrdersSheet({
  items,
  defaults,
}: {
  items: ItemOption[]
  defaults: { state: string; shop_item_id: string; currency: string; user_id: string; search: string }
}) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<string>(defaults.state)
  const [itemIds, setItemIds] = useState<Set<number>>(new Set())
  const [itemQuery, setItemQuery] = useState('')
  const [minQuantity, setMinQuantity] = useState('')
  const [group, setGroup] = useState<Group>('orders')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)

  // Seed from the list's current filters each time the panel opens so "export what I'm looking at" is one click.
  useEffect(() => {
    if (!open) return
    setState(defaults.state)
    setItemIds(defaults.shop_item_id ? new Set([Number(defaults.shop_item_id)]) : new Set())
    setItemQuery('')
    setMinQuantity('')
  }, [open, defaults.state, defaults.shop_item_id])

  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (state) p.set('state', state)
    itemIds.forEach((id) => p.append('shop_item_ids[]', String(id)))
    if (minQuantity && Number(minQuantity) > 1) p.set('min_quantity', minQuantity)
    p.set('group', group)
    if (defaults.currency) p.set('currency', defaults.currency)
    if (defaults.user_id) p.set('user_id', defaults.user_id)
    if (defaults.search) p.set('search', defaults.search)
    return p.toString()
  }, [state, itemIds, minQuantity, group, defaults.currency, defaults.user_id, defaults.search])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    const controller = new AbortController()
    const t = setTimeout(() => {
      fetch(`/admin/shop_orders/export.json?${params}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: Preview | null) => {
          setPreview(data)
          setLoading(false)
        })
        .catch(() => {})
    }, 250)
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [open, params])

  const visibleItems = itemQuery ? items.filter((i) => i.name.toLowerCase().includes(itemQuery.toLowerCase())) : items

  function toggleItem(id: number) {
    setItemIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const extraFilters = [
    defaults.user_id && 'buyer',
    defaults.currency && `${defaults.currency} items`,
    defaults.search && `search “${defaults.search}”`,
  ].filter(Boolean)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-1.5">
          <Download className="size-4" />
          Export
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-4" />
            Export orders
          </SheetTitle>
          <SheetDescription>Download a CSV of shop orders, optionally combined into shipments.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-4">
          <div className="space-y-2">
            <SectionLabel>Status</SectionLabel>
            <div className="grid grid-cols-5 gap-1 rounded-lg bg-muted p-1">
              {[
                { value: '', label: 'All' },
                ...ORDER_STATES.map((s) => ({ value: s, label: STATE_META[s].label })),
              ].map((opt) => (
                <button
                  key={opt.value || 'all'}
                  type="button"
                  onClick={() => setState(opt.value)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                    state === opt.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {opt.value && (
                    <span className={cn('size-1.5 rounded-full', STATE_META[opt.value as OrderState].dot)} />
                  )}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <SectionLabel hint={itemIds.size === 0 ? 'All items' : `${itemIds.size} selected`}>Items</SectionLabel>
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="flex items-center gap-2 border-b border-border px-3">
                <Search className="size-3.5 shrink-0 text-muted-foreground" />
                <input
                  value={itemQuery}
                  onChange={(e) => setItemQuery(e.target.value)}
                  placeholder="Filter items…"
                  className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {itemIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setItemIds(new Set())}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="max-h-56 overflow-y-auto p-1">
                {visibleItems.map((item) => {
                  const checked = itemIds.has(item.id)
                  return (
                    <label
                      key={item.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent',
                        checked && 'bg-accent/60',
                      )}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleItem(item.id)} />
                      <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted">
                        {item.image_url ? (
                          <img src={item.image_url} alt="" className="size-full object-cover" loading="lazy" />
                        ) : (
                          <ImageOff className="size-3 text-muted-foreground" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    </label>
                  )
                })}
                {visibleItems.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">No items match.</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <SectionLabel>Layout</SectionLabel>
            <div className="space-y-2">
              {GROUPS.map((opt) => {
                const active = group === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setGroup(opt.value)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                      active ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-md',
                        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      <opt.icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{opt.label}</span>
                      <span className="block text-xs text-muted-foreground">{opt.description}</span>
                    </span>
                    {active && <Check className="mt-0.5 size-4 shrink-0 text-primary" />}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <SectionLabel hint="optional">Minimum quantity</SectionLabel>
            <Input
              type="number"
              min={1}
              value={minQuantity}
              onChange={(e) => setMinQuantity(e.target.value)}
              placeholder="e.g. 2"
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              {group === 'packages'
                ? 'Only include packages with at least this many items in total.'
                : 'Only include orders placed for at least this many units.'}
            </p>
          </div>

          {extraFilters.length > 0 && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Also limited by the list’s current {extraFilters.join(', ')} filter{extraFilters.length > 1 ? 's' : ''}.
            </p>
          )}
        </div>

        <SheetFooter className="border-t border-border">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              {loading || !preview ? (
                <Skeleton className="h-4 w-32" />
              ) : (
                <span className="text-muted-foreground">
                  <span className="font-medium tabular-nums text-foreground">{preview.orders.toLocaleString()}</span>{' '}
                  {preview.orders === 1 ? 'order' : 'orders'}
                  {group === 'packages' && (
                    <>
                      {' '}
                      →{' '}
                      <span className="font-medium tabular-nums text-foreground">
                        {preview.rows.toLocaleString()}
                      </span>{' '}
                      {preview.rows === 1 ? 'package' : 'packages'}
                    </>
                  )}
                  {group === 'orders' && preview.rows !== preview.orders && (
                    <>
                      {' '}
                      →{' '}
                      <span className="font-medium tabular-nums text-foreground">
                        {preview.rows.toLocaleString()}
                      </span>{' '}
                      {preview.rows === 1 ? 'row' : 'rows'}
                    </>
                  )}
                </span>
              )}
            </div>
            <Button asChild disabled={!preview || preview.rows === 0}>
              <a href={`/admin/shop_orders/export.csv?${params}`} download>
                <Download className="size-4" />
                Download CSV
              </a>
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
