git_hash = ENV["SENTRY_RELEASE"].presence || (`git rev-parse HEAD 2>/dev/null`.strip rescue "")
git_hash = "unknown" if git_hash.blank?
short_hash = git_hash != "unknown" ? git_hash[0..7] : "unknown"
is_dirty = (`git status --porcelain 2>/dev/null`.strip.length > 0 rescue false)
version = is_dirty ? "#{short_hash}-dirty" : short_hash
commit_link = git_hash != "unknown" ? "https://github.com/hackclub/fallout/commit/#{git_hash}" : nil

Rails.application.config.server_start_time = Time.current
Rails.application.config.git_version = version
Rails.application.config.git_sha = git_hash
Rails.application.config.commit_link = commit_link
