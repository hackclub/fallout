# frozen_string_literal: true

# Settles a user's project funding grant against their order history via a ledger:
#   expected   = sum of frozen_usd_cents on fulfilled (non-discarded) ProjectGrantOrders
#   transferred = sum of amount_cents on completed (non-discarded) ProjectFundingTopups
#   delta      = expected − transferred
#
# If delta > 0, send a topup to HCB and append a ledger row.
# If delta == 0, no-op.
# If delta < 0, Sentry warning (over-transferred, never claw back).
#
# Safety:
# - `preflight!` raises for conditions that prove no HCB call could have started
#   (no email, no HCB connection, token expired) BEFORE we commit a pending row,
#   so transient auth issues don't leave phantom reconciliation work.
# - A pending row is pre-inserted in txn 1 and committed BEFORE the HCB call.
#   If the HCB call then fails, the pending row persists; retries hit
#   ReconciliationRequired instead of blindly duplicating the remote call.
# - Advisory lock on user.id serializes concurrent jobs for the same user.
module ProjectFundingTopupService
  class ReconciliationRequired < StandardError; end

  module_function

  # `expected_usd_cents` and `User#koi`'s deduction diverge deliberately:
  #   - expected = sum of FULFILLED orders only (drives HCB topups)
  #   - koi deduction = sum of NON-REJECTED orders (drives user balance)
  # A pending order withholds koi from the user but doesn't commit us to sending money.
  # A rejected-after-fulfilled order refunds koi AND removes from expected — the
  # Warnings table catches if this happened without also recording an `out` adjustment.
  def expected_usd_cents(user)
    user.project_grant_orders.kept.where(state: "fulfilled").sum(:frozen_usd_cents)
  end

  # Net transferred = completed in-topups minus completed out-refunds. Refunds
  # are ledger-only entries admins create after manually withdrawing on HCB; they
  # drop the transferred total so the service won't re-top-up what was reversed.
  #
  # This is the "all rows" sum used by the HCB parity check (ledger_divergence
  # warning) and the UI "expected (ledger)" label. It includes manual adjustments
  # regardless of whether they count toward issued funding.
  def transferred_usd_cents(user)
    user.project_funding_topups.kept.where(status: "completed").sum(
      Arel.sql("CASE direction WHEN 'out' THEN -amount_cents ELSE amount_cents END")
    )
  end

  # Funding-only sum — counts toward "issued funding" for the purpose of delta
  # math. Manual adjustments the admin marked as out-of-band HCB events
  # (counts_toward_funding = false) reflect reality on the card but don't reduce
  # what future orders send.
  def funding_transferred_usd_cents(user)
    user.project_funding_topups.kept.where(status: "completed", counts_toward_funding: true).sum(
      Arel.sql("CASE direction WHEN 'out' THEN -amount_cents ELSE amount_cents END")
    )
  end

  def delta_cents(user)
    expected_usd_cents(user) - funding_transferred_usd_cents(user)
  end

  def settle!(user, triggering_order: nil)
    raise ArgumentError, "User has no email" if user.email.blank?

    preflight!
    topup, card = prepare_topup!(user, triggering_order)
    return unless topup # delta was 0 or negative — nothing to send

    # HCB call is OUTSIDE the transaction so a failure here cannot roll back the
    # pending row. The pending row is our only defense against duplicate remote
    # state on retry given HCB's lack of idempotency keys.
    if card.issued?
      HcbService.topup_card_grant(card.hcb_id, amount_cents: topup.amount_cents)
    else
      card.issue! # HCB create_card_grant; persists hcb_id on success
    end

    topup.update!(status: "completed", completed_at: Time.current)
  end

  # Conditions that prove no HCB call could have started. Raising here before any
  # pending row is inserted keeps retries clean when the root cause is transient.
  def preflight!
    raise HcbService::NotConfiguredError unless HcbService.configured?

    connection = HcbConnection.current
    raise HcbService::Error, "No HCB connection configured" if connection.nil?
    raise HcbService::Error, "HCB token expired" if connection.token_expired?
  end

  # Runs inside a single txn w/ advisory lock. Commits the pending row so a
  # subsequent HCB failure leaves evidence for reconciliation.
  # Returns [topup, card] on success, or [nil, nil] if no action is needed.
  #
  # Structure deliberately avoids `break`/`return` inside the transaction block —
  # Rails 8 warns on those and the rollback semantics get fiddly. Instead we
  # assign to `result` and let the block fall through naturally.
  def prepare_topup!(user, triggering_order)
    result = [ nil, nil ]

    ActiveRecord::Base.transaction do
      lock_key = "pft:#{user.id}"
      ActiveRecord::Base.connection.execute(
        "SELECT pg_advisory_xact_lock(hashtext(#{ActiveRecord::Base.connection.quote(lock_key)}))"
      )

      delta = delta_cents(user)

      if delta.negative?
        # Record to both Sentry (realtime alert) and the Warnings table (persistent
        # admin surface). Same data, two channels — Sentry for on-call, Warnings for
        # the hcb admin working through the queue.
        ErrorReporter.capture_message(
          "ProjectFunding over-transfer detected",
          level: :warning,
          contexts: {
            project_funding: {
              user_id: user.id,
              expected_cents: expected_usd_cents(user),
              transferred_cents: transferred_usd_cents(user),
              delta_cents: delta
            }
          }
        )
        ProjectGrantWarning.record!(
          kind: "over_transferred_user",
          user: user,
          message: "Settle attempt found transferred (#{format_dollars(transferred_usd_cents(user))}) > expected " \
                   "(#{format_dollars(expected_usd_cents(user))}). Over by #{format_dollars(-delta)}.",
          details: {
            expected_cents: expected_usd_cents(user),
            transferred_cents: transferred_usd_cents(user),
            delta_cents: delta
          }
        )
      elsif delta.positive?
        pending = user.project_funding_topups.kept.where(status: "pending").first
        if pending
          raise ReconciliationRequired,
                "User #{user.id} has a pending topup (id=#{pending.id}, amount=#{pending.amount_cents}, " \
                "age=#{(Time.current - pending.created_at).to_i}s). Verify against HCB and resolve via " \
                "admin reconciliation before retrying."
        end

        card = ensure_active_card!(user, delta)
        # guard_dangling_card! only raises when the local card has no hcb_id AND was
        # created more than 5 minutes ago. Within the 5-min window we intentionally
        # allow the retry so a partially-failed first-issue can self-heal — the cost
        # of a duplicate remote grant in that narrow window is accepted (plan edge
        # case 60). Past 5m we assume something's wrong and require admin review.
        guard_dangling_card!(card) unless card.issued?

        # Ratchet: for already-issued cards, cap the send so the card never ends up
        # with MORE than our post-topup ledger expects. Refreshes HCB state first so
        # the comparison uses live data, not a possibly-15min-stale sync.
        send_amount = card.issued? ? ratchet_send_amount!(user, card, delta) : delta
        if send_amount <= 0
          # Ratchet zeroed the send (card already at or above target). Sentry warned
          # inside ratchet_send_amount!. Nothing to write.
        else
          topup = ProjectFundingTopup.create!(
            user: user,
            hcb_grant_card: card,
            project_grant_order: triggering_order,
            amount_cents: send_amount,
            direction: "in",
            status: "pending"
          )

          result = [ topup, card ]
        end
      end
      # delta == 0 → no-op, block falls through with result == [nil, nil]
    end

    result
  end

  def ensure_active_card!(user, delta_cents)
    existing = user.hcb_grant_cards.active.first
    return existing if existing

    setting = HcbGrantSetting.current
    HcbGrantCard.create!(
      user: user,
      amount_cents: delta_cents,
      email: user.email,
      purpose: setting.purpose.presence || "Project funding",
      expires_on: setting.expires_on_date,
      merchant_lock: setting.merchant_lock,
      category_lock: setting.category_lock,
      keyword_lock: setting.keyword_lock,
      one_time_use: setting.one_time_use,
      pre_authorization_required: setting.pre_authorization_required,
      instructions: setting.instructions,
      invite_message: setting.invite_message
    )
  end

  # Cap the send amount so that the card never ends up with MORE funds than our
  # post-topup ledger expects. Fetches live HCB state first so the comparison is
  # accurate. If the card already holds at-or-above target, send 0.
  #
  # Examples (intended = $40):
  #   - ledger_net = $40, hcb = $40 (aligned): excess = 0 → send $40
  #   - ledger_net = $40, hcb = $20 (card short): excess = -$20 → send $40 (Sentry warns)
  #   - ledger_net = $40, hcb = $60 (card ahead): excess = +$20 → send $20 (Sentry warns)
  #   - ledger_net = $40, hcb = $80 (card way ahead): excess = +$40 → send $0 (Sentry warns)
  def ratchet_send_amount!(user, card, intended_cents)
    hcb_amount_cents = sync_card_from_hcb!(card)

    # Per-card net of everything the ledger has already committed (doesn't include
    # the new pending topup we're about to create).
    ledger_net = card.project_funding_topups.kept.where(status: "completed").sum(
      Arel.sql("CASE direction WHEN 'out' THEN -amount_cents ELSE amount_cents END")
    )

    excess = hcb_amount_cents - ledger_net
    # excess > 0 → card holds more than ledger expects; cap the send so total lands on target
    # excess <= 0 → card is aligned or short; send intended in full (but warn if short)
    capped = [ intended_cents - [ excess, 0 ].max, 0 ].max

    if excess != 0
      ErrorReporter.capture_message(
        "ProjectFunding card/ledger divergence",
        level: :warning,
        contexts: {
          project_funding: {
            user_id: user.id,
            hcb_grant_card_id: card.id,
            hcb_amount_cents: hcb_amount_cents,
            ledger_net_cents: ledger_net,
            excess_cents: excess,
            intended_cents: intended_cents,
            ratcheted_send_cents: capped
          }
        }
      )
      # Two separate warning kinds here:
      #   - ledger_divergence: HCB amount doesn't match our ledger (always, if excess != 0)
      #   - ratchet_capped: if the divergence actually reduced what we sent
      ProjectGrantWarning.record!(
        kind: "ledger_divergence",
        user: user,
        hcb_grant_card: card,
        message: "During topup, HCB card showed #{format_dollars(hcb_amount_cents)} but ledger net was " \
                 "#{format_dollars(ledger_net)}. Gap #{format_dollars(excess)}#{excess.positive? ? ' (card has more)' : ' (card has less)'}.",
        details: {
          hcb_amount_cents: hcb_amount_cents,
          ledger_net_cents: ledger_net,
          excess_cents: excess,
          intended_cents: intended_cents,
          ratcheted_send_cents: capped
        }
      )
      if capped < intended_cents
        ProjectGrantWarning.record!(
          kind: "ratchet_capped",
          user: user,
          hcb_grant_card: card,
          message: "Topup intended #{format_dollars(intended_cents)} but ratchet capped to " \
                   "#{format_dollars(capped)} (card already ahead of ledger by #{format_dollars(excess)}).",
          details: {
            intended_cents: intended_cents,
            capped_to_cents: capped,
            excess_cents: excess
          }
        )
      end
    end

    capped
  end

  def format_dollars(cents)
    sign = cents.negative? ? "-" : ""
    "#{sign}$#{(cents.abs / 100.0).round(2)}"
  end

  # Pull the card's current amount_cents from HCB and persist it locally before the
  # ratchet check. The ratchet is only safe against live data, so we hard-fail if the
  # sync fails — ActiveJob retries the whole settle, rather than silently running the
  # cap against stale numbers and possibly letting an over-send through.
  def sync_card_from_hcb!(card)
    # In dev noop mode there's no real HCB to talk to. Use whatever is in the DB — the
    # ratchet still runs the math, just against the stub state we've been writing.
    return card.amount_cents unless HcbService.writes_allowed?

    data = HcbService.get_card_grant(card.hcb_id)
    card.update_columns(
      amount_cents: data[:amount_cents],
      balance_cents: data[:balance_cents] || card.balance_cents,
      last_synced_at: Time.current
    )
    data[:amount_cents]
    # Deliberately NO rescue — let Faraday::Error / HcbService::Error propagate so the
    # job retries. The alternative (falling back to local amount_cents) would let the
    # ratchet compare against stale data and could allow over-sending.
  end

  # Block auto-retry of first-issue after a partial failure that may have landed on HCB.
  # If we blindly re-call issue!, a prior successful remote create (where our local
  # update! to persist hcb_id never ran) becomes an orphaned duplicate grant.
  def guard_dangling_card!(card)
    return unless card.persisted? && card.hcb_id.nil? && card.created_at < 5.minutes.ago

    raise ReconciliationRequired,
          "User #{card.user_id} has a local HcbGrantCard (id=#{card.id}) with no hcb_id older than 5m. " \
          "Check HCB for duplicate grants by email before auto-retrying."
  end
end
