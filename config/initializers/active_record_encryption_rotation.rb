# Deterministic encryption can't take a key list like primary_key, so rows written before the
# 2026-11 key rotation (users.device_token) stay readable only through this previous scheme.
# Remove it, and previous_deterministic_key from credentials, once key_rotation:reencrypt has run.
ActiveSupport.on_load(:active_record_encryption) do
  previous_key = Rails.application.credentials.dig(:active_record_encryption, :previous_deterministic_key)
  next if previous_key.blank?

  ActiveRecord::Encryption.config.previous = [
    { deterministic: true, key_provider: ActiveRecord::Encryption::DeterministicKeyProvider.new(previous_key) }
  ]
end
