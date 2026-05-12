# frozen_string_literal: true

# Walks the org's revenue transactions on HCB and matches incoming donations
# back to user-created HcbDonationRequest intents (via a token in the donation
# `message` field). On match, books a ProjectFundingTopup with
# `counts_toward_funding: false` and tops up the user's HCB grant card.
#
# Separate from HcbGrantCardSyncJob because:
#   - different API scope (org transactions vs per-card)
#   - different ledger semantics (counts_toward_funding: false)
#   - different idempotency key (token-in-message vs note sentinel + card)
#
# Booking gate is just `!refunded` — we book on both `in_transit: true` and
# `deposited: true`. Stripe payouts take 1–2 business days; making users wait
# that long would defeat the purpose. The card may go overdrawn if HCB later
# reverses the donation before deposit — `donation_refunded_after_match`
# surfaces that for admin reconciliation.
class HcbDonationSyncJob < ApplicationJob
  queue_as :background

  # Sentinel for the ProjectFundingTopup `note` field. Used by the crash-recovery
  # scan to detect a partial-failure topup row before re-issuing one.
  TOPUP_NOTE_PREFIX = "Donation top-up:"

  # Accepts both "Top-up" (from URL) and "Top up" (how HCB renders it after
  # normalization). Trailing period optional. Token alphabet is strict-matched
  # against HcbDonationRequest::TOKEN_CHAR_CLASS — a permissive regex (e.g.
  # [A-Z2-9]) could let a donor-side typo like I→J accidentally collide with
  # another user's real token.
  TOKEN_RE = /Top[- ]up of HCB grant (#{HcbDonationRequest::TOKEN_CHAR_CLASS}{#{HcbDonationRequest::TOKEN_LENGTH}})\.?/

  def perform
    return unless HcbService.configured?

    connection = HcbConnection.current
    return unless connection&.access_token.present?
    return if connection.token_expired?

    sync_donations
  rescue HcbService::Error => e
    ErrorReporter.capture_exception(e, contexts: { hcb: { event: "donation_sync_failure" } })
  rescue Faraday::Error => e
    ErrorReporter.capture_exception(e, contexts: { hcb: { event: "donation_sync_api_failure" } })
  end

  private

  def sync_donations
    # No active intents → no work, and no floor → we'd otherwise walk the entire
    # org transaction history on every run. Bail early.
    floor = scan_floor
    return unless floor

    after_cursor = nil

    loop do
      response = HcbService.list_organization_transactions(
        filters: { revenue: true }, after: after_cursor
      )
      txns = response.is_a?(Hash) ? response[:data] : nil
      break unless txns.is_a?(Array) && txns.any?

      txns.each { |txn| handle_transaction(txn) }

      break unless response[:has_more]
      oldest = txns.last
      break if oldest_before_floor?(oldest, floor)

      after_cursor = oldest[:id]
      break unless after_cursor
    end
  end

  # Don't paginate older than the oldest unmatched intent (or oldest unrefunded
  # matched intent), minus 24h. Cuts re-scan cost while still catching late
  # refund flips on recent matches. Returns nil when there's nothing to match —
  # the caller treats that as "no work to do" and skips the API entirely.
  def scan_floor
    unmatched_floor = HcbDonationRequest.kept.where(matched_at: nil).minimum(:created_at)
    matched_floor = HcbDonationRequest.kept.where(refunded_at: nil).where.not(matched_at: nil).minimum(:matched_at)
    earliest = [ unmatched_floor, matched_floor ].compact.min
    earliest ? earliest - 24.hours : nil
  end

  def oldest_before_floor?(txn, floor)
    return false unless txn
    date = txn[:date] || txn.dig(:donation, :donated_at) || txn.dig(:donation, :created_at)
    return false if date.blank?

    Time.parse(date.to_s) < floor
  rescue ArgumentError
    false
  end

  def handle_transaction(txn)
    donation = txn[:donation]
    return unless donation

    token = TOKEN_RE.match(donation[:message].to_s)&.[](1)
    return unless token

    req = HcbDonationRequest.kept.find_by(token: token)
    return unless req

    req.update_columns(last_seen_at: Time.current)

    if req.matched_at.present?
      detect_refund!(req, donation) if donation[:refunded] && req.refunded_at.nil?
      return
    end

    # Booking gate: only `refunded` blocks. We book on either in_transit or
    # deposited so users see their card funded immediately after donating.
    return if donation[:refunded]

    apply_match!(req, txn, donation)
  end

  def apply_match!(req, txn, donation)
    user = req.user
    return unless user

    ActiveRecord::Base.transaction do
      lock_key = "pft:#{user.id}" # same key the settle service uses — serializes against any in-flight topup for this user
      ActiveRecord::Base.connection.execute(
        "SELECT pg_advisory_xact_lock(hashtext(#{ActiveRecord::Base.connection.quote(lock_key)}))"
      )

      req.reload
      next if req.matched_at.present? # concurrent worker just matched

      # Crash recovery: if a prior partial-failure left a topup row but the
      # HcbDonationRequest update never ran, link it here instead of re-issuing.
      existing_topup = ProjectFundingTopup.kept
        .where(user_id: user.id)
        .where("note LIKE ?", "#{TOPUP_NOTE_PREFIX} hcb_donation_id=#{donation[:id]}%")
        .first
      if existing_topup
        req.update!(
          matched_at: Time.current,
          hcb_donation_id: donation[:id],
          donated_at: donation[:donated_at],
          project_funding_topup_id: existing_topup.id
        )
        next
      end

      # Donor email must match — defends against token-leak attacks where someone
      # uses another user's intent to credit their own card.
      donor_email = donation.dig(:donor, :email).to_s.downcase
      if donor_email.blank? || donor_email != user.email.to_s.downcase
        ProjectGrantWarning.record!(
          kind: "donation_donor_mismatch",
          user: user,
          message: "Donation #{donation[:id]} matched token #{req.token} but donor " \
                   "email #{donor_email.inspect} != user email #{user.email.inspect}. Refusing to book.",
          details: { hcb_donation_id: donation[:id], donor_email: donor_email, token: req.token }
        )
        next
      end

      card = user.active_hcb_grant_card
      unless card&.issued?
        # No usable card — we CANNOT auto-claw-back; record a warning so admin
        # manually refunds the donation on HCB or issues a new card and tops up.
        ProjectGrantWarning.record!(
          kind: "donation_no_active_card",
          user: user,
          message: "Donation #{donation[:id]} (#{format_dollars(txn[:amount_cents])}) " \
                   "matched but user has no active issued HCB grant card. Admin must " \
                   "refund the donation on HCB or issue a new card and manually top up.",
          details: { hcb_donation_id: donation[:id], amount_cents: txn[:amount_cents], token: req.token }
        )
        next
      end

      hcb_amount = txn[:amount_cents]
      if hcb_amount != req.amount_cents
        ProjectGrantWarning.record!(
          kind: "donation_amount_mismatch",
          user: user,
          message: "Donation #{donation[:id]} amount #{hcb_amount} != request amount #{req.amount_cents}. Booking actual.",
          details: { hcb_donation_id: donation[:id], hcb_amount_cents: hcb_amount, request_amount_cents: req.amount_cents }
        )
      end

      # Book the ledger row first (status: completed directly — the settle service's
      # pending-row idempotency trick is unavailable to us because the partial unique
      # index on (user_id, status=pending) is reserved for that path).
      topup = ProjectFundingTopup.create!(
        user: user,
        hcb_grant_card: card,
        amount_cents: hcb_amount,
        direction: "in",
        status: "completed",
        completed_at: Time.current,
        # Critical: false so this top-up does NOT reduce future project-funding
        # delta. The donation is the user's own money; future koi-funded requests
        # should still send their full entitlement.
        counts_toward_funding: false,
        note: "#{TOPUP_NOTE_PREFIX} hcb_donation_id=#{donation[:id]} token=#{req.token}"
      )

      # HCB call lives INSIDE the txn. If it raises, the topup row rolls back and
      # the next sync pass retries cleanly.
      #
      # Known residual risk: if the HCB call SUCCEEDS but the post-call `req.update!`
      # or the txn COMMIT then fails (very rare — connection drop after HCB returned
      # 2xx), the topup row rolls back and the next pass re-issues the HCB topup →
      # one duplicate top-up on the card. This is recoverable: `scan_ledger_divergence!`
      # will surface the extra HCB amount as a `ledger_divergence` warning, and
      # admin reconciles via an `in` adjustment or HCB-side withdraw + `out`.
      # Splitting into two transactions trades this for the symmetric "HCB call
      # fails, orphan row gets fast-forwarded" failure — equivalent in cost and
      # also detected by the same `ledger_divergence` warning, so not pursued.
      HcbService.topup_card_grant(card.hcb_id, amount_cents: hcb_amount)

      req.update!(
        matched_at: Time.current,
        hcb_donation_id: donation[:id],
        donated_at: donation[:donated_at],
        project_funding_topup_id: topup.id
      )
    end
  end

  # Informational only — we never auto-claw-back from a card the user may have
  # already spent. Admin reviews the warning and books an `out` adjustment if
  # the funds are actually returnable.
  def detect_refund!(req, donation)
    req.update_columns(refunded_at: Time.current, updated_at: Time.current)
    ProjectGrantWarning.record!(
      kind: "donation_refunded_after_match",
      user: req.user,
      project_funding_topup: req.project_funding_topup,
      message: "Donation #{donation[:id]} (#{format_dollars(req.amount_cents)}) was refunded on HCB after " \
               "we already booked the top-up. Admin: decide whether to record an `out` adjustment.",
      details: { hcb_donation_id: donation[:id], topup_id: req.project_funding_topup_id }
    )
  end

  def format_dollars(cents)
    sign = (cents || 0).negative? ? "-" : ""
    format("%s$%.2f", sign, (cents || 0).abs / 100.0)
  end
end
