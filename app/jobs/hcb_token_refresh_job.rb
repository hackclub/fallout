# frozen_string_literal: true

class HcbTokenRefreshJob < ApplicationJob
  queue_as :background

  def perform
    return unless HcbService.configured?

    connection = HcbConnection.current
    return unless connection&.access_token.present?

    connection.with_lock do
      # Re-check the expiry predicate inside the lock. Two concurrent workers can both
      # read token_expiring_soon? = true, then one refreshes and invalidates the other's
      # refresh_token before the second worker enters. The second worker would then
      # consume the already-rotated refresh_token and disconnect the connection.
      next unless connection.token_expiring_soon?

      token_data = HcbService.refresh_token(connection.refresh_token)

      connection.update!(
        access_token: token_data[:access_token],
        refresh_token: token_data[:refresh_token] || connection.refresh_token,
        token_expires_at: Time.current + token_data[:expires_in].to_i.seconds
      )
    rescue Faraday::UnauthorizedError, Faraday::BadRequestError => e
      # Auth failure — token is invalid/revoked. Disconnect while still holding the lock.
      connection.disconnect!
      ErrorReporter.capture_exception(e, contexts: { hcb: { event: "token_refresh_auth_failure" } })
    end
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: { hcb: { event: "token_refresh_unexpected_failure" } })
  end
end
