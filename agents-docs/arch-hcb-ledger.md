# Project Grants & HCB Ledger

> Point-in-time snapshot. Verify against current code before relying on file paths or method names.

The "money side" of Fallout. Users spend koi to receive real USD on an HCB-issued card. This doc covers the ledger model, the settle service, card lifecycle (including closure refunds), divergence detection, and the admin UI scoping rules.

For the spending economy upstream of this (koi earning, ship/koi ledger), see [arch-ship-and-koi.md](arch-ship-and-koi.md). For HCB's API surface, see [hcb-api-docs.md](hcb-api-docs.md). Auth flow into HCB OAuth is in [auth-architecture.md](auth-architecture.md).

---

## 1. Two-Table Ledger

The system is an append-only ledger. Balances are derived by replaying history, not by mutating a running total.

### `ProjectGrantOrder` ([app/models/project_grant_order.rb](../app/models/project_grant_order.rb))
What the user **requested**.
- `frozen_usd_cents` — what they asked for
- `frozen_koi_amount` — koi cost snapshotted at request time via `HcbGrantSetting#koi_for_usd_cents` (ceil-rounded so the program never undercharges)
- `state` — `pending | fulfilled | rejected | on_hold`
- Soft-delete only (`Discardable`); `destroy` raises.
- Trial users blocked at validation.

### `ProjectFundingTopup` ([app/models/project_funding_topup.rb](../app/models/project_funding_topup.rb))
What was **actually moved on HCB**. Signed: `direction: in` adds, `direction: out` subtracts.
- `status` — `pending | completed | failed`
- `direction` — `in` (Fallout-initiated topup), `out` (refund/adjustment, ledger-only)
- `counts_toward_funding` — false marks an out-of-band HCB action that doesn't reduce future settle math
- `note` — free-form. Used as an idempotency marker for auto-booked closure refunds (sentinel prefix `"Auto-booked: card closed, refund to org"`).
- `readonly?` once status leaves `pending` — completed/failed rows are immutable.
- Out-direction rows must be `completed` (terminal from creation).
- `destroy` raises; `discard` only allowed on pending rows.
- Unique partial index `index_project_funding_topups_on_pending_per_user`: at most one pending in-flight topup per user.

### Derived balance
```
expected_usd_cents   = sum frozen_usd_cents on fulfilled, kept ProjectGrantOrders
transferred_usd_cents = sum amount_cents on completed, kept topups, in − out
delta = expected − transferred
```

### Two koi/USD divergences (intentional)
- `expected_usd_cents` (drives HCB topups) uses **fulfilled-only** orders.
- `User#koi` deduction uses **non-rejected** orders.

A pending order withholds koi but doesn't commit money. A fulfilled→rejected transition refunds koi automatically and removes from `expected` — but does **not** claw money back on HCB. Admin must manually record an `out` adjustment if the funds were actually returned.

---

## 2. Settle Service

[`ProjectFundingTopupService`](../app/services/project_funding_topup_service.rb) is the **only** code path that moves money. Called from `OrdersController` on fulfillment.

### Flow
1. **`preflight!`** — fail fast (HCB unconfigured, no connection, expired token) **before** writing any pending row, so transient auth issues don't leave phantom reconciliation work.
2. **Inside a txn + advisory lock** on `pft:#{user.id}`:
   - `delta < 0` → `ProjectGrantWarning.record!(:over_transferred_user)` + Sentry. No money move.
   - `delta == 0` → no-op.
   - `delta > 0` → `ensure_active_card!`; `ratchet_send_amount!` against live HCB state; insert **pending** topup row; commit txn.
3. **Outside the txn**, call HCB (`topup_card_grant` or `card.issue!` on first-time). On success, flip pending → completed.

The pending row is committed **before** the HCB call so a failure can't lose evidence — retries hit `ReconciliationRequired` instead of double-sending. HCB has no idempotency keys, so this is the only defense against duplicate remote state.

