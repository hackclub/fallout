class DecryptCollapseTimelapseSessionTokens < ActiveRecord::Migration[8.1]
  def up
    # CollapseTimelapse previously used ActiveRecord::Encryption on session_token.
    # Read each record with encryption enabled (temporary model), then write plaintext via raw SQL.
    encrypted_model = Class.new(ApplicationRecord) do
      self.table_name = "collapse_timelapses"
      encrypts :session_token
    end

    encrypted_model.find_each do |record|
      plaintext = record.session_token
      next if plaintext.blank?

      execute(
        ActiveRecord::Base.sanitize_sql_array([
          "UPDATE collapse_timelapses SET session_token = ? WHERE id = ?",
          plaintext, record.id
        ])
      )
    end
  end

  def down
    # No-op — re-adding `encrypts` to the model will encrypt on next write
  end
end
