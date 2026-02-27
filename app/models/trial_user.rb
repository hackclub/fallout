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