### Ratchet
For already-issued cards, `ratchet_send_amount!` syncs the card's live HCB `amount_cents` and caps the send so the card never ends up with **more** than the post-topup ledger expects. Records `ledger_divergence` and (if capped) `ratchet_capped` warnings. Does **not** rescue Faraday errors — stale ratchet math could allow over-sending, so a sync failure aborts the settle and lets ActiveJob retry.

### Dangling-card guard
`guard_dangling_card!` blocks first-issue retry after 5 minutes if the local card has no `hcb_id`. Inside that window, retries are intentionally allowed so a partially-failed first-issue can self-heal; past 5 minutes, an admin must reconcile (the cost of a duplicate remote grant is too high).

---

## 3. Card Lifecycle

[`HcbGrantCard`](../app/models/hcb_grant_card.rb)

### States
`active | canceled | expired`. Enforced unique partial index: at most one **active** card per user.

### `amount_cents` vs `balance_cents`
This distinction is critical and bites everywhere:
- **`amount_cents`** = the **historical grant total**. Set at issue (and on topups, reflecting cumulative funding). On HCB it does **not** decrease when a card is canceled/expired — it's a permanent record of "how much was originally granted."
- **`balance_cents`** = the **current funds remaining** on the card. Drops to $0 when the card is closed (HCB returns the unspent portion to the org).

The `> 0` validation on `amount_cents` exists so a stale 0/nil from HCB can't blank out historical state. [HcbGrantCardSyncJob#sync_single_grant](../app/jobs/hcb_grant_card_sync_job.rb) defensively ignores non-positive values returned by HCB.

### Closure: cancel and expire
HCB cancellation **and expiry** behave the same way: the card status flips, unspent balance returns to the org, balance becomes $0, and the closure is **irreversible** — once canceled or expired, a card cannot be re-activated. To give the user more money, issue a new card.

Fallout never initiates cancels; the only cancel signal is HCB itself (admin action on HCB UI, or automatic expiry). `HcbGrantCardSyncJob` is the single detection point.

---

## 4. Closure Refund Auto-Booking

When HCB closes a card (cancel or expire), the unspent balance returns to the org. Without booking an `out` topup, the Fallout ledger keeps showing the original transferred amount and `delta_cents` over-counts the user's funding on any future settle.

### Trigger ([`HcbGrantCardSyncJob#sync_single_grant`](../app/jobs/hcb_grant_card_sync_job.rb))
After every successful card sync **and** transaction sync:
```ruby
book_closure_refund!(card) if fully_synced && (card.canceled? || card.expired?)
```
- Evaluated on **every sync pass**, not just on the closing edge — so a crash mid-flight is retried on the next 15-min cycle.
- Gated on `fully_synced` from `sync_transactions` — a Faraday error mid-pagination returns false, preventing over-booking from a partial purchase history (which would be permanently locked in by the cheap pre-check).

### Math
```
ledger_net   = sum (in − out) of completed kept topups for THIS card
spent_cents  = -sum amount_cents of non-declined, non-reversed purchases for THIS card
                (HCB stores card-charge debits as negative; flip to positive)
unspent      = ledger_net − spent_cents
```
If `unspent > 0`, book one `out` ProjectFundingTopup with:
- `direction: "out"`, `status: "completed"`, `completed_at: Time.current`
- `counts_toward_funding: true` — **load-bearing**: returned balance must count toward future funding, so a subsequent order replenishes what came back. Example: user requests $30, spends $20, $10 returned on cancel; next request for $5 sends $15 (= $5 new + $10 replenishment). Flipping this to false would under-fund users by the returned amount on every closure.
- `note: "Auto-booked: card closed, refund to org status=#{status} (ledger_net=Xc, spent=Yc)"`

### Idempotency: double-checked locking
1. **Cheap pre-check** (`closure_refund_already_booked?`) outside the lock — short-circuits if a sentinel-prefixed `out` row already exists.
2. **Same advisory lock** as the settle service (`pft:#{user.id}`) — serializes against in-flight settles for the same user.
3. **Re-check inside the lock** — a concurrent worker may have just booked the row.
4. Math self-balances against admin-recorded `out` rows: if an admin manually booked the refund, `ledger_net − spent` will already be 0 → early return. No double-booking.

