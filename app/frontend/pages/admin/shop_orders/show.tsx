import { useEffect, useState, type ReactNode } from 'react'
import { router, Link, useForm } from '@inertiajs/react'
import {
  ArrowLeft,
  Copy,
  Check,
  ImageOff,
  Truck,
  CalendarClock,
  Fish,
  Coins,
  ExternalLink,
  Package,
} from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Badge } from '@/components/admin/ui/badge'
import { Textarea } from '@/components/admin/ui/textarea'
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
import {
  type Currency,
  type OrderState,
  STATE_META,
  STATE_ACTION,
  transitionsFrom,
  formatAmount,
} from '@/components/admin/shop/shopOrder'
import { cn } from '@/lib/utils'

type OrderDetail = {
  id: number
  user: { id: number; display_name: string; email: string; avatar: string }
  shop_item: { id: number; name: string; currency: Currency }
  quantity: number
  frozen_price: number
  total_cost: number
  frozen_koi_amount: number
  frozen_gold_amount: number
  requires_shipping: boolean
  requires_date_selection: boolean
  state: OrderState
  created_at: string
  updated_at: string
  image_url: string
  description: string
  selected_dates: string[]
  address: string | null
  phone: string | null
  admin_note: string | null
  user_koi_balance: number
  user_gold_balance: number
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
    </button>
  )
}

function formatDate(iso: string): string {
  // selected_dates are date-only strings; pin to local noon so the label doesn't drift a day by TZ.
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminShopOrderShow({ order }: { order: OrderDetail }) {
  const [optimisticState, setOptimisticState] = useState<OrderState | null>(null)
  const [confirmReject, setConfirmReject] = useState(false)
  const state = optimisticState ?? order.state
  const meta = STATE_META[state]

  // Clear the optimistic overlay once the server sends a fresh order.
  useEffect(() => setOptimisticState(null), [order])

  const noteForm = useForm({ admin_note: order.admin_note ?? '' })

  function applyState(next: OrderState) {
    setOptimisticState(next)
    router.patch(
      '/admin/shop_orders/bulk_update',
      { ids: [order.id], state: next },
      {
        preserveScroll: true,
        preserveState: true,
        only: ['order'],
        onError: () => setOptimisticState(null),
      },
    )
  }

  function requestState(next: OrderState) {
    if (next === 'rejected') setConfirmReject(true)
    else applyState(next)
  }

  function saveNote(e: React.FormEvent) {
    e.preventDefault()
    // Controller reads params.expect(shop_order: [...]), so nest the field under shop_order.
    noteForm.transform((data) => ({ shop_order: data }))
    noteForm.patch(`/admin/shop_orders/${order.id}`, { preserveScroll: true })
  }

  const currency = order.shop_item.currency
  const splitParts: { icon: typeof Fish; amount: number; unit: string }[] = []
  if (order.frozen_koi_amount > 0) splitParts.push({ icon: Fish, amount: order.frozen_koi_amount, unit: 'koi' })
  if (order.frozen_gold_amount > 0) splitParts.push({ icon: Coins, amount: order.frozen_gold_amount, unit: 'gold' })

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link
        href="/admin/shop_orders"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All orders
      </Link>

      {/* Header: identity + status + the primary fulfillment actions. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Order #{order.id}</h1>
            <Badge variant={meta.badge} className="gap-1.5">
              <span className={cn('size-1.5 rounded-full', meta.dot)} />
              {meta.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">Placed {order.created_at}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {transitionsFrom(state).map((s) => {
            const action = STATE_ACTION[s]
            return (
              <Button
                key={s}
                variant={s === 'rejected' ? 'destructive' : s === 'fulfilled' ? 'default' : 'outline'}
                onClick={() => requestState(s)}
              >
                <action.icon className="size-4" />
                {action.label}
              </Button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        {/* Main column. */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="size-4 text-muted-foreground" />
                Item
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                  {order.image_url ? (
                    <img src={order.image_url} alt="" className="size-full object-cover" />
                  ) : (
                    <ImageOff className="size-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/shop_items/${order.shop_item.id}/edit`} className="font-medium hover:underline">
                    {order.shop_item.name}
                  </Link>
                  {order.description && (
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{order.description}</p>
                  )}
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {formatAmount(order.frozen_price, currency)} × {order.quantity}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-semibold tabular-nums">{formatAmount(order.total_cost, currency)}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>

              {splitParts.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
                  <span className="text-muted-foreground">Paid with</span>
                  {splitParts.map((p) => (
                    <span key={p.unit} className="inline-flex items-center gap-1.5 font-medium tabular-nums">
                      <p.icon className="size-3.5 text-muted-foreground" />
                      {p.amount.toLocaleString()} {p.unit}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {order.requires_date_selection && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="size-4 text-muted-foreground" />
                  Selected dates
                </CardTitle>
              </CardHeader>
              <CardContent>
                {order.selected_dates.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {order.selected_dates.map((d) => (
                      <Badge key={d} variant="outline" className="gap-1.5 px-2.5 py-1 text-sm font-normal">
                        <CalendarClock className="size-3.5 text-muted-foreground" />
                        {formatDate(d)}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm italic text-muted-foreground">No dates selected.</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Admin note</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveNote} className="space-y-3">
                <Textarea
                  value={noteForm.data.admin_note}
                  onChange={(e) => noteForm.setData('admin_note', e.target.value)}
                  rows={3}
                  placeholder="Tracking number, fulfillment notes, anything the team should know…"
                />
                <div className="flex items-center gap-3">
                  <Button type="submit" size="sm" disabled={noteForm.processing || !noteForm.isDirty}>
                    {noteForm.processing ? 'Saving…' : 'Save note'}
                  </Button>
                  <span className="text-xs text-muted-foreground">Last updated {order.updated_at}</span>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar. */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <img src={order.user.avatar} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                <div className="min-w-0">
                  <Link
                    href={`/admin/users/${order.user.id}`}
                    className="flex items-center gap-1 font-medium hover:underline"
                  >
                    {order.user.display_name}
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">{order.user.email}</p>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">Current balance</span>
                <div className="flex items-center gap-3 font-medium tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <Fish className="size-3.5 text-muted-foreground" />
                    {order.user_koi_balance.toLocaleString()}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Coins className="size-3.5 text-muted-foreground" />
                    {order.user_gold_balance.toLocaleString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="size-4 text-muted-foreground" />
                Shipping
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {order.requires_shipping ? (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Address</p>
                      {order.address ? (
                        <p className="whitespace-pre-line">{order.address}</p>
                      ) : (
                        <p className="italic text-muted-foreground">Not provided</p>
                      )}
                    </div>
                    {order.address && <CopyButton value={order.address} label="address" />}
                  </div>
                  <div className="flex items-start justify-between gap-2 border-t border-border pt-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Phone</p>
                      {order.phone ? (
                        <p>{order.phone}</p>
                      ) : (
                        <p className="italic text-muted-foreground">Not provided</p>
                      )}
                    </div>
                    {order.phone && <CopyButton value={order.phone} label="phone" />}
                  </div>
                </>
              ) : (
                <p className="italic text-muted-foreground">This item doesn't ship.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={confirmReject} onOpenChange={setConfirmReject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this order?</AlertDialogTitle>
            <AlertDialogDescription>
              Rejecting refunds {order.user.display_name}'s koi and gold automatically (the order drops out of their
              balance). Any streak freeze it granted is revoked. You can reopen it later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                applyState('rejected')
                setConfirmReject(false)
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

AdminShopOrderShow.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
