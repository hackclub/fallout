# == Schema Information
#
# Table name: streak_days
#
#  id         :bigint           not null, primary key
#  date       :date             not null
#  status     :integer          default("pending"), not null
#  created_at :datetime         not null
#  updated_at :datetime         not null
#  user_id    :bigint           not null
#
# Indexes
#
#  index_streak_days_on_user_id           (user_id)
#  index_streak_days_on_user_id_and_date  (user_id,date) UNIQUE
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
class StreakDay < ApplicationRecord
  belongs_to :user

  has_paper_trail

  enum :status, { pending: 0, active: 1, frozen: 2, missed: 3 }, prefix: true

  validates :date, presence: true, uniqueness: { scope: :user_id }

  scope :chronological, -> { order(date: :asc) }
  scope :reverse_chronological, -> { order(date: :desc) }
  scope :streak_counting, -> { where(status: [ :active, :frozen ]) }

  def self.current_streak(user)
    today = Date.current.in_time_zone(user.timezone).to_date
    yesterday = today - 1.day

    days = where(user: user).streak_counting.where("date <= ?", today).reverse_chronological.pluck(:date)
    return 0 if days.empty?

    most_recent_date = days.first
    start_from = if most_recent_date == today
      today
    elsif most_recent_date == yesterday
      yesterday
    else
      return 0
    end

    count = 0
    expected = start_from

    days.each do |date|
      break unless date == expected

      count += 1
      expected -= 1.day
    end

    count
  end

  def self.consecutive_days_from(user, start_date)
    days = where(user: user).where("date >= ?", start_date).chronological.pluck(:date, :status)
    return 0 if days.empty?

    count = 0
    expected = start_date

    days.each do |date, status|
      break unless date == expected && status.in?(%w[active frozen])

      count += 1
      expected += 1.day
    end

    count
  end

  def self.longest_streak(user)
    days = where(user: user).chronological.pluck(:date, :status)
    return 0 if days.empty?

    max = 0
    current = 0
    expected = nil

    days.each do |date, status|
      if status.in?(%w[active frozen]) && (expected.nil? || date == expected)
        current += 1
        expected = date + 1.day
      else
        max = [ max, current ].max
        current = status.in?(%w[active frozen]) ? 1 : 0
        expected = status.in?(%w[active frozen]) ? date + 1.day : nil
      end
    end

    [ max, current ].max
  end
end