### Pending-charge edge case
The math counts pending purchases as "spent" (so an in-flight charge at closure isn't counted as still-on-card). If the pending later **declines**, the booked `out` is too small (under-booked refund). The cheap pre-check prevents auto-correction. This is surfaced via `scan_ledger_divergence!` if HCB updates the card's amount accordingly. Eventual consistency, admin-reconciled.

### HCB pending semantics: card charges vs transfers
HCB returns two structurally distinct payloads on the transactions endpoint, and they treat `pending` differently:
- **`card_charge`** (purchases) — pending means the merchant has captured an authorization but the bank hasn't fully posted. May still resolve to declined/reversed. We count pending as spent for spending totals and closure-refund math, but acknowledge it can flip.
- **`transfer`** (org↔card movement: topups, withdrawals, initial grant) — pending means the money has **already moved**, awaiting HCB staff confirmation. Treat the same as settled when reasoning about money flow. Fallout's local ledger is the source of truth for transfers anyway, so this distinction mostly matters when reading the HCB UI / API directly.

Both row types live in `HcbTransaction` keyed off `transaction_type` (`purchase | transfer | other`). The `purchases` scope filters to `card_charge` only.

---

## 5. Divergence Detection

[`ProjectGrantWarning`](../app/models/project_grant_warning.rb) is the surface for ledger anomalies. Detection runs in two places:
- `HcbGrantCardSyncJob` calls `ProjectGrantWarning.scan_all!` after every card sync (~every 15 min).
- The settle service records warnings inline at write time.

### Warning kinds
- `ledger_divergence` — HCB's `amount_cents` ≠ Fallout's per-card ledger net.
- `negative_transferred` — user has more out-adjustments than in-topups (always a data-entry mistake).
- `pending_topup_stuck` — pending row older than 30 minutes; settle won't retry until reconciled.
- `dangling_card` — local card has no `hcb_id` and is older than 5 minutes (partial first-issue failure).
- `ratchet_capped` — settle tried to send more than the ledger allows; safety triggered.

### `scan_ledger_divergence!` scopes to active cards only
Closed cards intentionally diverge post-fix: the auto-booked `out` drives `ledger_net` down to the spent amount, while `amount_cents` stays at the historical grant total. Comparing the two would warn forever for every closed card. The scan is `HcbGrantCard.issued.where(status: "active")`.

If a stale unresolved warning exists for a now-closed card from before the closure-refund logic was deployed, it will not auto-resolve — admin must clear it manually via the warnings UI (`ProjectGrantWarning#resolve!`).

### Idempotency
`record!` upserts — an unresolved row with the same `(kind, user, card, order, topup)` tuple gets refreshed (`last_detected_at`, `detection_count`) instead of duplicated.

---

## 6. Admin UI Scoping Rules

The "$ Issued" summary tile and the per-user adjustment preview both compare an "actual" against an "expected." Same trap as the divergence scan: closed cards have legitimately divergent values, and including them shows phantom drift forever.

**All summary aggregations must be scoped to `status: "active"` cards.** The fix is applied in:
- [`Admin::ProjectGrants::OrdersController#index`](../app/controllers/admin/project_grants/orders_controller.rb) — global `issued_actual_cents` / `issued_expected_cents` stats tile
- [`Admin::ProjectGrants::AdjustmentsController#preview`](../app/controllers/admin/project_grants/adjustments_controller.rb) — per-user preview pair
- [`Admin::UsersController#show`](../app/controllers/admin/users_controller.rb) renders cards individually; the **frontend** ([`admin/users/show.tsx`](../app/frontend/pages/admin/users/show.tsx)) suppresses the red drift highlight on closed-card rows since `amount_cents` (historical) is non-comparable to ledger_net (post-refund).

The per-card row still **shows** both values — an admin needs to see them — it just doesn't flag them as drift.

---

## 7. Access Control (recap)

Per [AGENTS.md](../AGENTS.md):
- **Money movement is restricted to `user.hcb?`** — only that role can transition an order to `fulfilled` (which triggers settle) or mark a pending topup `completed` during reconciliation.
- Regular admins can read grant orders, edit `HcbGrantSetting`, adjust admin notes, and move orders between `pending | on_hold | rejected` — but **not** `fulfilled`.
- HCB-related code changes require **explicit written approval**. No tests or console code against HCB without explicit approval.
- All financial models are immutable post-resolution: orders cannot be hard-destroyed, completed/failed topups are `readonly?`, settings are singleton and cannot be destroyed. PaperTrail audits all three.

---

## 8. Common Gotchas

| Trap | Reality |
|---|---|
| "Card balance" can mean two things | `amount_cents` is historical grant total (immutable on cancel); `balance_cents` is current funds. Never use `amount_cents` to mean "what's on the card now." |
| `HcbGrantCard#cancel!` and `HcbService.cancel_card_grant` removed | Fallout never initiates cancels — they all come from HCB. The auto-booking path assumes external triggers only. |
| Closed cards in summaries | Always scope summaries to `status: "active"`. Mixing closed cards in shows phantom drift equal to the sum of their unspent-at-cancel amounts. |
| HCB has no idempotency keys | The `pending` topup row IS the idempotency key. A retry hits `ReconciliationRequired` instead of double-sending. |
| `out`/`pending` is forbidden | Validation `out_rows_must_be_completed` enforces it — out rows are always terminal-completed, by construction. |
| `transferred_usd_cents` vs `funding_transferred_usd_cents` | Two different sums. Plain `transferred` includes everything; `funding_` excludes manual out-of-band adjustments (`counts_toward_funding: false`). The settle service uses `funding_`; user-level math uses `transferred`. |
| Ratchet uses live HCB data | `ratchet_send_amount!` does NOT rescue Faraday errors — stale data could allow over-sending, so failures abort and let ActiveJob retry. |
| Closed-card warning ghosts | Unresolved warnings created before closure-refund auto-booking shipped do not auto-resolve. Admins must clear them via the warnings UI. |

---

## 9. Where Things Live

| Concern | File |
|---|---|
| Order model | [app/models/project_grant_order.rb](../app/models/project_grant_order.rb) |
| Topup ledger model | [app/models/project_funding_topup.rb](../app/models/project_funding_topup.rb) |
| Card model | [app/models/hcb_grant_card.rb](../app/models/hcb_grant_card.rb) |
| HCB transaction model | [app/models/hcb_transaction.rb](../app/models/hcb_transaction.rb) |
| Settings (rates, defaults) | [app/models/hcb_grant_setting.rb](../app/models/hcb_grant_setting.rb) |
| Warning surface | [app/models/project_grant_warning.rb](../app/models/project_grant_warning.rb) |
| Settle service | [app/services/project_funding_topup_service.rb](../app/services/project_funding_topup_service.rb) |
| HCB API client | [app/services/hcb_service.rb](../app/services/hcb_service.rb) |
| Sync job (cards + closure refund) | [app/jobs/hcb_grant_card_sync_job.rb](../app/jobs/hcb_grant_card_sync_job.rb) |
| OAuth refresh job | [app/jobs/hcb_token_refresh_job.rb](../app/jobs/hcb_token_refresh_job.rb) |
| User-facing order creation | [app/controllers/project_grants_controller.rb](../app/controllers/project_grants_controller.rb) |
| Admin orders + warnings | [app/controllers/admin/project_grants/orders_controller.rb](../app/controllers/admin/project_grants/orders_controller.rb) |
| Admin manual adjustments | [app/controllers/admin/project_grants/adjustments_controller.rb](../app/controllers/admin/project_grants/adjustments_controller.rb) |
| Admin settings | [app/controllers/admin/project_grants/settings_controller.rb](../app/controllers/admin/project_grants/settings_controller.rb) |
