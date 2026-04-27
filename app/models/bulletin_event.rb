# == Schema Information
#
# Table name: bulletin_events
#
#  id          :bigint           not null, primary key
#  description :text             not null
#  ends_at     :datetime
#  image_url   :string
#  schedulable :boolean          default(TRUE), not null
#  starts_at   :datetime
#  title       :string           not null
#  created_at  :datetime         not null
#  updated_at  :datetime         not null
#
# Indexes
#
#  index_bulletin_events_on_ends_at    (ends_at)
#  index_bulletin_events_on_starts_at  (starts_at)
#
class BulletinEvent < ApplicationRecord
  URL_FORMAT = URI::DEFAULT_PARSER.make_regexp(%w[http https])

  include Broadcastable
  broadcasts_updates_to :bulletin_events

  validates :title, :description, presence: true
  validates :image_url, format: { with: URL_FORMAT }, allow_blank: true
  validates :starts_at, presence: true, if: :schedulable?
  validate :ends_at_after_starts_at

  scope :happening, -> {
    where(
      "(schedulable = FALSE AND starts_at IS NOT NULL AND ends_at IS NULL) OR " \
      "(schedulable = TRUE AND starts_at IS NOT NULL AND starts_at <= :now AND (ends_at IS NULL OR ends_at > :now))",
      now: Time.current
    )
  }
  scope :upcoming_or_happening, -> {
    where(
      "(schedulable = FALSE AND ends_at IS NULL) OR " \
      "(schedulable = TRUE AND (ends_at IS NULL OR ends_at > :now))",
      now: Time.current
    )
  }
  scope :expired, -> {
    where(
      "(schedulable = FALSE AND ends_at IS NOT NULL) OR " \
      "(schedulable = TRUE AND ends_at IS NOT NULL AND ends_at <= :now)",
      now: Time.current
    )
  }

  def status(now = Time.current)
    unless schedulable?
      return :expired if ends_at.present?
      return :draft   if starts_at.nil?

      return :happening
    end

    return :expired if ends_at.present? && ends_at <= now
    return :draft   if starts_at.nil?
    return :upcoming if starts_at > now

    :happening
  end

  def start_now!
    return if starts_at.present?

    update!(starts_at: Time.current)
  end

  def force_start_now!
    update!(starts_at: Time.current)
  end

  def end_now!
    update!(ends_at: Time.current)
  end

  private

  def ends_at_after_starts_at
    return if ends_at.blank? || starts_at.blank?
    return if ends_at > starts_at

    errors.add(:ends_at, "must be after starts at")
  end
end
