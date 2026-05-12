# frozen_string_literal: true

# User-initiated donation intent. Created when a user clicks Donate on /top_ups/new;
# the unique token is embedded in the HCB donation page's `message` field so the
# sync job (HcbDonationSyncJob) can match incoming donations back to the user.
#
# On match, the job books a ProjectFundingTopup with `counts_toward_funding: false`
# and links it here via `project_funding_topup_id`. The card is topped up via HCB
# without consuming any of the user's koi-funded entitlement.
class HcbDonationRequest < ApplicationRecord
  include Discardable

  # Token alphabet excludes 0/O/1/I/L for legibility — the user sees this in the
  # HCB donation page message and we don't want them to mis-transcribe if they
  # ever need to support-ticket the value.
  TOKEN_ALPHABET = ("A".."Z").to_a - %w[I O L] + ("2".."9").to_a
  TOKEN_LENGTH = 12
  # Character-class form of the alphabet. Kept in lockstep with TOKEN_ALPHABET —
  # validation (and HcbDonationSyncJob's extraction regex) MUST stay equal to the
  # generator, otherwise a typo-substitution like I→J on the donor side could
  # accidentally collide with a different user's token.
  TOKEN_CHAR_CLASS = "[A-HJKMNP-Z2-9]"
  # Sanity cap — keeps a fat-finger from creating a $1M intent that confuses the
  # donor on HCB's side. Matches the spirit of the order amount validation.
  AMOUNT_CENTS_MAX = 100_000_00

  has_paper_trail

  belongs_to :user
  belongs_to :project_funding_topup, optional: true

  validates :token, presence: true, uniqueness: true, format: { with: /\A#{TOKEN_CHAR_CLASS}{#{TOKEN_LENGTH}}\z/ }
  validates :amount_cents, presence: true,
    numericality: { greater_than: 0, less_than_or_equal_to: AMOUNT_CENTS_MAX, only_integer: true }
  validates :hcb_donation_id, uniqueness: true, allow_nil: true
  # Money attribution safety — mirrors ProjectFundingTopup's same check. Prevents a
  # bug from booking a topup we link to a different user's intent.
  validate :project_funding_topup_belongs_to_user

  # Matched rows have real money attached: the linked ProjectFundingTopup is a
  # completed ledger entry. Only the explicit mark_refunded! path may write to
  # them (it sets refunded_at via update_columns and bypasses readonly?).
  def readonly?
    persisted? && matched_at_was.present?
  end

  def destroy
    raise ActiveRecord::ReadOnlyRecord, "HcbDonationRequest cannot be destroyed; use #discard where allowed"
  end

  # A matched request points at a real ledger row — discarding would orphan that
  # row from its originating intent. Only unmatched rows can be soft-deleted.
  def discard
    raise ActiveRecord::ReadOnlyRecord, "Matched donation requests are immutable; cannot discard" if matched_at.present?

    super
  end

  def matched?
    matched_at.present?
  end

  def refunded?
    refunded_at.present?
  end

  # Generates a unique TOKEN_LENGTH-char token, retrying on collision. The token
  # space is ~60 bits, so a collision is a broken-RNG signal — bail after 10
  # rather than spinning forever.
  def self.generate_unique_token!
    10.times do
      token = Array.new(TOKEN_LENGTH) { TOKEN_ALPHABET.sample(random: SecureRandom) }.join
      return token unless exists?(token: token)
    end

    raise "HcbDonationRequest.generate_unique_token!: 10 collisions in a row — RNG suspect"
  end

  private

  def project_funding_topup_belongs_to_user
    return unless project_funding_topup && user
    return if project_funding_topup.user_id == user_id

    errors.add(:project_funding_topup, "belongs to a different user — money attribution mismatch")
  end
end
