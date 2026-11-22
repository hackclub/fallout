namespace :certificates do
  desc "Generate certificate-verification tokens for every kept, verified user with >= 60 " \
       "TA-approved hours, and print name + verify link as CSV (name,verify_url)."
  task generate: :environment do
    url_options = Rails.application.config.action_mailer.default_url_options

    puts "name,verify_url"
    User.verified.kept.not_banned.find_each do |user|
      # Strict 60+ TA-approved hours — unlike meets_ticket_hours?, no grace for submitted-but-unreviewed time,
      # since a certificate asserts hours are already approved, not just on track to be.
      next unless (user.approved_time_logged_seconds / 3600.0).round(1) >= User::CERTIFICATE_HOURS_THRESHOLD

      user.generate_certificate_token!
      url = Rails.application.routes.url_helpers.verify_certificate_url(user.certificate_token, **url_options)
      puts "#{user.display_name.inspect},#{url}"
    end
  end
end
