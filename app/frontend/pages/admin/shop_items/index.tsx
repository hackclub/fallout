import { useState, useEffect, useRef, type ReactNode } from 'react'
import { router, Link } from '@inertiajs/react'
import { Search, Plus, ChevronRight, ImageOff, Store, X } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Badge } from '@/components/admin/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/admin/ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import {
  type ShopItem,
  type Currency,
  CURRENCY_LABELS,
  FLAGS,
  STAR_ICON,
  unitFor,
  hasUsdEquivalent,
  priceToUsd,
} from '@/components/admin/shop/shopItem'

type Stats = { total: number; available: number; unavailable: number; featured: number }
type Filters = { q?: string; status?: string; currency?: string; featured?: string }

const ALL = '__all__'

function applyFilters(next: Filters) {
  const params: Record<string, string> = {}
  if (next.q) params.q = next.q
  if (next.status) params.status = next.status
  if (next.currency) params.currency = next.currency
  if (next.featured) params.featured = next.featured
  router.get('/admin/shop_items', params, { preserveState: true, preserveScroll: true, replace: true })
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-3">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

export default function AdminShopItemsIndex({
  shop_items,
  stats,
  filters,
}: {
  shop_items: ShopItem[]
  stats: Stats
  filters: Filters
}) {
  const [q, setQ] = useState(filters.q ?? '')
  const firstRender = useRef(true)
  const hasFilters = !!(filters.q || filters.status || filters.currency || filters.featured)

  // Debounce the free-text search; selects apply immediately.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const t = setTimeout(() => applyFilters({ ...filters, q }), 300)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Shop items</h1>
          <p className="text-sm text-muted-foreground">Manage everything buyers can spend koi, gold and hours on.</p>
        </div>
        <Button asChild>
          <Link href="/admin/shop_items/new">
            <Plus className="size-4" />
            New item
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap divide-x divide-border rounded-lg border border-border">
        <Stat label="Total items" value={stats.total} />
        <Stat label="Available" value={stats.available} />
        <Stat label="Unavailable" value={stats.unavailable} />
        <Stat label="Featured" value={stats.featured} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or description…"
            className="pl-9"
          />
        </div>
        <Select
          value={filters.status || ALL}
          onValueChange={(v) => applyFilters({ ...filters, status: v === ALL ? '' : v })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="unavailable">Unavailable</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.currency || ALL}
          onValueChange={(v) => applyFilters({ ...filters, currency: v === ALL ? '' : v })}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Currency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All currencies</SelectItem>
            {(Object.keys(CURRENCY_LABELS) as Currency[]).map((c) => (
              <SelectItem key={c} value={c}>
                {CURRENCY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.featured || ALL}
          onValueChange={(v) => applyFilters({ ...filters, featured: v === ALL ? '' : v })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Featured" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All items</SelectItem>
            <SelectItem value="true">Featured only</SelectItem>
            <SelectItem value="false">Not featured</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => {
              setQ('')
              applyFilters({})
            }}
          >
            <X className="size-4" />
            Clear
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Item</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Properties</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TooltipProvider delayDuration={150}>
              {shop_items.map((item) => (
                <TableRow
                  key={item.id}
                  onClick={() => router.visit(`/admin/shop_items/${item.id}/edit`)}
                  className="cursor-pointer"
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                        {item.image_url ? (
                          <img src={item.image_url} alt="" className="size-full object-cover" />
                        ) : (
                          <ImageOff className="size-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{item.name || 'Untitled'}</span>
                          {item.featured && <STAR_ICON className="size-3.5 fill-current text-amber-500" />}
                        </div>
                        {item.description && (
                          <p className="max-w-md truncate text-xs text-muted-foreground">{item.description}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium tabular-nums">
                      {item.price} {unitFor(item.currency)}
                    </span>
                    {hasUsdEquivalent(item.currency) && priceToUsd(item.price) && (
                      <p className="text-xs text-muted-foreground">≈ ${priceToUsd(item.price)}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {FLAGS.filter((f) => item[f.key]).map(({ key, label, icon: Icon }) => (
                        <Tooltip key={key}>
                          <TooltipTrigger asChild>
                            <span className="flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground">
                              <Icon className="size-3.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{label}</TooltipContent>
                        </Tooltip>
                      ))}
                      {!FLAGS.some((f) => item[f.key]) && <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.status === 'available' ? 'default' : 'outline'}>
                      {item.status === 'available' ? 'Available' : 'Unavailable'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{item.orders_count ?? 0}</TableCell>
                  <TableCell>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TooltipProvider>

            {shop_items.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-16">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                      <Store className="size-6 text-muted-foreground" />
                    </div>
                    {hasFilters ? (
                      <>
                        <p className="font-medium">No items match these filters</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setQ('')
                            applyFilters({})
                          }}
                        >
                          Clear filters
                        </Button>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="font-medium">No shop items yet</p>
                          <p className="text-sm text-muted-foreground">
                            Create your first item to start the shop.
                          </p>
                        </div>
                        <Button asChild size="sm">
                          <Link href="/admin/shop_items/new">
                            <Plus className="size-4" />
                            New item
                          </Link>
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {shop_items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {shop_items.length} item{shop_items.length === 1 ? '' : 's'} shown
          {hasFilters && ` of ${stats.total} total`}
        </p>
      )}
    </div>
  )
}

AdminShopItemsIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
