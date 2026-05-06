import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link, router, useForm, usePage } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Button } from '@/components/admin/ui/button'
import { Badge } from '@/components/admin/ui/badge'
import { Card, CardContent } from '@/components/admin/ui/card'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import type { SharedProps } from '@/types'

type Order = {
  id: number
  user: { id: number; display_name: string; email: string; avatar: string }
  frozen_koi_amount: number
  frozen_usd_cents: number
  state: 'pending' | 'fulfilled' | 'rejected' | 'on_hold'
  admin_note: string | null
  created_at: string
  action_type: 'new_grant' | 'top_up'
  pending_topup: { id: number; amount_cents: number; created_at: string } | null
}

type LedgerRow = {
  id: number
  amount_cents: number
  status: 'pending' | 'completed' | 'failed'
  completed_at: string | null
  failed_reason: string | null
  created_at: string
}

type Ledger = {
  expected_cents: number
  transferred_cents: number
  delta_cents: number
  recent_topups: LedgerRow[]
}

type Rates = {
  koi_to_cents_numerator: number
  koi_to_cents_denominator: number
  koi_to_hours_numerator: number | null
  koi_to_hours_denominator: number | null
}

function formatDollars(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`
}

function LedgerSnapshot({
  label,
  expected,
  transferred,
  highlight,
}: {
  label: string
  expected: number
  transferred: number
  highlight?: boolean
}) {
  const delta = expected - transferred
  return (
    <div className={`rounded-md border p-2.5 ${highlight ? 'border-primary bg-primary/5' : 'border-border'}`}>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">{label}</div>
      <dl className="space-y-0.5 text-xs font-mono">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">expected</dt>
          <dd>{formatDollars(expected)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">transferred</dt>
          <dd className={transferred < 0 ? 'text-red-700' : ''}>{formatDollars(transferred)}</dd>
        </div>
        <div className="flex justify-between border-t border-border pt-1 mt-1">
          <dt className="text-muted-foreground">delta</dt>
          <dd className={delta > 0 ? 'text-green-700' : delta < 0 ? 'text-red-700' : ''}>{formatDollars(delta)}</dd>
        </div>
      </dl>
    </div>
  )
}

export default function AdminProjectGrantsOrdersShow({
  order,
  ledger,
  rates,
  hours_configured,
  is_hcb,
}: {
  order: Order
  ledger: Ledger
  rates: Rates
  hours_configured: boolean
  is_hcb: boolean
}) {
  const { errors } = usePage<SharedProps>().props
  const stateForm = useForm({ state: order.state, admin_note: order.admin_note || '' })
  // Default reconciliation choice depends on role: only hcb can mark as completed,
  // so non-hcb admins should land on `failed` (the only option they can submit).
  const [reconcileResolution, setReconcileResolution] = useState<'completed' | 'failed'>(
    is_hcb ? 'completed' : 'failed',
  )
  const [failedReason, setFailedReason] = useState('')

  // The transition into `fulfilled` is the ONLY state change that moves real money on
  // HCB — every other transition is just bookkeeping and is freely reversible.
  const wouldFireTopup = stateForm.data.state === 'fulfilled' && order.state !== 'fulfilled'

  function submitState(e: React.FormEvent) {
    e.preventDefault()
    if (wouldFireTopup) {
      const msg =
        `Approving this grant will trigger an HCB topup for this user.\n\n` +
        `• A ProjectFundingTopupJob will enqueue and push funds to HCB\n` +
        `• The user's active grant card will be topped up, OR a new card will be issued if they have no active card\n` +
        `• To reverse later, use the Refund action — flipping state back to rejected is blocked\n\n` +
        `Continue?`
      if (!window.confirm(msg)) return
    }
    stateForm.patch(`/admin/project_grants/orders/${order.id}`)
  }

  function submitReconcile() {
    if (
      confirm(
        `Mark pending topup as "${reconcileResolution}"? Verify against HCB first — this changes what "transferred" sums to.`,
      )
    ) {
      router.post(`/admin/project_grants/orders/${order.id}/reconcile_pending_topup`, {
        resolution: reconcileResolution,
        failed_reason: reconcileResolution === 'failed' ? failedReason : undefined,
      })
    }
  }

  const hoursLabel =
    hours_configured && rates.koi_to_hours_numerator != null && rates.koi_to_hours_denominator != null
      ? ` · ≈ ${Math.round(((order.frozen_koi_amount * rates.koi_to_hours_numerator) / rates.koi_to_hours_denominator) * 100) / 100} hours`
      : ''

  return (
    <div>
      <div className="mb-4">
        <Link href="/admin/project_grants/orders" className="text-sm text-primary hover:underline">
          ← Orders
        </Link>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight mb-6">Order #{order.id}</h1>

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

      {order.pending_topup && (
        <Alert className="mb-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
          <AlertDescription>
            <div className="font-medium mb-2">⚠ Pending topup awaiting reconciliation</div>
            <div className="text-sm mb-3">
              Amount {formatDollars(order.pending_topup.amount_cents)} · created {order.pending_topup.created_at}.
              Verify in HCB whether this write landed, then mark it completed or failed below.
            </div>
            {is_hcb ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <select
                    value={reconcileResolution}
                    onChange={(e) => setReconcileResolution(e.target.value as 'completed' | 'failed')}
                    className="border border-input rounded-md px-2 py-1 text-sm"
                  >
                    <option value="completed">Mark as completed (topup happened on HCB)</option>
                    <option value="failed">Mark as failed (topup did not happen)</option>
                  </select>
                  <Button size="sm" onClick={submitReconcile}>
                    Reconcile
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Reconciliation requires the <code>hcb</code> role.
              </p>
            )}
            {is_hcb && reconcileResolution === 'failed' && (
              <input
                type="text"
                value={failedReason}
                onChange={(e) => setFailedReason(e.target.value)}
                placeholder="Reason (optional)"
                className="w-full border border-input rounded-md px-2 py-1 text-sm"
              />
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">User:</span>{' '}
              <Link href={`/admin/users/${order.user.id}`} className="font-medium hover:underline">
                {order.user.display_name}
              </Link>{' '}
              · {order.user.email}
            </div>
            <div>
              <span className="text-muted-foreground">Koi paid:</span>{' '}
              <span className="font-mono">{order.frozen_koi_amount}</span>
            </div>
            <div>
              <span className="text-muted-foreground">USD:</span>{' '}
              <span className="font-mono">{formatDollars(order.frozen_usd_cents)}</span>
              {hoursLabel}
            </div>
            <div>
              <span className="text-muted-foreground">Action:</span>{' '}
              <Badge variant={order.action_type === 'new_grant' ? 'default' : 'secondary'}>
                {order.action_type === 'new_grant' ? 'New grant' : 'Top-up'}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Requested:</span> {order.created_at}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="font-medium mb-2 text-sm">User ledger</div>
            {(() => {
              // The `expected` sum only counts FULFILLED orders. For pending/on_hold,
              // the current order isn't in the ledger yet — show what fulfilling it
              // WOULD do. For fulfilled/rejected, the ledger already reflects this
              // order's contribution (or removal).
              const awaitingDecision = order.state === 'pending' || order.state === 'on_hold'
              const stateLabel: Record<Order['state'], string> = {
                pending: `This order's $${(order.frozen_usd_cents / 100).toFixed(2)} is NOT yet in the ledger below. Fulfilling would add it to expected.`,
                on_hold: `This order's $${(order.frozen_usd_cents / 100).toFixed(2)} is NOT yet in the ledger below. Fulfilling would add it to expected.`,
                fulfilled: `This order's $${(order.frozen_usd_cents / 100).toFixed(2)} IS included in expected below.`,
                rejected: `This order's $${(order.frozen_usd_cents / 100).toFixed(2)} is EXCLUDED from expected (rejected).`,
              }
              return <p className="text-xs text-muted-foreground mb-3 italic">{stateLabel[order.state]}</p>
            })()}

            {/* Side-by-side "current" vs "after topup lands" for pending/on_hold orders
                so admins see the END state (not the mid-flight moment between state
                change and job completion). The middle arrow shows the topup size that
                will fire. If the delta is already ≤ 0 (over-transferred), topup = $0
                and the "after" box mirrors current. */}
            {order.state === 'pending' || order.state === 'on_hold' ? (
              (() => {
                const projectedExpected = ledger.expected_cents + order.frozen_usd_cents
                // Topup only fires when delta > 0 post-state-change. Otherwise
                // transferred doesn't change (over-transfer sits as-is; Sentry warns).
                const intendedTopup = Math.max(projectedExpected - ledger.transferred_cents, 0)
                const projectedTransferred = ledger.transferred_cents + intendedTopup
                return (
                  <div>
                    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 mb-3 items-stretch">
                      <LedgerSnapshot
                        label="Current"
                        expected={ledger.expected_cents}
                        transferred={ledger.transferred_cents}
                      />
                      <div className="flex flex-col items-center justify-center text-xs text-muted-foreground px-1">
                        <div className="text-[10px] uppercase tracking-wide">topup</div>
                        <div className="font-mono font-semibold text-foreground">{formatDollars(intendedTopup)}</div>
                        <div className="text-sm">→</div>
                      </div>
                      <LedgerSnapshot
                        label="After topup lands"
                        expected={projectedExpected}
                        transferred={projectedTransferred}
                        highlight
                      />
                    </div>
                    {intendedTopup === 0 && (
                      <p className="text-xs text-muted-foreground italic mb-2">
                        No topup will fire — delta after state change is ≤ 0 (already over-transferred).
                      </p>
                    )}
                  </div>
                )
              })()
            ) : (
              <LedgerSnapshot label="Current" expected={ledger.expected_cents} transferred={ledger.transferred_cents} />
            )}

            <dl className="mt-4 space-y-3 text-sm border-t border-border pt-3">
              <div>
                <dt className="text-xs font-semibold">What each number means</dt>
              </div>
              <div>
                <dt className="font-mono text-xs text-muted-foreground">expected</dt>
                <dd className="text-xs text-muted-foreground mt-0.5">
                  Sum of this user's <strong>fulfilled</strong> orders. Always ≥ 0. Grows when new orders are fulfilled;
                  drops if an admin flips fulfilled → rejected.
                </dd>
              </div>
              <div>
                <dt className="font-mono text-xs text-muted-foreground">transferred</dt>
                <dd className="text-xs text-muted-foreground mt-0.5">
                  Net completed ledger rows: <strong>in-topups minus out-refunds</strong>. Should be ≥ 0 in normal
                  operation. Negative means more out-adjustments were recorded than in-topups — usually a data-entry
                  mistake worth investigating via the Warnings table.
                </dd>
              </div>
              <div>
                <dt className="font-mono text-xs text-muted-foreground">delta</dt>
                <dd className="text-xs text-muted-foreground mt-0.5">
                  <code>expected − transferred</code>. <strong>Positive</strong>: money still owed; the next topup will
                  send up to this amount (capped by the ratchet to never exceed what the card needs to reach target).{' '}
                  <strong>Zero</strong>: aligned; no action. <strong>Negative</strong>: over-transferred; the service
                  Sentry-warns and sends nothing.
                </dd>
              </div>
            </dl>
            {ledger.delta_cents < 0 && (
              <div className="mt-3 text-xs text-red-700 border-l-2 border-red-700 pl-2">
                Over-transferred. Service will no-op; no automatic claw-back. Use the Warnings table to review.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="font-medium mb-3 text-sm">Update state</div>

          {/* State semantics reference — shown up front so admins don't discover
              money-movement behavior mid-click. */}
          <div className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
            <div>
              <code className="font-semibold">pending</code> — awaiting review. No money moves. Koi stays deducted.
            </div>
            <div>
              <strong className="text-red-700">
                <code>fulfilled</code> — approves the grant and sends real money on HCB.
              </strong>{' '}
              Tops up the user's active grant card, or issues a new one if they don't have one. NOT reversible: flipping
              back to pending/rejected later does NOT claw the money back.
            </div>
            <div>
              <code className="font-semibold">rejected</code> — denies the grant. No money moves. Refunds koi to the
              user (via the User#koi computation).
            </div>
            <div>
              <code className="font-semibold">on_hold</code> — pause for more info. No money moves. Koi stays deducted
              until you decide.
            </div>
          </div>

          {!is_hcb ? (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-muted-foreground">Current state:</span>
                <Badge variant={order.state === 'fulfilled' ? 'default' : 'outline'}>{order.state}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                You're viewing in read-only mode. The <code>hcb</code> role is required to change state, reconcile
                topups, or edit settings.
              </p>
            </div>
          ) : (
            <form onSubmit={submitState} className="space-y-3">
              <select
                value={stateForm.data.state}
                onChange={(e) => stateForm.setData('state', e.target.value as Order['state'])}
                className="w-full border border-input rounded-md px-3 py-2 text-sm"
              >
                <option value="pending">pending</option>
                <option value="fulfilled">fulfilled</option>
                <option value="rejected">rejected</option>
                <option value="on_hold">on_hold</option>
              </select>
              {wouldFireTopup && (
                <div className="rounded-md border-2 border-red-700 bg-red-50 dark:bg-red-950/40 p-3 text-sm">
                  <div className="font-bold text-red-700 mb-1">⚠ This will move real money on HCB.</div>
                  <div className="text-red-900 dark:text-red-200 text-xs">
                    Saving will enqueue a ProjectFundingTopupJob and send ${(order.frozen_usd_cents / 100).toFixed(2)}{' '}
                    to <strong>{order.user.display_name}</strong>'s{' '}
                    {order.action_type === 'new_grant' ? (
                      <>grant card (a new one will be issued — no active card exists)</>
                    ) : (
                      <>active grant card (top-up)</>
                    )}
                    . You'll be asked to confirm one more time.
                  </div>
                </div>
              )}
              <textarea
                value={stateForm.data.admin_note}
                onChange={(e) => stateForm.setData('admin_note', e.target.value)}
                rows={2}
                placeholder="Admin note…"
                className="w-full border border-input rounded-md px-3 py-2 text-sm"
              />
              <Button
                type="submit"
                disabled={stateForm.processing}
                variant={wouldFireTopup ? 'destructive' : 'default'}
              >
                {stateForm.processing ? 'Saving…' : wouldFireTopup ? 'Approve & send funds' : 'Save'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="font-medium mb-3 text-sm">Recent topups for this user</div>
          {ledger.recent_topups.length === 0 ? (
            <div className="text-sm text-muted-foreground">No topups yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-2">Amount</th>
                  <th className="py-1 pr-2">Status</th>
                  <th className="py-1 pr-2">Completed</th>
                  <th className="py-1 pr-2">Created</th>
                  <th className="py-1 pr-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {ledger.recent_topups.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="py-1 pr-2 font-mono">{formatDollars(t.amount_cents)}</td>
                    <td className="py-1 pr-2">
                      <Badge
                        variant={
                          t.status === 'completed' ? 'default' : t.status === 'failed' ? 'destructive' : 'secondary'
                        }
                      >
                        {t.status}
                      </Badge>
                    </td>
                    <td className="py-1 pr-2 text-muted-foreground">{t.completed_at ?? '—'}</td>
                    <td className="py-1 pr-2 text-muted-foreground">{t.created_at}</td>
                    <td className="py-1 pr-2 text-muted-foreground">{t.failed_reason ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

AdminProjectGrantsOrdersShow.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
