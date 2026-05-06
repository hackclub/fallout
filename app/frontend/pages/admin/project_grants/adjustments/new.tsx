import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useForm, usePage, Link } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent } from '@/components/admin/ui/card'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import type { SharedProps } from '@/types'

type LedgerData = {
  found: boolean
  user?: { id: number; display_name: string; email: string }
  has_card?: boolean
  // actual = what HCB actually holds across this user's grant cards
  // expected = Fallout's ledger net (completed in-topups minus out-adjustments)
  actual_cents?: number
  expected_cents?: number
}

function formatDollars(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`
}

function LedgerSnapshot({
  label,
  actual,
  expected,
  highlight,
}: {
  label: string
  actual: number
  expected: number
  highlight?: boolean
}) {
  const gap = actual - expected
  const gapLabel =
    gap === 0 ? 'match' : `${formatDollars(Math.abs(gap))} ${gap > 0 ? 'extra on HCB' : 'missing from HCB'}`
  return (
    <div className={`rounded-md border p-2.5 ${highlight ? 'border-primary bg-primary/5' : 'border-border'}`}>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">{label}</div>
      <dl className="space-y-0.5 text-xs font-mono">
        <div className="flex justify-between" title="HCB's authoritative amount_cents — the real-world state">
          <dt className="text-muted-foreground">actual (HCB)</dt>
          <dd>{formatDollars(actual)}</dd>
        </div>
        <div
          className="flex justify-between"
          title="Fallout's ledger net (in minus out) — what we think should be there"
        >
          <dt className="text-muted-foreground">expected (ledger)</dt>
          <dd className={expected < 0 ? 'text-red-700' : ''}>{formatDollars(expected)}</dd>
        </div>
        <div className="flex justify-between border-t border-border pt-1 mt-1">
          <dt className="text-muted-foreground">gap</dt>
          <dd className={gap === 0 ? '' : 'text-red-700'}>{gapLabel}</dd>
        </div>
      </dl>
    </div>
  )
}

export default function AdminProjectGrantsAdjustmentsNew({
  prefill_user_id,
  idempotency_key,
}: {
  prefill_user_id: string
  idempotency_key: string
}) {
  const { errors } = usePage<SharedProps>().props
  const form = useForm({
    user_id: prefill_user_id,
    direction: 'in' as 'in' | 'out',
    amount_dollars: '',
    note: '',
    // Unchecked by default — admin must explicitly opt in to "this counts as
    // issued funding". Safer in both directions: if they forget, future orders
    // aren't accidentally reduced; if they check it, they've thought about it.
    counts_toward_funding: false,
    // One-shot token consumed server-side to block duplicate submits.
    idempotency_key,
  })

  // Debounced ledger fetch: as the admin types a user ID, we ask the server for that
  // user's current ledger. The projection (transferred ± amount) is computed client-side
  // from that snapshot + the direction/amount fields.
  const [ledger, setLedger] = useState<LedgerData | null>(null)
  const [ledgerLoading, setLedgerLoading] = useState(false)

  useEffect(() => {
    const id = form.data.user_id.trim()
    if (!id) {
      setLedger(null)
      return
    }
    setLedgerLoading(true)
    const handle = setTimeout(() => {
      fetch(`/admin/project_grants/adjustments/ledger?user_id=${encodeURIComponent(id)}`, {
        headers: { Accept: 'application/json' },
      })
        .then((r) => (r.ok ? r.json() : { found: false }))
        .then((data: LedgerData) => setLedger(data))
        .catch(() => setLedger({ found: false }))
        .finally(() => setLedgerLoading(false))
    }, 350)
    return () => clearTimeout(handle)
  }, [form.data.user_id])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    form.post('/admin/project_grants/adjustments')
  }

  // Client-side projection. `in` raises expected (Fallout's ledger); `out` lowers it.
  // Actual is HCB's amount_cents — it never moves from an adjustment because an
  // adjustment is a ledger-only record of something that already happened on HCB.
  const amountCents = Math.round((parseFloat(form.data.amount_dollars) || 0) * 100)
  const canProject = ledger?.found && amountCents > 0
  const currentActual = ledger?.actual_cents ?? 0
  const currentExpected = ledger?.expected_cents ?? 0
  const projectedExpected = canProject
    ? currentExpected + (form.data.direction === 'in' ? amountCents : -amountCents)
    : currentExpected
  const currentGap = currentActual - currentExpected
  const projectedGap = currentActual - projectedExpected

  return (
    <div className="max-w-xl">
      <div className="mb-4">
        <Link href="/admin/project_grants/orders" className="text-sm text-primary hover:underline">
          ← Project Grants
        </Link>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Manual ledger adjustment</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Records an <code>in</code> or <code>out</code> ledger row without hitting HCB. Use this when real money has
        already moved outside the normal settle flow and the ledger is out of sync with reality.
      </p>

      <details className="mb-6 rounded-md border border-border bg-muted/30">
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium select-none">
          How to compensate for unexpected movement
        </summary>
        <div className="px-4 pb-4 pt-1 text-xs space-y-3">
          <p>
            The ledger tracks <strong>movement on the user's HCB grant card</strong>. <code>transferred</code> = in rows
            − out rows. Fallout's settle service sends <code>expected − transferred</code> every time a new order is
            fulfilled — so as long as the ledger matches what's on the card, the next topup self-corrects.
          </p>

          <div>
            <div className="font-semibold mb-1">
              Use direction = in when money landed on the card outside of Fallout.
            </div>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                <strong>You topped up the card manually on the HCB dashboard.</strong> Fallout didn't record it — add an{' '}
                <code>in</code> row so the ledger knows the money is on the card (otherwise the next order will double
                up).
              </li>
              <li>
                <strong>Someone else granted the card outside Fallout.</strong> Same story — record what actually hit
                the card.
              </li>
              <li>
                <strong>After an invoice was paid, you manually topped up the card.</strong> Invoices don't hit the card
                directly — they flow to the org's bank account, and you then move that money onto the card via HCB.
                Record the <em>card top-up</em> here, not the invoice.
              </li>
              <li>
                <strong>Warning shows ledger_divergence with card balance &gt; ledger net.</strong> If investigation
                confirms the card really does hold more, book an <code>in</code> for the difference and resolve the
                warning.
              </li>
            </ul>
          </div>

          <div>
            <div className="font-semibold mb-1">
              Use direction = out when money came off the card outside of Fallout.
            </div>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                <strong>You withdrew from the card on the HCB dashboard.</strong> Funds moved off the card back to the
                org — add an <code>out</code> row so Fallout stops counting it as transferred.
              </li>
              <li>
                <strong>HCB card was canceled with a balance on it.</strong> Cancelation returns any remaining balance
                to the org — record an <code>out</code> for that residual.
              </li>
              <li>
                <strong>Order was rejected but money already left.</strong> If you can pull it back off the card on HCB,
                record that withdrawal as <code>out</code>. If the funds were already spent and can't be recovered,{' '}
                <em>don't record anything</em> — <code>expected</code> dropping below <code>transferred</code> on its
                own is the correct over-transfer signal (Sentry warns; future orders send less until delta goes positive
                again).
              </li>
            </ul>
          </div>

          <div>
            <div className="font-semibold mb-1">What about a duplicate topup that we can't recover?</div>
            <p className="text-muted-foreground">
              If duplicate money landed on the card and the user is keeping it, book an <code>in</code> for the
              duplicate amount. That raises <code>transferred</code> to match reality; future orders will send less
              because <code>delta</code> is already capped by the extra on-card balance.
            </p>
          </div>

          <div className="pt-1 border-t border-border">
            <div className="font-semibold mb-1">Workflow</div>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Verify the real-world state on the HCB dashboard first — what's actually on the card?</li>
              <li>Compare to the user's ledger on the order show page (expected / transferred / delta).</li>
              <li>
                Decide: did money move <em>onto</em> the card (<code>in</code>) or <em>off</em> the card (
                <code>out</code>)?
              </li>
              <li>Record the adjustment here with a clear note citing the HCB transaction.</li>
              <li>
                If a warning surfaced the issue, return to <code>/admin/project_grants/orders</code> and resolve it.
              </li>
            </ol>
          </div>
        </div>
      </details>

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

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="block text-sm font-medium mb-1.5">User ID</span>
              <input
                type="number"
                value={form.data.user_id}
                onChange={(e) => form.setData('user_id', e.target.value)}
                required
                className="w-full border border-input rounded-md px-3 py-2 text-sm"
                placeholder="User ID (find on /admin/users)"
              />
              <p className="text-xs text-muted-foreground mt-1">User must already have an HCB grant card on record.</p>
              {form.data.user_id && ledger && !ledger.found && (
                <p className="text-xs text-red-700 mt-1">No user with ID {form.data.user_id}.</p>
              )}
              {ledger?.found && ledger.user && (
                <p className="text-xs text-muted-foreground mt-1">
                  ✓ {ledger.user.display_name} ({ledger.user.email})
                  {!ledger.has_card && (
                    <span className="text-red-700"> — no HCB grant card on record; save will fail</span>
                  )}
                </p>
              )}
              {ledgerLoading && <p className="text-xs text-muted-foreground mt-1">Loading ledger…</p>}
            </label>

            <label className="block">
              <span className="block text-sm font-medium mb-1.5">Direction</span>
              <select
                value={form.data.direction}
                onChange={(e) => form.setData('direction', e.target.value as 'in' | 'out')}
                required
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="in">in — money landed on the card (you topped it up on HCB manually)</option>
                <option value="out">out — money came off the card (you withdrew on HCB manually)</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-sm font-medium mb-1.5">Amount (USD)</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.data.amount_dollars}
                onChange={(e) => form.setData('amount_dollars', e.target.value)}
                required
                className="w-full border border-input rounded-md px-3 py-2 text-sm font-mono"
                placeholder="25.00"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Always a positive number. Direction determines sign in the ledger.
              </p>
            </label>

            <label className="flex items-start gap-2 p-2 rounded-md border border-border bg-muted/20">
              <input
                type="checkbox"
                checked={form.data.counts_toward_funding}
                onChange={(e) => form.setData('counts_toward_funding', e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="font-medium">Count towards issued funding</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Check this if the movement was funded by the project funding program (e.g. you topped up HCB by hand
                  because an auto-settle failed). Future order topups will be reduced by this amount. Leave unchecked
                  for out-of-band HCB activity (someone else credited the card, unrelated disbursement, etc.) — the
                  ledger still records it but it won't offset future order amounts.
                </span>
              </span>
            </label>

            <label className="block">
              <span className="block text-sm font-medium mb-1.5">Note (required)</span>
              <textarea
                value={form.data.note}
                onChange={(e) => form.setData('note', e.target.value)}
                required
                rows={3}
                className="w-full border border-input rounded-md px-3 py-2 text-sm"
                placeholder="Why this adjustment? e.g. 'topped up $25 on HCB manually after order #12 — ledger was $25 short'"
              />
            </label>

            {ledger?.found && (
              <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
                <div className="text-xs font-semibold">Ledger preview for {ledger.user?.display_name}</div>
                {canProject ? (
                  <>
                    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-stretch">
                      <LedgerSnapshot label="Current" actual={currentActual} expected={currentExpected} />
                      <div className="flex flex-col items-center justify-center text-xs text-muted-foreground px-1">
                        <div className="text-[10px] uppercase tracking-wide">{form.data.direction}</div>
                        <div
                          className={`font-mono font-semibold ${form.data.direction === 'out' ? 'text-red-700' : 'text-green-700'}`}
                        >
                          {form.data.direction === 'out' ? '−' : '+'}
                          {formatDollars(amountCents)}
                        </div>
                        <div className="text-sm">→</div>
                      </div>
                      <LedgerSnapshot
                        label="After this adjustment"
                        actual={currentActual}
                        expected={projectedExpected}
                        highlight
                      />
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>
                        <strong>What this changes:</strong> <code>expected</code> (Fallout ledger){' '}
                        {form.data.direction === 'in' ? 'rises' : 'falls'} by {formatDollars(amountCents)}.{' '}
                        <code>actual</code> (HCB) is unchanged — adjustments record movement that already happened on
                        HCB, they don't call the API.
                      </p>
                      {currentGap !== 0 && projectedGap === 0 && (
                        <p className="text-green-700">
                          <strong>This adjustment closes the gap.</strong> After it lands, Fallout's ledger matches HCB
                          exactly.
                        </p>
                      )}
                      {currentGap === 0 && projectedGap !== 0 && (
                        <p className="text-red-700">
                          <strong>⚠ This will create a {formatDollars(Math.abs(projectedGap))} gap.</strong> Ledger and
                          HCB currently match; this adjustment would push them out of sync. Only proceed if an
                          out-of-band HCB event actually happened.
                        </p>
                      )}
                      {currentGap !== 0 && projectedGap !== 0 && Math.abs(projectedGap) > Math.abs(currentGap) && (
                        <p className="text-red-700">
                          <strong>⚠ Gap grows:</strong> {formatDollars(Math.abs(currentGap))} →{' '}
                          {formatDollars(Math.abs(projectedGap))}. This adjustment moves the ledger further from HCB,
                          not closer. Double-check direction and amount.
                        </p>
                      )}
                      {projectedExpected < 0 && (
                        <p className="text-red-700">
                          <strong>⚠ expected would go negative.</strong> That means more out-adjustments than in-topups
                          on record — almost always a mistake.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1">
                      <LedgerSnapshot label="Current" actual={currentActual} expected={currentExpected} />
                    </div>
                    <p className="text-xs text-muted-foreground italic">
                      Enter an amount above to see how this adjustment will change the ledger.
                    </p>
                  </>
                )}
              </div>
            )}

            <div className="rounded-md border border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 p-3 text-xs">
              <strong>⚠ This only changes Fallout's ledger.</strong> It does not call the HCB API. Double-check that the
              real-world money movement has already happened before saving. Ledger rows are immutable once created.
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={form.processing}>
                {form.processing ? 'Saving…' : 'Record adjustment'}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/admin/project_grants/orders">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

AdminProjectGrantsAdjustmentsNew.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
