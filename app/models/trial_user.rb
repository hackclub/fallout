# == Schema Information
#
# Table name: users
#
#  id                          :bigint           not null, primary key
#  avatar                      :string           not null
#  ban_reason                  :text
#  ban_type                    :string
#  bio                         :text
#  device_token                :text
#  discarded_at                :datetime
#  display_name                :string           not null
#  email                       :string           not null
#  gold_balance                :integer          default(0), not null
#  has_hca_address             :boolean          default(FALSE), not null
#  hca_token                   :text
#  is_adult                    :boolean          default(FALSE), not null
#  is_banned                   :boolean          default(FALSE), not null
#  lapse_token                 :text
#  onboarded                   :boolean          default(FALSE), not null
#  pending_lookout_tokens      :string           default([]), not null, is an Array
#  pronouns                    :string
#  roles                       :string           default([]), not null, is an Array
#  slack_token                 :text
#  streak_freezes              :integer          default(1), not null
#  streak_in_app_notifications :boolean          default(TRUE), not null
#  streak_slack_notifications  :boolean          default(TRUE), not null
#  timezone                    :string           not null
#  type                        :string
#  verification_status         :string
#  created_at                  :datetime         not null
#  updated_at                  :datetime         not null
#  hca_id                      :string
#  slack_id                    :string
#
# Indexes
#
#  index_users_on_device_token        (device_token)
#  index_users_on_discarded_at        (discarded_at)
#  index_users_on_hca_id              (hca_id) UNIQUE WHERE (hca_id IS NOT NULL)
#  index_users_unique_verified_email  (email) UNIQUE WHERE ((type IS NULL) AND (discarded_at IS NULL))
#
class TrialUser < User
  validates :device_token, presence: true
  validate :email_not_taken_by_verified_user

  def trial?
    true
  end

  def verified?
    false
  end

  def self.find_or_create_from_device(email:, device_token:)
    find_by(email: email, device_token: device_token) ||
      create!(
        email: email,
        device_token: device_token,
        display_name: email.split("@").first.presence || "Guest",
        avatar: "/static-assets/pfp_fallback.webp",
        timezone: "UTC",
        is_banned: false,
        roles: []
      )
  end

  private

  def email_not_taken_by_verified_user
    errors.add(:email, "is associated with an existing account") if User.verified.kept.exists?(email: email)
  end
end
