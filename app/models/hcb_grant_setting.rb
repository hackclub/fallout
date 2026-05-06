# frozen_string_literal: true

# == Schema Information
#
# Table name: hcb_grant_settings
#
#  id                         :bigint           not null, primary key
#  category_lock              :string           default([]), not null, is an Array
#  default_expiry_days        :integer
#  instructions               :text
#  invite_message             :text
#  keyword_lock               :string
#  koi_to_cents_denominator   :integer          default(7), not null
#  koi_to_cents_numerator     :integer          default(500), not null
#  koi_to_hours_denominator   :integer
#  koi_to_hours_numerator     :integer
#  merchant_lock              :string           default([]), not null, is an Array
#  one_time_use               :boolean          default(FALSE), not null
#  pre_authorization_required :boolean          default(FALSE), not null
#  purpose                    :string
#  created_at                 :datetime         not null
#  updated_at                 :datetime         not null
#
class HcbGrantSetting < ApplicationRecord
  has_paper_trail

  validates :purpose, length: { maximum: 30 }, allow_blank: true
  validates :default_expiry_days, numericality: { greater_than: 0, only_integer: true }, allow_nil: true
  validates :koi_to_cents_numerator, :koi_to_cents_denominator,
            numericality: { greater_than: 0, only_integer: true }
  validates :koi_to_hours_numerator, :koi_to_hours_denominator,
            numericality: { greater_than: 0, only_integer: true }, allow_nil: true
  validate :hours_rate_both_or_neither
  validate :single_record, on: :create

  # Returns the singleton settings row, creating a default if missing.
  # find_or_create_by!(id: 1) is atomic via PK, safe under concurrent callers.
  def self.current
    find_or_create_by!(id: 1)
  end

  def expires_on_date
    default_expiry_days.present? ? Date.current + default_expiry_days.days : nil
  end

  def usd_cents_for(koi_amount)
    Rational(koi_amount * koi_to_cents_numerator, koi_to_cents_denominator).round
  end

  # Inverse of usd_cents_for: how much koi must the user pay to receive `usd_cents`.
  # Rounded UP (ceil) so the program never undercharges in the rounding gap — e.g. at
  # 500/7, $5.01 needs ceil((501*7)/500) = 8 koi, not 7.
  def koi_for_usd_cents(usd_cents)
    Rational(usd_cents * koi_to_cents_denominator, koi_to_cents_numerator).ceil
  end

  def hours_for(koi_amount)
    return nil if koi_to_hours_numerator.nil? || koi_to_hours_denominator.nil?

    Rational(koi_amount * koi_to_hours_numerator, koi_to_hours_denominator).to_f.round(2)
  end

  def hours_rate_configured?
    koi_to_hours_numerator.present? && koi_to_hours_denominator.present?
  end

  # Financial config — must never be destroyed; PaperTrail handles audit.
  def destroy
    raise ActiveRecord::ReadOnlyRecord, "HcbGrantSetting is a singleton and cannot be destroyed"
  end

  private

  def hours_rate_both_or_neither
    numer_set = koi_to_hours_numerator.present?
    denom_set = koi_to_hours_denominator.present?
    return if numer_set == denom_set

    errors.add(:base, "Hours rate numerator and denominator must both be set or both be blank")
  end

  def single_record
    errors.add(:base, "Only one HcbGrantSetting row is allowed") if self.class.exists?
  end
end
