# frozen_string_literal: true

class HcbGrantCardSyncJob < ApplicationJob
  queue_as :background

  def perform
    return unless HcbService.configured?

    connection = HcbConnection.current
    return unless connection&.access_token.present?
    return if connection.token_expired?

    sync_grant_cards
    # After every card's amount_cents has been refreshed from HCB, scan for
    # ledger/reality divergence so admins see current-state warnings without
    # having to trigger a topup to discover issues.
    ProjectGrantWarning.scan_all!
  rescue HcbService::Error => e
    ErrorReporter.capture_exception(e, contexts: { hcb: { event: "grant_card_sync_failure" } })
  rescue Faraday::Error => e
    ErrorReporter.capture_exception(e, contexts: { hcb: { event: "grant_card_sync_api_failure" } })
  end

  private

  def sync_grant_cards
    remote_grants = HcbService.list_card_grants
    return unless remote_grants.is_a?(Array)

    remote_by_id = remote_grants.index_by { |g| g[:id] }

    # Only sync cards that exist locally and have been issued
    HcbGrantCard.issued.find_each do |card|
      remote_data = remote_by_id[card.hcb_id]
      next unless remote_data

      sync_single_grant(card, remote_data)
    end
  end

  def sync_single_grant(card, data)
    attrs = {
      balance_cents: data[:balance_cents],
      purpose: data[:purpose],
      email: data[:email],
      one_time_use: data[:one_time_use] || false,
      card_id: data[:card_id],
      expires_on: data[:expires_on],
      merchant_lock: data[:merchant_lock] || [],
      category_lock: data[:category_lock] || [],
      keyword_lock: data[:keyword_lock],
      last_synced_at: Time.current
    }

    # Preserve the historical grant total locally if HCB ever returns 0/nil
    # (e.g. on a closed card) — `amount_cents` validates `> 0` so accepting 0
    # would fail the save and silently abort the rest of this method, including
    # the cancel-refund booking below. `balance_cents` already tracks runtime state.
    attrs[:amount_cents] = data[:amount_cents] if data[:amount_cents].is_a?(Integer) && data[:amount_cents].positive?

    # Don't let sync revert a local cancel — write scope is needed to cancel on HCB
    attrs[:status] = data[:status] unless card.canceled? && data[:status] != "canceled"

    card.assign_attributes(attrs)

    if card.changed?
      card.save!
    else
      card.update_column(:last_synced_at, Time.current)
    end

    fully_synced = sync_transactions(card)

    # When HCB closes a card (cancel or expiry), the unspent balance is returned
    # to the org and the closure is irreversible. Without booking an `out` topup
    # the Fallout ledger keeps showing the original transferred amount and
    # `delta_cents` over-counts the user's funding on any future settle.
    # Evaluated every sync (not just on the closing edge) so a crashed-mid-way
    # prior attempt is retried on the next pass; idempotency is enforced inside
    # book_closure_refund! by a double-checked guard. Gated on a successful
    # txn-sync pass so a partial purchase history doesn't over-book the refund.
    book_closure_refund!(card) if fully_synced && (card.canceled? || card.expired?)
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique => e
    ErrorReporter.capture_exception(e, contexts: {
      hcb: { event: "grant_card_sync_record_invalid", hcb_id: card.hcb_id }
    })
  end

  CLOSURE_REFUND_NOTE_PREFIX = "Auto-booked: card closed, refund to org"

  # Books a single ledger-only `out` topup for the unspent balance returned to
  # the org when a card is closed (canceled or expired). Safe to call every sync
  # — guarded by an existence check both outside and inside the advisory lock so
  # a concurrent caller can't slip a duplicate row through between the check
  # and the insert.
  def book_closure_refund!(card)
    user = card.user
    return unless user
    return if closure_refund_already_booked?(card) # cheap pre-check: avoid taking the lock when there's nothing to do

    ActiveRecord::Base.transaction do
      lock_key = "pft:#{user.id}" # same key the settle service uses, so we serialize against an in-flight topup for this user
      ActiveRecord::Base.connection.execute(
        "SELECT pg_advisory_xact_lock(hashtext(#{ActiveRecord::Base.connection.quote(lock_key)}))"
      )
      next if closure_refund_already_booked?(card) # re-check inside the lock — a concurrent worker may have just booked it

      ledger_net = card.project_funding_topups.kept.where(status: "completed").sum(
        Arel.sql("CASE direction WHEN 'out' THEN -amount_cents ELSE amount_cents END")
      )
      # HCB stores card-charge debits as negative amount_cents — flip to a
      # positive "spent" figure. Excludes declined/reversed; includes pending
      # so an in-flight charge at closure isn't counted as still-on-card.
      spent_cents = -card.hcb_transactions.purchases.where(declined: false, reversed: false).sum(:amount_cents)
      unspent_cents = ledger_net - spent_cents

      next unless unspent_cents.positive? # nothing to refund (fully spent, or admin already booked an offsetting out)

      ProjectFundingTopup.create!(
        user: user,
        hcb_grant_card: card,
        amount_cents: unspent_cents,
        direction: "out",
        status: "completed",
        completed_at: Time.current,
        # MUST be true: returned balance counts toward the user's funding so a
        # future order replenishes what came back. Example: user requests $30,
        # spends $20, $10 returned on cancel; next request for $5 should send
        # $15 (= $5 new + $10 replenishment). Flipping this to false would
        # under-fund users by the returned amount on every closure.
        counts_toward_funding: true,
        note: "#{CLOSURE_REFUND_NOTE_PREFIX} status=#{card.status} (ledger_net=#{ledger_net}c, spent=#{spent_cents}c)"
      )
    end
  end

  def closure_refund_already_booked?(card)
    card.project_funding_topups.kept
        .where(direction: "out", status: "completed")
        .where("note LIKE ?", "#{CLOSURE_REFUND_NOTE_PREFIX}%")
        .exists?
  end

  # Returns true iff the full transaction history paginated cleanly to the end.
  # The cancel-refund booking depends on a complete `card.hcb_transactions`
  # view — a partial history would undercount `spent` and over-book the refund,
  # and the cheap pre-check would prevent self-correction on later passes.
  def sync_transactions(card)
    after_cursor = nil

    loop do
      response = HcbService.list_card_grant_transactions(card.hcb_id, after: after_cursor)
      remote_txns = response.is_a?(Hash) ? response[:data] : response
      break unless remote_txns.is_a?(Array)

      remote_txns.each do |txn_data|
        sync_single_transaction(card, txn_data)
      end

      break unless response.is_a?(Hash) && response[:has_more]

      after_cursor = remote_txns.last&.dig(:id)
      break unless after_cursor
    end
    true
  rescue Faraday::Error => e
    ErrorReporter.capture_exception(e, contexts: {
      hcb: { event: "transaction_sync_failure", card_hcb_id: card.hcb_id }
    })
    false
  end

  def sync_single_transaction(card, txn_data)
    txn = HcbTransaction.find_or_initialize_by(hcb_id: txn_data[:id])
    txn.assign_attributes(
      hcb_grant_card: card,
      amount_cents: txn_data[:amount_cents],
      memo: txn_data[:memo],
      merchant_name: extract_merchant_name(txn_data),
      transaction_date: txn_data[:date],
      pending: txn_data[:pending] || false,
      declined: txn_data[:declined] || false,
      reversed: txn_data[:reversed] || false,
      transaction_type: infer_transaction_type(txn_data),
      last_synced_at: Time.current
    )
    if txn.changed?
      txn.save!
    else
      txn.update_column(:last_synced_at, Time.current)
    end
  end

  def extract_merchant_name(txn_data)
    card_charge = txn_data[:card_charge]
    return unless card_charge

    merchant = card_charge[:merchant]
    return unless merchant

    merchant[:smart_name].presence || merchant[:name]
  end

  # HCB returns two structurally distinct payloads on the same transactions
  # endpoint: card charges carry a `card_charge` key (real spend at a merchant);
  # org↔card money movement carries a `transfer` key (topups, withdrawals,
  # initial grant, refunds). Everything else is "other" — fallback so we don't
  # leave a nil type.
  def infer_transaction_type(txn_data)
    return "purchase" if txn_data[:card_charge].present?
    return "transfer" if txn_data[:transfer].present?
    "other"
  end
end
