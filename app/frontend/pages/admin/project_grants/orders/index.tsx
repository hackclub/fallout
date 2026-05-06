import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { Link, router, usePage } from '@inertiajs/react'
import { Cog, Plus } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { hcbGrantUrl } from '@/lib/hcb'
import TimeAgo from '@/components/shared/TimeAgo'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/admin/ui/tooltip'
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
import type { PagyProps } from '@/types'

type Order = {
  id: number
  user: { id: number; display_name: string; email: string; avatar: string }
  frozen_koi_amount: number
  frozen_usd_cents: number
  action_type: 'new_grant' | 'top_up'
  user_total_transferred_cents: number
  state: 'pending' | 'fulfilled' | 'rejected' | 'on_hold'
  created_at: string
}

type Topup = {
  id: number
  user: { id: number; display_name: string }
  hcb_grant_card_hcb_id: string | null
  project_grant_order_id: number | null
  amount_cents: number
  direction: 'in' | 'out'
  status: 'pending' | 'completed' | 'failed'
  counts_toward_funding: boolean
  note: string | null
  completed_at: string | null
  failed_reason: string | null
  created_at: string
}

const TOPUP_STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
]

type Warning = {
  id: number
  kind: string
  message: string
  details: Record<string, unknown>
  detection_count: number
  last_detected_at: string
  resolved_at: string | null
  resolution_note: string | null
  resolved_by: { id: number; display_name: string } | null
  user: { id: number; display_name: string } | null
  hcb_grant_card: { id: number; hcb_id: string | null } | null
  project_grant_order_id: number | null
  project_funding_topup_id: number | null
}

type WarningKindDescription = {
  title: string
  detail: string
  example: string
}

type Rates = {
  koi_to_cents_numerator: number
  koi_to_cents_denominator: number
  koi_to_hours_numerator: number | null
  koi_to_hours_denominator: number | null
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function hoursFor(koi: number, rates: Rates): number | null {
  if (rates.koi_to_hours_numerator == null || rates.koi_to_hours_denominator == null) return null
  return Math.round(((koi * rates.koi_to_hours_numerator) / rates.koi_to_hours_denominator) * 100) / 100
}

const STATE_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'on_hold', label: 'On Hold' },
]

