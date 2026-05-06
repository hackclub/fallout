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
      amount_cents: data[:amount_cents],
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

    # Don't let sync revert a local cancel — write scope is needed to cancel on HCB
    attrs[:status] = data[:status] unless card.canceled? && data[:status] != "canceled"

    card.assign_attributes(attrs)

    if card.changed?
      card.save!
    else
      card.update_column(:last_synced_at, Time.current)
    end

    sync_transactions(card)
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique => e
    ErrorReporter.capture_exception(e, contexts: {
      hcb: { event: "grant_card_sync_record_invalid", hcb_id: card.hcb_id }
    })
  end

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
  rescue Faraday::Error => e
    ErrorReporter.capture_exception(e, contexts: {
      hcb: { event: "transaction_sync_failure", card_hcb_id: card.hcb_id }
    })
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
