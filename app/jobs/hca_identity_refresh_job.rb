class HcaIdentityRefreshJob < ApplicationJob
  queue_as :background

  # Transient upstream HCA failures: retry with backoff instead of surfacing a Sentry error.
  retry_on(*HcaService::TRANSIENT_NETWORK_ERRORS, wait: :polynomially_longer, attempts: 5)

  # Polls HCA for users who aren't yet fully identity-gated. `verified` + `has_address` only
  # flip one way, so we can stop polling a user as soon as they reach fully_identity_gated?.
  def perform
    # hca_token is encrypted (non-deterministic), so we can only filter on IS NOT NULL here.
    scope = User.verified.kept.where.not(hca_token: nil)
                .where("verification_status IS DISTINCT FROM 'verified' OR has_hca_address = false")

    scope.find_each do |user|
      user.refresh_identity_cache!
    rescue *HcaService::TRANSIENT_NETWORK_ERRORS => e
      # Transient HCA upstream issue — next run will retry this user. Warn-level only.
      Rails.logger.warn("HcaIdentityRefreshJob transient HCA error for user #{user.id}: #{e.class}: #{e.message}")
    rescue => e
      Rails.logger.error("HcaIdentityRefreshJob error for user #{user.id}: #{e.message}")
      ErrorReporter.capture_exception(e, contexts: { hca_identity_refresh: { user_id: user.id } })
    end
  end
end