export default function AdminProjectGrantsOrdersIndex({
  orders,
  pagy,
  state_filter,
  topups,
  topups_pagy,
  topup_status_filter,
  warnings,
  warnings_include_resolved,
  warning_kind_descriptions,
  last_scan_at,
  hcb_auth_status,
  stats,
  rates,
  hours_configured,
  is_hcb,
}: {
  orders: Order[]
  pagy: PagyProps
  state_filter: string
  topups: Topup[]
  topups_pagy: PagyProps
  topup_status_filter: string
  warnings: Warning[]
  warnings_include_resolved: boolean
  warning_kind_descriptions: Record<string, WarningKindDescription>
  last_scan_at: string | null
  hcb_auth_status: 'connected' | 'expired' | 'disconnected' | 'not_configured'
  stats: { issued_actual_cents: number; issued_expected_cents: number; active_cards: number; transactions: number }
  rates: Rates
  hours_configured: boolean
  is_hcb: boolean
}) {
  const hcbHost = usePage().props.hcb_host as string | undefined
  const [showWarningDocs, setShowWarningDocs] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showConfirm, setShowConfirm] = useState(false)

  const selectableOrders = useMemo(() => orders.filter((o) => o.state !== 'fulfilled'), [orders])
  const allSelectableSelected = selectableOrders.length > 0 && selectableOrders.every((o) => selectedIds.has(o.id))

  function toggleAll() {
    if (allSelectableSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectableOrders.map((o) => o.id)))
    }
  }

  function toggleOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedOrders = orders.filter((o) => selectedIds.has(o.id))
  const totalKoi = selectedOrders.reduce((s, o) => s + o.frozen_koi_amount, 0)
  const totalCents = selectedOrders.reduce((s, o) => s + o.frozen_usd_cents, 0)
  const distinctUsers = new Set(selectedOrders.map((o) => o.user.id))
  const newGrantUserIds = new Set(selectedOrders.filter((o) => o.action_type === 'new_grant').map((o) => o.user.id))

  function submitBatchFulfill() {
    router.post(
      '/admin/project_grants/orders/batch_fulfill',
      { order_ids: Array.from(selectedIds) },
      {
        onSuccess: () => {
          setSelectedIds(new Set())
          setShowConfirm(false)
        },
      },
    )
  }

  // Keep the orders and topups tables' filter + pagination params independent —
  // changing one should NOT clobber the other (user would be dumped back to page 1
  // of the unrelated table on every filter click).
  function updateParams(updates: Record<string, string | null>) {
    const url = new URL(window.location.href)
    Object.entries(updates).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value)
      else url.searchParams.delete(key)
    })
    router.get(url.pathname + (url.search || ''))
  }

  function setStateFilter(value: string) {
    // Reset orders' page since the filter changes which rows exist; leave topup params alone.
    updateParams({ state: value || null, page: null })
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Project Grants</h1>
          {(() => {
            const pill = {
              connected: {
                variant: 'default' as const,
                label: 'HCB connected',
                title: 'HCB OAuth connection is active and token is fresh',
              },
              expired: {
                variant: 'destructive' as const,
                label: 'HCB token expired',
                title: 'Refresh required — HcbTokenRefreshJob usually handles this',
              },
              disconnected: {
                variant: 'destructive' as const,
                label: 'HCB disconnected',
                title: 'No HCB OAuth session on record — connect from /auth/hcb/start',
              },
              not_configured: {
                variant: 'outline' as const,
                label: 'HCB not configured',
                title: 'HCB_CLIENT_ID is not set; writes are stubbed',
              },
            }[hcb_auth_status]
            return (
              <Badge variant={pill.variant} title={pill.title} className="font-normal">
                {pill.label}
              </Badge>
            )
          })()}
        </div>
        <div className="flex items-center gap-2">
          {is_hcb && (
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/project_grants/adjustments/new">
                <Plus className="w-4 h-4 mr-1" /> Adjustment
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/project_grants/setting">
              <Cog className="w-4 h-4 mr-1" /> Settings
            </Link>
          </Button>
        </div>
      </div>

      {/* Top-level stats. Cheap aggregates from the controller — no deferred props. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-md border border-border p-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">$ Issued</div>
          <div className="text-2xl font-semibold font-mono mt-1">
            {(() => {
              const actual = stats.issued_actual_cents
              const expected = stats.issued_expected_cents
              const match = actual === expected
              const gapNote = match
                ? ''
                : ` — ${formatDollars(Math.abs(actual - expected))} ${actual > expected ? 'extra on HCB' : 'missing from HCB'}`
              return (
                <TooltipProvider>
                  <span className={match ? '' : 'text-red-700'}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default">{formatDollars(actual)}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Actual — HCB's authoritative amount_cents across all grant cards (reality){gapNote}
                      </TooltipContent>
                    </Tooltip>
                    <span className="text-muted-foreground"> / </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default text-muted-foreground">{formatDollars(expected)}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Expected — Fallout's ledger net (in minus out across all completed topups)
                      </TooltipContent>
                    </Tooltip>
                  </span>
                </TooltipProvider>
              )
            })()}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Drift means a card was touched outside of Fallout
          </div>
        </div>
        <div className="rounded-md border border-border p-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Cards Active</div>
          <div className="text-2xl font-semibold font-mono mt-1">{stats.active_cards}</div>
          <div className="text-[11px] text-muted-foreground mt-1">HcbGrantCard where status=active</div>
        </div>
        <div className="rounded-md border border-border p-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Total transactions</div>
          <div className="text-2xl font-semibold font-mono mt-1">{stats.transactions}</div>
          <div
            className="text-[11px] text-muted-foreground mt-1"
            title="Only card charges — excludes topups, withdrawals, and initial grant transfers"
          >
            real card purchases from HCB
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {STATE_FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={state_filter === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStateFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 p-3 border border-border rounded-md bg-muted/40">
          <div className="text-sm">
            <span className="font-medium">{selectedIds.size}</span> selected ·{' '}
            <span className="font-medium">{totalKoi}</span> koi ·{' '}
            <span className="font-medium">{formatDollars(totalCents)}</span> ·{' '}
            <span className="font-medium">{distinctUsers.size}</span> user{distinctUsers.size === 1 ? '' : 's'} (
            {newGrantUserIds.size} new grant{newGrantUserIds.size === 1 ? '' : 's'},{' '}
            {distinctUsers.size - newGrantUserIds.size} top-up
            {distinctUsers.size - newGrantUserIds.size === 1 ? '' : 's'})
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
            {is_hcb ? (
              <Button size="sm" onClick={() => setShowConfirm(true)}>
                Batch fulfill
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground italic px-2 self-center" title="Requires the hcb role">
                Batch fulfill (hcb role required)
              </span>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr className="text-left">
              <th className="p-3 w-8">
                <input
                  type="checkbox"
                  checked={allSelectableSelected}
                  onChange={toggleAll}
                  disabled={selectableOrders.length === 0}
                  aria-label="Select all"
                />
              </th>
              <th className="p-3">User</th>
              <th className="p-3">Koi</th>
              <th className="p-3">USD</th>
              {hours_configured && <th className="p-3">Hours</th>}
              <th className="p-3" title="Sum of completed HCB topups already sent to this user">
                Total so far
              </th>
              <th className="p-3">Action</th>
              <th className="p-3">State</th>
              <th className="p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={hours_configured ? 9 : 8} className="p-6 text-center text-muted-foreground">
                  No orders.
                </td>
              </tr>
            ) : (
              orders.map((o) => {
                const hours = hoursFor(o.frozen_koi_amount, rates)
                const selectable = o.state !== 'fulfilled'
                return (
                  <tr key={o.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(o.id)}
                        onChange={() => toggleOne(o.id)}
                        disabled={!selectable}
                        aria-label={`Select order ${o.id}`}
                      />
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/admin/project_grants/orders/${o.id}`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        {o.user.avatar && <img src={o.user.avatar} alt="" className="w-6 h-6 rounded-full" />}
                        <span>
                          <div className="font-medium">{o.user.display_name}</div>
                          <div className="text-xs text-muted-foreground">{o.user.email}</div>
                        </span>
                      </Link>
                    </td>
                    <td className="p-3 font-mono">{o.frozen_koi_amount}</td>
                    <td className="p-3 font-mono">{formatDollars(o.frozen_usd_cents)}</td>
                    {hours_configured && <td className="p-3 font-mono">{hours ?? '—'}</td>}
                    <td className="p-3 font-mono">
                      {o.user_total_transferred_cents > 0 ? formatDollars(o.user_total_transferred_cents) : '—'}
                    </td>
                    <td className="p-3">
                      <Badge variant={o.action_type === 'new_grant' ? 'default' : 'secondary'}>
                        {o.action_type === 'new_grant' ? 'New grant' : 'Top-up'}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant={o.state === 'fulfilled' ? 'default' : 'outline'}>{o.state}</Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{o.created_at}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {pagy.pages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <span className="text-sm text-muted-foreground">
            Showing page {pagy.page} of {pagy.pages} ({pagy.count} total)
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagy.prev && updateParams({ page: String(pagy.prev) })}
              disabled={!pagy.prev}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagy.next && updateParams({ page: String(pagy.next) })}
              disabled={!pagy.next}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Warnings — surfaced above the topups ledger because anomalies need admin
          attention more urgently than the audit log of what moved. Purely informational:
          "resolve" doesn't change any money state, it just marks the admin has handled it. */}
      <div className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight">
              Warnings
              {warnings.length > 0 && !warnings_include_resolved && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">({warnings.length} unresolved)</span>
              )}
            </h2>
            {/* last_scan_at proxies "when did scan_all! last run" via the most recent
                HcbGrantCard sync — the job fires scan_all! right after each sync cycle. */}
            {last_scan_at ? (
              <span
                className="text-xs text-muted-foreground"
                title={`HcbGrantCardSyncJob last ran ${new Date(last_scan_at).toLocaleString()}. Runs every ~15 minutes and triggers warning scan on completion.`}
              >
                scanned <TimeAgo datetime={last_scan_at} />
              </span>
            ) : (
              <span className="text-xs text-muted-foreground italic" title="No HCB grant cards have been synced yet">
                never scanned
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowWarningDocs((s) => !s)}>
              {showWarningDocs ? 'Hide docs' : 'What are warnings?'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                router.get(
                  warnings_include_resolved
                    ? '/admin/project_grants/orders'
                    : '/admin/project_grants/orders?include_resolved=1',
                )
              }
            >
              {warnings_include_resolved ? 'Show only unresolved' : 'Include resolved'}
            </Button>
          </div>
        </div>

        {showWarningDocs && (
          <div className="mb-4 p-4 rounded-md border border-border bg-muted/30 text-sm">
            <p className="mb-3">
              <strong>Warnings</strong> are anomalies detected automatically by the HCB sync job (every 15 min) and by
              the settle service at topup time. They surface <em>for visibility only</em> — nothing auto-resolves. When
              you've handled the underlying issue (adjusted the ledger, withdrawn on HCB, etc.), click{' '}
              <code>Resolve</code>. If the condition persists, a new warning will appear on the next scan.
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              <strong>Dedup:</strong> re-detecting the same issue bumps the detection count on the existing unresolved
              row — you won't see a flood of duplicates.
            </p>
            <div className="space-y-3 mt-4">
              {Object.entries(warning_kind_descriptions).map(([kind, desc]) => (
                <div key={kind} className="pl-3 border-l-2 border-border">
                  <div className="flex items-baseline gap-2">
                    <code className="text-xs font-semibold">{kind}</code>
                    <span className="text-sm">— {desc.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{desc.detail}</p>
                  <p className="text-xs text-muted-foreground mt-1 italic">
                    <strong>Example:</strong> {desc.example}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr className="text-left">
                <th className="p-3">Kind</th>
                <th className="p-3">Subject</th>
                <th className="p-3">Message</th>
                <th className="p-3">Detected</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {warnings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    {warnings_include_resolved
                      ? 'No warnings on record.'
                      : 'No unresolved warnings. System looks clean.'}
                  </td>
                </tr>
              ) : (
                warnings.map((w) => (
                  <tr key={w.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="p-3">
                      <Badge
                        variant={w.kind === 'ratchet_capped' ? 'secondary' : 'destructive'}
                        className="font-mono text-[10px]"
                      >
                        {w.kind}
                      </Badge>
                      {w.detection_count > 1 && (
                        <div className="text-[10px] text-muted-foreground mt-1">detected {w.detection_count}×</div>
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      {w.user && (
                        <div>
                          <Link href={`/admin/users/${w.user.id}`} className="text-primary hover:underline">
                            {w.user.display_name}
                          </Link>
                        </div>
                      )}
                      {w.hcb_grant_card &&
                        (() => {
                          const hcbUrl = hcbGrantUrl(hcbHost, w.hcb_grant_card.hcb_id)
                          return (
                            <div className="text-muted-foreground font-mono">
                              card{' '}
                              {hcbUrl ? (
                                <a
                                  href={hcbUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:underline text-primary"
                                >
                                  {w.hcb_grant_card.hcb_id}
                                </a>
                              ) : (
                                `#${w.hcb_grant_card.id}`
                              )}
                            </div>
                          )
                        })()}
                      {w.project_grant_order_id && (
                        <div>
                          <Link
                            href={`/admin/project_grants/orders/${w.project_grant_order_id}`}
                            className="text-muted-foreground hover:underline"
                          >
                            order #{w.project_grant_order_id}
                          </Link>
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-xs max-w-md">{w.message}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {new Date(w.last_detected_at).toLocaleString()}
                    </td>
                    <td className="p-3">
                      {w.resolved_at ? (
                        <div className="text-xs">
                          <Badge variant="outline">resolved</Badge>
                          <div className="text-muted-foreground mt-1">by {w.resolved_by?.display_name ?? '—'}</div>
                          {w.resolution_note && (
                            <div className="text-muted-foreground mt-1 italic">"{w.resolution_note}"</div>
                          )}
                        </div>
                      ) : (
                        <Badge variant="destructive">unresolved</Badge>
                      )}
                    </td>
                    <td className="p-3">
                      {!w.resolved_at && is_hcb && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const note = window.prompt('Resolution note (optional — how did you fix it?):', '')
                            if (note === null) return // cancel
                            router.post(`/admin/project_grants/warnings/${w.id}/resolve`, {
                              note: note || undefined,
                            })
                          }}
                        >
                          Resolve
                        </Button>
                      )}
                      {!w.resolved_at && !is_hcb && (
                        <span className="text-[10px] text-muted-foreground italic">hcb role req.</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Topups ledger — secondary read-only table. Tracks what actually moved on HCB. */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold tracking-tight">Topups ledger</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {TOPUP_STATUS_FILTERS.map((s) => (
            <Button
              key={s.value}
              variant={topup_status_filter === s.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateParams({ topup_status: s.value || null, tp: null })}
            >
              {s.label}
            </Button>
          ))}
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr className="text-left">
                <th className="p-3">User</th>
                <th className="p-3">Dir</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Status</th>
                <th className="p-3">HCB grant</th>
                <th className="p-3">Triggered by</th>
                <th className="p-3">Completed</th>
                <th className="p-3">Created</th>
                <th className="p-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {topups.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    No topups.
                  </td>
                </tr>
              ) : (
                topups.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-medium">{t.user.display_name}</td>
                    <td className="p-3">
                      <Badge variant={t.direction === 'out' ? 'destructive' : 'default'} className="font-mono">
                        {t.direction}
                      </Badge>
                      {!t.counts_toward_funding && (
                        <Badge
                          variant="outline"
                          className="ml-1 text-[9px] py-0 px-1 font-normal"
                          title="Ledger-only: does not count towards issued funding, so it won't reduce future order topup amounts"
                        >
                          ledger-only
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 font-mono">
                      {t.direction === 'out' ? '−' : ''}
                      {formatDollars(t.amount_cents)}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          t.status === 'completed' ? 'default' : t.status === 'failed' ? 'destructive' : 'secondary'
                        }
                      >
                        {t.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs font-mono text-muted-foreground">
                      {(() => {
                        const hcbUrl = hcbGrantUrl(hcbHost, t.hcb_grant_card_hcb_id)
                        if (!t.hcb_grant_card_hcb_id) return '—'
                        return hcbUrl ? (
                          <a
                            href={hcbUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline text-primary"
                          >
                            {t.hcb_grant_card_hcb_id}
                          </a>
                        ) : (
                          t.hcb_grant_card_hcb_id
                        )
                      })()}
                    </td>
                    <td className="p-3">
                      {t.project_grant_order_id ? (
                        <Link
                          href={`/admin/project_grants/orders/${t.project_grant_order_id}`}
                          className="hover:underline"
                        >
                          #{t.project_grant_order_id}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">manual</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{t.completed_at ?? '—'}</td>
                    <td className="p-3 text-muted-foreground">{t.created_at}</td>
                    <td className="p-3 text-muted-foreground text-xs max-w-xs">{t.note || t.failed_reason || ''}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {topups_pagy.pages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <span className="text-sm text-muted-foreground">
              Page {topups_pagy.page} of {topups_pagy.pages} ({topups_pagy.count} total)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => topups_pagy.prev && updateParams({ tp: String(topups_pagy.prev) })}
                disabled={!topups_pagy.prev}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => topups_pagy.next && updateParams({ tp: String(topups_pagy.next) })}
                disabled={!topups_pagy.next}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batch fulfill {selectedIds.size} order(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Total {totalKoi} koi · {formatDollars(totalCents)} across {distinctUsers.size} user
              {distinctUsers.size === 1 ? '' : 's'} ({newGrantUserIds.size} new grant
              {newGrantUserIds.size === 1 ? '' : 's'}, {distinctUsers.size - newGrantUserIds.size} top-up
              {distinctUsers.size - newGrantUserIds.size === 1 ? '' : 's'}).
              <br />
              Topup jobs will be enqueued — one per user. Real HCB writes are gated by <code>HCB_ALLOW_WRITES</code> in
              non-production envs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={submitBatchFulfill}>Fulfill</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

AdminProjectGrantsOrdersIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
