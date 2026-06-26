import { useEffect, useRef, useState, type ReactNode } from 'react'
import { router, Link, Deferred } from '@inertiajs/react'
import { Search, X, Store, MoreHorizontal, UserPlus, Eye, Fish, Coins } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Badge } from '@/components/admin/ui/badge'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { Skeleton } from '@/components/admin/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/admin/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/admin/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/admin/ui/alert-dialog'
import UserSearchCombobox, { type UserOption } from '@/components/admin/UserSearchCombobox'
import ItemFilterCombobox, { type ItemOption } from '@/components/admin/shop/ItemFilterCombobox'
import {
  type Currency,
  type OrderState,
  type OrderRow,
  STATE_META,
  STATE_ACTION,
  transitionsFrom,
  formatAmount,
} from '@/components/admin/shop/shopOrder'
import { cn } from '@/lib/utils'
import type { PagyProps } from '@/types'

type Counts = { all: number; pending: number; on_hold: number; fulfilled: number; rejected: number }
type Stats = { orders: number; koi: number; gold: number }

const ALL = '__all__'
const CURRENCIES: Currency[] = ['koi', 'gold', 'hours']
const CURRENCY_LABELS: Record<Currency, string> = { koi: 'Koi', gold: 'Gold', hours: 'Hours' }

// Tabs across the top: all + each state, in workflow order.
const TABS: { value: string; label: string; key: keyof Counts }[] = [
  { value: '', label: 'All', key: 'all' },
  { value: 'pending', label: 'Pending', key: 'pending' },
  { value: 'on_hold', label: 'On hold', key: 'on_hold' },
  { value: 'fulfilled', label: 'Fulfilled', key: 'fulfilled' },
  { value: 'rejected', label: 'Rejected', key: 'rejected' },
]

