# frozen_string_literal: true

# Surface for anomalies in the project grant financial system. Purely informational:
# nothing auto-resolves from a warning — it tells the hcb admin what needs attention.
#
# Detection runs in two places:
#   - HcbGrantCardSyncJob (every 15 min) calls .scan_all! after syncing all cards.
#     This is the passive continuous detector.
#   - ProjectFundingTopupService records warnings inline when the settle path catches
#     an anomaly (over-transfer, ratchet cap, etc.) — immediate feedback at write time.
#
# Dedup: .record! is idempotent — an unresolved warning for the same (kind, user,
# card, order, topup) tuple gets its last_detected_at and detection_count updated
# instead of creating a duplicate row.
# == Schema Information
#
# Table name: project_grant_warnings
#
#  id                       :bigint           not null, primary key
#  details                  :jsonb            not null
#  detection_count          :integer          default(1), not null
#  kind                     :string           not null
#  last_detected_at         :datetime         not null
#  message                  :text             not null
#  resolution_note          :text
#  resolved_at              :datetime
#  created_at               :datetime         not null
#  updated_at               :datetime         not null
#  hcb_grant_card_id        :bigint
#  project_funding_topup_id :bigint
#  project_grant_order_id   :bigint
#  resolved_by_id           :bigint
#  user_id                  :bigint
#
# Indexes
#
#  index_project_grant_warnings_on_hcb_grant_card_id         (hcb_grant_card_id)
#  index_project_grant_warnings_on_kind                      (kind)
#  index_project_grant_warnings_on_project_funding_topup_id  (project_funding_topup_id)
#  index_project_grant_warnings_on_project_grant_order_id    (project_grant_order_id)
#  index_project_grant_warnings_on_resolved_at               (resolved_at)
#  index_project_grant_warnings_on_resolved_by_id            (resolved_by_id)
#  index_project_grant_warnings_on_user_id                   (user_id)
#
# Foreign Keys
#
#  fk_rails_...  (hcb_grant_card_id => hcb_grant_cards.id)
#  fk_rails_...  (project_funding_topup_id => project_funding_topups.id)
#  fk_rails_...  (project_grant_order_id => project_grant_orders.id)
#  fk_rails_...  (resolved_by_id => users.id)
#  fk_rails_...  (user_id => users.id)
#
class ProjectGrantWarning < ApplicationRecord
  # kinds intentionally overlap for different subjects so the same underlying truth
  # (HCB + Fallout disagree) shows up scoped to what's most actionable.
  KINDS = %w[
    ledger_divergence
    negative_transferred
    pending_topup_stuck
    dangling_card
    ratchet_capped
  ].freeze

  # Description shown to admin in the UI. Keep these accurate as the detection logic
  # changes — they're the source of truth for what each kind means.
  KIND_DESCRIPTIONS = {
    "ledger_divergence" => {
      title: "Card amount differs from ledger net",
      detail: "HCB's record of how much has been granted to this card doesn't match " \
              "our sum of completed in-topups minus out-refunds. Caused by external " \
              "HCB actions that weren't mirrored in Fallout (manual withdrawal without " \
              "recording an `out` adjustment, or admin adding money on HCB).",
      example: "Card shows $80 on HCB. Our ledger sums to $100. Someone withdrew $20 " \
               "on HCB without recording. Fix: record an `out` adjustment of $20, or " \
               "move the $20 back on HCB."
    },
    "negative_transferred" => {
      title: "Transferred net is below zero",
      detail: "More `out` adjustments exist for this user than `in` topups. This shouldn't " \
              "happen in normal operation — you can only put `out` what was first put `in`.",
      example: "Admin recorded an `out` $30 adjustment but there are no completed `in` " \
               "topups. Likely a data-entry error. Fix: discard (set failed on) the wrong " \
               "row or record a corrective `in`."
    },
    "pending_topup_stuck" => {
      title: "Pending topup hasn't completed",
      detail: "An outbox row stayed in `pending` more than 30 minutes. The service " \
              "won't retry anything for this user until someone reconciles it (verify " \
              "vs HCB, then mark completed or failed).",
      example: "HCB call timed out mid-settle. Pending row was committed but the job " \
               "crashed before flipping to completed. Fix: check HCB for the disbursement; " \
               "if it landed, mark completed. If not, mark failed so the service retries."
    },
    "dangling_card" => {
      title: "Local card exists without an HCB id",
      detail: "HcbGrantCard row has no `hcb_id` and is more than 5 minutes old. A partial " \
              "failure during first-issue likely left this orphan. The dangling-card " \
              "guard in the service will refuse to retry until it's resolved.",
      example: "Service called create_card_grant on HCB, HCB created the grant, but the " \
               "response was lost and we never persisted the returned id. Fix: find the " \
               "grant on HCB by email and set hcb_id manually (console)."
    },
    "ratchet_capped" => {
      title: "Topup was capped by the ratchet",
      detail: "The service tried to send more than the card/ledger gap allows. This is a " \
              "safety working — no overfunding happened. Worth investigating why the card " \
              "has more than our ledger expects (external top-up, missed adjustment?).",
      example: "Admin manually added $50 on HCB without recording in Fallout. Next topup " \
               "attempt tried to add another $10 but got capped to $0. Fix: record the " \
               "$50 as an `in` adjustment to align the ledger."
    }
  }.freeze

  belongs_to :user, optional: true
  belongs_to :hcb_grant_card, optional: true
  belongs_to :project_grant_order, optional: true
  belongs_to :project_funding_topup, optional: true
  belongs_to :resolved_by, class_name: "User", optional: true

  validates :kind, inclusion: { in: KINDS }
  validates :message, presence: true

  scope :unresolved, -> { where(resolved_at: nil) }
  scope :resolved, -> { where.not(resolved_at: nil) }

  # Idempotent upsert. If an unresolved warning with the same identifying tuple exists,
  # refresh its message/details/last_detected_at and bump detection_count. Otherwise
  # insert a new row. Keeps the table from growing by one row per sync cycle for the
  # same persistent anomaly.
  def self.record!(kind:, message:, details: {}, user: nil, hcb_grant_card: nil, project_grant_order: nil, project_funding_topup: nil)
    row = unresolved.find_or_initialize_by(
      kind: kind,
      user_id: user&.id,
      hcb_grant_card_id: hcb_grant_card&.id,
      project_grant_order_id: project_grant_order&.id,
      project_funding_topup_id: project_funding_topup&.id
    )
    row.assign_attributes(
      message: message,
      details: row.details.merge(details),
      last_detected_at: Time.current
    )
    row.detection_count = row.persisted? ? row.detection_count + 1 : 1
    row.save!
    row
  end

  def resolve!(admin:, note: nil)
    update!(resolved_at: Time.current, resolved_by: admin, resolution_note: note)
  end

  # Runs every detection pass. Safe to call repeatedly — .record! dedupes. Called by
  # HcbGrantCardSyncJob after each sync cycle.
  def self.scan_all!
    scan_ledger_divergence!
    scan_stuck_pending_topups!
    scan_dangling_cards!
    scan_user_ledger_anomalies!
  end

  def self.scan_ledger_divergence!
    HcbGrantCard.issued.find_each do |card|
      ledger_net = card.project_funding_topups.kept.where(status: "completed").sum(
        Arel.sql("CASE direction WHEN 'out' THEN -amount_cents ELSE amount_cents END")
      )
      next if card.amount_cents == ledger_net

      gap = card.amount_cents - ledger_net
      direction = gap.positive? ? "extra on HCB" : "missing from HCB"
      record!(
        kind: "ledger_divergence",
        hcb_grant_card: card,
        user: card.user,
        message: "Card #{card.hcb_id || "(no hcb_id)"}: actual #{format_dollars(card.amount_cents)} (HCB) vs " \
                 "expected #{format_dollars(ledger_net)} (Fallout ledger). Gap: #{format_dollars(gap.abs)} #{direction}.",
        details: { hcb_amount_cents: card.amount_cents, ledger_net_cents: ledger_net, gap_cents: gap }
      )
    end
  end

  def self.scan_stuck_pending_topups!
    ProjectFundingTopup.kept.where(status: "pending").where("created_at < ?", 30.minutes.ago).find_each do |topup|
      record!(
        kind: "pending_topup_stuck",
        project_funding_topup: topup,
        project_grant_order: topup.project_grant_order,
        hcb_grant_card: topup.hcb_grant_card,
        user: topup.user,
        message: "Pending topup ##{topup.id} (#{format_dollars(topup.amount_cents)}) has been unresolved for " \
                 "#{((Time.current - topup.created_at) / 60).to_i} minutes. Reconcile against HCB.",
        details: { amount_cents: topup.amount_cents, age_seconds: (Time.current - topup.created_at).to_i }
      )
    end
  end

  def self.scan_dangling_cards!
    HcbGrantCard.where(hcb_id: nil).where("created_at < ?", 5.minutes.ago).find_each do |card|
      record!(
        kind: "dangling_card",
        hcb_grant_card: card,
        user: card.user,
        message: "HcbGrantCard ##{card.id} has no hcb_id and is #{((Time.current - card.created_at) / 60).to_i} " \
                 "minutes old. Partial first-issue failure.",
        details: { age_seconds: (Time.current - card.created_at).to_i }
      )
    end
  end

  def self.scan_user_ledger_anomalies!
    # The goal of the ledger scan is "does Fallout's ledger match HCB's view of
    # reality?" — that comparison lives in scan_ledger_divergence! above. Manual
    # adjustments are a legitimate ledger source (the whole point of the
    # adjustments form is to backfill out-of-band HCB activity), so we do NOT
    # flag transferred > fulfilled-orders as an anomaly. The only user-level
    # check that remains is negative-ledger, which means more out-adjustments
    # than in-topups — always a data-entry mistake.
    user_ids = ProjectFundingTopup.kept.distinct.pluck(:user_id)
    User.where(id: user_ids).find_each do |user|
      transferred = ProjectFundingTopupService.transferred_usd_cents(user)
      next unless transferred.negative?

      record!(
        kind: "negative_transferred",
        user: user,
        message: "Net transferred is #{format_dollars(transferred)} — more out-adjustments than in-topups.",
        details: { transferred_cents: transferred }
      )
    end
  end

  def self.format_dollars(cents)
    # Always two decimals (sprintf) — `.round(2).to_s` drops trailing zeros
    # so $8.00 would render as "$8.0". Values are stored in cents everywhere;
    # this is the only place we format for human display.
    sign = cents.negative? ? "-" : ""
    format("%s$%.2f", sign, cents.abs / 100.0)
  end
  private_class_method :format_dollars
end
