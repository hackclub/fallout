desc "Backfill users.birthday from HCA for users with a stored HCA token (used by soup campaign age targeting)"
task backfill_user_birthdays: :environment do
  scope = User.verified.kept.where(birthday: nil).where.not(hca_token: nil)
  puts "#{scope.count} candidates"

  filled = 0
  failed = 0
  scope.find_each do |user|
    user.refresh_identity_cache!
    filled += 1 if user.birthday.present?
  rescue HcaService::InvalidToken
    user.clear_hca_session!
    failed += 1
  rescue => e
    puts "  Failed User##{user.id}: #{e.class}: #{e.message}"
    failed += 1
  end

  puts "Filled #{filled}, failed #{failed}, still missing #{User.verified.kept.where(birthday: nil).count}"
end