function StatCell({ label, value, icon: Icon }: { label: string; value?: number; icon?: typeof Fish }) {
  return (
    <div className="px-4 py-3">
      {value == null ? (
        <Skeleton className="my-0.5 h-7 w-20" />
      ) : (
        <p className="flex items-center gap-1.5 text-2xl font-semibold tabular-nums">
          {Icon && <Icon className="size-4 text-muted-foreground" />}
          {value.toLocaleString()}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function StateBadge({ state }: { state: OrderState }) {
  const meta = STATE_META[state]
  return (
    <Badge variant={meta.badge} className="gap-1.5">
      <span className={cn('size-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </Badge>
  )
}

function OrdersSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10" />
            <TableHead>User</TableHead>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Ordered</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, r) => (
            <TableRow key={r} className="hover:bg-transparent">
              <TableCell>
                <Skeleton className="size-4 rounded" />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <Skeleton className="size-7 shrink-0 rounded-full" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-32" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-4 w-16" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-20 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export default function AdminShopOrdersIndex({
  orders,
  pagy,
  stats,
  counts,
  state_filter,
  item_filter,
  currency_filter,
  user_id_filter,
  user_filter,
  search,
  items,
}: {
  orders?: OrderRow[]
  pagy?: PagyProps
  stats?: Stats
  counts: Counts
  state_filter: string
  item_filter: string
  currency_filter: string
  user_id_filter: string
  user_filter: UserOption | null
  search: string
  items: ItemOption[]
}) {
  const [q, setQ] = useState(search)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [optimistic, setOptimistic] = useState<Record<number, OrderState>>({})
  const [confirmReject, setConfirmReject] = useState<{ ids: number[] } | null>(null)
  const [userPickerOpen, setUserPickerOpen] = useState(false)
  const didMount = useRef(false)

  // Reset transient selection/optimistic state whenever a fresh page of orders arrives.
  useEffect(() => {
    setSelected(new Set())
    setOptimistic({})
  }, [orders])

  const rows: OrderRow[] = (orders ?? []).map((o) => ({ ...o, state: optimistic[o.id] ?? o.state }))
  const allIds = rows.map((o) => o.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))
  const someSelected = selected.size > 0 && !allSelected

  function paramsFor(overrides: Record<string, string | undefined> = {}) {
    const base: Record<string, string | undefined> = {
      state: state_filter || undefined,
      shop_item_id: item_filter || undefined,
      currency: currency_filter || undefined,
      user_id: user_id_filter || undefined,
      search: q || undefined,
      ...overrides,
    }
    return Object.fromEntries(Object.entries(base).filter(([, v]) => v))
  }

  // Partial reload — names the deferred props in `only` so they resolve eagerly (no skeleton flash),
  // and echoes the controlled filter values so the tabs/selects stay in sync. Resets to page 1.
  function reload(overrides: Record<string, string | undefined> = {}) {
    router.get('/admin/shop_orders', paramsFor(overrides), {
      only: [
        'orders',
        'pagy',
        'stats',
        'counts',
        'state_filter',
        'item_filter',
        'currency_filter',
        'user_id_filter',
        'user_filter',
        'search',
      ],
      preserveState: true,
      preserveScroll: true,
      replace: true,
    })
  }

  // Debounced search.
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      return
    }
    const t = setTimeout(() => reload({ search: q || undefined }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  // Optimistically flip the affected rows, fire one bulk PATCH, revert on failure. The redirect's
  // partial reload (only:) refreshes the list, counts, and money in place — Shopify-grade snappiness.
  function applyState(ids: number[], state: OrderState) {
    if (ids.length === 0) return
    setOptimistic((p) => {
      const n = { ...p }
      ids.forEach((id) => (n[id] = state))
      return n
    })
    setSelected(new Set())
    router.patch(
      '/admin/shop_orders/bulk_update',
      { ids, state },
      {
        preserveScroll: true,
        preserveState: true,
        only: ['orders', 'pagy', 'stats', 'counts'],
        onError: () =>
          setOptimistic((p) => {
            const n = { ...p }
            ids.forEach((id) => delete n[id])
            return n
          }),
      },
    )
  }

  // Rejecting refunds the buyer, so route every reject through a confirmation.
  function requestState(ids: number[], state: OrderState) {
    if (state === 'rejected') setConfirmReject({ ids })
    else applyState(ids, state)
  }

  function toggleRow(id: number, on: boolean) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })
  }

  function toggleAll(on: boolean) {
    setSelected(on ? new Set(allIds) : new Set())
  }

  function filterByUser(user: UserOption) {
    setUserPickerOpen(false)
    reload({ user_id: String(user.id) })
  }

  const hasFilters = !!(q || state_filter || item_filter || currency_filter || user_id_filter)
  function clearFilters() {
    setQ('')
    router.get('/admin/shop_orders', {}, { preserveScroll: true })
  }

  const selectedIds = [...selected]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shop orders</h1>
        <p className="text-sm text-muted-foreground">Work the fulfillment queue and trace who bought what.</p>
      </div>

      <div className="flex flex-wrap divide-x divide-border rounded-lg border border-border">
        <StatCell label="Orders in view" value={stats?.orders} />
        <StatCell label="Koi collected" value={stats?.koi} icon={Fish} />
        <StatCell label="Gold collected" value={stats?.gold} icon={Coins} />
      </div>

      {/* State tabs with live counts. */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {TABS.map((tab) => {
          const active = state_filter === tab.value
          return (
            <button
              key={tab.value || 'all'}
              onClick={() => reload({ state: tab.value || undefined })}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-xs tabular-nums',
                  active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                {counts[tab.key]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Filter bar. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by user, email, item, or order #…"
            className="pl-9"
          />
        </div>
        <ItemFilterCombobox
          items={items}
          value={item_filter}
          onChange={(id) => reload({ shop_item_id: id || undefined })}
        />
        <Select value={currency_filter || ALL} onValueChange={(v) => reload({ currency: v === ALL ? undefined : v })}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Currency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All currencies</SelectItem>
            {CURRENCIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CURRENCY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {user_id_filter ? (
          <Badge variant="secondary" className="h-9 gap-1.5 px-2.5">
            {user_filter?.avatar && (
              <img src={user_filter.avatar} alt="" className="size-4 rounded-full object-cover" />
            )}
            {user_filter?.display_name ?? `User #${user_id_filter}`}
            <button
              onClick={() => reload({ user_id: undefined })}
              className="hover:text-foreground"
              aria-label="Clear user filter"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ) : (
          <Popover open={userPickerOpen} onOpenChange={setUserPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-1.5">
                <UserPlus className="size-4" />
                Filter by user
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <UserSearchCombobox autoFocus onSelect={filterByUser} />
            </PopoverContent>
          </Popover>
        )}
        {hasFilters && (
          <Button variant="ghost" onClick={clearFilters}>
            <X className="size-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Bulk action bar. */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <span className="text-muted-foreground">·</span>
          {(['fulfilled', 'on_hold', 'rejected'] as OrderState[]).map((s) => {
            const action = STATE_ACTION[s]
            return (
              <Button
                key={s}
                size="sm"
                variant={s === 'rejected' ? 'destructive' : s === 'fulfilled' ? 'default' : 'outline'}
                onClick={() => requestState(selectedIds, s)}
              >
                <action.icon className="size-3.5" />
                {action.label}
              </Button>
            )
          })}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      <Deferred data={['orders', 'pagy']} fallback={<OrdersSkeleton />}>
        <div>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={(c) => toggleAll(c === true)}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Ordered</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((order, i) => {
                  const isSelected = selected.has(order.id)
                  return (
                    <TableRow
                      key={order.id}
                      data-state={isSelected ? 'selected' : undefined}
                      onClick={() => router.visit(`/admin/shop_orders/${order.id}`)}
                      className="t-row-enter cursor-pointer"
                      style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(c) => toggleRow(order.id, c === true)}
                          aria-label={`Select order ${order.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <img
                            src={order.user.avatar}
                            alt=""
                            className="size-7 shrink-0 rounded-full object-cover"
                            loading="lazy"
                          />
                          <div className="min-w-0">
                            <p className="font-medium">{order.user.display_name}</p>
                            <p className="truncate text-xs text-muted-foreground">{order.user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{order.shop_item.name}</span>
                        {order.quantity > 1 && (
                          <span className="ml-1.5 text-xs text-muted-foreground">× {order.quantity}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatAmount(order.total_cost, order.shop_item.currency)}
                      </TableCell>
                      <TableCell>
                        <StateBadge state={order.state} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                        {order.created_at}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-7" aria-label="Order actions">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            {transitionsFrom(order.state).map((s) => {
                              const action = STATE_ACTION[s]
                              return (
                                <DropdownMenuItem
                                  key={s}
                                  variant={s === 'rejected' ? 'destructive' : 'default'}
                                  onSelect={() => requestState([order.id], s)}
                                >
                                  <action.icon className="size-4" />
                                  {action.label}
                                </DropdownMenuItem>
                              )
                            })}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/shop_orders/${order.id}`}>
                                <Eye className="size-4" />
                                View details
                              </Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}

                {rows.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7} className="py-16">
                      <div className="flex flex-col items-center gap-3 text-center">
                        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                          <Store className="size-6 text-muted-foreground" />
                        </div>
                        {hasFilters ? (
                          <>
                            <p className="font-medium">No orders match these filters</p>
                            <Button variant="outline" size="sm" onClick={clearFilters}>
                              Clear filters
                            </Button>
                          </>
                        ) : (
                          <div>
                            <p className="font-medium">No orders yet</p>
                            <p className="text-sm text-muted-foreground">Orders appear here as buyers spend.</p>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {pagy && pagy.count > 0 && (
            <div className="flex items-center justify-between pt-4">
              <span className="text-sm text-muted-foreground">
                {pagy.pages > 1
                  ? `Showing ${(pagy.page - 1) * pagy.limit + 1}–${Math.min(pagy.page * pagy.limit, pagy.count)} of ${pagy.count} orders`
                  : `${pagy.count} ${pagy.count === 1 ? 'order' : 'orders'}`}
              </span>
              {pagy.pages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => reload({ page: String(pagy.prev) })}
                    disabled={!pagy.prev}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {pagy.page} / {pagy.pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => reload({ page: String(pagy.next) })}
                    disabled={!pagy.next}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Deferred>

      <AlertDialog open={!!confirmReject} onOpenChange={(open) => !open && setConfirmReject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reject {confirmReject?.ids.length === 1 ? 'this order' : `${confirmReject?.ids.length} orders`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Rejecting refunds the buyer's koi and gold automatically (the order drops out of their balance). Streak
              freezes granted by the order are revoked. This can be reopened later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmReject) applyState(confirmReject.ids, 'rejected')
                setConfirmReject(null)
              }}
            >
              Reject &amp; refund
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

AdminShopOrdersIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
